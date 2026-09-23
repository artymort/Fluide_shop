(function enableLocalCmsPreview() {
  const enabled = ["127.0.0.1", "localhost"].includes(location.hostname);
  if (!enabled) return;

  const now = () => new Date().toISOString();
  const originalFetch = window.fetch.bind(window);
  let products = [];
  const HOME_DRAFT_KEY = "fluide-cms-home-draft";
  const HOME_PUBLISHED_KEY = "fluide-cms-home-published";
  let homeContent = null;
  let homePublishedContent = null;
  let homeDefaults = null;
  let homeUpdatedAt = null;
  let homePublishedAt = null;
  const mergeHomeDefaults = (defaults, value) => {
    const source = value && typeof value === "object" ? value : {};
    const merged = { ...defaults, ...source };
    ["seo", "hero", "bestsellers", "offers", "finder", "gifts", "brand", "voices", "club"].forEach((key) => {
      merged[key] = { ...defaults[key], ...(source[key] || {}) };
    });
    merged.hero.desktopImage ||= defaults.hero.desktopImage;
    merged.hero.mobileImage ||= defaults.hero.mobileImage;
    merged.finder.image ||= defaults.finder.image;
    merged.brand.image ||= defaults.brand.image;
    return merged;
  };
  const homeContentReady = originalFetch("../data/homepage.json", { cache: "no-cache" })
    .then((response) => response.json())
    .then((defaults) => {
      homeDefaults = defaults;
      try {
        homeContent = mergeHomeDefaults(defaults, JSON.parse(localStorage.getItem(HOME_DRAFT_KEY) || "null"));
        homePublishedContent = JSON.parse(localStorage.getItem(HOME_PUBLISHED_KEY) || "null");
      } catch {
        homeContent = structuredClone(defaults);
        homePublishedContent = null;
      }
      return homeContent;
    });
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
  const orders = [
    {
      id: "demo-order-payment-pending", order_number: "100127", user_id: null, status: "new", payment_status: "pending",
      customer_name: "Тестовый покупатель", customer_email: "buyer@example.ru", customer_phone_e164: "+79991112233",
      subtotal_minor: 349000, discount_minor: 0, delivery_minor: 45000, total_minor: 394000, currency: "RUB",
      payment_provider: "yookassa", payment_transaction_id: "yk_pending_preview", delivery_method: "СДЭК до пункта выдачи",
      delivery_address: { city: "Оренбург", pointName: "ПВЗ — пр-т Дзержинского, 7" }, customer_comment: null,
      created_at: new Date(Date.now() - 45 * 60_000).toISOString(), updated_at: new Date(Date.now() - 45 * 60_000).toISOString(),
      items: [{ id: "oi-pending-1", product_name: "FLUIDE 17 IMPERATRICE", variant_name: "30 мл", sku: "FL-017-30", image_url: "../images/fragrances/thumbs/017.webp", quantity: 1, unit_price_minor: 349000, total_price_minor: 349000 }],
      payments: [{ id: "pay-pending", operation: "payment", status: "pending", provider: "yookassa", provider_transaction_id: "yk_pending_preview", amount_minor: 394000, currency: "RUB", created_at: new Date(Date.now() - 45 * 60_000).toISOString() }],
      history: [{ id: 1, status: "new", admin_name: null, created_at: new Date(Date.now() - 45 * 60_000).toISOString() }],
    },
    {
      id: "demo-order-1042", order_number: "100126", user_id: "c1", status: "new", payment_status: "paid",
      customer_name: "Анна Касаткина", customer_email: "anna@example.ru", customer_phone_e164: "+79990000000",
      subtotal_minor: 585000, discount_minor: 0, delivery_minor: 0, total_minor: 585000, currency: "RUB",
      payment_provider: "ЮKassa", payment_transaction_id: "yk_2f84a1042", delivery_method: "СДЭК до пункта выдачи",
      delivery_address: { postalCode: "620014", city: "Екатеринбург", street: "8 Марта", house: "46" },
      customer_comment: "Позвонить перед отправкой", created_at: "2026-09-17T07:35:00Z", updated_at: "2026-09-17T07:36:00Z",
      items: [
        { id: "oi-1042-1", product_name: "FLUIDE 11 AMOR AMOR", variant_name: "30 мл", sku: "FL-011-30", image_url: "../images/fragrances/thumbs/011.webp", quantity: 1, unit_price_minor: 199000, total_price_minor: 199000 },
        { id: "oi-1042-2", product_name: "Свеча La Sultan", variant_name: "200 мл", sku: "FL-P-CANDLE-01", image_url: "../images/products/thumbs/candle-shell.webp", quantity: 1, unit_price_minor: 149000, total_price_minor: 149000 },
        { id: "oi-1042-3", product_name: "Парфюм для дома La Sultan", variant_name: "300 мл", sku: "FL-P-01", image_url: "../images/products/perfume-home-la-sultan.webp", quantity: 1, unit_price_minor: 49000, total_price_minor: 49000 },
        { id: "oi-1042-4", product_name: "Крем для тела La Sultan", variant_name: "300 мл", sku: "FL-P-04", image_url: "../images/products/body-cream-la-sultan.webp", quantity: 1, unit_price_minor: 89000, total_price_minor: 89000 },
        { id: "oi-1042-5", product_name: "MATSUKITA", variant_name: "15 г", sku: "FL-P-MATSUKITA", image_url: "../images/products/solid-perfume-matsukita.webp", quantity: 1, unit_price_minor: 99000, total_price_minor: 99000 },
      ],
      payments: [{ id: "pay-1042", operation: "payment", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "yk_2f84a1042", amount_minor: 585000, currency: "RUB", created_at: "2026-09-17T07:36:00Z" }],
      history: [{ id: 1, status: "new", admin_name: null, created_at: "2026-09-17T07:35:00Z" }],
    },
    {
      id: "demo-order-1041", order_number: "100125", user_id: "c2", status: "assembling", payment_status: "paid",
      customer_name: "Мария Иванова", customer_email: "maria@example.ru", customer_phone_e164: "+79876543210",
      subtotal_minor: 299000, discount_minor: 0, delivery_minor: 39000, total_minor: 338000, currency: "RUB",
      payment_provider: "ЮKassa", payment_transaction_id: "yk_31de41041", delivery_method: "Курьер",
      delivery_address: { city: "Москва", street: "Тверская", house: "12", apartment: "8" }, customer_comment: null,
      created_at: "2026-09-16T13:10:00Z", updated_at: "2026-09-17T06:20:00Z",
      items: [{ id: "oi-1041-1", product_name: "FLUIDE 100 BLOOMING", variant_name: "50 мл", sku: "FL-100-50", image_url: "../images/fragrances/thumbs/100.webp", quantity: 1, unit_price_minor: 299000, total_price_minor: 299000 }],
      payments: [{ id: "pay-1041", operation: "payment", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "yk_31de41041", amount_minor: 338000, currency: "RUB", created_at: "2026-09-16T13:12:00Z" }],
      history: [
        { id: 2, status: "assembling", admin_name: "Владелец FLUIDE", created_at: "2026-09-17T06:20:00Z" },
        { id: 1, status: "new", admin_name: null, created_at: "2026-09-16T13:10:00Z" },
      ],
    },
    {
      id: "demo-order-1040", order_number: "100124", user_id: null, status: "shipped", payment_status: "paid",
      customer_name: "Елена Соколова", customer_email: "elena@example.ru", customer_phone_e164: "+79112223344",
      subtotal_minor: 398000, discount_minor: 0, delivery_minor: 0, total_minor: 398000, currency: "RUB",
      payment_provider: "ЮKassa", payment_transaction_id: "yk_991b1040", delivery_method: "СДЭК до пункта выдачи",
      delivery_address: { city: "Санкт-Петербург", street: "Лиговский проспект", house: "50" }, customer_comment: null,
      created_at: "2026-09-15T09:45:00Z", updated_at: "2026-09-16T11:15:00Z",
      items: [{ id: "oi-1040-1", product_name: "FLUIDE 46 BOMBSHELL", variant_name: "30 мл", sku: "FL-046-30", image_url: "../images/fragrances/thumbs/046.webp", quantity: 2, unit_price_minor: 199000, total_price_minor: 398000 }],
      payments: [{ id: "pay-1040", operation: "payment", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "yk_991b1040", amount_minor: 398000, currency: "RUB", created_at: "2026-09-15T09:47:00Z" }],
      history: [
        { id: 3, status: "shipped", admin_name: "Владелец FLUIDE", created_at: "2026-09-16T11:15:00Z" },
        { id: 2, status: "ready", admin_name: "Владелец FLUIDE", created_at: "2026-09-16T08:30:00Z" },
        { id: 1, status: "new", admin_name: null, created_at: "2026-09-15T09:45:00Z" },
      ],
    },
    {
      id: "demo-order-1039", order_number: "100123", user_id: "c1", status: "delivered", payment_status: "paid",
      customer_name: "Анна Касаткина", customer_email: "anna@example.ru", customer_phone_e164: "+79990000000",
      subtotal_minor: 199000, discount_minor: 20000, delivery_minor: 0, total_minor: 179000, currency: "RUB",
      payment_provider: "ЮKassa", payment_transaction_id: "yk_88cd1039", delivery_method: "Самовывоз",
      delivery_address: { city: "Екатеринбург" }, customer_comment: null,
      created_at: "2026-09-11T08:20:00Z", updated_at: "2026-09-14T15:30:00Z",
      items: [{ id: "oi-1039-1", product_name: "FLUIDE 19 CHERRY", variant_name: "30 мл", sku: "FL-019-30", image_url: "../images/fragrances/thumbs/019.webp", quantity: 1, unit_price_minor: 199000, total_price_minor: 199000 }],
      payments: [{ id: "pay-1039", operation: "payment", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "yk_88cd1039", amount_minor: 179000, currency: "RUB", created_at: "2026-09-11T08:22:00Z" }],
      history: [{ id: 2, status: "delivered", admin_name: "Владелец FLUIDE", created_at: "2026-09-14T15:30:00Z" }, { id: 1, status: "new", admin_name: null, created_at: "2026-09-11T08:20:00Z" }],
    },
    {
      id: "demo-order-1038", order_number: "100122", user_id: null, status: "refunded", payment_status: "refunded",
      customer_name: "Ольга Петрова", customer_email: "olga@example.ru", customer_phone_e164: "+79210001122",
      subtotal_minor: 299000, discount_minor: 0, delivery_minor: 0, total_minor: 299000, currency: "RUB",
      payment_provider: "ЮKassa", payment_transaction_id: "yk_74ab1038", delivery_method: "СДЭК до пункта выдачи",
      delivery_address: { city: "Казань", street: "Баумана", house: "21" }, customer_comment: null,
      created_at: "2026-09-09T12:00:00Z", updated_at: "2026-09-10T09:15:00Z",
      items: [{ id: "oi-1038-1", product_name: "FLUIDE 49 DARK OPIUM", variant_name: "50 мл", sku: "FL-049-50", image_url: "../images/fragrances/thumbs/049.webp", quantity: 1, unit_price_minor: 299000, total_price_minor: 299000 }],
      payments: [
        { id: "refund-1038", operation: "refund", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "rf_74ab1038", amount_minor: 299000, currency: "RUB", created_at: "2026-09-10T09:15:00Z" },
        { id: "pay-1038", operation: "payment", status: "succeeded", provider: "ЮKassa", provider_transaction_id: "yk_74ab1038", amount_minor: 299000, currency: "RUB", created_at: "2026-09-09T12:02:00Z" },
      ],
      history: [{ id: 2, status: "refunded", admin_name: "Владелец FLUIDE", created_at: "2026-09-10T09:15:00Z" }, { id: 1, status: "new", admin_name: null, created_at: "2026-09-09T12:00:00Z" }],
    },
  ];
  const analyticsPreview = (period) => {
    const factor = period === 7 ? 0.27 : period === 90 ? 2.72 : 1;
    const daily = Array.from({ length: period }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (period - index - 1));
      const pageViews = 42 + ((index * 11) % 29) + (index % 6 === 0 ? 18 : 0);
      return { day: day.toISOString().slice(0, 10), page_views: pageViews, visitors: Math.round(pageViews * 0.58) };
    });
    const count = (value) => Math.round(value * factor);
    return {
      period,
      summary: { page_views: count(1842), visitors: count(936), product_views: count(1280), add_to_cart: count(214), orders: count(42), revenue_minor: count(11860000) },
      daily,
      funnel: [
        { key: "product_view", label: "Просмотр товара", value: count(1280) },
        { key: "add_to_cart", label: "Добавление в корзину", value: count(214) },
        { key: "checkout_start", label: "Начало оформления", value: count(76) },
        { key: "purchase", label: "Заказ", value: count(42) },
      ],
      products: [
        { product_key: "fragrance-11", product_name: "FLUIDE 11 AMOR AMOR", views: count(186), cart_adds: count(34) },
        { product_key: "fragrance-100", product_name: "FLUIDE 100 BLOOMING", views: count(162), cart_adds: count(29) },
        { product_key: "fragrance-46", product_name: "FLUIDE 46 BOMBSHELL", views: count(148), cart_adds: count(25) },
        { product_key: "fragrance-19", product_name: "FLUIDE 19 CHERRY", views: count(137), cart_adds: count(21) },
        { product_key: "solid-perfume-matsukita", product_name: "MATSUKITA", views: count(119), cart_adds: count(18) },
      ],
      sources: [
        { source: "Прямые заходы", visits: count(486) },
        { source: "yandex.ru", visits: count(274) },
        { source: "vk.com", visits: count(156) },
        { source: "google.com", visits: count(92) },
      ],
    };
  };
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
    if (path === "/content/pages/home" && method === "GET") {
      await homeContentReady;
      return json({
        slug: "home",
        content: homeContent,
        publishedContent: homePublishedContent,
        updatedAt: homeUpdatedAt,
        publishedAt: homePublishedAt,
        hasUnpublishedChanges: JSON.stringify(homeContent) !== JSON.stringify(homePublishedContent),
      });
    }
    if (path === "/content/pages/home" && method === "PUT") {
      await homeContentReady;
      homeContent = mergeHomeDefaults(homeDefaults, body(options).content);
      homeUpdatedAt = now();
      localStorage.setItem(HOME_DRAFT_KEY, JSON.stringify(homeContent));
      return json({ slug: "home", content: homeContent, updatedAt: homeUpdatedAt, publishedAt: homePublishedAt, hasUnpublishedChanges: true });
    }
    if (path === "/content/pages/home/publish" && method === "POST") {
      await homeContentReady;
      homePublishedContent = structuredClone(homeContent);
      homePublishedAt = now();
      localStorage.setItem(HOME_PUBLISHED_KEY, JSON.stringify(homePublishedContent));
      return json({ slug: "home", content: homeContent, updatedAt: homeUpdatedAt, publishedAt: homePublishedAt, hasUnpublishedChanges: false });
    }
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
    if (path === "/analytics" && method === "GET") {
      const period = [7, 30, 90].includes(Number(url.searchParams.get("period"))) ? Number(url.searchParams.get("period")) : 30;
      return json(analyticsPreview(period));
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
    if (path === "/orders" && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLocaleLowerCase("ru-RU");
      const status = url.searchParams.get("status") || "";
      const payment = url.searchParams.get("payment") || "";
      const view = url.searchParams.get("view") || (url.searchParams.get("archived") === "true" ? "archived" : "active");
      const rows = orders.filter((order) => {
        const paymentStartedAt = order.payments
          .filter((row) => row.operation === "payment" && String(row.provider).toLowerCase() === "yookassa")
          .map((row) => row.created_at)
          .sort()[0] || (String(order.payment_provider).toLowerCase() === "yookassa" ? order.created_at : null);
        const incompletePayment = ["unpaid", "pending", "failed", "cancelled"].includes(order.payment_status)
          && Boolean(paymentStartedAt);
        const lifecycleStartedAt = Math.max(Date.parse(paymentStartedAt), Date.parse(order.updated_at || order.created_at));
        if (!order.archived_at && incompletePayment && Date.now() - lifecycleStartedAt >= 86_400_000) {
          order.archived_at = now();
        }
        const searchable = [order.order_number, order.customer_name, order.customer_email, order.customer_phone_e164]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru-RU");
        const matchesView = view === "archived"
          ? Boolean(order.archived_at)
          : view === "incomplete" ? !order.archived_at && incompletePayment : !order.archived_at && !incompletePayment;
        return (!q || searchable.includes(q))
          && (!status || order.status === status)
          && (!payment || order.payment_status === payment)
          && matchesView;
      }).map((order) => ({
        ...order,
        item_count: order.items.length,
        items_preview: order.items.slice(0, 2),
        has_live_payment: order.payments.some((paymentRow) => paymentRow.status === "succeeded"),
        purge_at: order.archived_at ? new Date(new Date(order.archived_at).getTime() + 14 * 86_400_000).toISOString() : null,
        payment_started_at: order.payments
          .filter((row) => row.operation === "payment" && String(row.provider).toLowerCase() === "yookassa")
          .map((row) => row.created_at)
          .sort()[0] || (String(order.payment_provider).toLowerCase() === "yookassa" ? order.created_at : null),
      }));
      rows.forEach((order) => {
        order.incomplete_payment = ["unpaid", "pending", "failed", "cancelled"].includes(order.payment_status)
          && Boolean(order.payment_started_at);
        order.payment_attention_at = order.payment_started_at ? new Date(Date.parse(order.payment_started_at) + 30 * 60_000).toISOString() : null;
        order.auto_archive_at = order.payment_started_at
          ? new Date(Math.max(Date.parse(order.payment_started_at), Date.parse(order.updated_at || order.created_at)) + 24 * 60 * 60_000).toISOString()
          : null;
      });
      return json({ orders: rows });
    }
    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch && method === "GET") {
      const order = orders.find((item) => item.id === orderMatch[1]);
      return order
        ? json({
          order: {
            ...order,
            has_live_payment: order.payments.some((paymentRow) => paymentRow.status === "succeeded"),
            purge_at: order.archived_at ? new Date(new Date(order.archived_at).getTime() + 14 * 86_400_000).toISOString() : null,
            incomplete_payment: ["unpaid", "pending", "failed", "cancelled"].includes(order.payment_status)
              && String(order.payment_provider).toLowerCase() === "yookassa",
            payment_started_at: order.payments.find((row) => row.operation === "payment" && String(row.provider).toLowerCase() === "yookassa")?.created_at || order.created_at,
            payment_attention_at: new Date(Date.parse(order.created_at) + 30 * 60_000).toISOString(),
            auto_archive_at: new Date(Math.max(Date.parse(order.created_at), Date.parse(order.updated_at || order.created_at)) + 24 * 60 * 60_000).toISOString(),
          },
          items: order.items,
          payments: order.payments,
          history: order.history,
        })
        : json({ error: "order_not_found" }, 404);
    }
    if (orderMatch && method === "DELETE") {
      const order = orders.find((item) => item.id === orderMatch[1]);
      if (!order || order.archived_at) return json({ error: "order_not_found" }, 404);
      order.archived_at = now();
      return json({ order });
    }
    const orderRestoreMatch = path.match(/^\/orders\/([^/]+)\/restore$/);
    if (orderRestoreMatch && method === "POST") {
      const order = orders.find((item) => item.id === orderRestoreMatch[1]);
      if (!order?.archived_at) return json({ error: "order_not_found" }, 404);
      order.archived_at = null;
      order.updated_at = now();
      return json({ order });
    }
    const orderStatusMatch = path.match(/^\/orders\/([^/]+)\/status$/);
    if (orderStatusMatch && method === "PATCH") {
      const order = orders.find((item) => item.id === orderStatusMatch[1]);
      if (!order || order.archived_at) return json({ error: "order_not_found" }, 404);
      order.status = body(options).status;
      order.updated_at = now();
      order.history.unshift({ id: Date.now(), status: order.status, admin_name: "Владелец FLUIDE", created_at: order.updated_at });
      return json({ order });
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
      if (String(payload.password || "").length < 12) return json({ error: "staff_invalid" }, 400);
      staff.push({ id: `demo-staff-${Date.now()}`, email: payload.email, display_name: payload.displayName, role: payload.role, status: "active", last_login_at: null, created_at: now() });
      return json({ staff: staff.at(-1) }, 201);
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
    banner.textContent = "Локальная демонстрация CMS · черновик сохраняется в этом браузере";
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
