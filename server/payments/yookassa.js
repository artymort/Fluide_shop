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

export function buildPaymentPayload(order, config) {
  return {
    amount: { value: minorToValue(order.total_minor), currency: order.currency },
    capture: true,
    confirmation: { type: "redirect", return_url: config.returnUrl },
    description: `Оплата заказа ${order.order_number}`.slice(0, 128),
    metadata: { orderId: order.id, orderNumber: order.order_number },
  };
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

export async function createPayment(config, { order, idempotenceKey }) {
  return request(config, "/payments", {
    method: "POST",
    headers: { "Idempotence-Key": idempotenceKey },
    body: JSON.stringify(buildPaymentPayload(order, config)),
  });
}

export async function getPayment(config, paymentId) {
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(String(paymentId || ""))) {
    throw new YooKassaError("payment_id_invalid", 400);
  }
  return request(config, `/payments/${encodeURIComponent(paymentId)}`);
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
