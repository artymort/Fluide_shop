"use strict";

const accountReady = window.FluideAccount?.ready
  || Promise.resolve(window.FluideAccount?.read());
const accountCatalogReady = window.FluideCatalogData?.load()
  || Promise.reject(new Error("catalog_loader_unavailable"));

accountReady.then((account) => {
  if (!account) {
    window.location.replace("index.html?login=1");
  } else if (!account.phoneRequired) {
    initAccountPage(account);
  }
});

function initAccountPage(initialAccount) {
  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
  const favorites = readJson("fluide-favorites", []);
  const orders = readJson("fluide-orders", []);
  let cart = readJson("fluide-cart", []);
  const readSessionJson = (key, fallback) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const selection = readSessionJson("fluide-selection", {});
  const selectionStepCount = [
    Boolean(selection.gender),
    Array.isArray(selection.occasion) && selection.occasion.length > 0,
    Array.isArray(selection.family) && selection.family.length > 0,
    Array.isArray(selection.season) && selection.season.length > 0,
  ].filter(Boolean).length;
  const loyalty = initialAccount.loyalty && Number.isFinite(Number(initialAccount.loyalty.balance))
    ? initialAccount.loyalty
    : { balance: 300, welcomeBonus: 300, currencyRate: 1, awardedAt: new Date().toISOString() };
  if (!initialAccount.loyalty) {
    initialAccount = { ...initialAccount, loyalty };
    window.FluideAccount.save(initialAccount);
  }
  let toastTimer;
  const loyaltyThemes = new Set(["cobalt", "violet", "emerald", "graphite"]);

  function applyLoyaltyTheme(theme, remember = true) {
    const safeTheme = loyaltyThemes.has(theme) ? theme : "cobalt";
    document.querySelector(".account-loyalty-card").dataset.loyaltyTheme = safeTheme;
    const detailCard = document.querySelector(".loyalty-plastic");
    if (detailCard) detailCard.dataset.loyaltyTheme = safeTheme;
    document.querySelectorAll("[data-loyalty-theme-option]").forEach((button) => {
      const active = button.dataset.loyaltyThemeOption === safeTheme;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (remember) localStorage.setItem("fluide-loyalty-theme", safeTheme);
  }

  function money(value) {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }

  function bonusNumber(value) {
    return new Intl.NumberFormat("ru-RU").format(Math.abs(Number(value) || 0));
  }

  function bonusDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Дата не указана";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }

  function loyaltyTransactions() {
    const allowedTypes = new Set(["accrual", "spending", "expiration"]);
    const saved = Array.isArray(loyalty.transactions) ? loyalty.transactions : [];
    const entries = saved.map((item, index) => ({
      id: item.id || `saved-${index}`,
      type: allowedTypes.has(item.type) ? item.type : "accrual",
      title: item.title || "Операция с бонусами",
      note: item.note || item.description || "Карта FLUIDE",
      amount: Number(item.amount) || 0,
      date: item.date || item.createdAt || loyalty.awardedAt || initialAccount.createdAt,
      source: item.source || "",
    }));
    const hasWelcome = entries.some((item) => item.source === "welcome" || /приветствен/i.test(item.title));
    if (!hasWelcome) {
      entries.push({
        id: "welcome",
        type: "accrual",
        title: "Приветственные бонусы",
        note: "",
        amount: Number(loyalty.welcomeBonus) || 300,
        date: loyalty.awardedAt || initialAccount.createdAt,
        source: "welcome",
      });
    }
    orders.forEach((order, index) => {
      const amount = Number(order?.bonusEarned ?? order?.loyaltyEarned ?? 0);
      if (!amount) return;
      entries.push({
        id: `order-${order.id || index}`,
        type: "accrual",
        title: "Начисление за покупку",
        note: order.number ? `Заказ № ${order.number}` : "Заказ FLUIDE",
        amount,
        date: order.createdAt || order.date || new Date().toISOString(),
        source: "order",
      });
    });
    return entries.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }

  function renderLoyaltyHistory(filter = "all") {
    const container = document.querySelector("#loyalty-history-list");
    if (!container) return;
    document.querySelectorAll("[data-loyalty-filter]").forEach((button) => {
      const active = button.dataset.loyaltyFilter === filter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const entries = loyaltyTransactions().filter((item) => filter === "all" || item.type === filter);
    if (!entries.length) {
      container.innerHTML = '<p class="loyalty-history-empty">Здесь пока нет таких операций.</p>';
      return;
    }
    container.innerHTML = entries.map((item) => {
      const positive = item.type === "accrual" && item.amount >= 0;
      const sign = positive ? "+" : "−";
      return `<article class="loyalty-transaction">
        <time datetime="${escapeHtml(item.date)}">${escapeHtml(bonusDate(item.date))}</time>
        <div class="loyalty-transaction-row">
          <span class="loyalty-transaction-icon"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#star"></use></svg></span>
          <div>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}<strong>${escapeHtml(item.title)}</strong></div>
          <b class="${positive ? "is-positive" : "is-negative"}">${sign}${bonusNumber(item.amount)}</b>
        </div>
      </article>`;
    }).join("");
  }

  function cartQuantity() {
    return cart.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  }

  function cartAmount() {
    return window.FluidePromotions?.calculate(cart).total
      ?? cart.reduce((sum, item) => sum + (Number(item?.product?.price) || 0) * (Number(item?.quantity) || 0), 0);
  }

  function showToast(message) {
    const toast = document.querySelector("#account-toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function activateTab(name, updateHash = true) {
    const safeName = ["overview", "loyalty", "favorites", "orders", "profile"].includes(name) ? name : "overview";
    document.querySelectorAll("[data-account-panel]").forEach((panel) => {
      const active = panel.dataset.accountPanel === safeName;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
    document.querySelectorAll(".account-nav [data-account-tab]").forEach((button) => {
      const active = button.dataset.accountTab === safeName;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (updateHash) history.replaceState(null, "", safeName === "overview" ? "account.html" : `account.html#${safeName}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAccountIdentity(profile) {
    const form = document.querySelector("#account-profile-form");
    form.elements.name.value = profile.name || "";
    form.elements.phone.value = profile.phone;
    form.elements.email.value = profile.email || "";
    const balance = Number(profile.loyalty?.balance ?? loyalty.balance) || 0;
    document.querySelector("#loyalty-balance").textContent = new Intl.NumberFormat("ru-RU").format(balance);
    document.querySelector("#loyalty-balance-detail").textContent = new Intl.NumberFormat("ru-RU").format(balance);
  }

  function renderStats() {
    const cartUnits = cartQuantity();
    document.querySelector("#favorites-count").textContent = favorites.length;
    document.querySelector("#nav-favorites-count").textContent = favorites.length;
    document.querySelector("#cart-count-large").textContent = cartUnits;
    document.querySelector("#nav-cart-count").textContent = cartUnits;
    document.querySelector("#selection-count").textContent = selectionStepCount;
    const badge = document.querySelector(".cart-count");
    badge.textContent = cartUnits || "";
    badge.hidden = cartUnits === 0;
  }

  function renderSelectionProfile() {
    const hasProfile = selectionStepCount === 4;
    document.querySelector(".account-scent-card").classList.toggle("has-results", hasProfile);
    document.querySelector("#selection-progress").textContent = selectionStepCount ? `${selectionStepCount} из 4` : "4 вопроса";
    document.documentElement.style.setProperty("--account-selection-progress", `${selectionStepCount / 4 * 100}%`);
    document.querySelector("#scent-profile-title").textContent = hasProfile ? "Ваши ароматы" : "Подберем ароматы для вас";
    const copy = document.querySelector("#selection-copy");
    copy.textContent = "Ответьте на четыре коротких вопроса — мы соберем шесть подходящих ароматов.";
    copy.hidden = hasProfile;
    const action = document.querySelector("#selection-action");
    action.href = hasProfile ? selectionCatalogUrl() : "selection.html";
    action.childNodes[0].textContent = hasProfile ? "Посмотреть все " : "Начать подбор ";
    document.querySelector("[data-selection-reset]").hidden = !hasProfile;
  }

  function selectionCatalogUrl() {
    const params = new URLSearchParams({ mode: "selection", view: "results" });
    if (selection.gender) params.set("gender", selection.gender);
    ["occasion", "family", "season"].forEach((key) => {
      const values = Array.isArray(selection[key]) ? selection[key] : [];
      values.forEach((value) => params.append(key, value));
    });
    return `catalog.html?${params.toString()}`;
  }

  function renderSelectionRecommendations(fragrances) {
    const container = document.querySelector("#account-recommendations");
    if (selectionStepCount !== 4 || !window.FluideSelectionEngine) {
      document.querySelector(".account-scent-card").classList.remove("has-results");
      container.hidden = true;
      return;
    }
    const ranked = window.FluideSelectionEngine.rankRecommendations(fragrances, {
      gender: selection.gender || "",
      occasions: Array.isArray(selection.occasion) ? selection.occasion : [],
      families: Array.isArray(selection.family) ? selection.family : [],
      seasons: Array.isArray(selection.season) ? selection.season : [],
    }, 6).items;
    document.querySelector("#scent-profile-title").textContent = "Ваши ароматы";
    document.querySelector("#selection-progress").textContent = `${ranked.length} ${ranked.length === 1 ? "аромат" : ranked.length < 5 ? "аромата" : "ароматов"}`;
    document.querySelector(".account-scent-card").classList.toggle("has-results", ranked.length > 0);
    container.hidden = ranked.length === 0;
    container.innerHTML = ranked.slice(0, 6).map((item) => {
      const title = String(item.title || item.name || "Аромат").replace(/^\d+\s*/, "");
      return `<a href="product.html?id=${encodeURIComponent(item.id)}">
        <img src="${escapeHtml(item.thumbnail || item.image || "assets/brand/logo-blue.svg")}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">
        <span>FLUIDE ${Number(item.id)}</span>
        <strong>${escapeHtml(title)}</strong>
      </a>`;
    }).join("");
  }

  function renderCartPreview() {
    const container = document.querySelector("#account-cart-preview");
    const detailed = cart.filter((item) => item?.product).slice(0, 3);
    const cartUnits = cartQuantity();
    const title = document.querySelector("#account-cart-title");
    if (title) title.textContent = cartUnits ? `${cartUnits} шт. · ${money(cartAmount())}` : "Пока пусто";
    if (!container) return;
    container.innerHTML = detailed.map((item) => `<div class="account-cart-item">
      <img src="${escapeHtml(item.product.image || "assets/brand/logo-blue.svg")}" alt="" loading="lazy" decoding="async">
      <div><strong>${escapeHtml(item.product.name || "Аромат FLUIDE")}</strong><span>${Number(item.quantity) || 1} шт. · ${money((Number(item.product.price) || 0) * (Number(item.quantity) || 1))}</span></div>
    </div>`).join("");
    if (!detailed.length) container.innerHTML = '<p class="account-card-copy">Добавленные ароматы появятся здесь.</p>';
  }

  function renderCartDrawer() {
    const detailed = cart.map((item, index) => ({ item, index })).filter(({ item }) => item?.product);
    const promotion = window.FluidePromotions?.calculate(cart) || { total: cartAmount(), discount: 0, giftItemIds: [] };
    const items = document.querySelector(".cart-items");
    const footer = document.querySelector(".cart-footer");
    footer.hidden = detailed.length === 0;
    items.innerHTML = detailed.length ? `${window.FluidePromotions?.bannerMarkup() || ""}${detailed.map(({ item, index }) => `<div class="cart-row">
      <img src="${escapeHtml(item.product.image || "assets/brand/logo-blue.svg")}" alt="${escapeHtml(item.product.name || "Аромат FLUIDE")}" loading="lazy" decoding="async">
      <div class="cart-row-copy"><h3>${escapeHtml(item.product.name || "Аромат FLUIDE")}</h3>${promotion.giftItemCounts?.[String(item.id)] ? `<span class="cart-gift-label">Подарок по акции 3+1</span>` : ""}</div>
      <button type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить товар"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#x"></use></svg></button>
      <div class="cart-quantity"><button type="button" data-cart-index="${index}" data-cart-delta="-1" aria-label="Уменьшить количество" ${(Number(item.quantity)||1)<=1?"disabled":""}><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${Number(item.quantity) || 1}</span><button type="button" data-cart-index="${index}" data-cart-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div>
      <div class="cart-row-total">${promotion.giftItemCounts?.[String(item.id)] ? `<del>${money((Number(item.product.price)||0)*(Number(item.quantity)||1))}</del><strong>${money((Number(item.product.price)||0)*((Number(item.quantity)||1)-promotion.giftItemCounts[String(item.id)]))}</strong>` : `<strong>${money((Number(item.product.price)||0)*(Number(item.quantity)||1))}</strong>`}</div>
    </div>`).join("")}<a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>${window.FluidePromotions?.totalsMarkup(promotion, money) || `<div class="cart-total"><span>Итого</span><span>${money(promotion.total)}</span></div>`}` : `<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>`;
    if(detailed.length) window.FluidePromotions?.setupCompactFooter(items, footer, promotion, money);
  }

  function openCart() {
    renderCartDrawer();
    document.querySelector(".cart-drawer").classList.add("is-open");
    document.querySelector(".cart-drawer").setAttribute("aria-hidden", "false");
    document.querySelector(".drawer-backdrop").classList.add("is-open");
    document.body.classList.add("is-locked");
  }

  function closeCart() {
    document.querySelector(".cart-drawer").classList.remove("is-open");
    document.querySelector(".cart-drawer").setAttribute("aria-hidden", "true");
    document.querySelector(".drawer-backdrop").classList.remove("is-open");
    document.body.classList.remove("is-locked");
  }

  function favoriteId(value) {
    const match = String(value).match(/^fragrance-(\d{1,3})/);
    return match ? match[1].padStart(3, "0") : "";
  }

  function renderFavorites(fragrances) {
    const favoriteIds = new Set(favorites.map(favoriteId).filter(Boolean));
    const items = fragrances.filter((item) => favoriteIds.has(String(item.id).padStart(3, "0")));
    const grid = document.querySelector("#account-favorites-grid");
    const empty = document.querySelector("#favorites-empty");
    grid.hidden = items.length === 0;
    empty.hidden = items.length !== 0;
    grid.innerHTML = items.map((item) => {
      const title = String(item.title || item.name || "Аромат").replace(/^\d+\s*/, "");
      return `<a class="account-fragrance" href="product.html?id=${encodeURIComponent(item.id)}">
        <span class="account-fragrance-visual"><img src="${escapeHtml(item.image || "assets/brand/logo-blue.svg")}" alt="Флакон ${escapeHtml(title)}" loading="lazy" decoding="async"></span>
        <span class="account-fragrance-copy"><span>${escapeHtml(item.category || "Парфюм")}</span><h3>FLUIDE ${Number(item.id)} ${escapeHtml(title)}</h3><p>По мотивам ${escapeHtml(item.original || "авторской композиции")}</p></span>
      </a>`;
    }).join("");
  }

  renderAccountIdentity(initialAccount);
  renderLoyaltyHistory();
  renderStats();
  renderSelectionProfile();
  renderCartPreview();
  renderCartDrawer();

  accountCatalogReady
    .then((catalog) => {
      renderFavorites(catalog.fragrances);
      renderSelectionRecommendations(catalog.fragrances);
    })
    .catch(() => {
      renderFavorites([]);
      renderSelectionRecommendations([]);
    });

  document.addEventListener("click", async (event) => {
    const loyaltyFilter = event.target.closest("[data-loyalty-filter]");
    if (loyaltyFilter) {
      renderLoyaltyHistory(loyaltyFilter.dataset.loyaltyFilter);
      return;
    }
    if (event.target.closest("[data-selection-reset]")) {
      sessionStorage.removeItem("fluide-selection");
      window.location.reload();
      return;
    }
    const loyaltyThemeOption = event.target.closest("[data-loyalty-theme-option]");
    if (loyaltyThemeOption) {
      applyLoyaltyTheme(loyaltyThemeOption.dataset.loyaltyThemeOption);
      return;
    }
    const tab = event.target.closest("[data-account-tab]");
    if (tab) activateTab(tab.dataset.accountTab);
    if (event.target.closest(".cart-button") || event.target.closest("[data-account-cart]")) openCart();
    if (event.target.closest(".drawer-close") || event.target.matches(".drawer-backdrop")) closeCart();
    const quantityButton = event.target.closest("[data-cart-index]");
    if (quantityButton) {
      const row = cart[Number(quantityButton.dataset.cartIndex)];
      if (row) {
        row.quantity = (Number(row.quantity) || 0) + Number(quantityButton.dataset.cartDelta);
        cart = cart.filter((item) => item.quantity > 0);
        localStorage.setItem("fluide-cart", JSON.stringify(cart));
        renderStats();
        renderCartPreview();
        renderCartDrawer();
      }
      return;
    }
    const removeCart = event.target.closest("[data-remove-cart]");
    if (removeCart) {
      cart = cart.filter((item) => item.id !== removeCart.dataset.removeCart);
      localStorage.setItem("fluide-cart", JSON.stringify(cart));
      renderStats();
      renderCartPreview();
      renderCartDrawer();
    }
    if (event.target.closest("[data-account-logout]")) {
      await window.FluideAccount.clear();
      window.location.href = "index.html";
    }
  });

  document.querySelector("#account-profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = document.querySelector("#account-form-status");
    status.textContent = "Сохраняем…";
    try {
      const updated = await window.FluideAccount.updateProfile({
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
      });
      renderAccountIdentity(updated);
      status.textContent = updated.source === "server"
        ? "Изменения сохранены в вашем профиле."
        : "Изменения сохранены на этом устройстве.";
      showToast("Профиль сохранен");
    } catch {
      status.textContent = "Не удалось сохранить профиль. Проверьте email и попробуйте снова.";
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCart();
  });

  const menuToggle = document.querySelector(".menu-toggle");
  const mobileNav = document.querySelector(".mobile-nav");
  menuToggle.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });

  const notices = ["Доставка по России · бесплатно от 5 000 ₽", "Три любимых аромата по цене двух", "Откройте свой аромат с FLUIDE"];
  let notice = 0;
  document.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => {
    notice = (notice + Number(button.dataset.service) + notices.length) % notices.length;
    document.querySelector("#service-message").textContent = notices[notice];
  }));

  applyLoyaltyTheme(localStorage.getItem("fluide-loyalty-theme") || "cobalt", false);
  activateTab(location.hash.replace("#", "") || "overview", false);
  window.addEventListener("hashchange", () => {
    activateTab(location.hash.replace("#", "") || "overview", false);
  });
}
