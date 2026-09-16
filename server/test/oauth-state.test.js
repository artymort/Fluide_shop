import assert from "node:assert/strict";
import test from "node:test";
import { createOAuthState, readOAuthState } from "../security/oauth-state.js";

const secret = "test-secret-with-at-least-thirty-two-characters";

test("OAuth state round-trips with its PKCE verifier", () => {
  const created = createOAuthState(secret, 1_000);
  const parsed = readOAuthState(created.cookieValue, secret, 2_000);

  assert.equal(parsed.state, created.state);
  assert.equal(parsed.verifier, created.verifier);
  assert.match(created.challenge, /^[A-Za-z0-9_-]{43}$/);
});

test("OAuth state rejects tampering and expiration", () => {
  const created = createOAuthState(secret, 1_000);
  assert.equal(readOAuthState(`${created.cookieValue}x`, secret, 2_000), null);
  assert.equal(readOAuthState(created.cookieValue, secret, 700_001), null);
});
