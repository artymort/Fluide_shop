import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { normalizeRussianPhone } from "../security/phone-otp.js";
import { hashSessionToken, readCookie } from "../security/sessions.js";

const DELIVERY_METHODS = new Set(["russian_post", "cdek", "pickup"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class OrderRequestError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const cleanText = (value, maximum) => String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);

export function cartKeyToExternalKey(value) {
  const key = cleanText(value, 180);
  if (/^fragrance-\d{3}-\d+$/i.test(key)) return key.toLowerCase();
  if (/^[a-z0-9][a-z0-9-]{0,159}$/i.test(key)) return `${key}-default`.toLowerCase();
  return null;
}

export function calculatePerfumePromotion(items = []) {
  const eligibleUnitPrices = items
    .filter((item) => item?.kind === "fragrance")
    .flatMap((item) => Array.from(
      { length: Math.max(0, Math.floor(Number(item.quantity) || 0)) },
      () => Number(item.price_minor) || 0,
    ))
    .sort((left, right) => left - right);
  const giftCount = Math.floor(eligibleUnitPrices.length / 4);
  return {
    code: "perfume-3-plus-1",
    giftCount,
    discountMinor: eligibleUnitPrices.slice(0, giftCount).reduce((sum, price) => sum + price, 0),
  };
}

export function normalizeOrderPayload(body = {}) {
  const customerName = cleanText(body.customerName, 120);
  const phone = normalizeRussianPhone(body.customerPhone);
  const email = cleanText(body.customerEmail, 320).toLowerCase() || null;
  const deliveryMethod = cleanText(body.deliveryMethod, 32);
  const comment = cleanText(body.customerComment, 1000) || null;
  const delivery = body.deliveryAddress && typeof body.deliveryAddress === "object"
    ? body.deliveryAddress
    : {};
  const deliveryAddress = {
    city: cleanText(delivery.city, 120),
    address: cleanText(delivery.address, 300),
    postalCode: cleanText(delivery.postalCode, 20),
    pricingStatus: deliveryMethod === "pickup" ? "fixed" : "pending_provider_integration",
  };

  if (customerName.length < 2) throw new OrderRequestError("customer_name_invalid");
  if (!phone) throw new OrderRequestError("customer_phone_invalid");
  if (email && !EMAIL_PATTERN.test(email)) throw new OrderRequestError("customer_email_invalid");
  if (!DELIVERY_METHODS.has(deliveryMethod)) throw new OrderRequestError("delivery_method_invalid");
  if (deliveryMethod !== "pickup" && (!deliveryAddress.city || !deliveryAddress.address)) {
    throw new OrderRequestError("delivery_address_required");
  }
  if (deliveryMethod === "russian_post" && !/^\d{6}$/.test(deliveryAddress.postalCode)) {
    throw new OrderRequestError("delivery_postal_code_required");
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
    throw new OrderRequestError("order_items_invalid");
  }
  const items = body.items.map((item) => {
    const externalKey = cartKeyToExternalKey(item?.key);
    const quantity = Number(item?.quantity);
    if (!externalKey || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new OrderRequestError("order_item_invalid");
    }
    return { externalKey, quantity };
  });
  if (new Set(items.map((item) => item.externalKey)).size !== items.length) {
    throw new OrderRequestError("order_items_duplicate");
  }

  return { customerName, phone, email, deliveryMethod, deliveryAddress, comment, items };
}

async function findSessionUserId(database, request, config) {
  const token = readCookie(request.get("cookie"), config.session.cookieName);
  if (!token) return null;
  const result = await database.query(
    `SELECT u.id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.status = 'active'
        AND u.deleted_at IS NULL
      LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0]?.id || null;
}

const makeOrderNumber = () => {
  const year = new Date().getFullYear();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 7).toUpperCase();
  return `FA-${year}-${suffix}`;
};

const createCheckoutToken = () => {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: createHash("sha256").update(token).digest("hex"),
  };
};

export function createOrdersRouter({ pool, config }) {
  const router = Router();

  router.post("/", rateLimit({
    windowMs: 15 * 60_000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }), async (request, response, next) => {
    let payload;
    try {
      payload = normalizeOrderPayload(request.body);
    } catch (error) {
      if (error instanceof OrderRequestError) {
        response.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const userId = await findSessionUserId(client, request, config);
      const externalKeys = payload.items.map((item) => item.externalKey);
      const variantsResult = await client.query(
        `SELECT v.id AS variant_id, v.external_key, v.sku, v.name AS variant_name,
                v.price_minor, v.currency, p.id AS product_id, p.name AS product_name,
                p.kind, media.url AS image_url
           FROM catalog_variants v
           JOIN catalog_products p ON p.id = v.product_id
           LEFT JOIN LATERAL (
             SELECT m.url FROM catalog_media m
              WHERE m.product_id = p.id
              ORDER BY m.sort_order, m.id LIMIT 1
           ) media ON TRUE
          WHERE v.external_key = ANY($1::TEXT[])
            AND v.active
            AND p.status = 'published'`,
        [externalKeys],
      );
      const variantsByKey = new Map(variantsResult.rows.map((row) => [row.external_key, row]));
      if (variantsByKey.size !== payload.items.length) {
        throw new OrderRequestError("catalog_item_unavailable", 409);
      }

      const resolvedItems = payload.items.map((item) => ({
        ...variantsByKey.get(item.externalKey),
        quantity: item.quantity,
      }));
      const currencies = new Set(resolvedItems.map((item) => item.currency));
      if (currencies.size !== 1 || !currencies.has("RUB")) {
        throw new OrderRequestError("order_currency_invalid", 409);
      }
      const subtotalMinor = resolvedItems.reduce(
        (sum, item) => sum + Number(item.price_minor) * item.quantity,
        0,
      );
      const promotion = calculatePerfumePromotion(resolvedItems);
      const totalMinor = subtotalMinor - promotion.discountMinor;
      const orderNumber = makeOrderNumber();
      const checkoutToken = createCheckoutToken();
      const orderResult = await client.query(
        `INSERT INTO commerce_orders (
           order_number, user_id, status, payment_status, customer_name,
           customer_email, customer_phone_e164, subtotal_minor, discount_minor,
           delivery_minor, total_minor, currency, delivery_method, delivery_address,
           customer_comment, checkout_token_hash
         ) VALUES (
           $1, $2, 'new', 'unpaid', $3, $4, $5, $6, $7, 0, $8, 'RUB', $9, $10::JSONB, $11, $12
         ) RETURNING id, order_number, status, payment_status, total_minor, currency, created_at`,
        [
          orderNumber, userId, payload.customerName, payload.email, payload.phone,
          subtotalMinor, promotion.discountMinor, totalMinor, payload.deliveryMethod,
          JSON.stringify(payload.deliveryAddress), payload.comment, checkoutToken.hash,
        ],
      );
      const order = orderResult.rows[0];

      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO commerce_order_items (
             order_id, product_id, variant_id, product_name, variant_name, sku,
             image_url, quantity, unit_price_minor, total_price_minor
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9::BIGINT * $8::INTEGER)`,
          [
            order.id, item.product_id, item.variant_id, item.product_name, item.variant_name,
            item.sku, item.image_url, item.quantity, item.price_minor,
          ],
        );
      }
      await client.query(
        `INSERT INTO commerce_order_status_history (order_id, status, comment)
         VALUES ($1, 'new', 'Заказ создан на витрине')`,
        [order.id],
      );
      await client.query("COMMIT");
      response.status(201).json({
        order,
        checkoutToken: checkoutToken.token,
        payment: {
          available: Boolean(config.yooKassa?.enabled && payload.deliveryAddress.pricingStatus === "fixed"),
          provider: config.yooKassa?.enabled ? "yookassa" : null,
          test: Boolean(config.yooKassa?.testMode),
        },
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error instanceof OrderRequestError) {
        response.status(error.status).json({ error: error.code });
      } else {
        next(error);
      }
    } finally {
      client.release();
    }
  });

  return router;
}
