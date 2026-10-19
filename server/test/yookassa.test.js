import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentPayload,
  buildReceiptItems,
  createFinalReceipt,
  mapProviderStatus,
  minorToValue,
  valueToMinor,
  verifyPaymentForOrder,
} from "../payments/yookassa.js";

const order = {
  id: "bd51e1cf-39d2-4eac-931d-f38a51a7b95c",
  order_number: "FA-2026-TEST001",
  total_minor: 169950,
  currency: "RUB",
};
const config = { returnUrl: "https://fluide-atelier.ru/checkout.html?payment=return", testMode: true };

test("YooKassa amounts use exact two-decimal strings", () => {
  assert.equal(minorToValue(169950), "1699.50");
  assert.equal(valueToMinor("1699.50"), 169950);
  assert.equal(valueToMinor("1699.5"), null);
});

test("YooKassa payment payload uses server-side order values", () => {
  const payload = buildPaymentPayload(order, config);
  assert.deepEqual(payload.amount, { value: "1699.50", currency: "RUB" });
  assert.equal(payload.capture, true);
  assert.equal(payload.metadata.orderId, order.id);
  assert.equal(payload.confirmation.return_url, config.returnUrl);
});

test("live payment contains an itemized prepayment receipt including shipping", () => {
  const liveOrder = {
    ...order,
    customer_email: "buyer@example.ru",
    subtotal_minor: 200000,
    discount_minor: 40000,
    delivery_minor: 9950,
  };
  const items = [{ product_name: "Аромат FLUIDE", variant_name: "30 мл", quantity: 2, unit_price_minor: 100000 }];
  const payload = buildPaymentPayload(liveOrder, { ...config, testMode: false }, items);
  assert.equal(payload.receipt.customer.email, "buyer@example.ru");
  assert.equal(payload.receipt.items.length, 3);
  assert.equal(payload.receipt.items[0].amount.value, "800.00");
  assert.equal(payload.receipt.items[0].payment_mode, "full_prepayment");
  assert.equal(payload.receipt.items[0].vat_code, 1);
  assert.equal(payload.receipt.items[2].payment_subject, "service");
  assert.equal(payload.receipt.items.reduce((sum, item) => sum + valueToMinor(item.amount.value) * item.quantity, 0), liveOrder.total_minor);
  const closing = buildReceiptItems(liveOrder, items, "full_payment");
  assert.equal(closing[0].payment_mode, "full_payment");
  assert.throws(() => buildPaymentPayload({ ...liveOrder, customer_email: null }, { ...config, testMode: false }, items), /customer_email_required/);
});

test("discount kopecks are allocated exactly and invalid receipts fail closed", () => {
  const discounted = { ...order, subtotal_minor: 300, discount_minor: 100, delivery_minor: 0, total_minor: 200 };
  const items = [{ product_name: "Товар", quantity: 3, unit_price_minor: 100 }];
  const receipt = buildReceiptItems(discounted, items);
  assert.equal(receipt.reduce((sum, item) => sum + valueToMinor(item.amount.value), 0), 200);
  assert.throws(() => buildReceiptItems({ ...discounted, total_minor: 201 }, items), /payment_receipt_amount_invalid/);
  assert.throws(() => buildReceiptItems(discounted, [{ ...items[0], quantity: 81 }]), /payment_receipt_items_invalid/);
});

test("delivery creates a separate full-payment receipt for the same live payment", async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ id: "rt-123", status: "pending" }) };
  };
  try {
    const paidOrder = {
      ...order,
      customer_email: "buyer@example.ru",
      subtotal_minor: 169950,
      discount_minor: 0,
      delivery_minor: 0,
    };
    const receipt = await createFinalReceipt(
      { ...config, testMode: false, shopId: "1499983", secretKey: "live_fake" },
      {
        order: paidOrder,
        orderItems: [{ product_name: "Аромат", quantity: 1, unit_price_minor: 169950 }],
        paymentId: "2c5b499d-000f-5000-9000-1b68e7b15f3f",
      },
    );
    assert.equal(receipt.id, "rt-123");
    assert.equal(captured.url, "https://api.yookassa.ru/v3/receipts");
    assert.equal(captured.options.headers["Idempotence-Key"], `fluide-final-${paidOrder.id}`);
    const body = JSON.parse(captured.options.body);
    assert.equal(body.items[0].payment_mode, "full_payment");
    assert.equal(body.settlements[0].type, "prepayment");
    assert.equal(body.settlements[0].amount.value, "1699.50");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verified payment must match order, amount, currency and test mode", () => {
  const payment = {
    id: "2c5b499d-000f-5000-9000-1b68e7b15f3f",
    status: "succeeded",
    test: true,
    amount: { value: "1699.50", currency: "RUB" },
    metadata: { orderId: order.id, orderNumber: order.order_number },
  };
  assert.equal(verifyPaymentForOrder(payment, order, config), payment);
  assert.throws(
    () => verifyPaymentForOrder({ ...payment, test: false }, order, config),
    /payment_verification_failed/,
  );
  assert.throws(
    () => verifyPaymentForOrder({ ...payment, amount: { value: "1.00", currency: "RUB" } }, order, config),
    /payment_verification_failed/,
  );
});

test("provider statuses map to local payment states", () => {
  assert.equal(mapProviderStatus("succeeded"), "succeeded");
  assert.equal(mapProviderStatus("canceled"), "cancelled");
  assert.equal(mapProviderStatus("pending"), "pending");
});
