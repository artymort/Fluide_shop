import { Router } from "express";
import { serializePublicCatalog } from "../catalog/public-catalog.js";

export function createCatalogRouter(pool) {
  const router = Router();

  router.get("/bootstrap", async (_request, response, next) => {
    try {
      const [productsResult, variantsResult, mediaResult] = await Promise.all([
        pool.query(`SELECT * FROM catalog_products WHERE status = 'published' ORDER BY kind, legacy_id, name`),
        pool.query(`
          SELECT v.* FROM catalog_variants v
          JOIN catalog_products p ON p.id = v.product_id
          WHERE p.status = 'published' AND v.active
          ORDER BY v.product_id, v.sort_order, v.id
        `),
        pool.query(`
          SELECT m.* FROM catalog_media m
          JOIN catalog_products p ON p.id = m.product_id
          WHERE p.status = 'published'
          ORDER BY m.product_id, m.sort_order, m.id
        `),
      ]);
      const catalog = serializePublicCatalog(productsResult.rows, variantsResult.rows, mediaResult.rows);
      response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      response.json({ ...catalog, generatedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
