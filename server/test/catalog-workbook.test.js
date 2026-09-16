import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogWorkbook, parseCatalogWorkbook } from "../catalog/workbook.js";

test("catalog workbook round-trips editable product rows", async () => {
  const input = [{
    productSku: "FL-011",
    variantSku: "FL-011-30",
    status: "published",
    name: "FLUIDE 11 AMOR AMOR",
    productType: "fragrance",
    typeLabel: "Парфюм",
    volumeMl: 30,
    price: 1990,
    leadTimeDays: 1,
    imageUrl: "images/fragrances/011.webp",
    imageAlt: "Флакон FLUIDE 11",
    shortDescription: "По мотивам Cacharel Amor Amor",
    seoTitle: "FLUIDE 11 — купить",
    seoDescription: "Описание",
  }];
  const workbook = await createCatalogWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseCatalogWorkbook(Buffer.from(buffer));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].productSku, "FL-011");
  assert.equal(parsed.rows[0].priceMinor, 199000);
});
