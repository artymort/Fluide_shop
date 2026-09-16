import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_CODE_LENGTH = 6;

export function normalizeRussianPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return /^7\d{10}$/.test(digits) ? `+${digits}` : null;
}

export function generateOtpCode(randomIntImpl = randomInt) {
  return String(randomIntImpl(0, 10 ** OTP_CODE_LENGTH)).padStart(OTP_CODE_LENGTH, "0");
}

export function hashOtpCode({ secret, challengeId, phone, code }) {
  return createHmac("sha256", secret)
    .update(`${challengeId}:${phone}:${code}`)
    .digest("hex");
}

export function verifyOtpCode({ secret, challengeId, phone, code, expectedHash }) {
  if (!/^\d{6}$/.test(String(code || "")) || !/^[a-f0-9]{64}$/.test(String(expectedHash || ""))) {
    return false;
  }

  const actual = Buffer.from(hashOtpCode({ secret, challengeId, phone, code }), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
