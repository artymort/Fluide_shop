import { Router } from "express";

const EVENT_NAMES = new Set(["page_view", "product_view", "add_to_cart", "checkout_start", "purchase"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max) || null;

export function createAnalyticsRouter(pool) {
  const router = Router();

  router.post("/events", async (request, response, next) => {
    const eventName = String(request.body?.eventName || "");
    const visitorId = String(request.body?.visitorId || "");
    const sessionId = String(request.body?.sessionId || "");
    const path = cleanText(request.body?.path, 500);
    if (request.body?.consent !== true || !EVENT_NAMES.has(eventName)
      || !UUID_PATTERN.test(visitorId) || !UUID_PATTERN.test(sessionId)
      || !path || !path.startsWith("/")) {
      response.status(400).json({ error: "analytics_event_invalid" });
      return;
    }
    const metadata = request.body?.metadata && typeof request.body.metadata === "object"
      && !Array.isArray(request.body.metadata) ? request.body.metadata : {};
    try {
      await pool.query(
        `INSERT INTO analytics_events
          (event_name, visitor_id, session_id, path, referrer_host, product_key, value_minor, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)`,
        [
          eventName,
          visitorId,
          sessionId,
          path,
          cleanText(request.body?.referrerHost, 255),
          cleanText(request.body?.productKey, 180),
          request.body?.valueMinor === null || request.body?.valueMinor === undefined
            ? null : Math.max(0, Math.round(Number(request.body.valueMinor) || 0)),
          JSON.stringify(metadata),
        ],
      );
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
