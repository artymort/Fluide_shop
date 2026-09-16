import assert from "node:assert/strict";
import test from "node:test";
import { hashAdminPassword, verifyAdminPassword } from "../security/admin-auth.js";

test("admin passwords use salted scrypt hashes", () => {
  const password = "Strong-admin-password-42";
  const first = hashAdminPassword(password);
  const second = hashAdminPassword(password);
  assert.notEqual(first, second);
  assert.equal(verifyAdminPassword(password, first), true);
  assert.equal(verifyAdminPassword("wrong-password", first), false);
});

test("admin password requires at least twelve characters", () => {
  assert.throws(() => hashAdminPassword("short"), /password_too_short/);
});
