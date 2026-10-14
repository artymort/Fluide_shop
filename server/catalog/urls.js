export const SITE_ORIGIN = "https://fluide-atelier.ru";

export const SECTION_TYPES = Object.freeze({
  perfume: ["fragrance"],
  solid: ["solid-perfume"],
  home: ["home-fragrance", "candle", "diffuser"],
  care: ["body-cream", "hair-spray", "hand-soap"],
  car: ["car-fragrance"],
});

export function sectionForProduct(product) {
  if (product.kind === "fragrance") return "perfume";
  return Object.entries(SECTION_TYPES).find(([section, types]) => section !== "perfume" && types.includes(product.product_type))?.[0] || "other";
}

export function productPath(product) {
  let slug = product.slug;
  const legacyNumber = /^fragrance-(\d{3})$/.exec(String(product.legacy_id || product.legacyId || ""))?.[1];
  if (legacyNumber) {
    const repeatedNumber = String(Number(legacyNumber));
    const prefix = `${legacyNumber}-${repeatedNumber}-`;
    if (slug.startsWith(prefix)) slug = `${legacyNumber}-${slug.slice(prefix.length)}`;
  }
  return `/catalog/${sectionForProduct(product)}/${encodeURIComponent(slug)}/`;
}

export function normalizeLegacyId(value) {
  const id = String(value || "").trim();
  if (/^\d{1,3}$/.test(id)) return `fragrance-${id.padStart(3, "0")}`;
  return id;
}
