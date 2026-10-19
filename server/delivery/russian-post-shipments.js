import { createRussianPostClient } from "./russian-post.js";

const compact = (value, limit = 255) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);

export function buildRussianPostShipment(order, address, recipient, config) {
  const delivery = order.delivery_address || {};
  if (order.payment_status !== "paid" || order.delivery_method !== "russian_post"
    || delivery.mailType !== "ONLINE_PARCEL" || !/^\d{6}$/.test(String(delivery.postalCode || ""))
    || String(address.index) !== String(delivery.postalCode)
    || !address.place || !address.region || !address.street || !address.house
    || !recipient.valid || !recipient.name || !recipient.surname
    || !/^\+7\d{10}$/.test(String(order.customer_phone_e164 || ""))
    || !/^\d{6}$/.test(String(config.fromIndex || ""))) {
    throw new Error("russian_post_shipment_order_incomplete");
  }
  return {
    "address-type-to": "DEFAULT",
    "given-name": compact(recipient.name, 120),
    surname: compact(recipient.surname, 120),
    ...(recipient["middle-name"] ? { "middle-name": compact(recipient["middle-name"], 120) } : {}),
    "recipient-name": compact(order.customer_name, 120),
    "tel-address": Number(order.customer_phone_e164.slice(1)),
    "index-to": Number(address.index),
    "region-to": compact(address.region, 120),
    "place-to": compact(address.place, 120),
    "street-to": compact(address.street, 160),
    "house-to": compact(address.house, 40),
    ...(address.corpus ? { "corpus-to": compact(address.corpus, 40) } : {}),
    ...(address.building ? { "building-to": compact(address.building, 40) } : {}),
    ...(address.room ? { "room-to": compact(address.room, 40) } : {}),
    ...(address.slash ? { "slash-to": compact(address.slash, 30) } : {}),
    "mail-category": "ORDINARY",
    "mail-direct": 643,
    "mail-type": "ONLINE_PARCEL",
    mass: config.package.weightGrams,
    dimension: {
      height: config.package.heightCm,
      length: config.package.lengthCm,
      width: config.package.widthCm,
    },
    "payment-method": "CASHLESS",
    "postoffice-code": config.fromIndex,
    "order-num": `${config.orderPrefix}${order.order_number}`,
  };
}

const orderFromSearch = (payload, number) => {
  const orders = Array.isArray(payload) ? payload : (Array.isArray(payload?.orders) ? payload.orders : []);
  return orders.find((order) => order?.["order-num"] === number) || null;
};

const orderFromRegistration = (payload, number) => {
  const error = payload?.errors?.[0]?.["error-codes"]?.[0]?.code;
  if (error) return { error };
  const order = payload?.orders?.find((entry) => entry?.["order-num"] === number);
  return order || null;
};

async function setState(pool, job, status, { postOrderId = null, barcode = null, error = null, delaySeconds = 0 } = {}) {
  await pool.query(
    `UPDATE russian_post_shipments
        SET status = $2, post_order_id = COALESCE($3::BIGINT, post_order_id),
            barcode = COALESCE($4, barcode), last_error = $5,
            next_check_at = NOW() + $6::INTEGER * INTERVAL '1 second',
            lease_until = NULL, updated_at = NOW()
      WHERE order_id = $1`,
    [job.order_id, status, postOrderId, barcode, error, delaySeconds],
  );
  if (status === "created" || status === "awaiting_barcode") {
    await pool.query(
      `UPDATE commerce_orders
          SET delivery_address = delivery_address || jsonb_build_object(
            'shipmentCreation', true, 'russianPostId', $2::BIGINT, 'russianPostBarcode', $3::TEXT)
        WHERE id = $1`,
      [job.order_id, postOrderId || job.post_order_id, barcode || job.barcode],
    );
  }
}

export async function processPendingRussianPostShipment(pool, config,
  { client = createRussianPostClient(config) } = {}) {
  if (!config.enabled || !config.createOrders) return false;
  const claimed = await pool.query(
    `WITH next_job AS (
       SELECT order_id FROM russian_post_shipments
        WHERE status IN ('queued', 'submitting', 'awaiting_barcode')
          AND next_check_at <= NOW()
          AND (lease_until IS NULL OR lease_until < NOW())
        ORDER BY next_check_at, created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE russian_post_shipments s
        SET status = CASE WHEN s.status = 'queued' THEN 'submitting' ELSE s.status END,
            lease_until = NOW() + INTERVAL '45 seconds', attempts = attempts + 1,
            updated_at = NOW()
       FROM next_job WHERE s.order_id = next_job.order_id
     RETURNING s.*`,
  );
  const job = claimed.rows[0];
  if (!job) return false;
  try {
    const orderResult = await pool.query(
      `SELECT id, order_number, payment_status, delivery_method, delivery_address,
              customer_name, customer_phone_e164
         FROM commerce_orders WHERE id = $1`,
      [job.order_id],
    );
    const order = orderResult.rows[0];
    if (!order || order.payment_status !== "paid" || order.delivery_method !== "russian_post") {
      await setState(pool, job, "failed", { error: "order_not_paid_or_not_russian_post" });
      return true;
    }

    let providerOrder;
    if (job.status === "awaiting_barcode" || job.attempts > 1) {
      const found = await client.searchOrder(job.external_number);
      providerOrder = orderFromSearch(found, job.external_number);
      if (!providerOrder && job.status !== "awaiting_barcode") {
        await setState(pool, job, "needs_review", { error: "submission_result_unknown" });
        return true;
      }
      if (!providerOrder) {
        await setState(pool, job, "awaiting_barcode", { delaySeconds: 600 });
        return true;
      }
    } else {
      const delivery = order.delivery_address || {};
      const address = await client.normalizedAddressForShipment(delivery);
      const recipient = await client.normalizeRecipientName(order.customer_name);
      const payload = buildRussianPostShipment(order, address, recipient, {
        ...config, fromIndex: job.shipping_point,
      });
      providerOrder = orderFromSearch(await client.searchOrder(job.external_number), job.external_number);
      if (!providerOrder) {
        const response = await client.registerOrder(payload);
        providerOrder = orderFromRegistration(response, job.external_number);
        if (providerOrder?.error) {
          await setState(pool, job, "failed", { error: compact(providerOrder.error, 100) });
          return true;
        }
      }
    }

    const postOrderId = Number(providerOrder?.["result-id"] || providerOrder?.id || job.post_order_id);
    const barcode = compact(providerOrder?.barcode, 40) || null;
    if (!Number.isSafeInteger(postOrderId) || postOrderId < 1) {
      await setState(pool, job, "needs_review", { error: "russian_post_response_missing_id" });
    } else {
      await setState(pool, job, barcode ? "created" : "awaiting_barcode", {
        postOrderId, barcode, delaySeconds: barcode ? 0 : 600,
      });
    }
  } catch (error) {
    // A timed-out PUT may have created an order. Never repeat it automatically.
    const status = job.status === "awaiting_barcode" ? "awaiting_barcode"
      : error?.status === 422 ? "failed" : "needs_review";
    await setState(pool, job, status, {
      error: compact(error?.code || error?.message || "russian_post_unavailable", 100),
      delaySeconds: status === "awaiting_barcode" ? 600 : 0,
    });
  }
  return true;
}

export function startRussianPostShipmentWorker(pool, config,
  { client = createRussianPostClient(config), logger = console } = {}) {
  if (!config.enabled || !config.createOrders) return () => {};
  let stopped = false;
  let timer;
  const run = async () => {
    if (stopped) return;
    try {
      for (let index = 0; index < 10 && !stopped; index += 1) {
        if (!await processPendingRussianPostShipment(pool, config, { client })) break;
      }
    } catch (error) {
      logger.error("Russian Post shipment worker failed:", error?.code || error?.message);
    } finally {
      if (!stopped) timer = setTimeout(run, 15_000).unref();
    }
  };
  timer = setTimeout(run, 0).unref();
  return () => { stopped = true; clearTimeout(timer); };
}
