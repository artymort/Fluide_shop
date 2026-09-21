import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultHomeContent, normalizeHomeContent } from "../content/home-content.js";

test("homepage content keeps the selected bestseller count and order", async () => {
  const defaults = await getDefaultHomeContent();
  const selected = [
    "fragrance-011", "fragrance-019", "fragrance-046", "fragrance-049",
    "fragrance-055", "fragrance-072", "fragrance-088", "fragrance-100",
  ];
  const content = normalizeHomeContent({ bestsellers: { productIds: selected } }, defaults);
  assert.deepEqual(content.bestsellers.productIds, selected);
  assert.equal(content.bestsellers.productIds.length, 8);
});

test("homepage content removes duplicate bestseller ids", async () => {
  const defaults = await getDefaultHomeContent();
  const content = normalizeHomeContent({
    bestsellers: { productIds: ["fragrance-011", "fragrance-011", "fragrance-019"] },
  }, defaults);
  assert.deepEqual(content.bestsellers.productIds, ["fragrance-011", "fragrance-019"]);
});

test("homepage content rejects unsafe links and keeps defaults", async () => {
  const defaults = await getDefaultHomeContent();
  const content = normalizeHomeContent({ hero: { buttonUrl: "javascript:alert(1)" } }, defaults);
  assert.equal(content.hero.buttonUrl, defaults.hero.buttonUrl);
});

test("homepage content accepts secure absolute links", async () => {
  const defaults = await getDefaultHomeContent();
  const content = normalizeHomeContent({ hero: { buttonUrl: "https://fluide-atelier.ru/catalog.html#fresh" } }, defaults);
  assert.equal(content.hero.buttonUrl, "https://fluide-atelier.ru/catalog.html#fresh");
});
