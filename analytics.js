(() => {
  const CONSENT_KEY = "fluide-cookie-consent";
  const VISITOR_KEY = "fluide-analytics-visitor";
  const SESSION_KEY = "fluide-analytics-session";
  let started = false;
  let visitorId = null;
  let sessionId = null;

  const accepted = () => {
    try { return localStorage.getItem(CONSENT_KEY) === "accepted"; } catch { return false; }
  };

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
  start();
})();
