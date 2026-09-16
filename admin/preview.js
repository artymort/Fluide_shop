(function enableLocalCmsPreview() {
  const enabled = ["127.0.0.1", "localhost"].includes(location.hostname);
  if (!enabled) return;

  const now = () => new Date().toISOString();
  const originalFetch = window.fetch.bind(window);
  let products = [];
  const catalogReady = Promise.all([
    originalFetch("../data/fragrances.json", { cache: "no-cache" }).then((response) => response.json()),
    originalFetch("../data/products.json", { cache: "no-cache" }).then((response) => response.json()),
    originalFetch("../data/prices.json", { cache: "no-cache" }).then((response) => response.json()),
  ]).then(([fragrances, otherProducts, prices]) => {
    const perfumePrices = prices.perfume || {};
    const fragranceRows = fragrances.map((fragrance) => {
      const number = String(fragrance.id).padStart(3, "0");
      const sku = `FL-${number}`;
      const name = `FLUIDE ${Number(fragrance.id) || fragrance.id} ${String(fragrance.title || fragrance.name || "Аромат").replace(/^\d+\s+/, "").trim()}`;
      const category = String(fragrance.category || "Люкс");
      const variants = [30, 50].map((volume) => ({
        id: `preview-fragrance-${number}-${volume}`,
        sku: `${sku}-${volume}`,
        name: `${volume} мл`,
        volumeMl: volume,
        price: Number(perfumePrices[String(volume)]?.[category] || 0),
        active: true,
      }));
      const media = fragrance.image ? [{
        id: `preview-fragrance-${number}-media-0`,
        url: `../${fragrance.image}`,
        altText: `Флакон ${name}`,
      }] : [];
      return {
        id: `preview-fragrance-${number}`, legacyId: `fragrance-${number}`, sku, kind: "fragrance",
        status: "published", name, productType: "fragrance", typeLabel: "Парфюм",
        shortDescription: fragrance.original ? `По мотивам ${fragrance.original}` : "",
        description: fragrance.notesRaw || "", fulfillmentMode: "made_to_order", leadTimeDays: 1,
        seoTitle: `${name} — купить в FLUIDE Atelier`, seoDescription: "", noindex: false,
        variantCount: variants.length, minPrice: Math.min(...variants.map((variant) => variant.price)),
        imageUrl: media[0]?.url || null, minVolume: 30, variants, media,
      };
    });
    const productRows = otherProducts.filter((product) => product?.id && product.kind === "product").map((product) => {
      const legacyId = String(product.id);
      const suffix = legacyId.replace(/^product-/, "").replace(/[^a-z0-9]+/gi, "-").toUpperCase();
      const sku = `FL-P-${suffix}`;
      const name = String(product.title || product.name || legacyId).trim();
      const volumeMatch = String(product.volume || "").match(/(\d+)/);
      const variant = {
        id: `preview-${legacyId}-default`, sku: `${sku}-DEFAULT`, name: product.volume || "Основной вариант",
        volumeMl: volumeMatch ? Number(volumeMatch[1]) : null, price: Number(product.price || 0), active: true,
      };
      const imageUrl = product.image ? `../${product.image}` : null;
      return {
        id: `preview-${legacyId}`, legacyId, sku, kind: "product", status: "published", name,
        productType: String(product.productType || "product"), typeLabel: product.typeLabel || "Товар",
        shortDescription: "", description: "", fulfillmentMode: "made_to_order", leadTimeDays: 1,
        seoTitle: `${name} — купить в FLUIDE Atelier`, seoDescription: "", noindex: false,
        variantCount: 1, minPrice: variant.price, minVolume: variant.volumeMl, imageUrl, variants: [variant],
        media: imageUrl ? [{ id: `preview-${legacyId}-media`, url: imageUrl, altText: name }] : [],
      };
    });
    products = [...fragranceRows, ...productRows];
    return products;
  });
  const staff = [{ id: "demo-owner", email: "owner@fluide-atelier.ru", display_name: "Владелец FLUIDE", role: "owner", status: "active", last_login_at: now(), created_at: now() }];
  const customers = [
    {
      id: "c1", display_name: "Анна Касаткина", first_name: "Анна", last_name: "Касаткина",
      phone_e164: "+79990000000", login_phone_e164: null, contact_phone_e164: "+79990000000",
      email: "anna@example.ru", birth_date: "1992-04-18", gender: "female", avatar_url: null,
      status: "active", providers: ["yandex"], created_at: "2026-09-12T10:00:00Z",
      updated_at: "2026-09-16T12:10:00Z", last_login_at: "2026-09-16T12:10:00Z",
      identities: [{ provider: "yandex", provider_subject: "1000034426", created_at: "2026-09-12T10:00:00Z", last_login_at: "2026-09-16T12:10:00Z" }],
    },
    {
      id: "c2", display_name: "Мария Иванова", first_name: "Мария", last_name: "Иванова",
      phone_e164: null, login_phone_e164: null, contact_phone_e164: null,
      email: "maria@example.ru", birth_date: "1995-10-03", gender: "female", avatar_url: null,
      status: "active", providers: ["vk"], created_at: "2026-09-10T10:00:00Z",
      updated_at: "2026-09-15T09:00:00Z", last_login_at: "2026-09-15T09:00:00Z",
      identities: [{ provider: "vk", provider_subject: "42424242", created_at: "2026-09-10T10:00:00Z", last_login_at: "2026-09-15T09:00:00Z" }],
    },
  ];
  const json = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
  const body = (options) => options?.body && typeof options.body === "string" ? JSON.parse(options.body) : {};

  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.pathname.startsWith("/api/admin")) return originalFetch(input, options);
    const path = url.pathname.slice("/api/admin".length) || "/";
    const method = options.method || "GET";
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (path === "/session" || path === "/login") return json({ authenticated: true, admin: { id: "demo-owner", email: "owner@fluide-atelier.ru", displayName: "Владелец FLUIDE", role: "owner" } });
    if (path === "/logout" || path === "/password") return new Response(null, { status: 204 });
    if (path === "/dashboard") {
      await catalogReady;
      const categoryCounts = products.reduce((counts, product) => {
        const value = product.typeLabel || product.productType || "Товар";
        counts.set(value, (counts.get(value) || 0) + 1);
        return counts;
      }, new Map());
      const categories = [...categoryCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ru"))
        .slice(0, 7);
      return json({
        published_products: products.length,
        draft_products: 0,
        active_variants: products.reduce((total, product) => total + product.variantCount, 0),
        customers: 18,
        new_customers_7d: 4,
        products_without_media: products.filter((product) => !product.imageUrl).length,
        last_import_at: now(),
        categories,
        recent_products: products.slice(0, 5).map((product) => ({ ...product, updatedAt: product.updatedAt || now() })),
      });
    }
    if (path === "/products" && method === "GET") {
      await catalogReady;
      const q = (url.searchParams.get("q") || "").toLocaleLowerCase("ru-RU");
      const status = url.searchParams.get("status") || "";
      const type = url.searchParams.get("type") || "";
      const sort = url.searchParams.get("sort") || "updated-desc";
      const typeCounts = products.reduce((counts, product) => {
        const value = product.typeLabel || product.productType;
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
        return counts;
      }, new Map());
      const productTypes = [...typeCounts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ru"));
      const rows = products.filter((product) => {
        const productType = product.typeLabel || product.productType || "";
        return (!q || `${product.name} ${product.sku}`.toLocaleLowerCase("ru-RU").includes(q))
          && (!status || product.status === status)
          && (!type || productType === type);
      });
      const comparators = {
        "name-asc": (left, right) => left.name.localeCompare(right.name, "ru"),
        "name-desc": (left, right) => right.name.localeCompare(left.name, "ru"),
        "price-asc": (left, right) => (left.minPrice ?? Infinity) - (right.minPrice ?? Infinity),
        "price-desc": (left, right) => (right.minPrice ?? -Infinity) - (left.minPrice ?? -Infinity),
        "volume-asc": (left, right) => (left.minVolume ?? Infinity) - (right.minVolume ?? Infinity),
        "volume-desc": (left, right) => (right.minVolume ?? -Infinity) - (left.minVolume ?? -Infinity),
      };
      if (comparators[sort]) rows.sort(comparators[sort]);
      return json({ products: rows, productTypes, totalProducts: products.length });
    }
    const productMatch = path.match(/^\/products\/([^/]+)$/);
    if (productMatch && method === "GET") {
      const product = products.find((item) => item.id === productMatch[1]);
      return product ? json({ product, variants: product.variants, media: product.media }) : json({ error: "product_not_found" }, 404);
    }
    if (path === "/products" && method === "POST") {
      const payload = body(options);
      const product = { ...payload, id: `demo-${Date.now()}`, variantCount: payload.variants.length, minPrice: Math.min(...payload.variants.map((row) => row.price)), minVolume: Math.min(...payload.variants.map((row) => row.volumeMl).filter(Number.isFinite)), imageUrl: payload.media[0]?.url || null, variants: payload.variants, media: payload.media };
      products.unshift(product);
      return json({ product }, 201);
    }
    if (productMatch && method === "PUT") {
      const index = products.findIndex((item) => item.id === productMatch[1]);
      const payload = body(options);
      products[index] = { ...products[index], ...payload, variantCount: payload.variants.length, minPrice: Math.min(...payload.variants.map((row) => row.price)), minVolume: Math.min(...payload.variants.map((row) => row.volumeMl).filter(Number.isFinite)), imageUrl: payload.media[0]?.url || null, variants: payload.variants, media: payload.media };
      return json({ product: products[index] });
    }
    if (path === "/customers") return json({ customers });
    const customerMatch = path.match(/^\/customers\/([^/]+)$/);
    if (customerMatch) {
      const customer = customers.find((item) => item.id === customerMatch[1]);
      return customer
        ? json({ customer, identities: customer.identities || [] })
        : json({ error: "customer_not_found" }, 404);
    }
    if (path === "/staff" && method === "GET") return json({ staff });
    if (path === "/staff" && method === "POST") {
      const payload = body(options);
      staff.push({ id: `demo-staff-${Date.now()}`, email: payload.email, display_name: payload.displayName, role: payload.role, status: "active", last_login_at: null, created_at: now() });
      return json({ staff: staff.at(-1), initialPassword: "Preview-Only-Password-42" }, 201);
    }
    if (/^\/staff\//.test(path) && method === "PATCH") {
      const person = staff.find((item) => item.id === path.split("/").at(-1));
      Object.assign(person, body(options));
      return json({ staff: person });
    }
    if (path === "/media" && method === "POST") {
      const file = options.body.get("file");
      return json({ url: URL.createObjectURL(file), mimeType: file.type, size: file.size }, 201);
    }
    return json({ error: "preview_endpoint_missing" }, 404);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("div");
    banner.className = "preview-banner";
    banner.textContent = "Демонстрация CMS · изменения сохраняются только до обновления страницы";
    document.querySelector(".workspace")?.prepend(banner);
    document.querySelectorAll('a[href="/api/admin/catalog.xlsx"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        alert("В демонстрации выгрузка Excel отключена");
      });
    });
    const importInput = document.querySelector("#catalog-import");
    if (importInput) importInput.disabled = true;
    const dashboardImport = document.querySelector("#dashboard-action-import");
    if (dashboardImport) {
      dashboardImport.disabled = true;
      dashboardImport.title = "Импорт станет доступен после подключения CMS к серверу";
    }
  });
})();
