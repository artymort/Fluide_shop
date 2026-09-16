import assert from "node:assert/strict";
import test from "node:test";
import { serializePublicCatalog } from "../catalog/public-catalog.js";

test("public catalog keeps CMS prices and legacy storefront identities", () => {
  const catalog = serializePublicCatalog([
    { id: "p1", legacy_id: "fragrance-011", slug: "011-amor", kind: "fragrance", name: "FLUIDE 11 AMOR AMOR", product_type: "fragrance", type_label: "Парфюм", description: "Ноты", attributes: { category: "Люкс", original: "Cacharel" } },
    { id: "p2", legacy_id: "product-01", slug: "home", kind: "product", name: "Парфюм для дома", product_type: "home-fragrance", type_label: "Для дома", description: null, attributes: { volume: "300 мл" } },
  ], [
    { product_id: "p1", sku: "FL-011-30", name: "30 мл", volume_ml: 30, price_minor: 209000 },
    { product_id: "p2", sku: "FL-P-01", name: "300 мл", volume_ml: 300, price_minor: 49000 },
  ], [
    { product_id: "p1", url: "fragrance.webp" },
    { product_id: "p2", url: "home.webp" },
  ]);

  assert.equal(catalog.fragrances[0].id, "011");
  assert.equal(catalog.fragrances[0].title, "AMOR AMOR");
  assert.equal(catalog.fragrances[0].variants[0].price, 2090);
  assert.equal(catalog.products[0].id, "product-01");
  assert.equal(catalog.products[0].price, 490);
});
