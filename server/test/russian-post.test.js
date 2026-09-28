import assert from "node:assert/strict";
import test from "node:test";
import {
  createRussianPostClient,
  normalizeRussianPostTariff,
  RussianPostError,
  signRussianPostQuote,
  verifyRussianPostQuote,
} from "../delivery/russian-post.js";

const secret = "russian-post-test-secret-with-more-than-32-characters";

test("Russian Post tariff includes VAT and estimated delivery days", () => {
  assert.deepEqual(normalizeRussianPostTariff({
    "total-rate": 30_658,
    "total-vat": 6_132,
    "delivery-time": { "min-days": 2, "max-days": 4 },
  }), { deliveryMinor: 36_790, periodMin: 2, periodMax: 4 });
  assert.throws(() => normalizeRussianPostTariff({ "total-rate": 0 }), RussianPostError);
});

test("Russian Post quote is signed and expires after 15 minutes", () => {
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);
  const token = signRussianPostQuote({
    postalCode: "460000",
    city: "Оренбург",
    deliveryMinor: 36_790,
    currency: "RUB",
    mailType: "ONLINE_PARCEL",
    weightGrams: 1000,
    periodMin: 2,
    periodMax: 4,
  }, secret, now);
  assert.equal(verifyRussianPostQuote(token, secret, now).deliveryMinor, 36_790);
  assert.throws(() => verifyRussianPostQuote(`${token}x`, secret, now), /delivery_quote_invalid/);
  assert.throws(() => verifyRussianPostQuote(token, secret, now + 16 * 60_000), /delivery_quote_expired/);
});

test("Russian Post client only requests read-only tariff calculation", async () => {
  const requests = [];
  const client = createRussianPostClient({
    token: "app-token",
    userKey: "encoded-user-key",
    fromIndex: "600000",
    package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
  }, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        "total-rate": 30_658,
        "total-vat": 6_132,
        "delivery-time": { "min-days": 2, "max-days": 4 },
      }), { status: 200 });
    },
  });
  const quote = await client.quote("460000");
  assert.equal(quote.deliveryMinor, 36_790);
  assert.equal(requests[0].url, "https://otpravka-api.pochta.ru/1.0/tariff");
  assert.equal(requests[0].options.headers.Authorization, "AccessToken app-token");
  assert.equal(requests[0].options.headers["X-User-Authorization"], "Basic encoded-user-key");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    "index-to": "460000",
    "mail-category": "ORDINARY",
    "mail-type": "ONLINE_PARCEL",
    mass: 1000,
    "payment-method": "CASHLESS",
    "index-from": "600000",
    dimension: { height: 15, length: 25, width: 20 },
  });
});

test("Russian Post client does not misrepresent authorization failure as a quote", async () => {
  const client = createRussianPostClient({
    token: "app-token", userKey: "encoded-user-key", fromIndex: "",
    package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
  }, { fetchImpl: async () => new Response("{}", { status: 401 }) });
  await assert.rejects(() => client.quote("460000"), /russian_post_authorization_failed/);
});
