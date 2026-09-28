import { randomUUID } from "node:crypto";

const API_BASE = "https://api.telegram.org/bot";
const MAX_MESSAGE_LENGTH = 4096;
const compact = (value, maximum = 300) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maximum);

const rubles = (minor) => {
  const amount = BigInt(minor ?? 0);
  const whole = new Intl.NumberFormat("ru-RU").format(amount / 100n);
  const kopeks = amount % 100n;
  return `${whole}${kopeks ? `,${String(kopeks).padStart(2, "0")}` : ""} ₽`;
};

const deliveryDetails = (order) => {
  const address = order.delivery_address || {};
  let method;
  let location;
  if (order.delivery_method === "cdek") {
    method = "СДЭК, пункт выдачи";
    location = [address.city, address.pointName, address.address].filter(Boolean).join(", ");
  } else if (order.delivery_method === "russian_post") {
    method = "Почта России, отделение";
    location = [address.postalCode, address.city, address.address].filter(Boolean).join(", ");
  } else {
    method = "Самовывоз";
    location = "Владимир, проспект Строителей, 9Б, ТЦ «Черемушки»";
  }
  const period = Number(address.periodMax) > 0
    ? `Примерный срок: ${Number(address.periodMin) > 0 && Number(address.periodMin) !== Number(address.periodMax)
      ? `${address.periodMin}–${address.periodMax}` : `до ${address.periodMax}`} дн.`
    : "";
  return [method, compact(location, 380), period].filter(Boolean).join("\n");
};

export function formatPaidOrderMessage(order, items, { isTest = false } = {}) {
  const paidAt = order.paid_at || order.created_at;
  const date = paidAt && !Number.isNaN(new Date(paidAt).getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(paidAt))
    : "";
  const render = (nameLimit, variantLimit) => {
    const lines = items.map((item) => {
      const name = compact(item.product_name, nameLimit) || "Товар";
      const variant = compact(item.variant_name, variantLimit);
      const label = variant && variant.toLowerCase() !== name.toLowerCase() ? `${name}, ${variant}` : name;
      return `• ${label} × ${item.quantity} — ${rubles(item.total_price_minor)}`;
    });
    const totalLines = [
      `Товары: ${rubles(order.subtotal_minor)}`,
      ...(BigInt(order.discount_minor ?? 0) > 0n ? [`Скидка 3+1: −${rubles(order.discount_minor)}`] : []),
      `Доставка: ${rubles(order.delivery_minor)}`,
      `Оплачено: ${rubles(order.total_minor)}`,
    ];
    return [
      `${isTest ? "🧪 ТЕСТОВАЯ ОПЛАТА" : "✅ ОПЛАЧЕН"} · Заказ №${compact(order.order_number, 64)}`,
      date ? `${date} МСК` : "",
      "",
      "Товары:",
      ...lines,
      "",
      ...totalLines,
      "",
      "Доставка:",
      deliveryDetails(order),
      "",
      `Получатель: ${compact(order.customer_name, 120)}`,
      `Телефон: ${compact(order.customer_phone_e164, 30)}`,
      order.customer_email ? `Email: ${compact(order.customer_email, 160)}` : "",
      order.customer_comment ? `Комментарий: ${compact(order.customer_comment, 300)}` : "",
    ].filter((line, index, all) => line || (index > 0 && all[index - 1])).join("\n").trim();
  };
  for (const [nameLimit, variantLimit] of [[90, 35], [40, 16], [20, 10]]) {
    const message = render(nameLimit, variantLimit);
    if (Array.from(message).length <= MAX_MESSAGE_LENGTH) return message;
  }
  throw new Error("telegram_order_message_too_long");
}

export async function sendPaidOrderMessage(config, message, { fetchImpl = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(`${API_BASE}${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("telegram_unavailable");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !Number.isInteger(payload.result?.message_id)) {
    const error = new Error(`telegram_rejected_${response.status}`);
    error.retryAfter = Number(payload?.parameters?.retry_after) || null;
    throw error;
  }
  return payload.result.message_id;
}

export async function deliverPendingTelegramOrder(pool, config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config.enabled) return false;
  const leaseToken = randomUUID();
  const claimed = await pool.query(
    `WITH next_job AS (
       SELECT order_id FROM telegram_order_notifications
        WHERE sent_at IS NULL AND next_attempt_at <= NOW()
          AND (lease_until IS NULL OR lease_until < NOW())
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE telegram_order_notifications n
        SET attempts = n.attempts + 1,
            lease_until = NOW() + INTERVAL '30 seconds', lease_token = $1
       FROM next_job WHERE n.order_id = next_job.order_id
     RETURNING n.order_id, n.is_test, n.attempts`,
    [leaseToken],
  );
  const job = claimed.rows[0];
  if (!job) return false;
  try {
    const orderResult = await pool.query(
      `SELECT id, order_number, payment_status, created_at, paid_at,
              customer_name, customer_phone_e164, customer_email, customer_comment,
              subtotal_minor, discount_minor, delivery_minor, total_minor,
              delivery_method, delivery_address
         FROM commerce_orders WHERE id = $1`,
      [job.order_id],
    );
    const order = orderResult.rows[0];
    if (!order || order.payment_status !== "paid") {
      await pool.query(
        `UPDATE telegram_order_notifications
            SET sent_at = NOW(), lease_until = NULL, lease_token = NULL
          WHERE order_id = $1 AND lease_token = $2`,
        [job.order_id, leaseToken],
      );
      return true;
    }
    const items = await pool.query(
      `SELECT product_name, variant_name, quantity, total_price_minor
         FROM commerce_order_items WHERE order_id = $1 ORDER BY created_at, id`,
      [job.order_id],
    );
    const message = formatPaidOrderMessage(order, items.rows, { isTest: job.is_test });
    const messageId = await sendPaidOrderMessage(config, message, { fetchImpl });
    await pool.query(
      `UPDATE telegram_order_notifications
          SET sent_at = NOW(), telegram_message_id = $3,
              lease_until = NULL, lease_token = NULL, last_error = NULL
        WHERE order_id = $1 AND lease_token = $2`,
      [job.order_id, leaseToken, messageId],
    );
  } catch (error) {
    const retrySeconds = Math.min(3600, Math.max(Number(error.retryAfter) || 0, 5 * (2 ** Math.min(job.attempts, 9))));
    await pool.query(
      `UPDATE telegram_order_notifications
          SET next_attempt_at = NOW() + $3::INTEGER * INTERVAL '1 second',
              lease_until = NULL, lease_token = NULL, last_error = $4
        WHERE order_id = $1 AND lease_token = $2`,
      [job.order_id, leaseToken, retrySeconds, compact(error.message, 120)],
    );
    throw error;
  }
  return true;
}

export function startTelegramOrderWorker(pool, config, { fetchImpl = globalThis.fetch, logger = console } = {}) {
  if (!config.enabled) return () => {};
  let stopped = false;
  let timer;
  const run = async () => {
    if (stopped) return;
    try {
      for (let index = 0; index < 10 && !stopped; index += 1) {
        if (!await deliverPendingTelegramOrder(pool, config, { fetchImpl })) break;
      }
    } catch (error) {
      logger.error("Telegram order notification failed:", error.message);
    } finally {
      if (!stopped) timer = setTimeout(run, 10_000).unref();
    }
  };
  timer = setTimeout(run, 0).unref();
  return () => { stopped = true; clearTimeout(timer); };
}
