(function loadHomepageContent(global) {
  const PREVIEW_KEY = "fluide-cms-home-draft";

  const safeUrl = (value, fallback = "") => {
    const candidate = String(value || "").trim();
    return /^(?:https?:\/\/[^\s]+|\/[^\s]*|#[^\s]*|[a-z0-9][a-z0-9._/-]*(?:\?[^\s]*)?(?:#[^\s]*)?)$/i.test(candidate) ? candidate : fallback;
  };

  const safeImageUrl = (value, fallback = "") => {
    const candidate = String(value || "").trim();
    if (/^blob:https?:\/\//i.test(candidate) || /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,/i.test(candidate)) return candidate;
    return safeUrl(candidate, fallback);
  };

  const setText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node && typeof value === "string") node.textContent = value;
  };

  const setLink = (selector, label, url) => {
    const node = document.querySelector(selector);
    if (!node) return;
    if (typeof label === "string") (node.querySelector("span") || node).textContent = label;
    node.setAttribute("href", safeUrl(url, node.getAttribute("href") || "#"));
  };

  const setImage = (selector, source, alt) => {
    const node = document.querySelector(selector);
    if (!node) return;
    const url = safeImageUrl(source, node.getAttribute("src") || "");
    if (url) node.setAttribute("src", url);
    if (typeof alt === "string") node.setAttribute("alt", alt);
  };

  const toggleSection = (selector, section) => {
    const node = document.querySelector(selector);
    if (node) node.hidden = section?.enabled === false;
  };

  function applyContent(content) {
    if (!content || typeof content !== "object") return;
    if (content.seo?.title) document.title = content.seo.title;
    const description = document.querySelector('meta[name="description"]');
    if (description && content.seo?.description) description.content = content.seo.description;

    toggleSection(".hero", content.hero);
    setText(".hero-copy h1", content.hero?.title);
    setText(".hero-copy p", content.hero?.subtitle);
    setLink(".hero-copy .pill", content.hero?.buttonLabel, content.hero?.buttonUrl);
    const heroSource = document.querySelector(".hero-media source");
    if (heroSource && content.hero?.mobileImage) heroSource.srcset = safeImageUrl(content.hero.mobileImage, heroSource.srcset);
    setImage(".hero-media > img", content.hero?.desktopImage, content.hero?.imageAlt);

    toggleSection("#bestsellers", content.bestsellers);
    setText("#bestsellers .section-head h2", content.bestsellers?.title);
    const filters = document.querySelector("#bestsellers .product-filter-menu");
    if (filters) filters.hidden = content.bestsellers?.showFilters === false;

    toggleSection("#offers", content.offers);
    setText("#offers .promotions-head h2", content.offers?.title);
    document.querySelectorAll("#offers .promo").forEach((card, index) => {
      const item = content.offers?.items?.[index];
      if (!item) return;
      card.href = safeUrl(item.url, card.getAttribute("href") || "#");
      const cardImage = card.querySelector("img");
      if (cardImage) {
        cardImage.src = safeImageUrl(item.image, cardImage.src);
        cardImage.alt = item.imageAlt || "";
      }
      const heading = card.querySelector("h2");
      const copy = card.querySelector("p");
      const button = card.querySelector(".pill");
      if (heading) heading.textContent = item.title || "";
      if (copy) copy.textContent = item.text || "";
      if (button) button.textContent = item.buttonLabel || "";
    });

    toggleSection("#finder", content.finder);
    setText("#finder h2", content.finder?.title);
    setText("#finder p", content.finder?.text);
    setLink("#finder .pill", content.finder?.buttonLabel, content.finder?.buttonUrl);
    setImage("#finder img", content.finder?.image, content.finder?.imageAlt);

    toggleSection("#gifts", content.gifts);
    setText("#gifts .gift-copy h2", content.gifts?.title);
    setText("#gifts .gift-copy > p", content.gifts?.text);
    setText("#gifts .gift-card > span", content.gifts?.cardText);
    setText("#gifts .gift-card > small", content.gifts?.cardCaption);

    toggleSection("#brand", content.brand);
    setText("#brand .plain-label", content.brand?.label);
    setText("#brand h2", content.brand?.title);
    const brandParagraphs = document.querySelectorAll("#brand .brand-copy > p:not(.plain-label)");
    if (brandParagraphs[0]) brandParagraphs[0].textContent = content.brand?.text || "";
    if (brandParagraphs[1]) brandParagraphs[1].textContent = content.brand?.secondaryText || "";
    setLink("#brand .pill", content.brand?.buttonLabel, content.brand?.buttonUrl);
    setImage("#brand .brand-photo img", content.brand?.image, content.brand?.imageAlt);

    toggleSection("#voices", content.voices);
    setText("#voices .section-head h2", content.voices?.title);
    setText("#voices .section-head > span", content.voices?.subtitle);
    document.querySelectorAll("#voices .voice-grid > article").forEach((article, index) => {
      const item = content.voices?.items?.[index];
      if (!item) return;
      const articleImage = article.querySelector("img");
      if (articleImage) {
        articleImage.src = safeImageUrl(item.image, articleImage.src);
        articleImage.alt = item.imageAlt || "";
      }
      const label = article.querySelector(".voice-text > span");
      const heading = article.querySelector("h3");
      const copy = article.querySelector("p");
      if (label) label.textContent = item.label || "";
      if (heading) heading.textContent = item.title || "";
      if (copy) copy.textContent = item.text || "";
    });

    toggleSection("#club", content.club);
    setText("#club h2", content.club?.title);
    setText("#club > div > p", content.club?.text);
  }

  async function loadContent() {
    const preview = ["127.0.0.1", "localhost"].includes(location.hostname)
      && new URLSearchParams(location.search).get("cms-preview") === "1";
    if (preview) {
      try {
        const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null");
        if (saved) return saved;
      } catch {
        // Continue with the default local content.
      }
    }
    try {
      const response = await fetch("/api/content/pages/home", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()).content;
    } catch {
      const response = await fetch("data/homepage.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`homepage fallback: HTTP ${response.status}`);
      return response.json();
    }
  }

  loadContent().then((content) => {
    global.FluideHomeContent = content;
    applyContent(content);
    document.dispatchEvent(new CustomEvent("fluide:home-content", { detail: content }));
  }).catch((error) => console.warn("Не удалось загрузить контент главной страницы", error));
})(window);
