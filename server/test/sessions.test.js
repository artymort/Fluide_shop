import assert from "node:assert/strict";
import test from "node:test";
import { hashSessionToken, readCookie } from "../security/sessions.js";

test("readCookie returns only the requested cookie", () => {
  assert.equal(readCookie("theme=dark; session=abc%20123", "session"), "abc 123");
  assert.equal(readCookie("theme=dark", "session"), null);
});

test("session tokens are stored as deterministic SHA-256 hashes", () => {
  const hash = hashSessionToken("secret-token");
  assert.equal(hash.length, 64);
  assert.equal(hash, hashSessionToken("secret-token"));
  assert.notEqual(hash, hashSessionToken("another-token"));
});
