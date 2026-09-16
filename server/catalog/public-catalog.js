const money = (minor) => Number(minor || 0) / 100;

const fragranceTitle = (product) => String(product.name || "")
  .replace(/^FLUIDE\s+\d+\s+/i, "")
  .trim() || product.name;

export function serializePublicCatalog(products, variants, media) {
  const variantsByProduct = Map.groupBy(variants, (row) => row.product_id);
  const mediaByProduct = Map.groupBy(media, (row) => row.product_id);
  const result = { fragrances: [], products: [] };

  for (const product of products) {
    const productVariants = variantsByProduct.get(product.id) || [];
    const productMedia = mediaByProduct.get(product.id) || [];
    const image = productMedia[0]?.url || null;
    const attributes = product.attributes || {};

    if (product.kind === "fragrance") {
      const id = String(product.legacy_id || product.slug).replace(/^fragrance-/, "");
      result.fragrances.push({
        ...attributes,
        id,
        name: product.name,
        title: fragranceTitle(product),
        image,
        thumbnail: productMedia[1]?.url || image,
        notesRaw: product.description || attributes.notesRaw || "",
        variants: productVariants.map((variant) => ({
          sku: variant.sku,
          size: variant.volume_ml === null ? "" : String(variant.volume_ml),
          volume: variant.name || (variant.volume_ml ? `${variant.volume_ml} мл` : ""),
          price: money(variant.price_minor),
        })),
      });
      continue;
    }

    const primaryVariant = productVariants[0] || {};
    result.products.push({
      ...attributes,
      id: product.legacy_id || `product-${product.slug}`,
      kind: "product",
      name: product.name,
      title: product.name,
      productType: product.product_type,
      typeLabel: product.type_label,
      volume: primaryVariant.name || attributes.volume || "",
      price: money(primaryVariant.price_minor),
      image,
      variants: productVariants.map((variant) => ({
        sku: variant.sku,
        size: variant.volume_ml === null ? "" : String(variant.volume_ml),
        volume: variant.name || (variant.volume_ml ? `${variant.volume_ml} мл` : ""),
        price: money(variant.price_minor),
      })),
    });
  }

  return result;
}
