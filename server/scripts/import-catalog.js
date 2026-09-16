import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSourceCatalog } from "../catalog/source-catalog.js";
import { loadConfig } from "../config.js";
import { createPool } from "../db.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (filename) => JSON.parse(await readFile(path.join(root, "data", filename), "utf8"));
const updateExisting = process.argv.includes("--update-existing");

const [fragrances, products, prices] = await Promise.all([
  readJson("fragrances.json"),
  readJson("products.json"),
  readJson("prices.json"),
]);

const catalog = buildSourceCatalog({ fragrances, products, prices });
const config = loadConfig();
const pool = createPool(config.database);
const client = await pool.connect();
let importRunId;
const summary = { created: 0, updated: 0, skipped: 0, errors: [] };

try {
  const run = await client.query(
    `INSERT INTO catalog_import_runs (source, status)
     VALUES ('repository-json', 'running') RETURNING id`,
  );
  importRunId = run.rows[0].id;
  await client.query("BEGIN");

  for (const item of catalog) {
    const existing = await client.query(
      "SELECT id FROM catalog_products WHERE legacy_id = $1",
      [item.legacyId],
    );
    if (existing.rowCount && !updateExisting) {
      summary.skipped += 1;
      continue;
    }

    const productResult = await client.query(
      `INSERT INTO catalog_products (
         legacy_id, sku, slug, kind, status, name, product_type, type_label, short_description,
         description, fulfillment_mode, lead_time_days, attributes, seo_title, seo_description,
         published_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13::JSONB, $14, $15,
         CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END
       )
       ON CONFLICT (legacy_id) DO UPDATE SET
         sku = EXCLUDED.sku,
         slug = EXCLUDED.slug,
         kind = EXCLUDED.kind,
         name = EXCLUDED.name,
         product_type = EXCLUDED.product_type,
         type_label = EXCLUDED.type_label,
         short_description = EXCLUDED.short_description,
         description = EXCLUDED.description,
         fulfillment_mode = EXCLUDED.fulfillment_mode,
         lead_time_days = EXCLUDED.lead_time_days,
         attributes = EXCLUDED.attributes,
         seo_title = EXCLUDED.seo_title,
         seo_description = EXCLUDED.seo_description
       RETURNING id`,
      [
        item.legacyId, item.sku, item.slug, item.kind, item.status, item.name, item.productType,
        item.typeLabel, item.shortDescription, item.description, item.fulfillmentMode,
        item.leadTimeDays, JSON.stringify(item.attributes), item.seoTitle, item.seoDescription,
      ],
    );
    const productId = productResult.rows[0].id;

    for (const variant of item.variants) {
      await client.query(
        `INSERT INTO catalog_variants (
           product_id, external_key, sku, name, volume_ml, price_minor, sort_order, attributes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB)
         ON CONFLICT (external_key) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           sku = EXCLUDED.sku,
           name = EXCLUDED.name,
           volume_ml = EXCLUDED.volume_ml,
           price_minor = EXCLUDED.price_minor,
           sort_order = EXCLUDED.sort_order,
           attributes = EXCLUDED.attributes`,
        [
          productId, variant.externalKey, variant.sku, variant.name, variant.volumeMl,
          variant.priceMinor, variant.sortOrder, JSON.stringify(variant.attributes),
        ],
      );
    }

    for (const media of item.media) {
      await client.query(
        `INSERT INTO catalog_media (product_id, url, alt_text, sort_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, url) WHERE product_id IS NOT NULL
         DO UPDATE SET alt_text = EXCLUDED.alt_text, sort_order = EXCLUDED.sort_order`,
        [productId, media.url, media.altText, media.sortOrder],
      );
    }

    if (existing.rowCount) summary.updated += 1;
    else summary.created += 1;
  }

  await client.query("COMMIT");
  await client.query(
    `UPDATE catalog_import_runs SET
       status = 'completed', created_count = $2, updated_count = $3, skipped_count = $4,
       error_count = 0, report = $5::JSONB, finished_at = NOW()
     WHERE id = $1`,
    [importRunId, summary.created, summary.updated, summary.skipped, JSON.stringify(summary)],
  );
  console.log(`Catalog import complete: created=${summary.created}, updated=${summary.updated}, skipped=${summary.skipped}`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  if (importRunId) {
    await client.query(
      `UPDATE catalog_import_runs SET status = 'failed', error_count = 1,
         report = $2::JSONB, finished_at = NOW() WHERE id = $1`,
      [importRunId, JSON.stringify({ error: error.message })],
    ).catch(() => {});
  }
  throw error;
} finally {
  client.release();
  await pool.end();
}
