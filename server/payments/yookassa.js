import { timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.yookassa.ru/v3";
const PROVIDER = "yookassa";

export class YooKassaError extends Error {
  constructor(code, status = 502, details = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const minorToValue = (amountMinor) => {
  const amount = Number(amountMinor);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new YooKassaError("payment_amount_invalid", 409);
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
};

export const valueToMinor = (value) => {
  const match = /^(\d+)\.(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const amount = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(amount) ? amount : null;
};

export function safeTokenEquals(value, expectedHash, hashToken) {
  if (!value || !expectedHash) return false;
  const actual = Buffer.from(hashToken(value), "hex");
  const expected = Buffer.from(String(expectedHash), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function buildReceiptItems(order, orderItems, paymentMode = "full_prepayment") {
  const subtotal = Number(order.subtotal_minor);
  const discount = Number(order.discount_minor);
  const delivery = Number(order.delivery_minor);
  const total = Number(order.total_minor);
  if (![subtotal, discount, delivery, total].every(Number.isSafeInteger)
    || subtotal < 0 || discount < 0 || discount >= subtotal || delivery < 0
    || subtotal - discount + delivery !== total || order.currency !== "RUB") {
    throw new YooKassaError("payment_receipt_amount_invalid", 409);
  }
  const units = [];
  for (const item of orderItems || []) {
    const quantity = Number(item.quantity);
    const price = Number(item.unit_price_minor);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(price)
      || price < 1 || units.length + quantity > 80) {
      throw new YooKassaError("payment_receipt_items_invalid", 409);
    }
    const description = [item.product_name, item.variant_name].filter(Boolean).join(" · ").slice(0, 128);
    if (!description) throw new YooKassaError("payment_receipt_items_invalid", 409);
    for (let i = 0; i < quantity; i += 1) units.push({ description, price });
  }
  if (!units.length || units.reduce((sum, item) => sum + item.price, 0) !== subtotal) {
    throw new YooKassaError("payment_receipt_amount_invalid", 409);
  }
  const shares = units.map((item, index) => ({
    index,
    amount: Number(BigInt(discount) * BigInt(item.price) / BigInt(subtotal)),
    fraction: Number(BigInt(discount) * BigInt(item.price) % BigInt(subtotal)),
  }));
  let remainder = discount - shares.reduce((sum, share) => sum + share.amount, 0);
  shares.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const share of shares) {
    if (remainder === 0) break;
    share.amount += 1;
    remainder -= 1;
  }
  const discountedByIndex = new Map(shares.map((share) => [share.index, share.amount]));
  const receiptItems = units.map((unit, index) => ({
    description: unit.description,
    quantity: 1,
    amount: { value: minorToValue(unit.price - discountedByIndex.get(index)), currency: "RUB" },
    vat_code: 1,
    payment_mode: paymentMode,
    payment_subject: "commodity",
  }));
  if (delivery > 0) receiptItems.push({
    description: "Доставка",
    quantity: 1,
    amount: { value: minorToValue(delivery), currency: "RUB" },
    vat_code: 1,
    payment_mode: paymentMode,
    payment_subject: "service",
  });
  if (receiptItems.length > 80) throw new YooKassaError("payment_receipt_items_invalid", 409);
  return receiptItems;
}

export function buildPaymentPayload(order, config, orderItems = []) {
  const payload = {
    amount: { value: minorToValue(order.total_minor), currency: order.currency },
    capture: true,
    confirmation: { type: "redirect", return_url: config.returnUrl },
    description: `Оплата заказа ${order.order_number}`.slice(0, 128),
    metadata: { orderId: order.id, orderNumber: order.order_number },
  };
  if (!config.testMode) {
    if (!/^\S+@\S+\.\S+$/.test(String(order.customer_email || ""))) {
      throw new YooKassaError("customer_email_required", 409);
    }
    payload.receipt = {
      customer: { email: order.customer_email },
      items: buildReceiptItems(order, orderItems),
    };
  }
  return payload;
}

export function mapProviderStatus(status) {
  if (status === "succeeded") return "succeeded";
  if (status === "canceled") return "cancelled";
  return "pending";
}

const authorization = (config) => `Basic ${Buffer.from(`${config.shopId}:${config.secretKey}`).toString("base64")}`;

async function request(config, path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: authorization(config),
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new YooKassaError("payment_provider_unavailable", 503, error?.name || "network_error");
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new YooKassaError("payment_provider_rejected", 502, {
      status: response.status,
      code: body.code,
      parameter: body.parameter,
    });
  }
  return body;
}

export async function createPayment(config, { order, orderItems, idempotenceKey }) {
  return request(config, "/payments", {
    method: "POST",
    headers: { "Idempotence-Key": idempotenceKey },
    body: JSON.stringify(buildPaymentPayload(order, config, orderItems)),
  });
}

export async function getPayment(config, paymentId) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(String(paymentId || ""))) {
    throw new YooKassaError("payment_id_invalid", 400);
  }
  return request(config, `/payments/${encodeURIComponent(paymentId)}`);
}

export async function createFinalReceipt(config, { order, orderItems, paymentId }) {
  if (config.testMode) throw new YooKassaError("payment_receipt_live_only", 409);
  if (!/^\S+@\S+\.\S+$/.test(String(order.customer_email || ""))) {
    throw new YooKassaError("customer_email_required", 409);
  }
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(String(paymentId || ""))) {
    throw new YooKassaError("payment_id_invalid", 400);
  }
  return request(config, "/receipts", {
    method: "POST",
    headers: { "Idempotence-Key": `fluide-final-${order.id}` },
    body: JSON.stringify({
      type: "payment",
      payment_id: paymentId,
      customer: { email: order.customer_email },
      send: true,
      items: buildReceiptItems(order, orderItems, "full_payment"),
      settlements: [{
        type: "prepayment",
        amount: { value: minorToValue(order.total_minor), currency: order.currency },
      }],
    }),
  });
}

export function verifyPaymentForOrder(payment, order, config) {
  const amountMinor = valueToMinor(payment?.amount?.value);
  const matches = payment?.id
    && payment?.metadata?.orderId === order.id
    && payment?.metadata?.orderNumber === order.order_number
    && amountMinor === Number(order.total_minor)
    && payment?.amount?.currency === order.currency
    && Boolean(payment?.test) === Boolean(config.testMode);
  if (!matches) throw new YooKassaError("payment_verification_failed", 409);
  return payment;
}

export function paymentResponse(payment) {
  return {
    id: payment.id,
    status: mapProviderStatus(payment.status),
    confirmationUrl: payment?.confirmation?.confirmation_url || null,
    test: Boolean(payment.test),
  };
}

export const YOOKASSA_PROVIDER = PROVIDER;
