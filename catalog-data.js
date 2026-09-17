(function exposeCatalogData(global) {
  const CACHE_KEY = "fluide-catalog-cache-v2";
  const CACHE_TTL_MS = 60 * 1000;
  let memoryCatalog = null;
  let pendingLoad = null;

  function isValidCatalog(catalog) {
    return Array.isArray(catalog?.fragrances) && Array.isArray(catalog?.products);
  }

  function readSessionCache() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (!cached || !isValidCatalog(cached.catalog)) return null;
      if (Date.now() - Number(cached.savedAt || 0) > CACHE_TTL_MS) return null;
      return cached.catalog;
    } catch {
      return null;
    }
  }

  function writeSessionCache(catalog) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), catalog }));
    } catch {
      // The catalog still works when storage is unavailable or full.
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: "default", ...options });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
  }

  async function fetchCatalog() {
    try {
      const catalog = await fetchJson("/api/catalog/bootstrap");
      if (!isValidCatalog(catalog)) throw new Error("catalog_payload_invalid");
      const normalized = { ...catalog, source: "postgresql" };
      writeSessionCache(normalized);
      return normalized;
    } catch (apiError) {
      console.warn("Каталог API пока недоступен, используется резервная копия", apiError);
      const [fragrances, products, prices] = await Promise.all([
        fetchJson("data/fragrances.json"),
        fetchJson("data/products.json").catch(() => []),
        fetchJson("data/prices.json").catch(() => ({})),
      ]);
      const fallback = { fragrances, products, prices, source: "json-fallback" };
      writeSessionCache(fallback);
      return fallback;
    }
  }

  function load(options = {}) {
    const force = options.force === true;
    if (!force && memoryCatalog) return Promise.resolve(memoryCatalog);

    if (!force) {
      const cached = readSessionCache();
      if (cached) {
        memoryCatalog = cached;
        return Promise.resolve(cached);
      }
    }

    if (pendingLoad) return pendingLoad;
    pendingLoad = fetchCatalog()
      .then((catalog) => {
        memoryCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        pendingLoad = null;
      });
    return pendingLoad;
  }

  function prefetch() {
    return load().catch(() => null);
  }

  global.FluideCatalogData = Object.freeze({ load, prefetch });
})(window);
