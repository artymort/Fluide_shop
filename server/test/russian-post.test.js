import assert from "node:assert/strict";
import test from "node:test";
import {
  createRussianPostClient,
  normalizeRussianPostAddress,
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

test("Russian Post suggests only a validated complete address", () => {
  const address = {
    index: "460044", place: "Оренбург", street: "ул. Строителей", house: "9Б",
    room: "12", "quality-code": "GOOD", "validation-code": "VALIDATED",
  };
  assert.deepEqual(normalizeRussianPostAddress([address], "строителей 9б кв 12"), {
    city: "Оренбург", postalCode: "460044", address: "ул. Строителей, д. 9Б, кв. 12",
  });
  assert.equal(normalizeRussianPostAddress([{ ...address, "quality-code": "UNDEF_03" }]), null);
  assert.equal(normalizeRussianPostAddress([{ ...address, room: "" }], "строителей 9б кв 12"), null);
  assert.equal(normalizeRussianPostAddress([{ ...address, house: "" }]), null);
  assert.deepEqual(normalizeRussianPostAddress([{
    ...address, place: "г. Оренбург", street: "ул. Конституции СССР",
    house: "д. 11/2", room: "кв. 73",
  }], "ул. Конституции СССР, д. 11/2, кв. 73"), {
    city: "г. Оренбург", postalCode: "460044",
    address: "ул. Конституции СССР, д. 11/2, кв. 73",
  });
  assert.deepEqual(normalizeRussianPostAddress([{
    ...address, house: "дом 11/2", room: "квартира 73",
    corpus: "корпус 2", building: "строение 1", letter: "литера А",
  }], "дом 11/2, квартира 73"), {
    city: "Оренбург", postalCode: "460044",
    address: "ул. Строителей, д. 11/2, корп. 2, стр. 1, лит. А, кв. 73",
  });
});

test("Russian Post client requests only official address normalization", async () => {
  const requests = [];
  const client = createRussianPostClient({ token: "app-token", userKey: "encoded-user-key" }, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify([{
        index: "460044", place: "Оренбург", street: "улица Лесная", house: "5",
        "quality-code": "GOOD", "validation-code": "VALIDATED",
      }]), { status: 200 });
    },
  });
  assert.deepEqual(await client.normalizeAddress({
    city: "Оренбург", postalCode: "460044", address: "Лесная 5",
  }), { city: "Оренбург", postalCode: "460044", address: "улица Лесная, д. 5" });
  assert.equal(requests[0].url, "https://otpravka-api.pochta.ru/1.0/clean/address");
  assert.equal(requests[0].options.headers.Authorization, "AccessToken app-token");
  assert.equal(requests[0].options.headers["X-User-Authorization"], "Basic encoded-user-key");
  assert.deepEqual(JSON.parse(requests[0].options.body), [{
    id: "1", "original-address": "460044, Оренбург, Лесная 5",
  }]);
});
