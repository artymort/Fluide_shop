import { randomUUID } from "node:crypto";
import { Router } from "express";
import { buildYandexAuthorizeUrl, fetchYandexProfile, YandexOAuthError } from "../oauth/yandex.js";
import { createOAuthState, readOAuthState } from "../security/oauth-state.js";
import {
  clearSessionCookie,
  createSession,
  hashSessionToken,
  readCookie,
  setSessionCookie,
} from "../security/sessions.js";

const yandexStateCookieName = (config) => (
  config.isProduction ? "__Host-fluide_yandex_oauth" : "fluide_yandex_oauth"
);

const oauthCookieOptions = (config) => ({
  httpOnly: true,
  secure: config.isProduction,
  sameSite: "lax",
  path: "/",
});

const serializeUser = (row) => ({
  id: row.id,
  displayName: row.display_name,
  phone: row.phone_e164,
  phoneVerified: Boolean(row.phone_verified_at),
  phoneRequired: !row.phone_e164,
  email: row.email,
  createdAt: row.created_at,
});

const authErrorLocation = (code) => `/index.html?login=1&auth_error=${encodeURIComponent(code)}`;

async function findSessionUser(pool, request, config) {
  const token = readCookie(request.get("cookie"), config.session.cookieName);
  if (!token) return null;

  const result = await pool.query(
    `SELECT u.id, u.display_name, u.phone_e164, u.phone_verified_at, u.email, u.created_at
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
  return result.rows[0] || null;
}

async function signInWithYandex({ pool, config, request, profile }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT u.id
         FROM auth_identities ai
         JOIN users u ON u.id = ai.user_id
        WHERE ai.provider = 'yandex' AND ai.provider_subject = $1
        FOR UPDATE OF ai, u`,
      [profile.subject],
    );

    let user;
    if (existing.rowCount) {
      const updated = await client.query(
        `UPDATE users
            SET display_name = COALESCE($2, display_name),
                email = CASE
                  WHEN email_verified_at IS NULL AND $3::TEXT IS NOT NULL THEN $3
                  ELSE email
                END,
                phone_e164 = CASE
                  WHEN phone_verified_at IS NULL AND $4::TEXT IS NOT NULL THEN $4
                  ELSE phone_e164
                END
          WHERE id = $1
          RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [existing.rows[0].id, profile.displayName, profile.email, profile.phone],
      );
      user = updated.rows[0];
      await client.query(
        `UPDATE auth_identities
            SET profile = $3::JSONB, last_login_at = NOW()
          WHERE provider = $1 AND provider_subject = $2`,
        ["yandex", profile.subject, JSON.stringify(profile.profile)],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO users (display_name, phone_e164, email)
         VALUES ($1, $2, $3)
         RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [profile.displayName, profile.phone, profile.email],
      );
      user = inserted.rows[0];
      await client.query(
        `INSERT INTO auth_identities (user_id, provider, provider_subject, profile, last_login_at)
         VALUES ($1, 'yandex', $2, $3::JSONB, NOW())`,
        [user.id, profile.subject, JSON.stringify(profile.profile)],
      );
    }

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, 'auth.login', 'user', $1::TEXT, $2::JSONB, $3)`,
      [user.id, JSON.stringify({ provider: "yandex", eventId: randomUUID() }), request.ip || null],
    );
    const session = await createSession({ pool: client, config, userId: user.id, request });
    await client.query("COMMIT");
    return { user, session };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function createAuthRouter({ pool, config, fetchImpl = globalThis.fetch }) {
  const router = Router();

  router.get("/session", async (request, response, next) => {
    try {
      const user = await findSessionUser(pool, request, config);
      if (!user) {
        if (readCookie(request.get("cookie"), config.session.cookieName)) clearSessionCookie(response, config);
        response.set("Cache-Control", "no-store").json({ authenticated: false });
        return;
      }

      response.set("Cache-Control", "no-store").json({
        authenticated: true,
        user: serializeUser(user),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/yandex/start", (_request, response) => {
    if (!config.yandex.enabled) {
      response.status(503).json({ error: "yandex_not_configured" });
      return;
    }

    const oauth = createOAuthState(config.session.secret);
    response.cookie(yandexStateCookieName(config), oauth.cookieValue, {
      ...oauthCookieOptions(config),
      maxAge: oauth.maxAgeMs,
    });
    response.set("Cache-Control", "no-store").redirect(buildYandexAuthorizeUrl({
      clientId: config.yandex.clientId,
      redirectUri: config.yandex.redirectUri,
      state: oauth.state,
      challenge: oauth.challenge,
    }));
  });

  router.get("/yandex/callback", async (request, response, next) => {
    const cookieValue = readCookie(request.get("cookie"), yandexStateCookieName(config));
    const oauth = readOAuthState(cookieValue, config.session.secret);
    response.clearCookie(yandexStateCookieName(config), oauthCookieOptions(config));

    if (request.query.error) {
      response.redirect(authErrorLocation("access_denied"));
      return;
    }
    if (!config.yandex.enabled || !oauth || request.query.state !== oauth.state) {
      response.redirect(authErrorLocation("invalid_state"));
      return;
    }
    if (typeof request.query.code !== "string" || !request.query.code) {
      response.redirect(authErrorLocation("missing_code"));
      return;
    }

    try {
      const profile = await fetchYandexProfile({
        fetchImpl,
        config: config.yandex,
        code: request.query.code,
        verifier: oauth.verifier,
      });
      const { user, session } = await signInWithYandex({ pool, config, request, profile });
      setSessionCookie(response, config, session.token, session.expiresAt);
      response.set("Cache-Control", "no-store").redirect(
        user.phone_e164 ? "/account.html?auth=success" : "/account.html?auth=success&phone=required",
      );
    } catch (error) {
      if (error instanceof YandexOAuthError) {
        console.warn(`Yandex OAuth failed: ${error.code}`);
        response.redirect(authErrorLocation(error.code));
        return;
      }
      if (error?.code === "23505") {
        response.redirect(authErrorLocation("account_conflict"));
        return;
      }
      next(error);
    }
  });

  router.patch("/phone", async (request, response, next) => {
    try {
      const current = await findSessionUser(pool, request, config);
      if (!current) {
        response.status(401).json({ error: "not_authenticated" });
        return;
      }

      const phone = String(request.body?.phone || "").replace(/[^+\d]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        response.status(400).json({ error: "invalid_phone" });
        return;
      }

      const result = await pool.query(
        `UPDATE users
            SET phone_e164 = COALESCE(phone_e164, $2)
          WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
          RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [current.id, phone],
      );
      response.set("Cache-Control", "no-store").json({ user: serializeUser(result.rows[0]) });
    } catch (error) {
      if (error?.code === "23505") {
        response.status(409).json({ error: "phone_in_use" });
        return;
      }
      next(error);
    }
  });

  router.patch("/phone", async (request, response, next) => {
    try {
      const current = await findSessionUser(pool, request, config);
      if (!current) {
        response.status(401).json({ error: "not_authenticated" });
        return;
      }

      const phone = String(request.body?.phone || "").replace(/[^+\d]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        response.status(400).json({ error: "invalid_phone" });
        return;
      }

      const result = await pool.query(
        `UPDATE users
            SET phone_e164 = COALESCE(phone_e164, $2)
          WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
          RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [current.id, phone],
      );
      response.set("Cache-Control", "no-store").json({ user: serializeUser(result.rows[0]) });
    } catch (error) {
      if (error?.code === "23505") {
        response.status(409).json({ error: "phone_in_use" });
        return;
      }
      next(error);
    }
  });

  router.patch("/profile", async (request, response, next) => {
    try {
      const current = await findSessionUser(pool, request, config);
      if (!current) {
        response.status(401).json({ error: "not_authenticated" });
        return;
      }

      const displayName = String(request.body?.displayName || "").trim().slice(0, 120) || null;
      const email = String(request.body?.email || "").trim().toLowerCase() || null;
      if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        response.status(400).json({ error: "invalid_email" });
        return;
      }

      const result = await pool.query(
        `UPDATE users
            SET display_name = $2, email = $3
          WHERE id = $1 AND status = 'active' AND deleted_at IS NULL
          RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [current.id, displayName, email],
      );
      response.set("Cache-Control", "no-store").json({ user: serializeUser(result.rows[0]) });
    } catch (error) {
      if (error?.code === "23505") {
        response.status(409).json({ error: "email_in_use" });
        return;
      }
      next(error);
    }
  });

  router.post("/logout", async (request, response, next) => {
    try {
      const token = readCookie(request.get("cookie"), config.session.cookieName);
      if (token) {
        await pool.query(
          "UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1",
          [hashSessionToken(token)],
        );
      }

      clearSessionCookie(response, config);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
