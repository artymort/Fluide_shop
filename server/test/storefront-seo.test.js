import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createStorefrontSeoRouter } from "../routes/storefront-seo.js";
import { normalizeLegacyId, productPath, sectionForProduct } from "../catalog/urls.js";

const product = {
  id: "p1", legacy_id: "fragrance-025", sku: "FL-025", slug: "025-25-baccarat",
  kind: "fragrance", name: "FLUIDE 25 Baccarat", product_type: "fragrance",
  type_label: "Парфюм", status: "published", fulfillment_mode: "made_to_order",
  short_description: "По мотивам Baccarat Rouge", description: "Шафран и жасмин",
  attributes: { category: "Селектив", original: "Baccarat Rouge" },
  noindex: false, updated_at: "2026-10-14T00:00:00.000Z",
};
const pool = {
  async query(sql) {
    if (sql.includes("WHERE status = 'archived'")) return { rows: [{ legacy_id: "fragrance-099", slug: "099-old" }] };
    if (sql.includes("FROM catalog_products WHERE")) return { rows: [product] };
    if (sql.includes("FROM catalog_variants")) return { rows: [
      { product_id: "p1", sku: "FL-025-30", volume_ml: 30, name: "30 мл", price_minor: 349000 },
      { product_id: "p1", sku: "FL-025-50", volume_ml: 50, name: "50 мл", price_minor: 499000 },
    ] };
    if (sql.includes("FROM catalog_media")) return { rows: [{ product_id: "p1", url: "images/fragrances/025.webp" }] };
    throw new Error(`Unexpected query: ${sql}`);
  },
};

test("catalog URL maps fragrance and legacy number consistently", () => {
  assert.equal(productPath(product), "/catalog/perfume/025-baccarat/");
  assert.equal(productPath({ ...product, legacy_id: undefined, legacyId: "fragrance-025" }), "/catalog/perfume/025-baccarat/");
  assert.equal(sectionForProduct({ kind: "product", product_type: "candle" }), "home");
  assert.equal(normalizeLegacyId("25"), "fragrance-025");
  assert.equal(normalizeLegacyId("025"), "fragrance-025");
});

test("storefront serves product HTML, one-hop legacy redirect, 404 and current sitemap", async () => {
  const app = express().use(createStorefrontSeoRouter(pool));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const legacy = await fetch(`${base}/product.html?id=25&utm_source=test`, { redirect: "manual" });
    assert.equal(legacy.status, 301);
    assert.equal(legacy.headers.get("location"), "/catalog/perfume/025-baccarat/?utm_source=test");

    const page = await fetch(`${base}/catalog/perfume/025-baccarat/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /<h1 itemprop="name">FLUIDE 25 Baccarat<\/h1>/);
    assert.match(html, /3[\s\u00a0]?490 ₽/);
    assert.match(html, /<link rel="canonical" href="https:\/\/fluide-atelier.ru\/catalog\/perfume\/025-baccarat\/">/);
    assert.match(html, /application\/ld\+json/);

    const duplicateNumber = await fetch(`${base}/catalog/perfume/025-25-baccarat/`, { redirect: "manual" });
    assert.equal(duplicateNumber.status, 301);
    assert.equal(duplicateNumber.headers.get("location"), "/catalog/perfume/025-baccarat/");

    const filtered = await fetch(`${base}/catalog/perfume/025-baccarat/?utm_source=test`);
    assert.match(await filtered.text(), /<meta name="robots" content="noindex,follow">/);

    const category = await fetch(`${base}/catalog/perfume/`);
    const categoryHtml = await category.text();
    assert.equal(category.status, 200);
    assert.match(categoryHtml, /<h1>Парфюм FLUIDE<\/h1>/);
    assert.match(categoryHtml, /href="\/catalog\/perfume\/025-baccarat\/"/);
    assert.match(categoryHtml, /itemscope itemtype="https:\/\/schema\.org\/OfferCatalog"/);
    assert.match(categoryHtml, /itemprop="itemListElement" itemscope itemtype="https:\/\/schema\.org\/Offer"/);
    assert.match(categoryHtml, /itemprop="price" content="3490"/);
    assert.match(categoryHtml, /itemprop="image" href="https:\/\/fluide-atelier\.ru\/images\/fragrances\/025\.webp"/);

    const oldCategory = await fetch(`${base}/catalog.html?section=perfume`, { redirect: "manual" });
    assert.equal(oldCategory.status, 301);
    assert.equal(oldCategory.headers.get("location"), "/catalog/perfume/");

    const missing = await fetch(`${base}/product.html?id=999999`, { redirect: "manual" });
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Товар не найден/);
    const missingClean = await fetch(`${base}/catalog/perfume/999999-missing/`);
    assert.equal(missingClean.status, 404);
    const archived = await fetch(`${base}/product.html?id=99`);
    assert.equal(archived.status, 410);

    const sitemap = await fetch(`${base}/sitemap.xml`);
    const xml = await sitemap.text();
    assert.equal(sitemap.status, 200);
    assert.match(xml, /\/catalog\/perfume\/025-baccarat\//);
    assert.doesNotMatch(xml, /product\.html\?id=/);

    const feed = await fetch(`${base}/yandex-feed.yml`);
    const yml = await feed.text();
    assert.equal(feed.status, 200);
    assert.match(feed.headers.get("content-type"), /application\/xml/);
    assert.match(yml, /<yml_catalog date="\d{4}-\d\d-\d\d \d\d:\d\d">/);
    assert.match(yml, /<offer id="fragrance-025-30" available="true">/);
    assert.match(yml, /<offer id="fragrance-025-50" available="true">/);
    assert.match(yml, /<price>3490\.00<\/price>/);
    assert.match(yml, /<categoryId>2<\/categoryId>/);
    assert.match(yml, /<picture>https:\/\/fluide-atelier\.ru\/images\/fragrances\/025\.webp<\/picture>/);
    assert.match(yml, /<collectionId>perfume<\/collectionId>/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Yandex feed excludes unpublished offers and escapes CMS content", async () => {
  const rows = [
    { ...product, name: "FLUIDE & Cherry", description: "Вишня & мускус" },
    { ...product, id: "p2", legacy_id: "fragrance-026", slug: "026-hidden", noindex: true },
    { ...product, id: "p3", legacy_id: "fragrance-027", slug: "027-unavailable", fulfillment_mode: "unavailable" },
    { ...product, id: "p4", legacy_id: "fragrance-028", slug: "028-no-image" },
  ];
  const testPool = {
    async query(sql) {
      if (sql.includes("WHERE status = 'archived'")) return { rows: [] };
      if (sql.includes("FROM catalog_products WHERE")) return { rows };
      if (sql.includes("FROM catalog_variants")) return { rows: rows.map((row) => ({ product_id: row.id, sku: `FL-${row.id}-30`, name: "30 мл", volume_ml: 30, price_minor: 349000 })) };
      if (sql.includes("FROM catalog_media")) return { rows: rows.filter((row) => row.id !== "p4").map((row) => ({ product_id: row.id, url: `images/fragrances/${row.id}.webp` })) };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const app = express().use(createStorefrontSeoRouter(testPool));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/yandex-feed.yml`);
    const yml = await response.text();
    assert.equal(response.status, 200);
    assert.match(yml, /<name>FLUIDE &amp; Cherry, 30 мл<\/name>/);
    assert.match(yml, /<description>Парфюм\. Вишня &amp; мускус<\/description>/);
    assert.equal((yml.match(/<offer id=/g) || []).length, 1);
    assert.doesNotMatch(yml, /026-hidden|027-unavailable|028-no-image/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
