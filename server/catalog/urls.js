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
  return `/catalog/${sectionForProduct(product)}/${encodeURIComponent(product.slug)}/`;
}

export function normalizeLegacyId(value) {
  const id = String(value || "").trim();
  if (/^\d{1,3}$/.test(id)) return `fragrance-${id.padStart(3, "0")}`;
  return id;
}
