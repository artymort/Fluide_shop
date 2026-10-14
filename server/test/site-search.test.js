import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("shared search finds all product kinds and normalizes fragrance numbers and ё", async () => {
  const source = await readFile(new URL("../../site-search.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const search = context.window.FluideSearch;
  const items = [
    { id: "025", name: "FLUIDE 25 Baccarat", title: "Baccarat", notes: { top: ["шафран"] } },
    { id: "product-01", kind: "product", name: "Крем для тела", typeLabel: "Уход" },
    { id: "product-02", kind: "product", name: "Парфюмерное мыло с ёлкой" },
  ];
  assert.equal(search.find(items, "25")[0].id, "025");
  assert.equal(search.find(items, "025")[0].id, "025");
  assert.equal(search.find(items, "крем")[0].id, "product-01");
  assert.equal(search.find(items, "елкой")[0].id, "product-02");
  assert.equal(search.find(items, "").length, 0);
});
