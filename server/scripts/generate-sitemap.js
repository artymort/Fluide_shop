import { readFile, writeFile } from "node:fs/promises";

const siteOrigin = "https://fluide-atelier.ru";
const publicPages = [
  "/",
  "/catalog.html",
  "/selection.html",
  "/about.html",
];

const [fragrances, products] = await Promise.all([
  readFile(new URL("../../data/fragrances.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../data/products.json", import.meta.url), "utf8").then(JSON.parse),
]);

const productPages = [...fragrances, ...products].map(
  ({ id }) => `/product.html?id=${encodeURIComponent(id)}`,
);

const urls = [...publicPages, ...productPages];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((path) => `  <url><loc>${siteOrigin}${path}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

await writeFile(new URL("../../sitemap.xml", import.meta.url), xml, "utf8");
console.log(`Generated sitemap.xml with ${urls.length} URLs.`);
