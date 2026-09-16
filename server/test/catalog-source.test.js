import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceCatalog, slugify } from "../catalog/source-catalog.js";

test("slugify transliterates Russian names", () => {
  assert.equal(slugify("Парфюм для дома № 7"), "parfyum-dlya-doma-7");
});

test("source catalog creates made-to-order fragrance variants", () => {
  const catalog = buildSourceCatalog({
    fragrances: [{
      id: "011",
      title: "11 AMOR AMOR",
      original: "Cacharel Amor Amor",
      category: "Люкс",
      image: "images/011.webp",
      thumbnail: "images/thumbs/011.webp",
      notesRaw: "Верхние: цитрус",
    }],
    products: [],
    prices: { perfume: { 30: { Люкс: 1990 }, 50: { Люкс: 2990 } } },
  });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].legacyId, "fragrance-011");
  assert.equal(catalog[0].fulfillmentMode, "made_to_order");
  assert.equal(catalog[0].leadTimeDays, 1);
  assert.deepEqual(catalog[0].variants.map((variant) => variant.priceMinor), [199000, 299000]);
  assert.deepEqual(catalog[0].variants.map((variant) => variant.sku), ["FL-011-30", "FL-011-50"]);
  assert.deepEqual(catalog[0].media, [{
    url: "images/011.webp",
    altText: "Флакон FLUIDE 11 AMOR AMOR",
    sortOrder: 0,
  }]);
});

test("source catalog imports standalone products without inventory fields", () => {
  const catalog = buildSourceCatalog({
    fragrances: [],
    products: [{
      id: "product-01",
      kind: "product",
      title: "Парфюм для дома La Sultan 300 мл",
      productType: "home-fragrance",
      typeLabel: "Парфюм для дома",
      volume: "300 мл",
      price: 490,
      image: "images/la-sultan.webp",
    }],
    prices: {},
  });
  assert.equal(catalog[0].variants[0].priceMinor, 49000);
  assert.equal(catalog[0].variants[0].volumeMl, 300);
  assert.equal(catalog[0].attributes.price, undefined);
  assert.equal(catalog[0].fulfillmentMode, "made_to_order");
});
