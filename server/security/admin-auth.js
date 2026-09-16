import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { hashSessionToken, readCookie } from "./sessions.js";

const KEY_LENGTH = 64;

export function hashAdminPassword(password) {
  const value = String(password || "");
  if (value.length < 12) throw new Error("password_too_short");
  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyAdminPassword(password, encoded) {
  try {
    const [algorithm, saltText, hashText] = String(encoded || "").split("$");
    if (algorithm !== "scrypt" || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, "base64url");
    const actual = scryptSync(String(password || ""), Buffer.from(saltText, "base64url"), expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createAdminSession({ pool, config, adminUserId, request }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.admin.sessionTtlHours * 3_600_000);
  await pool.query(
    `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      adminUserId,
      hashSessionToken(token),
      expiresAt,
      request.ip || null,
      request.get("user-agent")?.slice(0, 512) || null,
    ],
  );
  return { token, expiresAt };
}

export function setAdminCookie(response, config, token, expiresAt) {
  response.cookie(config.admin.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export function clearAdminCookie(response, config) {
  response.clearCookie(config.admin.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "strict",
    path: "/",
  });
}

export async function readAdminSession({ pool, config, request }) {
  const token = readCookie(request.get("cookie"), config.admin.cookieName);
  if (!token) return null;
  const result = await pool.query(
    `SELECT au.id, au.email, au.display_name, au.role, au.status, s.id AS session_id
       FROM admin_sessions s
       JOIN admin_users au ON au.id = s.admin_user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND au.status = 'active'
      LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0] || null;
}

export const publicAdmin = (admin) => ({
  id: admin.id,
  email: admin.email,
  displayName: admin.display_name,
  role: admin.role,
});
