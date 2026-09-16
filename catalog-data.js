(function exposeCatalogData(global) {
  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  async function load() {
    try {
      const catalog = await fetchJson("/api/catalog/bootstrap");
      if (!Array.isArray(catalog.fragrances) || !Array.isArray(catalog.products)) {
        throw new Error("catalog_payload_invalid");
      }
      return { ...catalog, source: "postgresql" };
    } catch (apiError) {
      console.warn("Каталог API пока недоступен, используется резервная копия", apiError);
      const [fragrances, products, prices] = await Promise.all([
        fetchJson("data/fragrances.json"),
        fetchJson("data/products.json").catch(() => []),
        fetchJson("data/prices.json").catch(() => ({})),
      ]);
      return { fragrances, products, prices, source: "json-fallback" };
    }
  }

  global.FluideCatalogData = Object.freeze({ load });
})(window);
