import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { fileTypeFromBuffer } from "file-type";
import multer from "multer";
import {
  clearAdminCookie,
  createAdminSession,
  hashAdminPassword,
  publicAdmin,
  readAdminSession,
  setAdminCookie,
  verifyAdminPassword,
} from "../security/admin-auth.js";
import { hashSessionToken, readCookie } from "../security/sessions.js";
import { createCatalogWorkbook, parseCatalogWorkbook } from "../catalog/workbook.js";
import { slugify } from "../catalog/source-catalog.js";
import { prepareHomeContent } from "../content/home-content.js";

const PRODUCT_EDIT_ROLES = new Set(["owner", "admin", "editor"]);
const CONTENT_EDIT_ROLES = new Set(["owner", "admin", "editor"]);
const CUSTOMER_ROLES = new Set(["owner", "admin", "orders"]);
const ORDER_ROLES = new Set(["owner", "admin", "orders"]);
const ORDER_ARCHIVE_ROLES = new Set(["owner", "admin"]);
const ORDER_VIEWS = new Set(["active", "incomplete", "archived"]);
const ANALYTICS_ROLES = new Set(["owner", "admin", "analyst"]);
const ORDER_STATUSES = new Set(["new", "confirmed", "assembling", "ready", "shipped", "delivered", "cancelled", "refunded"]);
const PAYMENT_STATUSES = new Set(["unpaid", "pending", "paid", "partially_refunded", "refunded", "failed", "cancelled"]);
const STAFF_MANAGE_ROLES = new Set(["owner"]);
const STAFF_ROLES = new Set(["owner", "admin", "editor", "orders", "analyst"]);
const serializeProduct = (row) => ({
  id: row.id,
  legacyId: row.legacy_id,
  sku: row.sku,
  slug: row.slug,
  kind: row.kind,
  status: row.status,
  name: row.name,
  productType: row.product_type,
  typeLabel: row.type_label,
  shortDescription: row.short_description,
  description: row.description,
  fulfillmentMode: row.fulfillment_mode,
  leadTimeDays: row.lead_time_days,
  attributes: row.attributes || {},
  seoTitle: row.seo_title,
  seoDescription: row.seo_description,
  canonicalUrl: row.canonical_url,
  noindex: row.noindex,
  publishedAt: row.published_at,
  updatedAt: row.updated_at,
});

const cleanText = (value, max = 5000) => String(value ?? "").trim().slice(0, max) || null;
const validSku = (value) => /^[A-Za-z0-9._-]{2,100}$/.test(String(value || ""));

async function audit(pool, request, action, entityType, entityId, details = {}) {
  await pool.query(
    `INSERT INTO admin_audit_log
      (admin_user_id, action, entity_type, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5::JSONB, $6)`,
    [request.admin.id, action, entityType, entityId || null, JSON.stringify(details), request.ip || null],
  );
}

async function purgeExpiredArchivedOrders(database) {
  await database.query(
    `WITH purged AS (
       DELETE FROM commerce_orders o
        WHERE o.archived_at < NOW() - INTERVAL '14 days'
          AND NOT EXISTS (
            SELECT 1
              FROM commerce_payments p
             WHERE p.order_id = o.id
               AND p.operation = 'payment'
               AND p.status = 'succeeded'
               AND LOWER(COALESCE(p.metadata->>'test', 'false')) <> 'true'
          )
        RETURNING o.id, o.order_number, o.archived_at, o.payment_status
     )
     INSERT INTO admin_audit_log (action, entity_type, entity_id, details)
     SELECT 'order.purged_after_retention', 'commerce_order', id::TEXT,
            jsonb_build_object(
              'orderNumber', order_number,
              'archivedAt', archived_at,
              'paymentStatus', payment_status,
              'retentionDays', 14
            )
       FROM purged`,
  );
}

async function archiveAbandonedPaymentOrders(database) {
  await database.query(
    `WITH candidates AS (
       SELECT o.id
         FROM commerce_orders o
        WHERE o.archived_at IS NULL
          AND o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
          AND (
            LOWER(COALESCE(o.payment_provider, '')) = 'yookassa'
            OR EXISTS (
              SELECT 1 FROM commerce_payments p_started
               WHERE p_started.order_id = o.id
                 AND p_started.operation = 'payment'
                 AND LOWER(p_started.provider) = 'yookassa'
            )
          )
          AND GREATEST(COALESCE((
            SELECT MIN(p_started.created_at)
              FROM commerce_payments p_started
             WHERE p_started.order_id = o.id
               AND p_started.operation = 'payment'
               AND LOWER(p_started.provider) = 'yookassa'
          ), o.created_at), o.updated_at) < NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM commerce_payments p_paid
             WHERE p_paid.order_id = o.id
               AND p_paid.operation = 'payment'
               AND p_paid.status = 'succeeded'
          )
     ), archived AS (
       UPDATE commerce_orders o
          SET archived_at = NOW(), archived_by = NULL
         FROM candidates c
        WHERE o.id = c.id
          AND o.archived_at IS NULL
          AND o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
        RETURNING o.id, o.order_number, o.payment_status
     )
     INSERT INTO admin_audit_log (action, entity_type, entity_id, details)
     SELECT 'order.auto_archived_incomplete_payment', 'commerce_order', id::TEXT,
            jsonb_build_object(
              'orderNumber', order_number,
              'paymentStatus', payment_status,
              'incompletePaymentHours', 24
            )
       FROM archived`,
  );
}

async function maintainOrderLifecycle(database) {
  await archiveAbandonedPaymentOrders(database);
  await purgeExpiredArchivedOrders(database);
}

export function createAdminRouter({ pool, config }) {
  const router = Router();
  const mediaDirectory = path.resolve(process.cwd(), config.admin.mediaDirectory);
  const memoryUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.admin.maxUploadMb * 1024 * 1024, files: 1 },
  });
  const loginLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: "too_many_requests" }),
  });

  router.post("/login", loginLimit, async (request, response, next) => {
    try {
      const email = String(request.body?.email || "").trim().toLowerCase();
      const password = String(request.body?.password || "");
      const result = await pool.query(
        `SELECT id, email, display_name, role, status, password_hash
           FROM admin_users WHERE email = $1 LIMIT 1`,
        [email],
      );
      const admin = result.rows[0];
      if (!admin || admin.status !== "active" || !verifyAdminPassword(password, admin.password_hash)) {
        response.status(401).json({ error: "invalid_credentials" });
        return;
      }
      const session = await createAdminSession({ pool, config, adminUserId: admin.id, request });
      await pool.query("UPDATE admin_users SET last_login_at = NOW() WHERE id = $1", [admin.id]);
      setAdminCookie(response, config, session.token, session.expiresAt);
      response.set("Cache-Control", "no-store").json({ admin: publicAdmin(admin) });
    } catch (error) {
      next(error);
    }
  });

  router.use(async (request, response, next) => {
    try {
      const admin = await readAdminSession({ pool, config, request });
      if (!admin) {
        clearAdminCookie(response, config);
        response.status(401).json({ error: "admin_not_authenticated" });
        return;
      }
      request.admin = admin;
      response.set("Cache-Control", "no-store");
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get("/session", (request, response) => {
    response.json({ authenticated: true, admin: publicAdmin(request.admin) });
  });

  router.get("/content/pages/home", async (request, response, next) => {
    if (!CONTENT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await pool.query("INSERT INTO content_pages (slug) VALUES ('home') ON CONFLICT (slug) DO NOTHING");
      const result = await pool.query(
        `SELECT draft_content, published_content, updated_at, published_at,
                draft_content IS DISTINCT FROM published_content AS has_unpublished_changes
           FROM content_pages
          WHERE slug = 'home'
          LIMIT 1`,
      );
      const page = result.rows[0];
      response.json({
        slug: "home",
        content: await prepareHomeContent(page?.draft_content),
        publishedContent: page?.published_content ? await prepareHomeContent(page.published_content) : null,
        updatedAt: page?.updated_at || null,
        publishedAt: page?.published_at || null,
        hasUnpublishedChanges: Boolean(page?.has_unpublished_changes),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/content/pages/home", async (request, response, next) => {
    if (!CONTENT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const content = await prepareHomeContent(request.body?.content);
      const result = await pool.query(
        `INSERT INTO content_pages (slug, draft_content, updated_by)
         VALUES ('home', $1::JSONB, $2)
         ON CONFLICT (slug) DO UPDATE
           SET draft_content = EXCLUDED.draft_content,
               updated_by = EXCLUDED.updated_by
         RETURNING updated_at, published_at,
                   draft_content IS DISTINCT FROM published_content AS has_unpublished_changes`,
        [JSON.stringify(content), request.admin.id],
      );
      await audit(pool, request, "content.draft_saved", "content_page", null, { slug: "home" });
      response.json({
        slug: "home",
        content,
        updatedAt: result.rows[0].updated_at,
        publishedAt: result.rows[0].published_at,
        hasUnpublishedChanges: Boolean(result.rows[0].has_unpublished_changes),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/content/pages/home/publish", async (request, response, next) => {
    if (!CONTENT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      await pool.query("INSERT INTO content_pages (slug) VALUES ('home') ON CONFLICT (slug) DO NOTHING");
      const result = await pool.query(
        `UPDATE content_pages
            SET published_content = draft_content,
                published_by = $1,
                published_at = NOW()
          WHERE slug = 'home'
          RETURNING published_content, updated_at, published_at`,
        [request.admin.id],
      );
      const content = await prepareHomeContent(result.rows[0]?.published_content);
      await audit(pool, request, "content.published", "content_page", null, { slug: "home" });
      response.json({
        slug: "home",
        content,
        updatedAt: result.rows[0]?.updated_at || null,
        publishedAt: result.rows[0]?.published_at || null,
        hasUnpublishedChanges: false,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (request, response, next) => {
    try {
      const token = readCookie(request.get("cookie"), config.admin.cookieName);
      if (token) {
        await pool.query(
          "UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1",
          [hashSessionToken(token)],
        );
      }
      clearAdminCookie(response, config);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.patch("/password", async (request, response, next) => {
    try {
      const currentPassword = String(request.body?.currentPassword || "");
      const newPassword = String(request.body?.newPassword || "");
      const result = await pool.query("SELECT password_hash FROM admin_users WHERE id = $1", [request.admin.id]);
      if (!verifyAdminPassword(currentPassword, result.rows[0]?.password_hash)) {
        response.status(400).json({ error: "current_password_invalid" });
        return;
      }
      if (newPassword.length < 12) {
        response.status(400).json({ error: "password_too_short" });
        return;
      }
      await pool.query("UPDATE admin_users SET password_hash = $2 WHERE id = $1", [
        request.admin.id,
        hashAdminPassword(newPassword),
      ]);
      await audit(pool, request, "admin.password_changed", "admin_user", request.admin.id);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/staff", async (request, response, next) => {
    if (!STAFF_MANAGE_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const result = await pool.query(
        `SELECT id, email, display_name, role, status, last_login_at, created_at
           FROM admin_users
          ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                   display_name, email`,
      );
      response.json({ staff: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/staff", async (request, response, next) => {
    if (!STAFF_MANAGE_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const email = String(request.body?.email || "").trim().toLowerCase();
    const displayName = cleanText(request.body?.displayName, 120);
    const role = String(request.body?.role || "editor");
    const password = String(request.body?.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName || !STAFF_ROLES.has(role)
      || password.length < 12 || password.length > 256
      || (role === "owner" && request.admin.role !== "owner")) {
      response.status(400).json({ error: "staff_invalid" });
      return;
    }
    try {
      const result = await pool.query(
        `INSERT INTO admin_users (email, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, display_name, role, status, created_at`,
        [email, displayName, hashAdminPassword(password), role],
      );
      await audit(pool, request, "admin.staff_created", "admin_user", result.rows[0].id, { email, role });
      response.status(201).json({ staff: result.rows[0] });
    } catch (error) {
      if (error?.code === "23505") {
        response.status(409).json({ error: "staff_email_exists" });
        return;
      }
      next(error);
    }
  });

  router.patch("/staff/:id", async (request, response, next) => {
    if (!STAFF_MANAGE_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const role = String(request.body?.role || "");
    const status = String(request.body?.status || "");
    if (!STAFF_ROLES.has(role) || !new Set(["active", "blocked"]).has(status)
      || (role === "owner" && request.admin.role !== "owner")
      || (request.params.id === request.admin.id && status === "blocked")) {
      response.status(400).json({ error: "staff_invalid" });
      return;
    }
    try {
      const target = await pool.query("SELECT role FROM admin_users WHERE id = $1", [request.params.id]);
      if (!target.rowCount) {
        response.status(404).json({ error: "staff_not_found" });
        return;
      }
      if (target.rows[0].role === "owner" && request.admin.role !== "owner") {
        response.status(403).json({ error: "forbidden" });
        return;
      }
      if (target.rows[0].role === "owner" && (role !== "owner" || status !== "active")) {
        const owners = await pool.query(
          "SELECT COUNT(*)::INT AS count FROM admin_users WHERE role = 'owner' AND status = 'active' AND id <> $1",
          [request.params.id],
        );
        if (owners.rows[0].count === 0) {
          response.status(400).json({ error: "last_owner_required" });
          return;
        }
      }
      const result = await pool.query(
        `UPDATE admin_users SET role = $2, status = $3 WHERE id = $1
         RETURNING id, email, display_name, role, status, last_login_at, created_at`,
        [request.params.id, role, status],
      );
      await audit(pool, request, "admin.staff_updated", "admin_user", request.params.id, { role, status });
      response.json({ staff: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard", async (_request, response, next) => {
    try {
      const [summaryResult, categoriesResult, recentProductsResult] = await Promise.all([pool.query(`
        SELECT
          (SELECT COUNT(*) FROM catalog_products WHERE status = 'published')::INT AS published_products,
          (SELECT COUNT(*) FROM catalog_products WHERE status = 'draft')::INT AS draft_products,
          (SELECT COUNT(*) FROM catalog_variants WHERE active)::INT AS active_variants,
          (SELECT COUNT(*) FROM users WHERE status = 'active' AND deleted_at IS NULL)::INT AS customers,
          (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days')::INT AS new_customers_7d,
          (SELECT COUNT(*) FROM catalog_products p
            WHERE NOT EXISTS (SELECT 1 FROM catalog_media m WHERE m.product_id = p.id))::INT AS products_without_media,
          (SELECT MAX(finished_at) FROM catalog_import_runs WHERE status = 'completed') AS last_import_at
      `), pool.query(`
        SELECT COALESCE(NULLIF(type_label, ''), product_type) AS value,
               COUNT(*)::INT AS count
          FROM catalog_products
         WHERE status = 'published'
           AND COALESCE(NULLIF(type_label, ''), product_type) IS NOT NULL
           AND COALESCE(NULLIF(type_label, ''), product_type) <> ''
         GROUP BY value
         ORDER BY count DESC, value ASC
         LIMIT 7
      `), pool.query(`
        SELECT p.*,
               (array_agg(m.url ORDER BY m.sort_order, m.id)
                 FILTER (WHERE m.url IS NOT NULL))[1] AS image_url
          FROM catalog_products p
          LEFT JOIN catalog_media m ON m.product_id = p.id
         GROUP BY p.id
         ORDER BY p.updated_at DESC, p.name ASC
         LIMIT 5
      `)]);
      response.json({
        ...summaryResult.rows[0],
        categories: categoriesResult.rows,
        recent_products: recentProductsResult.rows.map((row) => ({
          ...serializeProduct(row),
          imageUrl: row.image_url,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/customers", async (request, response, next) => {
    if (!CUSTOMER_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      const search = String(request.query.q || "").trim().slice(0, 120);
      const result = await pool.query(
        `SELECT u.id, u.display_name, u.first_name, u.last_name,
                COALESCE(u.phone_e164, u.contact_phone_e164) AS phone_e164,
                u.phone_e164 AS login_phone_e164,
                u.contact_phone_e164, u.email, u.birth_date, u.gender,
                u.avatar_url, u.status, u.created_at,
                MAX(ai.last_login_at) AS last_login_at,
                COALESCE(array_agg(DISTINCT ai.provider) FILTER (WHERE ai.provider IS NOT NULL), '{}') AS providers
           FROM users u
           LEFT JOIN auth_identities ai ON ai.user_id = u.id
          WHERE u.deleted_at IS NULL
            AND ($1 = '' OR u.display_name ILIKE '%' || $1 || '%'
              OR u.email ILIKE '%' || $1 || '%' OR u.phone_e164 ILIKE '%' || $1 || '%')
          GROUP BY u.id
          ORDER BY u.created_at DESC
          LIMIT 200`,
        [search],
      );
      response.json({ customers: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/customers/:id", async (request, response, next) => {
    if (!CUSTOMER_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
      response.status(404).json({ error: "customer_not_found" });
      return;
    }
    try {
      const result = await pool.query(
        `SELECT u.id, u.display_name, u.first_name, u.last_name,
                COALESCE(u.phone_e164, u.contact_phone_e164) AS phone_e164,
                u.phone_e164 AS login_phone_e164, u.contact_phone_e164,
                u.phone_verified_at, u.email, u.email_verified_at,
                u.birth_date, u.gender, u.avatar_url, u.status,
                u.created_at, u.updated_at
           FROM users u
          WHERE u.id = $1 AND u.deleted_at IS NULL
          LIMIT 1`,
        [request.params.id],
      );
      if (!result.rowCount) {
        response.status(404).json({ error: "customer_not_found" });
        return;
      }
      const identities = await pool.query(
        `SELECT provider, provider_subject, created_at, last_login_at
           FROM auth_identities
          WHERE user_id = $1
          ORDER BY created_at, provider`,
        [request.params.id],
      );
      response.json({ customer: result.rows[0], identities: identities.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/orders", async (request, response, next) => {
    if (!ORDER_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const search = String(request.query.q || "").trim().slice(0, 120);
    const status = String(request.query.status || "");
    const payment = String(request.query.payment || "");
    const legacyArchived = String(request.query.archived || "false") === "true";
    const view = String(request.query.view || (legacyArchived ? "archived" : "active"));
    if ((status && !ORDER_STATUSES.has(status))
      || (payment && !PAYMENT_STATUSES.has(payment))
      || !ORDER_VIEWS.has(view)) {
      response.status(400).json({ error: "order_filter_invalid" });
      return;
    }
    try {
      await maintainOrderLifecycle(pool);
      const result = await pool.query(
        `SELECT o.id, o.order_number, o.user_id, o.status, o.payment_status,
                o.customer_name, o.customer_email, o.customer_phone_e164,
                o.total_minor, o.currency, o.created_at, o.updated_at, o.archived_at,
                o.archived_at + INTERVAL '14 days' AS purge_at,
                COALESCE(yk.payment_started_at,
                  CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                ) AS payment_started_at,
                COALESCE(yk.payment_started_at,
                  CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                ) + INTERVAL '30 minutes' AS payment_attention_at,
                GREATEST(COALESCE(yk.payment_started_at,
                  CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                ), o.updated_at) + INTERVAL '24 hours' AS auto_archive_at,
                (o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
                  AND (LOWER(COALESCE(o.payment_provider, '')) = 'yookassa'
                    OR yk.payment_started_at IS NOT NULL)) AS incomplete_payment,
                EXISTS (
                  SELECT 1 FROM commerce_payments p_live
                   WHERE p_live.order_id = o.id
                     AND p_live.operation = 'payment'
                     AND p_live.status = 'succeeded'
                     AND LOWER(COALESCE(p_live.metadata->>'test', 'false')) <> 'true'
                ) AS has_live_payment,
                COUNT(oi.id)::INT AS item_count,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'product_name', preview.product_name,
                    'variant_name', preview.variant_name,
                    'sku', preview.sku,
                    'image_url', preview.image_url
                  ) ORDER BY preview.created_at, preview.id)
                    FROM (
                      SELECT oi_preview.id, oi_preview.product_name, oi_preview.variant_name,
                             oi_preview.sku, oi_preview.image_url, oi_preview.created_at
                        FROM commerce_order_items oi_preview
                       WHERE oi_preview.order_id = o.id
                       ORDER BY oi_preview.created_at, oi_preview.id
                       LIMIT 2
                    ) preview
                ), '[]'::JSONB) AS items_preview
           FROM commerce_orders o
           LEFT JOIN commerce_order_items oi ON oi.order_id = o.id
           LEFT JOIN LATERAL (
             SELECT MIN(p_started.created_at) AS payment_started_at
               FROM commerce_payments p_started
              WHERE p_started.order_id = o.id
                AND p_started.operation = 'payment'
                AND LOWER(p_started.provider) = 'yookassa'
           ) yk ON TRUE
          WHERE ($1 = '' OR o.order_number ILIKE '%' || $1 || '%'
            OR o.customer_name ILIKE '%' || $1 || '%'
            OR o.customer_email ILIKE '%' || $1 || '%'
            OR o.customer_phone_e164 ILIKE '%' || $1 || '%')
            AND ($2 = '' OR o.status = $2)
            AND ($3 = '' OR o.payment_status = $3)
            AND (
              ($4 = 'archived' AND o.archived_at IS NOT NULL)
              OR ($4 = 'incomplete' AND o.archived_at IS NULL
                AND o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
                AND (LOWER(COALESCE(o.payment_provider, '')) = 'yookassa'
                  OR yk.payment_started_at IS NOT NULL))
              OR ($4 = 'active' AND o.archived_at IS NULL
                AND NOT (o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
                  AND (LOWER(COALESCE(o.payment_provider, '')) = 'yookassa'
                    OR yk.payment_started_at IS NOT NULL)))
            )
          GROUP BY o.id, yk.payment_started_at
          ORDER BY CASE WHEN $4 = 'archived' THEN o.archived_at
                        WHEN $4 = 'incomplete' THEN COALESCE(yk.payment_started_at, o.created_at)
                        ELSE o.created_at END DESC
          LIMIT 300`,
        [search, status, payment, view],
      );
      response.json({ orders: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/orders/:id", async (request, response, next) => {
    if (!ORDER_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
      response.status(404).json({ error: "order_not_found" });
      return;
    }
    try {
      await maintainOrderLifecycle(pool);
      const [orderResult, itemsResult, paymentsResult, historyResult] = await Promise.all([
        pool.query(
          `SELECT o.*,
                  o.archived_at + INTERVAL '14 days' AS purge_at,
                  COALESCE(yk.payment_started_at,
                    CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                  ) AS payment_started_at,
                  COALESCE(yk.payment_started_at,
                    CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                  ) + INTERVAL '30 minutes' AS payment_attention_at,
                  GREATEST(COALESCE(yk.payment_started_at,
                    CASE WHEN LOWER(COALESCE(o.payment_provider, '')) = 'yookassa' THEN o.created_at END
                  ), o.updated_at) + INTERVAL '24 hours' AS auto_archive_at,
                  (o.payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
                    AND (LOWER(COALESCE(o.payment_provider, '')) = 'yookassa'
                      OR yk.payment_started_at IS NOT NULL)) AS incomplete_payment,
                  EXISTS (
                    SELECT 1 FROM commerce_payments p_live
                     WHERE p_live.order_id = o.id
                       AND p_live.operation = 'payment'
                       AND p_live.status = 'succeeded'
                       AND LOWER(COALESCE(p_live.metadata->>'test', 'false')) <> 'true'
                  ) AS has_live_payment
             FROM commerce_orders o
             LEFT JOIN LATERAL (
               SELECT MIN(p_started.created_at) AS payment_started_at
                 FROM commerce_payments p_started
                WHERE p_started.order_id = o.id
                  AND p_started.operation = 'payment'
                  AND LOWER(p_started.provider) = 'yookassa'
             ) yk ON TRUE
            WHERE o.id = $1
            LIMIT 1`,
          [request.params.id],
        ),
        pool.query(
          `SELECT id, product_id, variant_id, product_name, variant_name, sku,
                  image_url, quantity, unit_price_minor, total_price_minor, created_at
             FROM commerce_order_items
            WHERE order_id = $1
            ORDER BY created_at, id`,
          [request.params.id],
        ),
        pool.query(
          `SELECT id, operation, status, provider, provider_transaction_id,
                  amount_minor, currency, failure_reason, created_at, updated_at
             FROM commerce_payments
            WHERE order_id = $1
            ORDER BY created_at DESC, id`,
          [request.params.id],
        ),
        pool.query(
          `SELECT h.id, h.status, h.comment, h.created_at,
                  a.display_name AS admin_name
             FROM commerce_order_status_history h
             LEFT JOIN admin_users a ON a.id = h.admin_user_id
            WHERE h.order_id = $1
            ORDER BY h.created_at DESC, h.id DESC`,
          [request.params.id],
        ),
      ]);
      if (!orderResult.rowCount) {
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      response.json({
        order: orderResult.rows[0],
        items: itemsResult.rows,
        payments: paymentsResult.rows,
        history: historyResult.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/orders/:id", async (request, response, next) => {
    if (!ORDER_ARCHIVE_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
      response.status(404).json({ error: "order_not_found" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE commerce_orders
            SET archived_at = NOW(), archived_by = $2
          WHERE id = $1 AND archived_at IS NULL
          RETURNING *, archived_at + INTERVAL '14 days' AS purge_at`,
        [request.params.id, request.admin.id],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      await audit(client, request, "order.archived", "commerce_order", request.params.id, {
        orderNumber: result.rows[0].order_number,
        retentionDays: 14,
      });
      await client.query("COMMIT");
      response.json({ order: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  router.post("/orders/:id/restore", async (request, response, next) => {
    if (!ORDER_ARCHIVE_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
      response.status(404).json({ error: "order_not_found" });
      return;
    }
    const client = await pool.connect();
    try {
      await purgeExpiredArchivedOrders(client);
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE commerce_orders
            SET archived_at = NULL, archived_by = NULL
          WHERE id = $1 AND archived_at IS NOT NULL
          RETURNING *`,
        [request.params.id],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      await audit(client, request, "order.restored", "commerce_order", request.params.id, {
        orderNumber: result.rows[0].order_number,
      });
      await client.query("COMMIT");
      response.json({ order: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  router.patch("/orders/:id/status", async (request, response, next) => {
    if (!ORDER_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const status = String(request.body?.status || "");
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id) || !ORDER_STATUSES.has(status)) {
      response.status(400).json({ error: "order_status_invalid" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE commerce_orders
            SET status = $2,
                shipped_at = CASE WHEN $2 = 'shipped' THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
                delivered_at = CASE WHEN $2 = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
                cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END
          WHERE id = $1 AND archived_at IS NULL
          RETURNING *`,
        [request.params.id, status],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        response.status(404).json({ error: "order_not_found" });
        return;
      }
      await client.query(
        `INSERT INTO commerce_order_status_history (order_id, status, admin_user_id)
         VALUES ($1, $2, $3)`,
        [request.params.id, status, request.admin.id],
      );
      await audit(client, request, "order.status_updated", "commerce_order", request.params.id, { status });
      await client.query("COMMIT");
      response.json({ order: result.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  });

  router.get("/analytics", async (request, response, next) => {
    if (!ANALYTICS_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const period = Number(request.query.period || 30);
    if (![7, 30, 90].includes(period)) {
      response.status(400).json({ error: "analytics_period_invalid" });
      return;
    }
    try {
      await maintainOrderLifecycle(pool);
      const [eventsResult, ordersResult, revenueResult, dailyResult, funnelResult, productsResult, sourcesResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE event_name = 'page_view')::INT AS page_views,
                  COUNT(DISTINCT visitor_id) FILTER (WHERE event_name = 'page_view')::INT AS visitors,
                  COUNT(*) FILTER (WHERE event_name = 'product_view')::INT AS product_views,
                  COUNT(*) FILTER (WHERE event_name = 'add_to_cart')::INT AS add_to_cart
             FROM analytics_events
            WHERE occurred_at >= NOW() - ($1::INT * INTERVAL '1 day')`,
          [period],
        ),
        pool.query(
          `SELECT COUNT(*)::INT AS orders
             FROM commerce_orders
            WHERE created_at >= NOW() - ($1::INT * INTERVAL '1 day')
              AND archived_at IS NULL
              AND status NOT IN ('cancelled', 'refunded')
              AND NOT (
                payment_status IN ('unpaid', 'pending', 'failed', 'cancelled')
                AND (
                  LOWER(COALESCE(payment_provider, '')) = 'yookassa'
                  OR EXISTS (
                    SELECT 1 FROM commerce_payments p_started
                     WHERE p_started.order_id = commerce_orders.id
                       AND p_started.operation = 'payment'
                       AND LOWER(p_started.provider) = 'yookassa'
                  )
                )
              )`,
          [period],
        ),
        pool.query(
          `SELECT COALESCE(SUM(CASE WHEN p.operation = 'payment' THEN p.amount_minor ELSE -p.amount_minor END), 0)::BIGINT AS revenue_minor
             FROM commerce_payments p
             JOIN commerce_orders o ON o.id = p.order_id
            WHERE p.status = 'succeeded'
              AND o.archived_at IS NULL
              AND p.created_at >= NOW() - ($1::INT * INTERVAL '1 day')`,
          [period],
        ),
        pool.query(
          `WITH days AS (
             SELECT generate_series(CURRENT_DATE - ($1::INT - 1), CURRENT_DATE, INTERVAL '1 day')::DATE AS day
           )
           SELECT days.day,
                  COUNT(e.id) FILTER (WHERE e.event_name = 'page_view')::INT AS page_views,
                  COUNT(DISTINCT e.visitor_id) FILTER (WHERE e.event_name = 'page_view')::INT AS visitors
             FROM days
             LEFT JOIN analytics_events e ON e.occurred_at >= days.day
              AND e.occurred_at < days.day + INTERVAL '1 day'
            GROUP BY days.day
            ORDER BY days.day`,
          [period],
        ),
        pool.query(
          `SELECT event_name, COUNT(*)::INT AS event_count
             FROM analytics_events
            WHERE occurred_at >= NOW() - ($1::INT * INTERVAL '1 day')
              AND event_name IN ('product_view', 'add_to_cart', 'checkout_start')
            GROUP BY event_name`,
          [period],
        ),
        pool.query(
          `SELECT product_key,
                  COALESCE(MAX(NULLIF(metadata->>'productName', '')), product_key) AS product_name,
                  COUNT(*) FILTER (WHERE event_name = 'product_view')::INT AS views,
                  COUNT(*) FILTER (WHERE event_name = 'add_to_cart')::INT AS cart_adds
             FROM analytics_events
            WHERE occurred_at >= NOW() - ($1::INT * INTERVAL '1 day')
              AND product_key IS NOT NULL
              AND event_name IN ('product_view', 'add_to_cart')
            GROUP BY product_key
            ORDER BY views DESC, cart_adds DESC, product_key
            LIMIT 8`,
          [period],
        ),
        pool.query(
          `SELECT COALESCE(NULLIF(referrer_host, ''), 'Прямые заходы') AS source,
                  COUNT(*)::INT AS visits
             FROM analytics_events
            WHERE occurred_at >= NOW() - ($1::INT * INTERVAL '1 day')
              AND event_name = 'page_view'
            GROUP BY source
            ORDER BY visits DESC, source
            LIMIT 8`,
          [period],
        ),
      ]);
      const funnelCounts = Object.fromEntries(funnelResult.rows.map((row) => [row.event_name, row.event_count]));
      const orders = ordersResult.rows[0]?.orders || 0;
      response.json({
        period,
        summary: {
          ...eventsResult.rows[0],
          orders,
          revenue_minor: revenueResult.rows[0]?.revenue_minor || 0,
        },
        daily: dailyResult.rows,
        funnel: [
          { key: "product_view", label: "Просмотр товара", value: funnelCounts.product_view || 0 },
          { key: "add_to_cart", label: "Добавление в корзину", value: funnelCounts.add_to_cart || 0 },
          { key: "checkout_start", label: "Начало оформления", value: funnelCounts.checkout_start || 0 },
          { key: "purchase", label: "Заказ", value: orders },
        ],
        products: productsResult.rows,
        sources: sourcesResult.rows,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/products", async (request, response, next) => {
    try {
      const search = String(request.query.q || "").trim().slice(0, 120);
      const status = String(request.query.status || "");
      const type = String(request.query.type || "").trim().slice(0, 120);
      const sort = String(request.query.sort || "updated-desc");
      const sortSql = {
        "updated-desc": "p.updated_at DESC, p.name ASC",
        "name-asc": "p.name ASC",
        "name-desc": "p.name DESC",
        "price-asc": "MIN(v.price_minor) FILTER (WHERE v.active) ASC NULLS LAST, p.name ASC",
        "price-desc": "MIN(v.price_minor) FILTER (WHERE v.active) DESC NULLS LAST, p.name ASC",
        "volume-asc": "MIN(v.volume_ml) FILTER (WHERE v.active) ASC NULLS LAST, p.name ASC",
        "volume-desc": "MIN(v.volume_ml) FILTER (WHERE v.active) DESC NULLS LAST, p.name ASC",
      }[sort] || "p.updated_at DESC, p.name ASC";
      const [result, typeResult, totalResult] = await Promise.all([pool.query(
        `SELECT p.*,
                COUNT(DISTINCT v.id)::INT AS variant_count,
                MIN(v.price_minor) FILTER (WHERE v.active) AS min_price_minor,
                MIN(v.volume_ml) FILTER (WHERE v.active) AS min_volume_ml,
                (array_agg(m.url ORDER BY m.sort_order, m.id) FILTER (WHERE m.url IS NOT NULL))[1] AS image_url
           FROM catalog_products p
           LEFT JOIN catalog_variants v ON v.product_id = p.id
           LEFT JOIN catalog_media m ON m.product_id = p.id
          WHERE ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.sku ILIKE '%' || $1 || '%')
            AND ($2 = '' OR p.status = $2)
            AND ($3 = '' OR COALESCE(NULLIF(p.type_label, ''), p.product_type) = $3)
          GROUP BY p.id
          ORDER BY ${sortSql}
          LIMIT 500`,
        [search, status, type],
      ), pool.query(
        `SELECT COALESCE(NULLIF(type_label, ''), product_type) AS value,
                COUNT(*)::INT AS product_count
           FROM catalog_products
          WHERE COALESCE(NULLIF(type_label, ''), product_type) IS NOT NULL
            AND COALESCE(NULLIF(type_label, ''), product_type) <> ''
          GROUP BY value
          ORDER BY product_count DESC, value ASC`,
      ), pool.query("SELECT COUNT(*)::INT AS product_count FROM catalog_products")]);
      response.json({ products: result.rows.map((row) => ({
        ...serializeProduct(row),
        variantCount: row.variant_count,
        minPrice: row.min_price_minor === null ? null : Number(row.min_price_minor) / 100,
        minVolume: row.min_volume_ml === null ? null : Number(row.min_volume_ml),
        imageUrl: row.image_url,
      })),
      productTypes: typeResult.rows.map((row) => ({ value: row.value, count: row.product_count })),
      totalProducts: totalResult.rows[0]?.product_count || 0 });
    } catch (error) {
      next(error);
    }
  });

  router.get("/products/:id", async (request, response, next) => {
    try {
      const [productResult, variantsResult, mediaResult] = await Promise.all([
        pool.query("SELECT * FROM catalog_products WHERE id = $1", [request.params.id]),
        pool.query("SELECT * FROM catalog_variants WHERE product_id = $1 ORDER BY sort_order, id", [request.params.id]),
        pool.query("SELECT * FROM catalog_media WHERE product_id = $1 ORDER BY sort_order, id", [request.params.id]),
      ]);
      if (!productResult.rowCount) {
        response.status(404).json({ error: "product_not_found" });
        return;
      }
      response.json({
        product: serializeProduct(productResult.rows[0]),
        variants: variantsResult.rows.map((row) => ({
          id: row.id,
          sku: row.sku,
          name: row.name,
          volumeMl: row.volume_ml,
          price: Number(row.price_minor) / 100,
          compareAtPrice: row.compare_at_price_minor === null ? null : Number(row.compare_at_price_minor) / 100,
          active: row.active,
          sortOrder: row.sort_order,
        })),
        media: mediaResult.rows.map((row) => ({
          id: row.id,
          url: row.url,
          altText: row.alt_text,
          sortOrder: row.sort_order,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/products", async (request, response, next) => {
    if (!PRODUCT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const body = request.body || {};
    const name = cleanText(body.name, 240);
    const sku = String(body.sku || "").trim();
    const status = String(body.status || "draft");
    const leadTimeDays = Number(body.leadTimeDays ?? 1);
    if (!name || !validSku(sku) || !["draft", "published", "archived"].includes(status)
      || !Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) {
      response.status(400).json({ error: "product_invalid" });
      return;
    }
    const variants = Array.isArray(body.variants) ? body.variants : [];
    if (!variants.length) {
      response.status(400).json({ error: "variant_required" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO catalog_products
          (sku, slug, kind, status, name, product_type, type_label, short_description, description,
           fulfillment_mode, lead_time_days, seo_title, seo_description, noindex, published_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'made_to_order',$10,$11,$12,$13,
           CASE WHEN $4='published' THEN NOW() ELSE NULL END)
         RETURNING *`,
        [
          sku, `${slugify(name, sku.toLowerCase())}-${slugify(sku)}`,
          body.kind === "fragrance" ? "fragrance" : "product", status, name,
          cleanText(body.productType, 100) || "product", cleanText(body.typeLabel, 120),
          cleanText(body.shortDescription), cleanText(body.description, 20000), leadTimeDays,
          cleanText(body.seoTitle, 240), cleanText(body.seoDescription, 500), Boolean(body.noindex),
        ],
      );
      const product = inserted.rows[0];
      for (const [index, variant] of variants.entries()) {
        const variantSku = String(variant.sku || "").trim();
        const priceMinor = Math.round(Number(variant.price) * 100);
        if (!validSku(variantSku) || !Number.isSafeInteger(priceMinor) || priceMinor < 0) {
          throw Object.assign(new Error("variant_invalid"), { statusCode: 400 });
        }
        await client.query(
          `INSERT INTO catalog_variants
            (product_id, external_key, sku, name, volume_ml, price_minor, active, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [product.id, `cms:${randomUUID()}`, variantSku, cleanText(variant.name, 120),
            variant.volumeMl || null, priceMinor, variant.active !== false, index],
        );
      }
      for (const [index, media] of (Array.isArray(body.media) ? body.media : []).entries()) {
        if (!cleanText(media.url, 1000)) continue;
        await client.query(
          `INSERT INTO catalog_media (product_id,url,alt_text,sort_order)
           VALUES ($1,$2,$3,$4)`,
          [product.id, cleanText(media.url, 1000), cleanText(media.altText, 250) || name, index],
        );
      }
      await audit(client, request, "catalog.product_created", "catalog_product", product.id, { sku, name });
      await client.query("COMMIT");
      response.status(201).json({ product: serializeProduct(product) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" || error?.statusCode === 400) {
        response.status(error.statusCode || 409).json({ error: error.message || "catalog_conflict" });
        return;
      }
      next(error);
    } finally {
      client.release();
    }
  });

  router.put("/products/:id", async (request, response, next) => {
    if (!PRODUCT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    const body = request.body || {};
    const name = cleanText(body.name, 240);
    const sku = String(body.sku || "").trim();
    const status = String(body.status || "draft");
    const leadTimeDays = Number(body.leadTimeDays ?? 1);
    const variants = Array.isArray(body.variants) ? body.variants : [];
    if (!name || !validSku(sku) || !["draft", "published", "archived"].includes(status)
      || !Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365
      || !variants.length) {
      response.status(400).json({ error: "product_invalid" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE catalog_products SET
           sku = $2, name = $3, status = $4, product_type = $5, type_label = $6,
           short_description = $7, description = $8, fulfillment_mode = 'made_to_order',
           lead_time_days = $9, seo_title = $10, seo_description = $11,
           noindex = $12,
           published_at = CASE WHEN $4 = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
         WHERE id = $1 RETURNING *`,
        [
          request.params.id, sku, name, status, cleanText(body.productType, 100) || "product",
          cleanText(body.typeLabel, 120), cleanText(body.shortDescription), cleanText(body.description, 20000),
          leadTimeDays, cleanText(body.seoTitle, 240), cleanText(body.seoDescription, 500), Boolean(body.noindex),
        ],
      );
      if (!result.rowCount) {
        await client.query("ROLLBACK");
        response.status(404).json({ error: "product_not_found" });
        return;
      }
      if (variants.length) {
        const retainedVariantIds = [];
        for (const [index, variant] of variants.entries()) {
          const variantSku = String(variant.sku || "").trim();
          const priceMinor = Math.round(Number(variant.price) * 100);
          if (!validSku(variantSku) || !Number.isSafeInteger(priceMinor) || priceMinor < 0) {
            throw Object.assign(new Error("variant_invalid"), { statusCode: 400 });
          }
          if (variant.id) {
            const updatedVariant = await client.query(
              `UPDATE catalog_variants SET sku=$3, name=$4, volume_ml=$5, price_minor=$6,
                 compare_at_price_minor=$7, active=$8, sort_order=$9
               WHERE id=$1 AND product_id=$2`,
              [
                variant.id, request.params.id, variantSku, cleanText(variant.name, 120),
                variant.volumeMl || null, priceMinor,
                variant.compareAtPrice ? Math.round(Number(variant.compareAtPrice) * 100) : null,
                variant.active !== false, index,
              ],
            );
            if (!updatedVariant.rowCount) {
              throw Object.assign(new Error("variant_invalid"), { statusCode: 400 });
            }
            retainedVariantIds.push(variant.id);
          } else {
            const insertedVariant = await client.query(
              `INSERT INTO catalog_variants
                (product_id, external_key, sku, name, volume_ml, price_minor, active, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               RETURNING id`,
              [
                request.params.id, `cms:${randomUUID()}`, variantSku, cleanText(variant.name, 120),
                variant.volumeMl || null, priceMinor, variant.active !== false, index,
              ],
            );
            retainedVariantIds.push(insertedVariant.rows[0].id);
          }
        }
        await client.query(
          `DELETE FROM catalog_variants
            WHERE product_id = $1 AND NOT (id = ANY($2::UUID[]))`,
          [request.params.id, retainedVariantIds],
        );
      }
      if (Array.isArray(body.media)) {
        await client.query("DELETE FROM catalog_media WHERE product_id = $1", [request.params.id]);
        for (const [index, media] of body.media.entries()) {
          if (!cleanText(media.url, 1000)) continue;
          await client.query(
            `INSERT INTO catalog_media (product_id,url,alt_text,sort_order)
             VALUES ($1,$2,$3,$4)`,
            [request.params.id, cleanText(media.url, 1000), cleanText(media.altText, 250) || name, index],
          );
        }
      }
      await audit(client, request, "catalog.product_updated", "catalog_product", request.params.id, { sku, name });
      await client.query("COMMIT");
      response.json({ product: serializeProduct(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" || error?.statusCode === 400) {
        response.status(error.statusCode || 409).json({ error: error.message || "catalog_conflict" });
        return;
      }
      next(error);
    } finally {
      client.release();
    }
  });

  router.post("/media", memoryUpload.single("file"), async (request, response, next) => {
    if (!PRODUCT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      if (!request.file?.buffer) {
        response.status(400).json({ error: "file_required" });
        return;
      }
      const detected = await fileTypeFromBuffer(request.file.buffer);
      if (!detected || !new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(detected.mime)) {
        response.status(415).json({ error: "image_type_not_allowed" });
        return;
      }
      await mkdir(mediaDirectory, { recursive: true });
      const filename = `${Date.now()}-${randomUUID()}.${detected.ext}`;
      await writeFile(path.join(mediaDirectory, filename), request.file.buffer, { flag: "wx", mode: 0o640 });
      const url = `/${config.admin.mediaDirectory.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "")}/${filename}`;
      await audit(pool, request, "media.uploaded", "media", null, {
        filename,
        originalName: request.file.originalname,
        size: request.file.size,
      });
      response.status(201).json({ url, mimeType: detected.mime, size: request.file.size });
    } catch (error) {
      next(error);
    }
  });

  router.get("/catalog.xlsx", async (_request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT p.sku AS product_sku, v.sku AS variant_sku, p.status, p.name, p.product_type,
               p.type_label, v.volume_ml, v.price_minor, p.lead_time_days,
               (array_agg(m.url ORDER BY m.sort_order, m.id) FILTER (WHERE m.url IS NOT NULL))[1] AS image_url,
               (array_agg(m.alt_text ORDER BY m.sort_order, m.id) FILTER (WHERE m.url IS NOT NULL))[1] AS image_alt,
               p.short_description, p.seo_title, p.seo_description
          FROM catalog_products p
          JOIN catalog_variants v ON v.product_id = p.id
          LEFT JOIN catalog_media m ON m.product_id = p.id
         GROUP BY p.id, v.id
         ORDER BY p.name, v.sort_order, v.sku
      `);
      const workbook = await createCatalogWorkbook(result.rows.map((row) => ({
        productSku: row.product_sku,
        variantSku: row.variant_sku,
        status: row.status,
        name: row.name,
        productType: row.product_type,
        typeLabel: row.type_label,
        volumeMl: row.volume_ml,
        price: Number(row.price_minor) / 100,
        leadTimeDays: row.lead_time_days,
        imageUrl: row.image_url,
        imageAlt: row.image_alt,
        shortDescription: row.short_description,
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
      })));
      const buffer = await workbook.xlsx.writeBuffer();
      response.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="fluide-catalog.xlsx"',
        "Content-Length": buffer.length,
      }).send(Buffer.from(buffer));
    } catch (error) {
      next(error);
    }
  });

  router.post("/catalog.xlsx", memoryUpload.single("file"), async (request, response, next) => {
    if (!PRODUCT_EDIT_ROLES.has(request.admin.role)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }
    try {
      if (!request.file?.buffer) {
        response.status(400).json({ error: "file_required" });
        return;
      }
      const parsed = await parseCatalogWorkbook(request.file.buffer);
      if (parsed.errors.length || request.query.apply !== "1") {
        response.status(parsed.errors.length ? 400 : 200).json({
          valid: parsed.errors.length === 0,
          rowCount: parsed.rows.length,
          errors: parsed.errors.slice(0, 100),
          preview: parsed.rows.slice(0, 20),
          applied: false,
        });
        return;
      }

      const client = await pool.connect();
      const counts = { productsCreated: 0, productsUpdated: 0, variantsCreated: 0, variantsUpdated: 0 };
      try {
        await client.query("BEGIN");
        const groups = Map.groupBy(parsed.rows, (row) => row.productSku);
        for (const [productSku, rows] of groups) {
          const first = rows[0];
          const existing = await client.query("SELECT id FROM catalog_products WHERE sku = $1", [productSku]);
          let productId;
          if (existing.rowCount) {
            productId = existing.rows[0].id;
            await client.query(
              `UPDATE catalog_products SET status=$2, name=$3, product_type=$4, type_label=$5,
                 short_description=$6, fulfillment_mode='made_to_order', lead_time_days=$7,
                 seo_title=$8, seo_description=$9,
                 published_at=CASE WHEN $2='published' THEN COALESCE(published_at,NOW()) ELSE published_at END
               WHERE id=$1`,
              [productId, first.status, first.name, first.productType, first.typeLabel,
                first.shortDescription, first.leadTimeDays, first.seoTitle, first.seoDescription],
            );
            counts.productsUpdated += 1;
          } else {
            const inserted = await client.query(
              `INSERT INTO catalog_products
                (sku, slug, kind, status, name, product_type, type_label, short_description,
                 fulfillment_mode, lead_time_days, seo_title, seo_description, published_at)
               VALUES ($1,$2,'product',$3,$4,$5,$6,$7,'made_to_order',$8,$9,$10,
                 CASE WHEN $3='published' THEN NOW() ELSE NULL END)
               RETURNING id`,
              [productSku, `${first.slug}-${slugify(productSku)}`, first.status, first.name,
                first.productType, first.typeLabel, first.shortDescription, first.leadTimeDays,
                first.seoTitle, first.seoDescription],
            );
            productId = inserted.rows[0].id;
            counts.productsCreated += 1;
          }

          for (const row of rows) {
            const variant = await client.query("SELECT id FROM catalog_variants WHERE sku = $1", [row.variantSku]);
            if (variant.rowCount) {
              await client.query(
                `UPDATE catalog_variants SET product_id=$2, name=$3, volume_ml=$4,
                   price_minor=$5, active=TRUE WHERE id=$1`,
                [variant.rows[0].id, productId, row.volumeMl ? `${row.volumeMl} мл` : null, row.volumeMl, row.priceMinor],
              );
              counts.variantsUpdated += 1;
            } else {
              await client.query(
                `INSERT INTO catalog_variants
                  (product_id, external_key, sku, name, volume_ml, price_minor)
                 VALUES ($1,$2,$3,$4,$5,$6)`,
                [productId, `xlsx:${row.variantSku}`, row.variantSku,
                  row.volumeMl ? `${row.volumeMl} мл` : null, row.volumeMl, row.priceMinor],
              );
              counts.variantsCreated += 1;
            }
          }
          if (first.imageUrl) {
            await client.query(
              `INSERT INTO catalog_media (product_id, url, alt_text, sort_order)
               VALUES ($1,$2,$3,0)
               ON CONFLICT (product_id,url) WHERE product_id IS NOT NULL
               DO UPDATE SET alt_text=EXCLUDED.alt_text`,
              [productId, first.imageUrl, first.imageAlt],
            );
          }
        }
        await audit(client, request, "catalog.xlsx_imported", "catalog", null, counts);
        await client.query("COMMIT");
        response.json({ valid: true, applied: true, rowCount: parsed.rows.length, counts });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error?.code === "23505") {
        response.status(409).json({ error: "catalog_conflict", detail: error.detail });
        return;
      }
      next(error);
    }
  });

  return router;
}
