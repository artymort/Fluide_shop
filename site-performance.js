(function improvePageTransitions(global) {
  const prefetchedDocuments = new Set();
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const shouldSaveData = connection?.saveData === true;

  function idle(callback) {
    if ("requestIdleCallback" in global) {
      global.requestIdleCallback(callback, { timeout: 2500 });
    } else {
      global.setTimeout(callback, 1200);
    }
  }

  function isNavigablePage(link) {
    if (!link?.href || link.target || link.hasAttribute("download")) return false;
    const url = new URL(link.href, location.href);
    const current = new URL(location.href);
    url.hash = "";
    current.hash = "";
    if (url.origin !== location.origin || url.href === current.href) return false;
    return url.pathname.endsWith("/") || url.pathname.endsWith(".html");
  }

  function prefetchDocument(link) {
    if (shouldSaveData || !isNavigablePage(link)) return;
    const url = new URL(link.href, location.href);
    url.hash = "";
    const key = url.href;
    if (prefetchedDocuments.has(key)) return;
    prefetchedDocuments.add(key);
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.as = "document";
    hint.href = key;
    document.head.append(hint);
  }

  function prefetchCatalog() {
    if (shouldSaveData || document.visibilityState !== "visible") return;
    global.FluideCatalogData?.prefetch?.();
  }

  document.addEventListener("pointerover", (event) => {
    const link = event.target.closest?.("a[href]");
    if (link) prefetchDocument(link);
  }, { passive: true });
  document.addEventListener("focusin", (event) => {
    const link = event.target.closest?.("a[href]");
    if (link) prefetchDocument(link);
  });
  document.addEventListener("touchstart", (event) => {
    const link = event.target.closest?.("a[href]");
    if (link) prefetchDocument(link);
  }, { passive: true });

  const scheduleCatalogPrefetch = () => idle(prefetchCatalog);
  if (document.readyState === "complete") scheduleCatalogPrefetch();
  else global.addEventListener("load", scheduleCatalogPrefetch, { once: true });
})(window);
