import assert from "node:assert/strict";
import test from "node:test";
import { createRussianPostClient } from "../delivery/russian-post.js";
import { buildRussianPostShipment, processPendingRussianPostShipment } from "../delivery/russian-post-shipments.js";
import { persistVerifiedPayment } from "../routes/payments.js";

const config = {
  enabled: true, createOrders: true, token: "app-token", userKey: "user-key",
  fromIndex: "600000", orderPrefix: "FLUIDE-",
  package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
};
const order = {
  id: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c", order_number: "000123",
  payment_status: "paid", delivery_method: "russian_post",
  customer_name: "Анна Иванова", customer_phone_e164: "+79990000000",
  delivery_address: {
    mailType: "ONLINE_PARCEL", postalCode: "460044", city: "Оренбург",
    address: "улица Лесная, д. 5, кв. 12",
  },
};
const address = {
  index: "460044", region: "Оренбургская область", place: "Оренбург",
  street: "улица Лесная", house: "5", room: "12",
};
const recipient = { valid: true, name: "Анна", surname: "Иванова" };

test("prepaid Russian Post shipment uses a unique FLUIDE number and no cash-on-delivery", () => {
  const payload = buildRussianPostShipment(order, address, recipient, config);
  assert.equal(payload["order-num"], "FLUIDE-000123");
  assert.equal(payload["postoffice-code"], "600000");
  assert.equal(payload["mail-type"], "ONLINE_PARCEL");
  assert.equal(payload["index-to"], 460044);
  assert.equal(payload["given-name"], "Анна");
  assert.equal(payload.surname, "Иванова");
  assert.equal(payload["payment-method"], "CASHLESS");
  assert.ok(!("payment" in payload));
  assert.throws(() => buildRussianPostShipment({ ...order, payment_status: "unpaid" }, address, recipient, config));
  assert.throws(() => buildRussianPostShipment(order, { ...address, index: "600000" }, recipient, config));
});

test("Russian Post client uses official live registration, safe search and shipping-point APIs", async () => {
  const requests = [];
  const client = createRussianPostClient(config, { fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("user-shipping-points")) return new Response(JSON.stringify([
      { enabled: true, "operator-postcode": "600000" },
      { enabled: false, "operator-postcode": "600001" },
    ]), { status: 200 });
    if (String(url).includes("backlog/search")) return new Response("[]", { status: 200 });
    return new Response(JSON.stringify({ orders: [{ "order-num": "FLUIDE-000123", "result-id": 77 }] }), { status: 200 });
  } });
  assert.equal((await client.shippingPoints()).length, 1);
  await client.registerOrder({ "order-num": "FLUIDE-000123" });
  await client.searchOrder("FLUIDE-000123");
  assert.equal(requests[1].url, "https://otpravka-api.pochta.ru/2.0/user/backlog");
  assert.equal(requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[1].options.body), [{ "order-num": "FLUIDE-000123" }]);
  assert.equal(new URL(requests[2].url).searchParams.get("query"), "FLUIDE-000123");
});

test("only a new real paid Russian Post order is queued", async () => {
  const queries = [];
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("INSERT INTO commerce_payments")) return { rows: [{ id: "payment-1" }] };
    return { rows: [] };
  }, release: () => {} };
  const database = { connect: async () => client };
  await persistVerifiedPayment(database, { ...order, payment_status: "unpaid" },
    { id: "yoo-payment-1", status: "succeeded", test: false },
    null, null, false, null, config);
  assert.deepEqual(queries.find(({ sql }) => sql.includes("INSERT INTO russian_post_shipments"))?.params,
    [order.id, "FLUIDE-000123", "600000"]);
  queries.length = 0;
  await persistVerifiedPayment(database, { ...order, payment_status: "unpaid" },
    { id: "yoo-test-1", status: "succeeded", test: true },
    null, null, false, null, config);
  assert.ok(!queries.some(({ sql }) => sql.includes("INSERT INTO russian_post_shipments")));
});

const mockPool = (job, queries) => ({ query: async (sql, params) => {
  queries.push({ sql, params });
  if (sql.includes("WITH next_job")) return { rows: [job] };
  if (sql.includes("FROM commerce_orders WHERE id")) return { rows: [order] };
  return { rows: [] };
} });

test("Russian Post success stores its internal id and waits for barcode", async () => {
  const queries = [];
  const pool = mockPool({ order_id: order.id, status: "submitting", attempts: 1,
    external_number: "FLUIDE-000123", shipping_point: "600000" }, queries);
  const client = {
    normalizedAddressForShipment: async () => address,
    normalizeRecipientName: async () => recipient,
    searchOrder: async () => [],
    registerOrder: async () => ({ orders: [{ "order-num": "FLUIDE-000123", "result-id": 77 }] }),
  };
  assert.equal(await processPendingRussianPostShipment(pool, config, { client }), true);
  const update = queries.find(({ sql }) => sql.includes("UPDATE russian_post_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "awaiting_barcode");
  assert.equal(update.params[2], 77);
  assert.ok(queries.some(({ sql }) => sql.includes("UPDATE commerce_orders")));
});

test("uncertain Russian Post PUT result never triggers another PUT", async () => {
  const queries = [];
  const pool = mockPool({ order_id: order.id, status: "submitting", attempts: 2,
    external_number: "FLUIDE-000123" }, queries);
  let registered = false;
  const client = {
    searchOrder: async () => [],
    registerOrder: async () => { registered = true; },
  };
  await processPendingRussianPostShipment(pool, config, { client });
  assert.equal(registered, false);
  const update = queries.find(({ sql }) => sql.includes("UPDATE russian_post_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "needs_review");
});

test("Russian Post barcode is recorded only for the exact external order number", async () => {
  const queries = [];
  const pool = mockPool({ order_id: order.id, status: "awaiting_barcode", attempts: 4,
    external_number: "FLUIDE-000123", post_order_id: 77 }, queries);
  const client = { searchOrder: async () => [
    { "order-num": "FLUIDE-000123-other", id: 50, barcode: "WRONG" },
    { "order-num": "FLUIDE-000123", id: 77, barcode: "80100012345678" },
  ] };
  await processPendingRussianPostShipment(pool, config, { client });
  const update = queries.find(({ sql }) => sql.includes("UPDATE russian_post_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "created");
  assert.equal(update.params[3], "80100012345678");
});
