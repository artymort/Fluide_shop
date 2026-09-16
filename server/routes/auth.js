import { Router } from "express";
import { clearSessionCookie, hashSessionToken, readCookie } from "../security/sessions.js";

export function createAuthRouter({ pool, config }) {
  const router = Router();

  router.get("/session", async (request, response, next) => {
    try {
      const token = readCookie(request.get("cookie"), config.session.cookieName);
      if (!token) {
        response.set("Cache-Control", "no-store").json({ authenticated: false });
        return;
      }

      const result = await pool.query(
        `SELECT u.id, u.display_name, u.phone_e164, u.email, u.created_at
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

      if (!result.rowCount) {
        clearSessionCookie(response, config);
        response.set("Cache-Control", "no-store").json({ authenticated: false });
        return;
      }

      response.set("Cache-Control", "no-store").json({
        authenticated: true,
        user: result.rows[0],
      });
    } catch (error) {
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
