import { readFile } from "node:fs/promises";
import { Router } from "express";
import { serializePublicCatalog } from "../catalog/public-catalog.js";
import { normalizeLegacyId, productPath, sectionForProduct, SECTION_TYPES, SITE_ORIGIN } from "../catalog/urls.js";

const root = new URL("../../", import.meta.url);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const xmlEscape = escapeHtml;
const absolute = (path) => new URL(path, SITE_ORIGIN).href;
const price = (amount) => new Intl.NumberFormat("ru-RU").format(Number(amount) || 0);
const jsonScript = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function renderHead(template, { title, description, path, image, robots = "index,follow", schema }) {
  const canonical = absolute(path);
  const socialImage = image ? absolute(image) : absolute("/assets/brand/logo-blue.svg");
  const extra = [
    '<base href="/">',
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="robots" content="${robots}">`,
    `<meta property="og:type" content="${schema ? "product" : "website"}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(socialImage)}">`,
    schema ? `<script type="application/ld+json">${jsonScript(schema)}</script>` : "",
  ].filter(Boolean).join("\n  ");
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>\n  ${extra}`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);
}

function productDescription(row, item) {
  const notes = item.notesRaw || row.description || "";
  const short = row.short_description || [item.typeLabel, item.volume].filter(Boolean).join(" · ");
  return String(row.seo_description || `${row.name}. ${[short, notes].filter(Boolean).join(". ") || "Купить в FLUIDE Atelier."}`)
    .replace(/\s+/g, " ").trim().slice(0, 300);
}

function productSchema(row, item, path) {
  const variants = item.variants || [];
  const offer = variants.length ? variants.map((variant) => ({
    "@type": "Offer",
    url: absolute(path),
    priceCurrency: "RUB",
    price: Number(variant.price),
    availability: row.fulfillment_mode === "unavailable" ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    sku: variant.sku,
  })) : undefined;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: row.name,
        description: productDescription(row, item),
        image: (item.images || []).map((image) => absolute(image.url)),
        sku: row.sku,
        brand: { "@type": "Brand", name: "FLUIDE Atelier" },
        offers: offer?.length === 1 ? offer[0] : offer,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: absolute("/") },
          { "@type": "ListItem", position: 2, name: "Каталог", item: absolute("/catalog/") },
          { "@type": "ListItem", position: 3, name: row.name, item: absolute(path) },
        ],
      },
    ],
  };
}

function productBody(row, item) {
  const title = escapeHtml(row.name);
  const description = escapeHtml(productDescription(row, item));
  const image = item.image ? `<img class="product-main-image" src="${escapeHtml(item.image)}" alt="${title}">` : "";
  const variants = (item.variants || []).map((variant) =>
    `<li>${escapeHtml(variant.volume || variant.size || "Вариант")}: ${price(variant.price)} ₽</li>`).join("");
  const unavailable = row.fulfillment_mode === "unavailable";
  return `<article class="product-layout" itemscope itemtype="https://schema.org/Product">
    <div class="product-overview"><section class="product-gallery">${image}</section>
      <section class="product-details"><h1 itemprop="name">${title}</h1>
        <p class="product-inspiration" itemprop="description">${description}</p>
        <div class="product-purchase"><div class="product-price">${variants.length ? `от ${price(Math.min(...item.variants.map((variant) => Number(variant.price))))} ₽` : "Цена уточняется"}</div>
        <p>${unavailable ? "Временно нет в наличии" : "Доступно для заказа"}</p>
        ${variants ? `<ul>${variants}</ul>` : ""}</div></section></div>
  </article>`;
}

function renderProduct(template, row, item) {
  const path = productPath(row);
  const title = row.seo_title || `${row.name} — купить в FLUIDE Atelier`;
  const description = productDescription(row, item);
  const html = renderHead(template, {
    title, description, path, image: item.image,
    robots: row.noindex ? "noindex,follow" : "index,follow",
    schema: productSchema(row, item, path),
  });
  const id = row.legacy_id || item.id;
  return html
    .replace('href="#product-main"', `href="${escapeHtml(path)}#product-main"`)
    .replace('class="product-page shell" aria-live="polite"', `class="product-page shell" aria-live="polite" data-product-id="${escapeHtml(id)}" data-ssr="true"`)
    .replace(/<section class="product-loading">[\s\S]*?<\/section>/, productBody(row, item))
    .replace('<span class="breadcrumb-current">Загрузка...</span>', `<span class="breadcrumb-current">${escapeHtml(row.name)}</span>`);
}

function renderNotFound(template) {
  return renderHead(template, {
    title: "Товар не найден — FLUIDE Atelier", description: "Товар не найден. Посмотрите актуальный каталог FLUIDE Atelier.",
    path: "/catalog/", robots: "noindex,follow",
  }).replace(/<section class="product-loading">[\s\S]*?<\/section>/,
    '<section class="product-error"><h1>Товар не найден</h1><p>Посмотрите другие товары в каталоге.</p><a href="/catalog/">Открыть каталог</a></section>');
}

function renderGone(template) {
  return renderNotFound(template)
    .replace("Товар не найден — FLUIDE Atelier", "Товар снят с продажи — FLUIDE Atelier")
    .replace("<h1>Товар не найден</h1>", "<h1>Товар снят с продажи</h1>");
}

const sectionLabels = { all: "Каталог FLUIDE", perfume: "Парфюм FLUIDE", solid: "Твердый парфюм", home: "Ароматы для дома", care: "Уход", car: "Автопарфюм" };

function renderCatalog(template, section, query, rows, items) {
  const title = sectionLabels[section] || sectionLabels.all;
  const path = section === "all" ? "/catalog/" : `/catalog/${section}/`;
  const cards = rows.filter((row) => section === "all" || sectionForProduct(row) === section).map((row) => {
    const item = items.get(productPath(row));
    const image = item?.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(row.name)}" loading="lazy">` : "";
    const amount = item?.variants?.length ? Math.min(...item.variants.map((variant) => Number(variant.price))) : Number(item?.price || 0);
    return `<article class="fragrance-card"><a class="fragrance-media" href="${escapeHtml(productPath(row))}">${image}</a><div class="fragrance-info"><h3><a href="${escapeHtml(productPath(row))}">${escapeHtml(row.name)}</a></h3><strong class="card-price">${amount ? `от ${price(amount)} ₽` : "Цена уточняется"}</strong></div></article>`;
  }).join("");
  return renderHead(template, {
    title: `${title} — FLUIDE Atelier`, description: `${title}: продукция FLUIDE Atelier. Выберите свой аромат и оформите заказ.`,
    path, robots: Object.keys(query).length ? "noindex,follow" : "index,follow",
  }).replace("<h1>Каталог FLUIDE</h1>", `<h1>${escapeHtml(title)}</h1>`)
    .replace('href="#catalog-main"', `href="${escapeHtml(path)}#catalog-main"`)
    .replace('<div class="fragrance-grid"></div>', `<div class="fragrance-grid">${cards}</div>`);
}

export function createStorefrontSeoRouter(pool) {
  const router = Router();
  let snapshot;
  let expiresAt = 0;
  const templates = Promise.all([
    readFile(new URL("product.html", root), "utf8"),
    readFile(new URL("catalog.html", root), "utf8"),
  ]).then(([product, catalog]) => ({ product, catalog }));

  async function catalogSnapshot() {
    if (snapshot && Date.now() < expiresAt) return snapshot;
    const [products, variants, media, archived] = await Promise.all([
      pool.query("SELECT * FROM catalog_products WHERE status = 'published' ORDER BY kind, legacy_id, name"),
      pool.query("SELECT v.* FROM catalog_variants v JOIN catalog_products p ON p.id = v.product_id WHERE p.status = 'published' AND v.active ORDER BY v.product_id, v.sort_order, v.id"),
      pool.query("SELECT m.* FROM catalog_media m JOIN catalog_products p ON p.id = m.product_id WHERE p.status = 'published' ORDER BY m.product_id, m.sort_order, m.id"),
      pool.query("SELECT legacy_id, slug FROM catalog_products WHERE status = 'archived'"),
    ]);
    const publicCatalog = serializePublicCatalog(products.rows, variants.rows, media.rows);
    const items = new Map([...publicCatalog.fragrances, ...publicCatalog.products].map((item) => [item.url, item]));
    snapshot = { rows: products.rows, items, archived: archived.rows };
    expiresAt = Date.now() + 60_000;
    return snapshot;
  }

  router.get("/product.html", async (request, response, next) => {
    try {
      const { product } = await templates;
      const id = normalizeLegacyId(request.query.id);
      if (!id || Array.isArray(request.query.id)) return response.status(404).send(renderNotFound(product));
      const { rows, archived } = await catalogSnapshot();
      const row = rows.find((candidate) => candidate.legacy_id === id);
      if (!row) return response.status(archived.some((candidate) => candidate.legacy_id === id) ? 410 : 404)
        .send(archived.some((candidate) => candidate.legacy_id === id) ? renderGone(product) : renderNotFound(product));
      const query = new URLSearchParams(request.query);
      query.delete("id");
      return response.redirect(301, `${productPath(row)}${query.size ? `?${query}` : ""}`);
    } catch (error) { next(error); }
  });

  router.get("/catalog.html", (request, response) => {
    const query = new URLSearchParams(request.query);
    const section = query.get("section") || (query.get("category") === "home" ? "home" : "all");
    query.delete("section");
    query.delete("category");
    const path = section === "all" || !SECTION_TYPES[section] ? "/catalog/" : `/catalog/${section}/`;
    response.redirect(301, `${path}${query.size ? `?${query}` : ""}`);
  });

  router.get(["/catalog/", "/catalog/:section/"], async (request, response, next) => {
    try {
      const section = request.params.section || "all";
      if (section !== "all" && !SECTION_TYPES[section]) return response.status(404).send("Категория не найдена");
      const canonical = section === "all" ? "/catalog/" : `/catalog/${section}/`;
      if (request.path !== canonical) return response.redirect(301, `${canonical}${request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : ""}`);
      const { catalog } = await templates;
      const { rows, items } = await catalogSnapshot();
      response.set("Cache-Control", "public, max-age=60");
      response.send(renderCatalog(catalog, section, request.query, rows, items));
    } catch (error) { next(error); }
  });

  router.get("/catalog/:section/:slug/", async (request, response, next) => {
    try {
      const { product } = await templates;
      const { rows, items, archived } = await catalogSnapshot();
      const row = rows.find((candidate) => candidate.slug === request.params.slug);
      if (!row) return response.status(archived.some((candidate) => candidate.slug === request.params.slug) ? 410 : 404)
        .send(archived.some((candidate) => candidate.slug === request.params.slug) ? renderGone(product) : renderNotFound(product));
      const canonical = productPath(row);
      if (request.path !== canonical) return response.redirect(301, `${canonical}${request.url.includes("?") ? request.url.slice(request.url.indexOf("?")) : ""}`);
      const item = items.get(canonical);
      response.set("Cache-Control", "public, max-age=60");
      const html = renderProduct(product, row, item);
      response.send(Object.keys(request.query).length ? html.replace('content="index,follow"', 'content="noindex,follow"') : html);
    } catch (error) { next(error); }
  });

  router.get("/sitemap.xml", async (_request, response, next) => {
    try {
      const { rows } = await catalogSnapshot();
      const paths = ["/", "/catalog/", ...Object.keys(SECTION_TYPES).map((section) => `/catalog/${section}/`), "/selection.html", "/about.html"];
      const urls = [
        ...paths.map((path) => ({ path })),
        ...rows.filter((row) => !row.noindex).map((row) => ({ path: productPath(row), updated: row.updated_at })),
      ];
      const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map(({ path, updated }) => `  <url><loc>${xmlEscape(absolute(path))}</loc>${updated ? `<lastmod>${new Date(updated).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`),
        "</urlset>", ""].join("\n");
      response.type("application/xml").set("Cache-Control", "public, max-age=60").send(xml);
    } catch (error) { next(error); }
  });

  return router;
}
