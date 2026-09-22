import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  createPayment,
  getPayment,
  mapProviderStatus,
  paymentResponse,
  safeTokenEquals,
  verifyPaymentForOrder,
  YOOKASSA_PROVIDER,
  YooKassaError,
} from "../payments/yookassa.js";

const hashToken = (value) => createHash("sha256").update(String(value)).digest("hex");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const paymentLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const loadOrder = async (database, id, { includeArchived = false } = {}) => {
  if (!UUID_PATTERN.test(String(id || ""))) return null;
  const result = await database.query(
    `SELECT id, order_number, payment_status, total_minor, currency,
            delivery_method, delivery_address, checkout_token_hash
       FROM commerce_orders
      WHERE id = $1 AND ($2::BOOLEAN OR archived_at IS NULL)
      LIMIT 1`,
    [id, includeArchived],
  );
  return result.rows[0] || null;
};

const assertOrderAccess = (order, token) => {
  if (!order || !safeTokenEquals(token, order.checkout_token_hash, hashToken)) {
    throw new YooKassaError("order_not_found", 404);
  }
};

async function persistVerifiedPayment(database, order, payment, existingPaymentId = null, idempotenceKey = null) {
  const localStatus = mapProviderStatus(payment.status);
  const metadata = {
    idempotenceKey,
    paymentMethod: payment?.payment_method?.type || null,
    test: Boolean(payment.test),
  };
  let paymentRow;

  if (existingPaymentId) {
    const duplicate = await database.query(
      `SELECT id FROM commerce_payments
        WHERE provider = $1 AND provider_transaction_id = $2 AND id <> $3
        LIMIT 1`,
      [YOOKASSA_PROVIDER, payment.id, existingPaymentId],
    );
    if (duplicate.rowCount) {
      await database.query("DELETE FROM commerce_payments WHERE id = $1", [existingPaymentId]);
      const result = await database.query(
        `UPDATE commerce_payments
            SET status = $2, metadata = $3::JSONB, failure_reason = $4
          WHERE id = $1
          RETURNING *`,
        [
          duplicate.rows[0].id,
          localStatus,
          JSON.stringify(metadata),
          payment?.cancellation_details?.reason || null,
        ],
      );
      paymentRow = result.rows[0];
    } else {
      const result = await database.query(
        `UPDATE commerce_payments
            SET status = $2, provider_transaction_id = $3, metadata = $4::JSONB,
                failure_reason = $5
          WHERE id = $1
          RETURNING *`,
        [
          existingPaymentId,
          localStatus,
          payment.id,
          JSON.stringify(metadata),
          payment?.cancellation_details?.reason || null,
        ],
      );
      paymentRow = result.rows[0];
    }
  } else {
    const result = await database.query(
      `INSERT INTO commerce_payments (
         order_id, operation, status, provider, provider_transaction_id,
         amount_minor, currency, failure_reason, metadata
       ) VALUES ($1, 'payment', $2, $3, $4, $5, $6, $7, $8::JSONB)
       ON CONFLICT (provider, provider_transaction_id)
       DO UPDATE SET status = EXCLUDED.status,
                     failure_reason = EXCLUDED.failure_reason,
                     metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        order.id,
        localStatus,
        YOOKASSA_PROVIDER,
        payment.id,
        order.total_minor,
        order.currency,
        payment?.cancellation_details?.reason || null,
        JSON.stringify(metadata),
      ],
    );
    paymentRow = result.rows[0];
  }

  const orderPaymentStatus = localStatus === "succeeded"
    ? "paid"
    : localStatus === "cancelled" ? "cancelled" : "pending";
  await database.query(
    `UPDATE commerce_orders
        SET payment_status = $2,
            payment_provider = $3,
            payment_transaction_id = $4,
            paid_at = CASE WHEN $2 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
      WHERE id = $1`,
    [order.id, orderPaymentStatus, YOOKASSA_PROVIDER, payment.id],
  );
  if (paymentRow?.id) {
    await database.query(
      `DELETE FROM commerce_payments
        WHERE order_id = $1
          AND provider = $2
          AND operation = 'payment'
          AND provider_transaction_id IS NULL
          AND id <> $3`,
      [order.id, YOOKASSA_PROVIDER, paymentRow.id],
    );
  }
  return paymentRow;
}

async function providerPaymentForOrder(database, order, config) {
  const result = await database.query(
    `SELECT * FROM commerce_payments
      WHERE order_id = $1 AND operation = 'payment' AND provider = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [order.id, YOOKASSA_PROVIDER],
  );
  const row = result.rows[0];
  if (!row?.provider_transaction_id) return { row, payment: null };
  const payment = verifyPaymentForOrder(
    await getPayment(config, row.provider_transaction_id),
    order,
    config,
  );
  await persistVerifiedPayment(database, order, payment, row.id, row.metadata?.idempotenceKey || null);
  return { row, payment };
}

export function createPaymentsRouter({ pool, config }) {
  const router = Router();
  const yooKassa = config.yooKassa;

  router.post("/yookassa/webhook", async (request, response, next) => {
    if (!yooKassa.enabled) {
      response.status(503).json({ error: "payment_provider_disabled" });
      return;
    }
    try {
      const event = String(request.body?.event || "");
      const paymentId = request.body?.object?.id;
      if (!new Set(["payment.succeeded", "payment.canceled"]).has(event) || !paymentId) {
        response.status(200).end();
        return;
      }

      const payment = await getPayment(yooKassa, paymentId);
      const orderId = payment?.metadata?.orderId;
      const order = orderId ? await loadOrder(pool, orderId, { includeArchived: true }) : null;
      if (!order) {
        response.status(200).end();
        return;
      }
      verifyPaymentForOrder(payment, order, yooKassa);
      await persistVerifiedPayment(pool, order, payment);
      response.status(200).end();
    } catch (error) {
      if (error instanceof YooKassaError && error.status < 500) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/orders/:id/yookassa", paymentLimit, async (request, response, next) => {
    try {
      if (!yooKassa.enabled) throw new YooKassaError("payment_provider_disabled", 503);
      const order = await loadOrder(pool, request.params.id);
      assertOrderAccess(order, request.body?.checkoutToken);
      if (order.payment_status === "paid") {
        response.json({ payment: { status: "succeeded", confirmationUrl: null, test: yooKassa.testMode } });
        return;
      }
      if (order.delivery_address?.pricingStatus !== "fixed") {
        throw new YooKassaError("delivery_price_pending", 409);
      }

      const existing = await providerPaymentForOrder(pool, order, yooKassa);
      if (existing.payment && existing.payment.status !== "canceled") {
        response.json({ payment: paymentResponse(existing.payment) });
        return;
      }

      const placeholder = existing.row && !existing.row.provider_transaction_id
        ? existing.row
        : null;
      const idempotenceKey = placeholder?.metadata?.idempotenceKey || randomUUID();
      const placeholderResult = placeholder
        ? { rows: [placeholder] }
        : await pool.query(
          `INSERT INTO commerce_payments (
             order_id, operation, status, provider, amount_minor, currency, metadata
           ) VALUES ($1, 'payment', 'pending', $2, $3, $4, $5::JSONB)
           RETURNING id`,
          [order.id, YOOKASSA_PROVIDER, order.total_minor, order.currency, JSON.stringify({ idempotenceKey })],
        );
      const payment = verifyPaymentForOrder(
        await createPayment(yooKassa, { order, idempotenceKey }),
        order,
        yooKassa,
      );
      await persistVerifiedPayment(
        pool,
        order,
        payment,
        placeholderResult.rows[0].id,
        idempotenceKey,
      );
      response.status(201).json({ payment: paymentResponse(payment) });
    } catch (error) {
      if (error instanceof YooKassaError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/orders/:id/yookassa/status", paymentLimit, async (request, response, next) => {
    try {
      if (!yooKassa.enabled) throw new YooKassaError("payment_provider_disabled", 503);
      const order = await loadOrder(pool, request.params.id);
      assertOrderAccess(order, request.body?.checkoutToken);
      const current = await providerPaymentForOrder(pool, order, yooKassa);
      if (!current.payment) throw new YooKassaError("payment_not_found", 404);
      response.json({
        order: { orderNumber: order.order_number },
        payment: paymentResponse(current.payment),
      });
    } catch (error) {
      if (error instanceof YooKassaError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  return router;
}
