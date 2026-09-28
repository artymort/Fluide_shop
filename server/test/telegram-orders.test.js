import assert from "node:assert/strict";
import test from "node:test";
import {
  deliverPendingTelegramOrder,
  formatPaidOrderMessage,
  sendPaidOrderMessage,
} from "../telegram/orders.js";
import { persistVerifiedPayment } from "../routes/payments.js";

const order = {
  id: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c",
  order_number: "000123",
  payment_status: "paid",
  paid_at: "2026-09-28T12:00:00Z",
  customer_name: "Анна Иванова",
  customer_phone_e164: "+79990000000",
  customer_email: "anna@example.ru",
  customer_comment: "Позвоните перед отправкой",
  subtotal_minor: "698000",
  discount_minor: "349000",
  delivery_minor: "40870",
  total_minor: "389870",
  delivery_method: "russian_post",
  delivery_address: {
    postalCode: "460044", city: "Оренбург",
    address: "ул. Конституции СССР, д. 11/2, кв. 73",
    periodMin: 3, periodMax: 5,
  },
};
const items = [{
  product_name: "FLUIDE 2 Lucky Wish", variant_name: "30 мл", quantity: 2,
  total_price_minor: "698000",
}];
const telegram = { enabled: true, botToken: "123456:example-secret", chatId: "-1001234567890" };

test("verified successful payment and Telegram queue are committed together", async () => {
  const queries = [];
  let released = false;
  const client = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("INSERT INTO commerce_payments")) return { rows: [{ id: "payment-1" }] };
    return { rows: [] };
  }, release: () => { released = true; } };
  await persistVerifiedPayment({ connect: async () => client }, order, {
    id: "yoo-payment-1", status: "succeeded", test: true,
  }, null, null, true);
  const queued = queries.find(({ sql }) => sql.includes("INSERT INTO telegram_order_notifications"));
  assert.deepEqual(queued?.params, [order.id, true]);
  assert.equal(queries[0].sql, "BEGIN");
  assert.equal(queries.at(-1).sql, "COMMIT");
  assert.equal(released, true);
});

test("unpaid payment is not sent to Telegram", async () => {
  const queries = [];
  const client = { query: async (sql) => {
    queries.push(sql);
    if (sql.includes("INSERT INTO commerce_payments")) return { rows: [{ id: "payment-2" }] };
    return { rows: [] };
  }, release: () => {} };
  await persistVerifiedPayment({ connect: async () => client }, order, {
    id: "yoo-payment-2", status: "pending", test: true,
  }, null, null, true);
  assert.ok(!queries.some((sql) => sql.includes("INSERT INTO telegram_order_notifications")));
});

test("Telegram paid order message includes fulfillment details and marks test payments", () => {
  const message = formatPaidOrderMessage(order, items, { isTest: true });
  for (const part of [
    "ТЕСТОВАЯ ОПЛАТА", "000123", "FLUIDE 2 Lucky Wish", "30 мл", "2 шт",
    "6 980 ₽", "Скидка 3+1", "Почта России", "460044", "кв. 73",
    "Анна Иванова", "+79990000000", "anna@example.ru", "Позвоните перед отправкой",
  ]) {
    assert.ok(message.replaceAll(/[\u00a0\u202f]/g, " ").includes(part.replace("2 шт", "× 2")), part);
  }
  assert.doesNotMatch(message, /payment_transaction_id|checkout_token|test_\w+/);
});

test("Telegram CDEK address excludes point label and repeated city", () => {
  const cdekOrder = {
    ...order,
    delivery_method: "cdek",
    delivery_address: {
      city: "Оренбург",
      pointName: "ORN78, Оренбург, пр-т. Дзержинского",
      address: "пр-т. Дзержинского, 7",
      periodMin: 4,
      periodMax: 5,
    },
  };
  const message = formatPaidOrderMessage(cdekOrder, items);
  assert.match(message, /^Оренбург, пр-т\. Дзержинского, 7$/m);
  assert.doesNotMatch(message, /ORN78|Дзержинского, пр-т/);

  const fullAddressMessage = formatPaidOrderMessage({
    ...cdekOrder,
    delivery_address: { ...cdekOrder.delivery_address, address: "г. Оренбург, пр-т. Дзержинского, 7" },
  }, items);
  assert.match(fullAddressMessage, /^г\. Оренбург, пр-т\. Дзержинского, 7$/m);
  assert.doesNotMatch(fullAddressMessage, /Оренбург, г\. Оренбург/);
});

test("Telegram message keeps all line items within the API limit", () => {
  const manyItems = Array.from({ length: 50 }, (_, index) => ({
    product_name: `Очень длинное название парфюмерного аромата номер ${index}`,
    variant_name: "Большой флакон 50 мл", quantity: 1, total_price_minor: "10000",
  }));
  const message = formatPaidOrderMessage(order, manyItems);
  assert.equal((message.match(/^• /gm) || []).length, 50);
  assert.ok(Array.from(message).length <= 4096);
});

test("Telegram sender posts only to the configured chat and checks API confirmation", async () => {
  const calls = [];
  const messageId = await sendPaidOrderMessage(telegram, "Заказ №000123", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 41 } }), { status: 200 });
    },
  });
  assert.equal(messageId, 41);
  assert.equal(calls[0].url, "https://api.telegram.org/bot123456:example-secret/sendMessage");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    chat_id: telegram.chatId,
    text: "Заказ №000123",
    link_preview_options: { is_disabled: true },
  });
  await assert.rejects(() => sendPaidOrderMessage(telegram, "Заказ", {
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 403 }),
  }), /telegram_rejected_403/);
});

test("Telegram worker claims a paid order and records one sent message", async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{ order_id: order.id, is_test: false, attempts: 1 }] };
    if (sql.includes("FROM commerce_orders")) return { rows: [order] };
    if (sql.includes("FROM commerce_order_items")) return { rows: items };
    return { rows: [], rowCount: 1 };
  } };
  const result = await deliverPendingTelegramOrder(pool, telegram, {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, result: { message_id: 91 } }), { status: 200 }),
  });
  assert.equal(result, true);
  assert.equal(queries.length, 4);
  assert.match(queries[3].sql, /telegram_message_id/);
  assert.equal(queries[3].params[2], 91);
});

test("Telegram worker leaves failed delivery queued for retry", async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("WITH next_job")) return { rows: [{ order_id: order.id, is_test: true, attempts: 1 }] };
    if (sql.includes("FROM commerce_orders")) return { rows: [order] };
    if (sql.includes("FROM commerce_order_items")) return { rows: items };
    return { rows: [], rowCount: 1 };
  } };
  await assert.rejects(() => deliverPendingTelegramOrder(pool, telegram, {
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, parameters: { retry_after: 30 } }), { status: 429 }),
  }), /telegram_rejected_429/);
  assert.match(queries.at(-1).sql, /next_attempt_at/);
  assert.equal(queries.at(-1).params[2], 30);
});
