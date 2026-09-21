import { Router } from "express";
import { prepareHomeContent } from "../content/home-content.js";

export function createContentRouter(pool) {
  const router = Router();

  router.get("/pages/home", async (_request, response, next) => {
    try {
      const result = await pool.query(
        "SELECT published_content, published_at FROM content_pages WHERE slug = 'home' LIMIT 1",
      );
      const content = await prepareHomeContent(result.rows[0]?.published_content);
      response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      response.json({ slug: "home", content, publishedAt: result.rows[0]?.published_at || null });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
