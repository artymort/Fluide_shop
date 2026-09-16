import { Router } from "express";

export function createHealthRouter(pool) {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      await pool.query("SELECT 1");
      response.set("Cache-Control", "no-store").json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
