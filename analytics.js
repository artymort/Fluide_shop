(() => {
  const CONSENT_KEY = "fluide-cookie-consent";
  const VISITOR_KEY = "fluide-analytics-visitor";
  const SESSION_KEY = "fluide-analytics-session";
  const METRIKA_ID = 113817251;
  let started = false;
  let metrikaStarted = false;
  let visitorId = null;
  let sessionId = null;
  let cartSnapshot = [];
  const sentPurchases = new Set();

  try {
    const storedCart = JSON.parse(localStorage.getItem("fluide-cart") || "[]");
    if (Array.isArray(storedCart)) cartSnapshot = storedCart;
  } catch { /* A damaged cart must not stop analytics. */ }

  function ecommerceProduct(row, quantity = Number(row?.quantity) || 1) {
    const product = row?.product || row;
    const id = String(row?.id || product?.id || "").trim();
    const name = String(product?.name || product?.title || "").trim();
    const price = Number(product?.price);
    if (!id || !name || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
    return {
      id,
      name,
      price,
      quantity,
      ...(product?.category || product?.categoryLabel ? { category: String(product.category || product.categoryLabel) } : {}),
    };
  }

  function pushEcommerce(action, payload) {
    if (!metrikaStarted) return false;
    try {
      window.dataLayer.push({ ecommerce: { currencyCode: "RUB", [action]: payload } });
      return true;
    } catch { return false; /* A third-party tracking error must not interrupt shopping. */ }
  }

  function cartUpdated(nextCart) {
    if (!Array.isArray(nextCart)) return;
    const previous = new Map(cartSnapshot.map((row) => [String(row?.id), row]));
    const next = new Map(nextCart.map((row) => [String(row?.id), row]));
    const added = [];
    const removed = [];
    for (const key of new Set([...previous.keys(), ...next.keys()])) {
      const before = Number(previous.get(key)?.quantity) || 0;
      const after = Number(next.get(key)?.quantity) || 0;
      if (after > before) {
        const product = ecommerceProduct(next.get(key), after - before);
        if (product) added.push(product);
      } else if (before > after) {
        const product = ecommerceProduct(previous.get(key), before - after);
        if (product) removed.push(product);
      }
    }
    cartSnapshot = nextCart.map((row) => ({ ...row, product: row.product ? { ...row.product } : row.product }));
    if (added.length) pushEcommerce("add", { products: added });
    if (removed.length) pushEcommerce("remove", { products: removed });
  }

  function productViewed(row) {
    const product = ecommerceProduct(row);
    if (product) pushEcommerce("detail", { products: [product] });
  }

  function purchase({ orderNumber, valueMinor, cart }) {
    const id = String(orderNumber || "").trim();
    const revenue = Number(valueMinor) / 100;
    if (!id || !Number.isFinite(revenue) || revenue < 0 || !Array.isArray(cart)) return;
    const products = cart.map((row) => ecommerceProduct(row)).filter(Boolean);
    if (!products.length || !metrikaStarted) return;
    const marker = `fluide-metrika-purchase-${id}`;
    if (sentPurchases.has(id)) return;
    try { if (localStorage.getItem(marker)) return; } catch { /* Continue without persistent deduplication. */ }
    if (pushEcommerce("purchase", { actionField: { id, revenue }, products })) {
      sentPurchases.add(id);
      try { localStorage.setItem(marker, "1"); } catch { /* The transaction is still counted. */ }
    }
  }

  const accepted = () => {
    try { return localStorage.getItem(CONSENT_KEY) === "accepted"; } catch { return false; }
  };

  function startMetrika() {
    // Keep local previews out of production statistics.
    if (metrikaStarted || !/^(www\.)?fluide-atelier\.ru$/i.test(location.hostname)) return;
    window.dataLayer = window.dataLayer || [];
    const source = `https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}`;
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = Date.now();
      for (let j = 0; j < e.scripts.length; j++) {
        if (e.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = true;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, "script", source, "ym");
    window.ym(METRIKA_ID, "init", {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: "dataLayer",
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
    metrikaStarted = true;
  }

  const readOrCreate = (storage, key) => {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = crypto.randomUUID();
        storage.setItem(key, value);
      }
      return value;
    } catch {
      return crypto.randomUUID();
    }
  };

  const referrerHost = () => {
    if (!document.referrer) return null;
    try {
      const host = new URL(document.referrer).hostname;
      return host === location.hostname ? null : host;
    } catch { return null; }
  };

  function track(eventName, detail = {}) {
    if (!started || !accepted()) return;
    fetch("/api/analytics/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: true,
        eventName,
        visitorId,
        sessionId,
        path: `${location.pathname}${location.search}`,
        referrerHost: referrerHost(),
        productKey: detail.productKey || null,
        valueMinor: detail.valueMinor ?? null,
        metadata: detail.metadata || {},
      }),
    }).catch(() => {});
  }

  function productFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get("id") || params.get("product") || params.get("slug") || null;
  }

  function start() {
    if (started || !accepted()) return;
    started = true;
    visitorId = readOrCreate(localStorage, VISITOR_KEY);
    sessionId = readOrCreate(sessionStorage, SESSION_KEY);
    track("page_view");
    if (/\/product\.html$/i.test(location.pathname)) {
      track("product_view", { productKey: productFromUrl(), metadata: { productName: document.title } });
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-cookie-accept]")) {
      queueMicrotask(start);
      return;
    }
    const addButton = event.target.closest("[data-analytics-add]");
    if (addButton) {
      const key = addButton.dataset.productKey || addButton.dataset.addProduct || productFromUrl();
      track("add_to_cart", {
        productKey: key,
        metadata: { productName: addButton.getAttribute("aria-label") || document.title },
      });
      return;
    }
    if (event.target.closest(".checkout-button, .cart-footer button")) track("checkout_start");
  });

  window.FluideAnalytics = { track };
  window.FluideEcommerce = { cartUpdated, productViewed, purchase };
  try { startMetrika(); } catch { /* Third-party analytics must not affect the store. */ }
  start();
})();
