const CYRILLIC_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(value, fallback = "item") {
  const transliterated = [...String(value || "").toLocaleLowerCase("ru-RU")]
    .map((character) => CYRILLIC_MAP[character] ?? character)
    .join("");
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 150);
  return slug || fallback;
}

const minorUnits = (value) => Math.max(0, Math.round((Number(value) || 0) * 100));

const fragranceName = (fragrance) => {
  const title = String(fragrance.title || fragrance.name || "Аромат").replace(/^\d+\s+/, "").trim();
  return `FLUIDE ${Number(fragrance.id) || fragrance.id} ${title}`.trim();
};

const fragranceSku = (id) => `FL-${String(id).padStart(3, "0")}`;

function sourceAttributes(source, omittedKeys) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !omittedKeys.has(key)));
}

export function buildSourceCatalog({ fragrances = [], products = [], prices = {} }) {
  const priceBySize = prices.perfume || {};
  const result = [];

  for (const fragrance of fragrances) {
    if (!fragrance?.id) continue;
    const id = String(fragrance.id).padStart(3, "0");
    const name = fragranceName(fragrance);
    const sku = fragranceSku(id);
    const category = String(fragrance.category || "Люкс");
    const variants = [30, 50].map((volume, index) => ({
      externalKey: `fragrance-${id}-${volume}`,
      sku: `${sku}-${volume}`,
      name: `${volume} мл`,
      volumeMl: volume,
      priceMinor: minorUnits(priceBySize[String(volume)]?.[category] || 0),
      sortOrder: index,
      attributes: { category },
    }));

    result.push({
      legacyId: `fragrance-${id}`,
      sku,
      slug: slugify(`${id}-${fragrance.title || name}`, `fragrance-${id}`),
      kind: "fragrance",
      status: "published",
      name,
      productType: "fragrance",
      typeLabel: "Парфюм",
      shortDescription: fragrance.original ? `По мотивам ${fragrance.original}` : null,
      description: fragrance.notesRaw || null,
      fulfillmentMode: "made_to_order",
      leadTimeDays: 1,
      attributes: sourceAttributes(fragrance, new Set(["id", "name", "title", "image", "thumbnail"])),
      seoTitle: `${name} — купить в FLUIDE Atelier`,
      seoDescription: null,
      variants,
      // `thumbnail` is a generated storefront derivative of the main image,
      // not a separate gallery photo managed by the CMS.
      media: fragrance.image ? [{
        url: fragrance.image,
        altText: `Флакон ${name}`,
        sortOrder: 0,
      }] : [],
    });
  }

  for (const product of products) {
    if (!product?.id || product.kind !== "product") continue;
    const legacyId = String(product.id);
    const suffix = legacyId.replace(/^product-/, "").replace(/[^a-z0-9]+/gi, "-").toUpperCase();
    const sku = `FL-P-${suffix}`;
    const name = String(product.title || product.name || legacyId).trim();
    const volumeMatch = String(product.volume || "").match(/(\d+)/);
    result.push({
      legacyId,
      sku,
      slug: slugify(`${legacyId}-${name}`, legacyId),
      kind: "product",
      status: "published",
      name,
      productType: String(product.productType || "product"),
      typeLabel: product.typeLabel || null,
      shortDescription: null,
      description: null,
      fulfillmentMode: "made_to_order",
      leadTimeDays: 1,
      attributes: sourceAttributes(product, new Set([
        "id", "kind", "name", "title", "productType", "typeLabel", "price", "image",
      ])),
      seoTitle: `${name} — купить в FLUIDE Atelier`,
      seoDescription: null,
      variants: [{
        externalKey: `${legacyId}-default`,
        sku: `${sku}-DEFAULT`,
        name: product.volume || "Основной вариант",
        volumeMl: volumeMatch ? Number(volumeMatch[1]) : null,
        priceMinor: minorUnits(product.price),
        sortOrder: 0,
        attributes: {},
      }],
      media: product.image ? [{
        url: product.image,
        altText: name,
        sortOrder: 0,
      }] : [],
    });
  }

  return result;
}
