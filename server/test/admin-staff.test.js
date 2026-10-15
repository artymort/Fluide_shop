import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAdminRouter } from "../routes/admin.js";
import { hashAdminPassword, verifyAdminPassword } from "../security/admin-auth.js";
import { hashSessionToken } from "../security/sessions.js";

async function withStaffServer(run) {
  const owner = { id: "owner-id", email: "owner@example.test", display_name: "Owner", role: "owner", status: "active" };
  const staff = { id: "staff-id", email: "staff@example.test", display_name: "Staff", role: "editor", status: "active", password_hash: hashAdminPassword("old-password-123") };
  const state = { staff, revoked: false, audits: [] };
  const pool = {
    async query(sql, params = []) {
      if (sql.includes("FROM admin_sessions s")) {
        const user = params[0] === hashSessionToken("owner-token") ? owner
          : params[0] === hashSessionToken("staff-token") ? staff : null;
        return { rows: user ? [{ ...user, session_id: "session-id" }] : [], rowCount: user ? 1 : 0 };
      }
      if (sql.includes("FROM admin_users WHERE id = $1")) {
        const user = params[0] === staff.id ? staff : null;
        if (!user) return { rows: [], rowCount: 0 };
        const { password_hash: _hash, ...publicStaff } = user;
        return { rows: [publicStaff], rowCount: 1 };
      }
      if (sql.includes("UPDATE admin_users SET role")) {
        Object.assign(staff, { role: params[1], status: params[2], email: params[3], display_name: params[4] });
        return { rows: [{ ...staff }], rowCount: 1 };
      }
      if (sql.includes("UPDATE admin_users SET password_hash")) {
        if (params[0] !== staff.id) return { rows: [], rowCount: 0 };
        staff.password_hash = params[1];
        return { rows: [{ id: staff.id }], rowCount: 1 };
      }
      if (sql.includes("UPDATE admin_sessions SET revoked_at")) {
        state.revoked = true;
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO admin_audit_log")) {
        state.audits.push(params[1]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const config = { isProduction: false, admin: { cookieName: "admin_test", mediaDirectory: "tmp/admin-test", maxUploadMb: 1, sessionTtlHours: 1 } };
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminRouter({ pool, config }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/admin`, state);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("only owner can view and edit a staff card or reset its password", async () => {
  await withStaffServer(async (root, state) => {
    const call = (path, token, method = "GET", body) => fetch(`${root}${path}`, {
      method,
      headers: { Cookie: `admin_test=${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal((await call("/staff/staff-id", "staff-token")).status, 403);
    const card = await call("/staff/staff-id", "owner-token");
    assert.equal(card.status, 200);
    assert.equal((await card.json()).staff.password_hash, undefined);

    const changes = { displayName: "Updated Staff", email: "updated@example.test", role: "orders", status: "active" };
    assert.equal((await call("/staff/staff-id", "staff-token", "PATCH", changes)).status, 403);
    assert.equal((await call("/staff/staff-id", "owner-token", "PATCH", changes)).status, 200);
    assert.equal(state.staff.display_name, "Updated Staff");
    assert.equal(state.staff.role, "orders");

    assert.equal((await call("/staff/staff-id/password", "staff-token", "PATCH", { newPassword: "new-password-123" })).status, 403);
    assert.equal((await call("/staff/staff-id/password", "owner-token", "PATCH", { newPassword: "short" })).status, 400);
    assert.equal((await call("/staff/owner-id/password", "owner-token", "PATCH", { newPassword: "new-password-123" })).status, 400);
    assert.equal((await call("/staff/staff-id/password", "owner-token", "PATCH", { newPassword: "new-password-123" })).status, 204);
    assert.equal(verifyAdminPassword("new-password-123", state.staff.password_hash), true);
    assert.equal(state.revoked, true);
    assert.ok(state.audits.includes("admin.staff_password_reset"));
  });
});
