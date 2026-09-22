import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  calculatePerfumePromotion,
  cartKeyToExternalKey,
  createOrdersRouter,
  normalizeOrderPayload,
} from "../routes/orders.js";

const ordersConfig = {
  session: { cookieName: "fluide_session", secret: "test-secret" },
  cdek: { enabled: false },
  yooKassa: { enabled: false, testMode: true },
};

async function withOrdersServer(pool, callback) {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", createOrdersRouter({ pool, config: ordersConfig }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("cart keys resolve to catalog variant external keys", () => {
  assert.equal(cartKeyToExternalKey("fragrance-011-30"), "fragrance-011-30");
  assert.equal(cartKeyToExternalKey("product-01"), "product-01-default");
  assert.equal(cartKeyToExternalKey("../wrong"), null);
});

test("order payload normalizes customer, delivery and cart", () => {
  const payload = normalizeOrderPayload({
    customerName: "  Анна   Касаткина ",
    customerPhone: "8 (999) 000-00-00",
    customerEmail: "ANNA@example.com",
    deliveryMethod: "russian_post",
    deliveryAddress: { city: " Владимир ", address: " ул. Мира, 1 ", postalCode: "600000" },
    customerComment: "  Позвонить   за час ",
    items: [{ key: "fragrance-011-30", quantity: 2 }, { key: "product-01", quantity: 1 }],
  });

  assert.equal(payload.customerName, "Анна Касаткина");
  assert.equal(payload.phone, "+79990000000");
  assert.equal(payload.email, "anna@example.com");
  assert.equal(payload.items[1].externalKey, "product-01-default");
});

test("carrier delivery requires an address", () => {
  assert.throws(() => normalizeOrderPayload({
    customerName: "Анна",
    customerPhone: "+79990000000",
    deliveryMethod: "cdek",
    deliveryAddress: {},
    items: [{ key: "product-01", quantity: 1 }],
  }), /delivery_address_required/);
});

test("CDEK delivery requires a server-signed quote", () => {
  assert.throws(() => normalizeOrderPayload({
    customerName: "Анна",
    customerPhone: "+79990000000",
    deliveryMethod: "cdek",
    deliveryAddress: { city: "Оренбург", address: "ул. Мира, 1", postalCode: "" },
    items: [{ key: "product-01", quantity: 1 }],
  }), /delivery_quote_required/);

  const payload = normalizeOrderPayload({
    customerName: "Анна",
    customerPhone: "+79990000000",
    deliveryMethod: "cdek",
    deliveryQuoteToken: "signed.quote",
    deliveryAddress: { city: "Оренбург", address: "ул. Мира, 1", postalCode: "" },
    items: [{ key: "product-01", quantity: 1 }],
  });
  assert.equal(payload.deliveryQuoteToken, "signed.quote");
  assert.equal(payload.deliveryAddress.postalCode, "");
});

test("Russian Post delivery requires a six-digit postal code", () => {
  assert.throws(() => normalizeOrderPayload({
    customerName: "Анна",
    customerPhone: "+79990000000",
    deliveryMethod: "russian_post",
    deliveryAddress: { city: "Владимир", address: "ул. Мира, 1", postalCode: "123" },
    items: [{ key: "product-01", quantity: 1 }],
  }), /delivery_postal_code_required/);
});

test("3+1 promotion discounts the cheapest perfume unit only", () => {
  const promotion = calculatePerfumePromotion([
    { kind: "fragrance", price_minor: 499000, quantity: 1 },
    { kind: "fragrance", price_minor: 349000, quantity: 2 },
    { kind: "fragrance", price_minor: 199000, quantity: 1 },
    { kind: "product", price_minor: 49000, quantity: 4 },
  ]);

  assert.equal(promotion.giftCount, 1);
  assert.equal(promotion.discountMinor, 199000);
});

test("3+1 promotion never includes home and other products", () => {
  const promotion = calculatePerfumePromotion([
    { kind: "fragrance", price_minor: 349000, quantity: 3 },
    { kind: "product", price_minor: 49000, quantity: 8 },
  ]);

  assert.equal(promotion.giftCount, 0);
  assert.equal(promotion.discountMinor, 0);
});

test("customer orders require an active session", async () => {
  await withOrdersServer({ query: async () => assert.fail("database should not be queried without a cookie") }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/orders/mine`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "not_authenticated" });
  });
});

test("customer orders are scoped to the signed-in user and exclude the archive", async () => {
  const queries = [];
  const pool = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (queries.length === 1) return { rows: [{ id: "user-42" }] };
      return { rows: [{ id: "order-1", order_number: "FA-2026-TEST", items: [] }] };
    },
  };

  await withOrdersServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/orders/mine`, {
      headers: { Cookie: "fluide_session=session-token" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual((await response.json()).orders[0].order_number, "FA-2026-TEST");
  });

  assert.equal(queries[1].values[0], "user-42");
  assert.match(queries[1].sql, /o\.user_id = \$1/);
  assert.match(queries[1].sql, /o\.archived_at IS NULL/);
});
