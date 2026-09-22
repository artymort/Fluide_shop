import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPaymentPayload,
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
