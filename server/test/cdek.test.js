import assert from "node:assert/strict";
import test from "node:test";
import {
  CdekError,
  createCdekClient,
  normalizeCdekCity,
  normalizeCdekPoint,
  quotePayload,
  selectCdekTariff,
  signCdekQuote,
  verifyCdekQuote,
} from "../delivery/cdek.js";

const secret = "cdek-test-secret-with-more-than-32-characters";

test("CDEK tariff selection keeps the requested delivery mode and lowest price", () => {
  const tariff = selectCdekTariff([
    { tariff_code: 1, delivery_mode: 3, total_sum: 400, period_max: 2 },
    { tariff_code: 2, delivery_mode: 4, total_sum: 550, period_max: 2 },
    { tariff_code: 3, delivery_mode: 4, total_sum: 450, period_max: 4 },
  ], "pvz");

  assert.equal(tariff.tariff_code, 3);
  assert.equal(tariff.deliveryMinor, 45_000);
});

test("signed CDEK quote detects tampering and expiration", () => {
  const now = Date.UTC(2026, 8, 22, 12, 0, 0);
  const token = signCdekQuote({
    mode: "pvz",
    city: "Оренбург",
    cityCode: 100,
    postalCode: "",
    address: "ул. Мира, 1",
    pointCode: "ORE1",
    tariffCode: 136,
    deliveryMinor: 49_900,
    currency: "RUB",
  }, secret, now);

  assert.equal(verifyCdekQuote(token, secret, now).deliveryMinor, 49_900);
  assert.throws(() => verifyCdekQuote(`${token}x`, secret, now), CdekError);
  assert.throws(() => verifyCdekQuote(token, secret, now + 16 * 60_000), /delivery_quote_expired/);
});

test("CDEK point normalization only returns usable pickup points", () => {
  assert.deepEqual(normalizeCdekPoint({
    code: "ORE1",
    name: "ПВЗ",
    type: "PVZ",
    work_time: "10:00–20:00",
    location: { address: "ул. Мира, 1", latitude: 51.7, longitude: 55.1 },
  }), {
    code: "ORE1",
    name: "ПВЗ",
    type: "pvz",
    address: "ул. Мира, 1",
    workTime: "10:00–20:00",
    latitude: 51.7,
    longitude: 55.1,
  });
  assert.equal(normalizeCdekPoint({ code: "ORE2" }), null);
});

test("CDEK city normalization builds a clear suggestion label", () => {
  assert.deepEqual(normalizeCdekCity({
    code: 261,
    city: "Оренбург",
    sub_region: "городской округ Оренбург",
    region: "Оренбургская область",
  }), {
    code: 261,
    city: "Оренбург",
    subRegion: "городской округ Оренбург",
    region: "Оренбургская область",
    label: "Оренбург, городской округ Оренбург, Оренбургская область",
  });
  assert.equal(normalizeCdekCity({ city: "Без кода" }), null);
});

test("CDEK quote payload marks shipment creation as disabled", () => {
  const payload = quotePayload({
    destination: { city: "Оренбург", code: 100, postalCode: "460044" },
    tariff: {
      tariff_code: 136,
      tariff_name: "Посылка склад-склад",
      delivery_mode: 4,
      deliveryMinor: 49_900,
      period_min: 2,
      period_max: 4,
    },
    mode: "pvz",
    point: { code: "ORE1", name: "ПВЗ", type: "pvz", address: "ул. Мира, 1" },
  });

  assert.equal(payload.shipmentCreation, false);
  assert.equal(payload.pointCode, "ORE1");
  assert.equal(payload.deliveryMinor, 49_900);
});

test("CDEK client resolves the origin city code before tariff calculation", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const requestUrl = new URL(url);
    calls.push({ url: requestUrl, options });
    if (requestUrl.pathname.endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    }
    if (requestUrl.pathname.endsWith("/location/cities") && requestUrl.searchParams.get("code") === "261") {
      return new Response(JSON.stringify([{ code: 261, city: "Оренбург", region: "Оренбургская область" }]), { status: 200 });
    }
    if (requestUrl.pathname.endsWith("/location/cities") && requestUrl.searchParams.get("city") === "Владимир") {
      return new Response(JSON.stringify([{ code: 999, city: "Владимир", region: "Владимирская область" }]), { status: 200 });
    }
    if (requestUrl.pathname.endsWith("/calculator/tarifflist")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.from_location, { code: 999 });
      assert.deepEqual(body.to_location, { code: 261 });
      return new Response(JSON.stringify({
        tariff_codes: [{ tariff_code: 136, tariff_name: "Посылка", delivery_mode: 4, total_sum: 499 }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500 });
  };
  const client = createCdekClient({
    account: "account",
    securePassword: "secret",
    apiBase: "https://api.cdek.ru/v2",
    fromCity: "Владимир",
    package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
  }, { fetchImpl });

  const destination = await client.findCity({ code: 261, city: "Оренбург", postalCode: "" });
  const tariff = await client.quote({ destination, mode: "pvz" });

  assert.equal(tariff.deliveryMinor, 49_900);
  assert.equal(calls.filter((call) => call.url.pathname.endsWith("/location/cities")).length, 2);
});

test("CDEK client searches and deduplicates city suggestions", async () => {
  const fetchImpl = async (url) => {
    const requestUrl = new URL(url);
    if (requestUrl.pathname.endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
    }
    if (requestUrl.pathname.endsWith("/location/suggest/cities")) {
      assert.equal(requestUrl.searchParams.get("name"), "Орен");
      assert.equal(requestUrl.searchParams.get("country_code"), "RU");
      return new Response(JSON.stringify([
        { code: 261, full_name: "Оренбург, Оренбургская область", country_code: "RU" },
        { code: 300, full_name: "Новосергиевка, Оренбургская область", country_code: "RU" },
        { code: 261, full_name: "Оренбург, Оренбургская область", country_code: "RU" },
      ]), { status: 200 });
    }
    return new Response(JSON.stringify({ message: "unexpected request" }), { status: 500 });
  };
  const client = createCdekClient({
    account: "account",
    securePassword: "secret",
    apiBase: "https://api.cdek.ru/v2",
    fromCity: "Владимир",
    package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
  }, { fetchImpl });

  const cities = await client.searchCities("Орен");
  assert.deepEqual(cities.map((city) => city.code), [261, 300]);
  assert.equal(cities[0].label, "Оренбург, Оренбургская область");
});
