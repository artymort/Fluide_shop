import assert from "node:assert/strict";
import test from "node:test";
import {
  CdekError,
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
    postalCode: "460044",
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
