import { createCdekClient } from "./cdek.js";

const compact = (value, limit = 255) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, limit);
const providerFailure = (payload) => {
  const request = payload?.requests?.find((entry) => entry.state === "INVALID" || entry.errors?.length);
  return request?.errors?.[0]?.code || (request?.state === "INVALID" ? "cdek_request_invalid" : null);
};

export function buildCdekShipment(order, items, config, shipmentPoint = config.shipmentPoint) {
  const address = order.delivery_address || {};
  if (order.payment_status !== "paid" || order.delivery_method !== "cdek"
    || address.cdekMode !== "pvz" || !address.pointCode || !shipmentPoint
    || !Number.isInteger(Number(address.tariffCode)) || !order.customer_phone_e164
    || !items.length) {
    throw new Error("cdek_shipment_order_incomplete");
  }
  const units = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  if (!Number.isSafeInteger(units) || units < 1) throw new Error("cdek_shipment_items_invalid");
  const itemWeight = Math.max(1, Math.floor(config.package.weightGrams / units));
  return {
    type: 1,
    number: `${config.orderPrefix}${order.order_number}`,
    tariff_code: Number(address.tariffCode),
    shipment_point: shipmentPoint,
    delivery_point: address.pointCode,
    recipient: {
      name: compact(order.customer_name, 120),
      phones: [{ number: order.customer_phone_e164 }],
      ...(order.customer_email ? { email: order.customer_email } : {}),
    },
    packages: [{
      number: `${config.orderPrefix}${order.order_number}-1`,
      weight: Math.max(config.package.weightGrams, itemWeight * units),
      length: config.package.lengthCm,
      width: config.package.widthCm,
      height: config.package.heightCm,
      items: items.map((item, index) => ({
        name: compact([item.product_name, item.variant_name].filter(Boolean).join(", ")),
        ware_key: compact(item.sku || `FLUIDE-${index + 1}`, 20),
        payment: { value: 0 },
        cost: Number(item.unit_price_minor) / 100,
        weight: itemWeight,
        amount: Number(item.quantity),
      })),
    }],
  };
}

async function setState(pool, job, status, { uuid = null, cdekNumber = null, error = null, delaySeconds = 0 } = {}) {
  await pool.query(
    `UPDATE cdek_shipments
        SET status = $2, cdek_uuid = COALESCE($3::UUID, cdek_uuid),
            cdek_number = COALESCE($4, cdek_number), last_error = $5,
            next_check_at = NOW() + $6::INTEGER * INTERVAL '1 second',
            lease_until = NULL, updated_at = NOW()
      WHERE order_id = $1`,
    [job.order_id, status, uuid, cdekNumber, error, delaySeconds],
  );
  if (status === "created") {
    await pool.query(
      `UPDATE commerce_orders
          SET delivery_address = delivery_address || jsonb_build_object(
            'shipmentCreation', true, 'cdekNumber', $2::TEXT, 'cdekUuid', $3::TEXT)
        WHERE id = $1`,
      [job.order_id, cdekNumber, uuid],
    );
  }
}

export async function processPendingCdekShipment(pool, config, { client = createCdekClient(config) } = {}) {
  if (!config.enabled || !config.createOrders) return false;
  const claimed = await pool.query(
    `WITH next_job AS (
       SELECT order_id FROM cdek_shipments
        WHERE status IN ('queued', 'submitting', 'accepted')
          AND next_check_at <= NOW()
          AND (lease_until IS NULL OR lease_until < NOW())
        ORDER BY next_check_at, created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE cdek_shipments s
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
              customer_name, customer_email, customer_phone_e164
         FROM commerce_orders WHERE id = $1`,
      [job.order_id],
    );
    const order = orderResult.rows[0];
    if (!order || order.payment_status !== "paid" || order.delivery_method !== "cdek") {
      await setState(pool, job, "failed", { error: "order_not_paid_or_not_cdek" });
      return true;
    }

    let providerOrder;
    if (job.cdek_uuid) {
      providerOrder = await client.orderByUuid(job.cdek_uuid);
    } else if (job.attempts > 1) {
      // A previous POST may have succeeded even if its HTTP response was lost.
      providerOrder = await client.orderByNumber(job.external_number);
      if (!providerOrder?.entity?.uuid) {
        await setState(pool, job, "needs_review", { error: "submission_result_unknown" });
        return true;
      }
    } else {
      const itemsResult = await pool.query(
        `SELECT product_name, variant_name, sku, quantity, unit_price_minor
           FROM commerce_order_items WHERE order_id = $1 ORDER BY created_at, id`,
        [job.order_id],
      );
      const payload = buildCdekShipment(order, itemsResult.rows, config, job.shipment_point);
      providerOrder = await client.registerOrder(payload);
    }

    const uuid = providerOrder?.entity?.uuid || job.cdek_uuid;
    const cdekNumber = providerOrder?.entity?.cdek_number || null;
    const error = providerFailure(providerOrder);
    if (error) {
      await setState(pool, job, "failed", { uuid, error: compact(error, 100) });
    } else if (uuid && cdekNumber) {
      await setState(pool, job, "created", { uuid, cdekNumber });
    } else if (uuid) {
      await setState(pool, job, "accepted", { uuid, delaySeconds: 20 });
    } else {
      await setState(pool, job, "needs_review", { error: "cdek_response_missing_uuid" });
    }
  } catch (error) {
    const rejected = error?.code === "cdek_provider_rejected" && error?.details?.status === 400;
    await setState(pool, job, rejected ? "failed" : job.cdek_uuid ? "accepted" : "needs_review", {
      error: compact(error?.code || error?.message || "cdek_unavailable", 100),
      delaySeconds: job.cdek_uuid && !rejected ? 60 : 0,
    });
  }
  return true;
}

export function startCdekShipmentWorker(pool, config, { client = createCdekClient(config), logger = console } = {}) {
  if (!config.enabled || !config.createOrders) return () => {};
  let stopped = false;
  let timer;
  const run = async () => {
    if (stopped) return;
    try {
      for (let index = 0; index < 10 && !stopped; index += 1) {
        if (!await processPendingCdekShipment(pool, config, { client })) break;
      }
    } catch (error) {
      logger.error("CDEK shipment worker failed:", error?.code || error?.message);
    } finally {
      if (!stopped) timer = setTimeout(run, 15_000).unref();
    }
  };
  timer = setTimeout(run, 0).unref();
  return () => { stopped = true; clearTimeout(timer); };
}
