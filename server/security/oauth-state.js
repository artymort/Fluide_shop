import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000;

const sign = (value, secret) => createHmac("sha256", secret).update(value).digest("base64url");

export function createOAuthState(secret, now = Date.now()) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    state,
    verifier,
    expiresAt: now + STATE_TTL_MS,
  })).toString("base64url");

  return {
    state,
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
    cookieValue: `${payload}.${sign(payload, secret)}`,
    maxAgeMs: STATE_TTL_MS,
  };
}

export function readOAuthState(cookieValue, secret, now = Date.now()) {
  if (!cookieValue || typeof cookieValue !== "string") return null;
  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra) return null;

  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof value.state !== "string"
      || typeof value.verifier !== "string"
      || !Number.isFinite(value.expiresAt)
      || value.expiresAt < now
    ) return null;
    return value;
  } catch {
    return null;
  }
}
