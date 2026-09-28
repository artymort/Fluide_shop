import { createHmac, timingSafeEqual } from "node:crypto";

const QUOTE_TTL_SECONDS = 15 * 60;
const MAX_DELIVERY_MINOR = 500_000;

export class RussianPostError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const cleanText = (value, maximum = 120) => String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);
const signatureFor = (body, secret) => createHmac("sha256", secret).update(body).digest();

export function signRussianPostQuote(payload, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({
    ...payload,
    version: 1,
    provider: "russian_post",
    expiresAt: Math.floor(now / 1000) + QUOTE_TTL_SECONDS,
  })).toString("base64url");
  return `${body}.${signatureFor(body, secret).toString("base64url")}`;
}

export function verifyRussianPostQuote(token, secret, now = Date.now()) {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) throw new RussianPostError("delivery_quote_invalid", 409);
  const actual = Buffer.from(signature, "base64url");
  const expected = signatureFor(body, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new RussianPostError("delivery_quote_invalid", 409);
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new RussianPostError("delivery_quote_invalid", 409);
  }
  if (payload?.version !== 1 || payload.provider !== "russian_post"
    || !Number.isInteger(payload.expiresAt)) {
    throw new RussianPostError("delivery_quote_invalid", 409);
  }
  if (payload.expiresAt < Math.floor(now / 1000)) {
    throw new RussianPostError("delivery_quote_expired", 409);
  }
  if (!/^\d{6}$/.test(payload.postalCode)
    || !cleanText(payload.city)
    || !Number.isSafeInteger(payload.deliveryMinor)
    || payload.deliveryMinor < 1
    || payload.deliveryMinor > MAX_DELIVERY_MINOR
    || payload.currency !== "RUB"
    || payload.mailType !== "ONLINE_PARCEL"
    || !Number.isInteger(payload.weightGrams)
    || payload.weightGrams < 1) {
    throw new RussianPostError("delivery_quote_invalid", 409);
  }
  return payload;
}

export function normalizeRussianPostTariff(payload) {
  const rate = payload?.["total-rate"];
  const vat = payload?.["total-vat"];
  if (!Number.isSafeInteger(rate) || !Number.isSafeInteger(vat) || rate < 0 || vat < 0) {
    throw new RussianPostError("russian_post_tariff_unavailable", 422);
  }
  const deliveryMinor = rate + vat;
  if (deliveryMinor < 1 || deliveryMinor > MAX_DELIVERY_MINOR) {
    throw new RussianPostError("russian_post_tariff_unavailable", 422);
  }
  const min = payload?.["delivery-time"]?.["min-days"];
  const max = payload?.["delivery-time"]?.["max-days"];
  const periodMin = Number.isInteger(min) && min > 0 && min <= 365 ? min : null;
  const periodMax = Number.isInteger(max) && max > 0 && max <= 365 ? max : null;
  return { deliveryMinor, periodMin, periodMax };
}

export function normalizeRussianPostAddress(payload, originalAddress = "") {
  const entry = Array.isArray(payload) ? payload[0] : null;
  if (!entry || entry["quality-code"] !== "GOOD"
    || !new Set(["VALIDATED", "OVERRIDDEN", "CONFIRMED_MANUALLY"]).has(entry["validation-code"])) return null;
  const clean = (value, max = 160) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
  const postalCode = clean(entry.index, 6);
  const city = clean(entry.place, 120);
  const street = clean(entry.street);
  const house = clean(entry.house, 40);
  const room = clean(entry.room, 40);
  if (!/^\d{6}$/.test(postalCode) || !city || !street || !house) return null;
  const apartmentMentioned = /(?:^|[\s,;])кв(?:артира)?\.?\s*\d/i.test(originalAddress);
  const roomMentioned = /(?:^|[\s,;])(?:оф(?:ис)?|пом(?:ещение)?)\.?\s*\d/i.test(originalAddress);
  if ((apartmentMentioned || roomMentioned) && !room) return null;
  const houseNumber = `${house}${entry.slash ? `/${clean(entry.slash, 20)}` : ""}`;
  const address = [
    street,
    `д. ${houseNumber}`,
    entry.corpus ? `корп. ${clean(entry.corpus, 30)}` : "",
    entry.building ? `стр. ${clean(entry.building, 30)}` : "",
    entry.letter ? `лит. ${clean(entry.letter, 20)}` : "",
    room ? `${apartmentMentioned ? "кв." : "пом."} ${room}` : "",
  ].filter(Boolean).join(", ");
  if (address.length > 300) return null;
  return { city, postalCode, address };
}

export function createRussianPostClient(config, { fetchImpl = globalThis.fetch } = {}) {
  async function quote(postalCode) {
    if (!/^\d{6}$/.test(postalCode)) throw new RussianPostError("delivery_postal_code_required", 400);
    const body = {
      "index-to": postalCode,
      "mail-category": "ORDINARY",
      "mail-type": "ONLINE_PARCEL",
      mass: config.package.weightGrams,
      "payment-method": "CASHLESS",
      ...(config.fromIndex ? { "index-from": config.fromIndex } : {}),
      dimension: {
        height: config.package.heightCm,
        length: config.package.lengthCm,
        width: config.package.widthCm,
      },
    };
    let response;
    try {
      response = await fetchImpl("https://otpravka-api.pochta.ru/1.0/tariff", {
        method: "POST",
        headers: {
          Authorization: `AccessToken ${config.token}`,
          "X-User-Authorization": `Basic ${config.userKey}`,
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new RussianPostError("russian_post_provider_unavailable", 503);
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new RussianPostError("russian_post_authorization_failed", 502);
    }
    if (!response.ok) throw new RussianPostError("russian_post_provider_rejected", 502);
    return normalizeRussianPostTariff(payload);
  }

  async function normalizeAddress({ city, postalCode, address }) {
    const originalAddress = `${postalCode}, ${city}, ${address}`;
    let response;
    try {
      response = await fetchImpl("https://otpravka-api.pochta.ru/1.0/clean/address", {
        method: "POST",
        headers: {
          Authorization: `AccessToken ${config.token}`,
          "X-User-Authorization": `Basic ${config.userKey}`,
          "Content-Type": "application/json;charset=UTF-8",
          Accept: "application/json",
        },
        body: JSON.stringify([{ id: "1", "original-address": originalAddress }]),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new RussianPostError("russian_post_provider_unavailable", 503);
    }
    const payload = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) {
      throw new RussianPostError("russian_post_authorization_failed", 502);
    }
    if (!response.ok) throw new RussianPostError("russian_post_provider_rejected", 502);
    return normalizeRussianPostAddress(payload, address);
  }
  return Object.freeze({ quote, normalizeAddress });
}
