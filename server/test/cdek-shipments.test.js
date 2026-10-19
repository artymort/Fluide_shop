import assert from "node:assert/strict";
import test from "node:test";
import { buildCdekShipment, processPendingCdekShipment } from "../delivery/cdek-shipments.js";
import { persistVerifiedPayment } from "../routes/payments.js";

const config = {
  enabled: true,
  createOrders: true,
  shipmentPoint: "VLD10",
  orderPrefix: "FLUIDE-",
  package: { weightGrams: 1000, lengthCm: 25, widthCm: 20, heightCm: 15 },
};
const order = {
  id: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c",
  order_number: "000123",
  payment_status: "paid",
  delivery_method: "cdek",
  customer_name: "Анна Иванова",
  customer_phone_e164: "+79990000000",
  customer_email: "anna@example.ru",
  delivery_address: { cdekMode: "pvz", pointCode: "MSK2181", tariffCode: 136 },
};

test("live CDEK shipment uses distinct FLUIDE order number, warehouse and prepaid goods", () => {
  const payload = buildCdekShipment(order, [{
    product_name: "FLUIDE 1 Amber Wood", variant_name: "30 мл", sku: "FL-001-30",
    unit_price_minor: "349000", quantity: 2,
  }], config);
  assert.equal(payload.type, 1);
  assert.equal(payload.number, "FLUIDE-000123");
  assert.equal(payload.shipment_point, "VLD10");
  assert.equal(payload.delivery_point, "MSK2181");
  assert.equal(payload.tariff_code, 136);
  assert.deepEqual(payload.packages[0].items[0].payment, { value: 0 });
  assert.equal(payload.packages[0].weight, 1000);
  assert.equal(payload.packages[0].items[0].amount, 2);
  assert.ok(!("from_location" in payload));
  assert.ok(!("to_location" in payload));
});

test("unpaid CDEK order cannot become a shipment", () => {
  assert.throws(() => buildCdekShipment({ ...order, payment_status: "pending" }, [{ quantity: 1 }], config));
});

test("only a new real paid CDEK order is queued once", async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("INSERT INTO commerce_payments")) return { rows: [{ id: "payment-1" }] };
      return { rows: [] };
    },
    release: () => {},
  };
  const database = { connect: async () => client };
  await persistVerifiedPayment(database, { ...order, payment_status: "pending" }, {
    id: "yoo-payment-1", status: "succeeded", test: false,
  }, null, null, false, config);
  const queued = queries.find(({ sql }) => sql.includes("INSERT INTO cdek_shipments"));
  assert.deepEqual(queued?.params, [order.id, "FLUIDE-000123", "VLD10"]);
  assert.equal(queries.at(-1).sql, "COMMIT");

  queries.length = 0;
  await persistVerifiedPayment(database, { ...order, payment_status: "pending" }, {
    id: "yoo-test-1", status: "succeeded", test: true,
  }, null, null, false, config);
  assert.ok(!queries.some(({ sql }) => sql.includes("INSERT INTO cdek_shipments")));
});

test("accepted CDEK response waits for assigned waybill number", async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{
      order_id: order.id, status: "submitting", attempts: 1,
      external_number: "FLUIDE-000123", shipment_point: "VLD10",
    }] };
    if (sql.includes("FROM commerce_orders WHERE id")) return { rows: [order] };
    if (sql.includes("FROM commerce_order_items")) return { rows: [{
      product_name: "Парфюм", sku: "SKU", unit_price_minor: "349000", quantity: 1,
    }] };
    return { rows: [] };
  } };
  const client = { registerOrder: async () => ({ entity: {
    uuid: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c",
  } }) };
  assert.equal(await processPendingCdekShipment(pool, config, { client }), true);
  const update = queries.find(({ sql }) => sql.includes("UPDATE cdek_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "accepted");
  assert.ok(!queries.some(({ sql }) => sql.includes("UPDATE commerce_orders")));
});

test("uncertain submission is reconciled by number without another POST", async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{
      order_id: order.id, status: "submitting", attempts: 2,
      external_number: "FLUIDE-000123", shipment_point: "VLD10",
    }] };
    if (sql.includes("FROM commerce_orders WHERE id")) return { rows: [order] };
    return { rows: [] };
  } };
  let registered = false;
  const client = {
    orderByNumber: async (number) => {
      assert.equal(number, "FLUIDE-000123");
      return null;
    },
    registerOrder: async () => { registered = true; },
  };
  assert.equal(await processPendingCdekShipment(pool, config, { client }), true);
  assert.equal(registered, false);
  const update = queries.find(({ sql }) => sql.includes("UPDATE cdek_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "needs_review");
});

test("assigned CDEK number updates the paid order", async () => {
  const queries = [];
  const uuid = "bd51e1cf-39d2-4eac-931d-f38a51a7b95c";
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{
      order_id: order.id, status: "accepted", attempts: 3, cdek_uuid: uuid,
      external_number: "FLUIDE-000123", shipment_point: "VLD10",
    }] };
    if (sql.includes("FROM commerce_orders WHERE id")) return { rows: [order] };
    return { rows: [] };
  } };
  const client = { orderByUuid: async () => ({ entity: { uuid, cdek_number: "1234567890" } }) };
  assert.equal(await processPendingCdekShipment(pool, config, { client }), true);
  const update = queries.find(({ sql }) => sql.includes("UPDATE cdek_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "created");
  assert.ok(queries.some(({ sql }) => sql.includes("UPDATE commerce_orders")));
});

test("an invalid asynchronous CDEK request does not remain pending forever", async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{
      order_id: order.id, status: "accepted", attempts: 2,
      cdek_uuid: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c",
    }] };
    if (sql.includes("FROM commerce_orders WHERE id")) return { rows: [order] };
    return { rows: [] };
  } };
  const client = { orderByUuid: async () => ({
    entity: { uuid: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c" },
    requests: [{ state: "INVALID", errors: [] }],
  }) };
  await processPendingCdekShipment(pool, config, { client });
  const update = queries.find(({ sql }) => sql.includes("UPDATE cdek_shipments") && sql.includes("SET status = $2"));
  assert.equal(update.params[1], "failed");
  assert.equal(update.params[4], "cdek_request_invalid");
});
