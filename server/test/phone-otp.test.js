import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeRussianPhone,
  verifyOtpCode,
} from "../security/phone-otp.js";

const secret = "test-secret-with-at-least-thirty-two-characters";

test("Russian phone numbers normalize to a single E.164 identity", () => {
  assert.equal(normalizeRussianPhone("+7 999 000-00-00"), "+79990000000");
  assert.equal(normalizeRussianPhone("8 (999) 000-00-00"), "+79990000000");
  assert.equal(normalizeRussianPhone("9990000000"), "+79990000000");
  assert.equal(normalizeRussianPhone("123"), null);
});

test("OTP generation always returns six digits", () => {
  assert.equal(generateOtpCode(() => 42), "000042");
  assert.match(generateOtpCode(), /^\d{6}$/);
});

test("OTP hashes are bound to challenge and phone and reject tampering", () => {
  const input = {
    secret,
    challengeId: "11111111-1111-4111-8111-111111111111",
    phone: "+79990000000",
    code: "123456",
  };
  const expectedHash = hashOtpCode(input);

  assert.equal(verifyOtpCode({ ...input, expectedHash }), true);
  assert.equal(verifyOtpCode({ ...input, code: "123457", expectedHash }), false);
  assert.equal(verifyOtpCode({ ...input, phone: "+79990000001", expectedHash }), false);
  assert.equal(verifyOtpCode({ ...input, challengeId: "22222222-2222-4222-8222-222222222222", expectedHash }), false);
});
