(() => {
  const CONSENT_KEY = "fluide-cookie-consent";
  const VISITOR_KEY = "fluide-analytics-visitor";
  const SESSION_KEY = "fluide-analytics-session";
  const METRIKA_ID = 113817251;
  let started = false;
  let metrikaStarted = false;
  let visitorId = null;
  let sessionId = null;

  const accepted = () => {
    try { return localStorage.getItem(CONSENT_KEY) === "accepted"; } catch { return false; }
  };

  function startMetrika() {
    // Keep local previews out of production statistics.
    if (metrikaStarted || !/^(www\.)?fluide-atelier\.ru$/i.test(location.hostname)) return;
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
  try { startMetrika(); } catch { /* Third-party analytics must not affect the store. */ }
  start();
})();
