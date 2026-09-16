import { randomUUID } from "node:crypto";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { buildYandexAuthorizeUrl, fetchYandexProfile, YandexOAuthError } from "../oauth/yandex.js";
import { buildVkAuthorizeUrl, fetchVkProfile, VkOAuthError } from "../oauth/vk.js";
import { createOAuthState, readOAuthState } from "../security/oauth-state.js";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeRussianPhone,
  verifyOtpCode,
} from "../security/phone-otp.js";
import {
  clearSessionCookie,
  createSession,
  hashSessionToken,
  readCookie,
  setSessionCookie,
} from "../security/sessions.js";
import { createSmsSender, SmsDeliveryError } from "../sms/sender.js";

const oauthStateCookieName = (config, provider) => (
  config.isProduction ? `__Host-fluide_${provider}_oauth` : `fluide_${provider}_oauth`
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
  phoneRequired: false,
  email: row.email,
  createdAt: row.created_at,
});

const authErrorLocation = (code) => `/index.html?login=1&auth_error=${encodeURIComponent(code)}`;

async function findSessionUser(database, request, config) {
  const token = readCookie(request.get("cookie"), config.session.cookieName);
  if (!token) return null;

  const result = await database.query(
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

async function signInWithProvider({ pool, config, request, provider, profile }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT u.id
         FROM auth_identities ai
         JOIN users u ON u.id = ai.user_id
        WHERE ai.provider = $1 AND ai.provider_subject = $2
        FOR UPDATE OF ai, u`,
      [provider, profile.subject],
    );

    let user;
    if (existing.rowCount) {
      const updated = await client.query(
        `UPDATE users
            SET display_name = COALESCE($2, display_name),
                email = CASE
                  WHEN email_verified_at IS NULL AND $3::TEXT IS NOT NULL THEN $3
                  ELSE email
                END
          WHERE id = $1
          RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [existing.rows[0].id, profile.displayName, profile.email],
      );
      user = updated.rows[0];
      await client.query(
        `UPDATE auth_identities
            SET profile = $3::JSONB, last_login_at = NOW()
          WHERE provider = $1 AND provider_subject = $2`,
        [provider, profile.subject, JSON.stringify(profile.profile)],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO users (display_name, email)
         VALUES ($1, $2)
         RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
        [profile.displayName, profile.email],
      );
      user = inserted.rows[0];
      await client.query(
        `INSERT INTO auth_identities (user_id, provider, provider_subject, profile, last_login_at)
         VALUES ($1, $2, $3, $4::JSONB, NOW())`,
        [user.id, provider, profile.subject, JSON.stringify(profile.profile)],
      );
    }

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, 'auth.login', 'user', $1::TEXT, $2::JSONB, $3)`,
      [user.id, JSON.stringify({ provider, eventId: randomUUID() }), request.ip || null],
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

async function findOrCreatePhoneUser({ client, phone }) {
  const existing = await client.query(
    `SELECT id, display_name, phone_e164, phone_verified_at, email, created_at
       FROM users
      WHERE phone_e164 = $1 AND status = 'active' AND deleted_at IS NULL
      FOR UPDATE`,
    [phone],
  );
  if (existing.rowCount) {
    const verified = await client.query(
      `UPDATE users
          SET phone_verified_at = COALESCE(phone_verified_at, NOW())
        WHERE id = $1
        RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
      [existing.rows[0].id],
    );
    return verified.rows[0];
  }

  const inserted = await client.query(
    `INSERT INTO users (phone_e164, phone_verified_at)
     VALUES ($1, NOW())
     RETURNING id, display_name, phone_e164, phone_verified_at, email, created_at`,
    [phone],
  );
  return inserted.rows[0];
}

export function createAuthRouter({ pool, config, fetchImpl = globalThis.fetch, sendOtpImpl }) {
  const router = Router();
  const sendOtp = sendOtpImpl || createSmsSender({ config, fetchImpl });
  const oauthStartLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: "too_many_requests" }),
  });
  const requestPhoneLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: "too_many_requests" }),
  });
  const verifyPhoneLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 15,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json({ error: "too_many_requests" }),
  });

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

  router.get("/yandex/start", oauthStartLimit, (_request, response) => {
    if (!config.yandex.enabled) {
      response.status(503).json({ error: "yandex_not_configured" });
      return;
    }

    const oauth = createOAuthState(config.session.secret);
    response.cookie(oauthStateCookieName(config, "yandex"), oauth.cookieValue, {
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
    const cookieValue = readCookie(request.get("cookie"), oauthStateCookieName(config, "yandex"));
    const oauth = readOAuthState(cookieValue, config.session.secret);
    response.clearCookie(oauthStateCookieName(config, "yandex"), oauthCookieOptions(config));

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
      const { user, session } = await signInWithProvider({
        pool,
        config,
        request,
        provider: "yandex",
        profile,
      });
      setSessionCookie(response, config, session.token, session.expiresAt);
      response.set("Cache-Control", "no-store").redirect("/account.html?auth=success");
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

  router.get("/vk/start", oauthStartLimit, (_request, response) => {
    if (!config.vk.enabled) {
      response.status(503).json({ error: "vk_not_configured" });
      return;
    }

    const oauth = createOAuthState(config.session.secret);
    response.cookie(oauthStateCookieName(config, "vk"), oauth.cookieValue, {
      ...oauthCookieOptions(config),
      maxAge: oauth.maxAgeMs,
    });
    response.set("Cache-Control", "no-store").redirect(buildVkAuthorizeUrl({
      clientId: config.vk.clientId,
      redirectUri: config.vk.redirectUri,
      state: oauth.state,
      challenge: oauth.challenge,
    }));
  });

  router.get("/vk/callback", async (request, response, next) => {
    const cookieValue = readCookie(request.get("cookie"), oauthStateCookieName(config, "vk"));
    const oauth = readOAuthState(cookieValue, config.session.secret);
    response.clearCookie(oauthStateCookieName(config, "vk"), oauthCookieOptions(config));

    if (request.query.error) {
      response.redirect(authErrorLocation("vk_access_denied"));
      return;
    }
    if (!config.vk.enabled || !oauth || request.query.state !== oauth.state) {
      response.redirect(authErrorLocation("vk_invalid_state"));
      return;
    }

    const code = typeof request.query.code === "string" ? request.query.code : "";
    const deviceId = typeof request.query.device_id === "string" ? request.query.device_id : "";
    const type = typeof request.query.type === "string" ? request.query.type : "";
    if (!code || code.length > 4096 || !deviceId || deviceId.length > 256 || (type && type !== "code_v2")) {
      response.redirect(authErrorLocation("vk_invalid_response"));
      return;
    }

    try {
      const profile = await fetchVkProfile({
        fetchImpl,
        config: config.vk,
        code,
        deviceId,
        verifier: oauth.verifier,
        state: oauth.state,
      });
      const { user, session } = await signInWithProvider({
        pool,
        config,
        request,
        provider: "vk",
        profile,
      });
      setSessionCookie(response, config, session.token, session.expiresAt);
      response.set("Cache-Control", "no-store").redirect("/account.html?auth=vk-success");
    } catch (error) {
      if (error instanceof VkOAuthError) {
        console.warn(`VK OAuth failed: ${error.code}`);
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

  router.post("/phone/request", requestPhoneLimit, async (request, response, next) => {
    const phone = normalizeRussianPhone(request.body?.phone);
    if (!phone) {
      response.status(400).json({ error: "invalid_phone" });
      return;
    }
    if (!config.sms.enabled) {
      response.status(503).json({ error: "sms_not_configured" });
      return;
    }

    try {
      const recent = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (created_at + ($2 * INTERVAL '1 second') - NOW()))::INT AS retry_after
           FROM otp_challenges
          WHERE phone_e164 = $1
            AND consumed_at IS NULL
            AND created_at > NOW() - ($2 * INTERVAL '1 second')
          ORDER BY created_at DESC
          LIMIT 1`,
        [phone, config.sms.resendSeconds],
      );
      if (recent.rowCount) {
        response.status(429).json({
          error: "code_recently_sent",
          retryAfter: Math.max(1, recent.rows[0].retry_after || config.sms.resendSeconds),
        });
        return;
      }

      const daily = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE phone_e164 = $1) AS phone_count,
           COUNT(*) FILTER (WHERE ip_address = $2::INET) AS ip_count,
           COUNT(*) AS global_count
         FROM otp_challenges
        WHERE created_at > NOW() - INTERVAL '24 hours'`,
        [phone, request.ip || null],
      );
      if (Number(daily.rows[0].phone_count) >= config.sms.dailyPerPhone
        || Number(daily.rows[0].ip_count) >= config.sms.dailyPerIp
        || Number(daily.rows[0].global_count) >= config.sms.dailyGlobal) {
        response.status(429).json({ error: "daily_limit_reached" });
        return;
      }

      const challengeId = randomUUID();
      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + config.sms.codeTtlMinutes * 60_000);
      const codeHash = hashOtpCode({
        secret: config.session.secret,
        challengeId,
        phone,
        code,
      });
      await pool.query(
        `UPDATE otp_challenges
            SET consumed_at = NOW()
          WHERE phone_e164 = $1 AND consumed_at IS NULL`,
        [phone],
      );
      await pool.query(
        `INSERT INTO otp_challenges
          (id, phone_e164, code_hash, expires_at, ip_address)
         VALUES ($1, $2, $3, $4, $5)`,
        [challengeId, phone, codeHash, expiresAt, request.ip || null],
      );

      try {
        await sendOtp({ phone, code, ipAddress: request.ip || null });
      } catch (error) {
        await pool.query("UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1", [challengeId]);
        throw error;
      }

      const payload = {
        challengeId,
        expiresInSeconds: config.sms.codeTtlMinutes * 60,
      };
      if (!config.isProduction && config.sms.provider === "console") payload.developmentCode = code;
      response.set("Cache-Control", "no-store").status(202).json(payload);
    } catch (error) {
      if (error instanceof SmsDeliveryError) {
        console.warn(`SMS delivery failed: ${error.code}`, error.details);
        response.status(error.code === "sms_not_configured" ? 503 : 502).json({ error: error.code });
        return;
      }
      next(error);
    }
  });

  router.post("/phone/verify", verifyPhoneLimit, async (request, response, next) => {
    const challengeId = String(request.body?.challengeId || "");
    const code = String(request.body?.code || "");
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
      response.status(400).json({ error: "invalid_code" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const challengeResult = await client.query(
        `SELECT id, phone_e164, code_hash, expires_at, attempts, consumed_at
           FROM otp_challenges
          WHERE id = $1
          FOR UPDATE`,
        [challengeId],
      );
      const challenge = challengeResult.rows[0];
      if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= new Date()
        || challenge.attempts >= config.sms.maxAttempts) {
        throw Object.assign(new Error("invalid_or_expired_code"), { code: "invalid_or_expired_code" });
      }

      const valid = verifyOtpCode({
        secret: config.session.secret,
        challengeId: challenge.id,
        phone: challenge.phone_e164,
        code,
        expectedHash: challenge.code_hash,
      });
      if (!valid) {
        await client.query(
          `UPDATE otp_challenges
              SET attempts = attempts + 1,
                  consumed_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE consumed_at END
            WHERE id = $1`,
          [challenge.id, config.sms.maxAttempts],
        );
        await client.query("COMMIT");
        response.status(400).json({ error: "invalid_code" });
        return;
      }

      const user = await findOrCreatePhoneUser({ client, phone: challenge.phone_e164 });

      const phoneIdentity = await client.query(
        `SELECT user_id
           FROM auth_identities
          WHERE provider = 'phone' AND provider_subject = $1
          FOR UPDATE`,
        [challenge.phone_e164],
      );
      if (phoneIdentity.rowCount && phoneIdentity.rows[0].user_id !== user.id) {
        throw Object.assign(new Error("phone_conflict"), { code: "phone_conflict" });
      }
      if (phoneIdentity.rowCount) {
        await client.query(
          `UPDATE auth_identities SET last_login_at = NOW()
            WHERE provider = 'phone' AND provider_subject = $1`,
          [challenge.phone_e164],
        );
      } else {
        await client.query(
          `INSERT INTO auth_identities (user_id, provider, provider_subject, profile, last_login_at)
           VALUES ($1, 'phone', $2, '{}'::JSONB, NOW())`,
          [user.id, challenge.phone_e164],
        );
      }

      await client.query("UPDATE otp_challenges SET consumed_at = NOW() WHERE id = $1", [challenge.id]);
      const existingToken = readCookie(request.get("cookie"), config.session.cookieName);
      if (existingToken) {
        await client.query(
          "UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1",
          [hashSessionToken(existingToken)],
        );
      }
      await client.query(
        `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, 'auth.phone_verified', 'user', $1::TEXT, $2::JSONB, $3)`,
        [user.id, JSON.stringify({ purpose: "login" }), request.ip || null],
      );
      const session = await createSession({ pool: client, config, userId: user.id, request });
      await client.query("COMMIT");

      setSessionCookie(response, config, session.token, session.expiresAt);
      response.set("Cache-Control", "no-store").json({
        authenticated: true,
        user: serializeUser(user),
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      if (["invalid_or_expired_code", "invalid_code"].includes(error?.code)) {
        response.status(400).json({ error: error.code });
        return;
      }
      if (error?.code === "phone_conflict" || error?.code === "23505") {
        response.status(409).json({ error: "phone_conflict" });
        return;
      }
      next(error);
    } finally {
      client.release();
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
