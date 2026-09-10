"use strict";

const account = window.FluideAccount?.read();
if (!account) {
  window.location.replace("index.html?login=1");
} else {
  initAccountPage(account);
}

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
  const selectionLabels = {
    женский: "Для нее", мужской: "Для него", унисекс: "Унисекс",
    everyday: "На каждый день", evening: "Вечер", date: "Свидание", gym: "Спорт", walk: "Прогулка",
    spring: "Весна", summer: "Лето", autumn: "Осень", winter: "Зима",
  };
  const selectionValues = [selection.gender, ...(selection.occasion || []), ...(selection.family || []), ...(selection.season || [])].filter(Boolean);
  let toastTimer;

  function money(value) {
    return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
  }

  function cartQuantity() {
    return cart.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  }

  function cartAmount() {
    return cart.reduce((sum, item) => sum + (Number(item?.product?.price) || 0) * (Number(item?.quantity) || 0), 0);
  }

  function showToast(message) {
    const toast = document.querySelector("#account-toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function activateTab(name, updateHash = true) {
    const safeName = ["overview", "favorites", "orders", "profile"].includes(name) ? name : "overview";
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
  }

  function renderStats() {
    const cartUnits = cartQuantity();
    document.querySelector("#favorites-count").textContent = favorites.length;
    document.querySelector("#nav-favorites-count").textContent = favorites.length;
    document.querySelector("#cart-count-large").textContent = cartUnits;
    document.querySelector("#selection-count").textContent = selectionValues.length;
    const badge = document.querySelector(".cart-count");
    badge.textContent = cartUnits || "";
    badge.hidden = cartUnits === 0;
  }

  function renderSelectionProfile() {
    const tags = document.querySelector("#account-selection-tags");
    tags.innerHTML = selectionValues.map((value) => `<span>${escapeHtml(selectionLabels[value] || value)}</span>`).join("");
    const hasProfile = selectionValues.length > 0;
    document.querySelector("#scent-profile-title").textContent = hasProfile ? "Ваши ориентиры собраны" : "Пока не собран";
    document.querySelector("#selection-copy").textContent = hasProfile
      ? "Мы сохранили ответы последнего подбора. Вернитесь к ним или соберите новый профиль под другое настроение."
      : "Ответьте на четыре коротких вопроса — мы соберем шесть подходящих ароматов.";
    const action = document.querySelector("#selection-action");
    action.href = hasProfile ? "selection.html?step=4" : "selection.html";
    action.childNodes[0].textContent = hasProfile ? "Вернуться к подбору " : "Начать подбор ";
  }

  function renderCartPreview() {
    const container = document.querySelector("#account-cart-preview");
    const detailed = cart.filter((item) => item?.product).slice(0, 3);
    const cartUnits = cartQuantity();
    document.querySelector("#account-cart-title").textContent = cartUnits ? `${cartUnits} шт. · ${money(cartAmount())}` : "Пока пусто";
    container.innerHTML = detailed.map((item) => `<div class="account-cart-item">
      <img src="${escapeHtml(item.product.image || "assets/brand/logo-blue.svg")}" alt="">
      <div><strong>${escapeHtml(item.product.name || "Аромат FLUIDE")}</strong><span>${Number(item.quantity) || 1} шт. · ${money((Number(item.product.price) || 0) * (Number(item.quantity) || 1))}</span></div>
    </div>`).join("");
    if (!detailed.length) container.innerHTML = '<p class="account-card-copy">Добавленные ароматы появятся здесь.</p>';
  }

  function renderCartDrawer() {
    const detailed = cart.map((item, index) => ({ item, index })).filter(({ item }) => item?.product);
    const items = document.querySelector(".cart-items");
    const footer = document.querySelector(".cart-footer");
    footer.hidden = true;
    items.innerHTML = detailed.length ? `${detailed.map(({ item, index }) => `<div class="cart-row">
      <img src="${escapeHtml(item.product.image || "assets/brand/logo-blue.svg")}" alt="${escapeHtml(item.product.name || "Аромат FLUIDE")}">
      <div><h3>${escapeHtml(item.product.name || "Аромат FLUIDE")}</h3><p>${money(Number(item.product.price) || 0)}</p><div class="cart-quantity"><button type="button" data-cart-index="${index}" data-cart-delta="-1" aria-label="Уменьшить количество"><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${Number(item.quantity) || 1}</span><button type="button" data-cart-index="${index}" data-cart-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div></div>
      <button type="button" data-remove-cart="${escapeHtml(item.id)}" aria-label="Удалить товар"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#trash-2"></use></svg></button>
    </div>`).join("")}<div class="cart-total"><span>Итого</span><span>${money(cartAmount())}</span></div><p class="cart-note">Товары сохранены в корзине. Онлайн-оформление заказа пока не подключено.</p><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>` : `<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>`;
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
        <span class="account-fragrance-visual"><img src="${escapeHtml(item.image || "assets/brand/logo-blue.svg")}" alt="Флакон ${escapeHtml(title)}"></span>
        <span class="account-fragrance-copy"><span>${escapeHtml(item.category || "Парфюм")}</span><h3>FLUIDE ${Number(item.id)} ${escapeHtml(title)}</h3><p>По мотивам ${escapeHtml(item.original || "авторской композиции")}</p></span>
      </a>`;
    }).join("");
  }

  renderAccountIdentity(initialAccount);
  renderStats();
  renderSelectionProfile();
  renderCartPreview();
  renderCartDrawer();

  fetch("data/fragrances.json", { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(renderFavorites)
    .catch(() => renderFavorites([]));

  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-account-tab]");
    if (tab) activateTab(tab.dataset.accountTab);
    if (event.target.closest(".cart-button")) openCart();
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
      window.FluideAccount.clear();
      window.location.href = "index.html";
    }
  });

  document.querySelector("#account-profile-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const updated = { ...window.FluideAccount.read(), name: String(data.get("name") || "").trim(), email: String(data.get("email") || "").trim() };
    window.FluideAccount.save(updated);
    renderAccountIdentity(updated);
    document.querySelector("#account-form-status").textContent = "Изменения сохранены на этом устройстве.";
    showToast("Профиль сохранен");
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

  activateTab(location.hash.replace("#", "") || "overview", false);
}
