import { readFile, writeFile } from "node:fs/promises";
import { buildSourceCatalog } from "../catalog/source-catalog.js";
import { productPath, SITE_ORIGIN } from "../catalog/urls.js";

const publicPages = [
  "/",
  "/catalog/",
  "/catalog/perfume/",
  "/catalog/solid/",
  "/catalog/home/",
  "/catalog/care/",
  "/catalog/car/",
  "/selection.html",
  "/about.html",
];

const [fragrances, products, prices] = await Promise.all([
  readFile(new URL("../../data/fragrances.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../data/products.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../data/prices.json", import.meta.url), "utf8").then(JSON.parse),
]);

const productPages = buildSourceCatalog({ fragrances, products, prices })
  .filter((item) => item.status === "published")
  .map(productPath);

const urls = [...new Set([...publicPages, ...productPages])];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((path) => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

await writeFile(new URL("../../sitemap.xml", import.meta.url), xml, "utf8");
console.log(`Generated sitemap.xml with ${urls.length} URLs.`);
