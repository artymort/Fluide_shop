"use strict";

const aboutCartDrawer = document.querySelector(".cart-drawer");
const aboutCartBackdrop = document.querySelector(".drawer-backdrop");
const aboutCartItems = document.querySelector(".cart-items");
const aboutCartCount = document.querySelector(".cart-count");
const aboutCartButton = document.querySelector(".cart-button");
const aboutInfoDialog = document.querySelector("#info-dialog");
const aboutToast = document.querySelector(".toast");
const aboutMobileNav = document.querySelector(".mobile-nav");
const aboutMenuToggle = document.querySelector(".menu-toggle");

const aboutEscapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const aboutMoney = value => `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)}&nbsp;<span class="price-ruble">₽</span>`;
const readAboutCart = () => {
  try {
    const value = JSON.parse(localStorage.getItem("fluide-cart") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const saveAboutCart = cart => {
  try { localStorage.setItem("fluide-cart", JSON.stringify(cart)); } catch {}
};

let aboutCart = readAboutCart();
let aboutToastTimer;

function aboutProduct(row) {
  return row.product || null;
}

function renderAboutCart() {
  aboutCart = readAboutCart();
  const detailed = aboutCart.map((item, index) => ({ item, index, product: aboutProduct(item) })).filter(row => row.product);
  const quantity = aboutCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const promotion = window.FluidePromotions?.calculate(aboutCart) || {
    total: detailed.reduce((sum, row) => sum + Number(row.product.price || 0) * Number(row.item.quantity || 0), 0),
    discount: 0,
    giftItemCounts: {}
  };
  aboutCartCount.textContent = quantity || "";
  aboutCartCount.hidden = quantity === 0;
  if (!detailed.length) {
    aboutCartItems.innerHTML = '<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>';
    return;
  }
  aboutCartItems.innerHTML = `${window.FluidePromotions?.bannerMarkup() || ""}${detailed.map(({ item, index, product }) => {
    const itemQuantity = Number(item.quantity) || 1;
    const giftQuantity = promotion.giftItemCounts?.[String(item.id)] || 0;
    const gross = Number(product.price || 0) * itemQuantity;
    const paid = Number(product.price || 0) * (itemQuantity - giftQuantity);
    return `<div class="cart-row">
      <img src="${aboutEscapeHtml(product.image || "assets/brand/logo-blue.svg")}" alt="${aboutEscapeHtml(product.name || "Товар FLUIDE")}">
      <div class="cart-row-copy"><h3>${aboutEscapeHtml(product.name || "Товар FLUIDE")}</h3>${giftQuantity ? '<span class="cart-gift-label">Подарок по акции 3+1</span>' : ""}</div>
      <button type="button" data-about-remove="${index}" aria-label="Удалить ${aboutEscapeHtml(product.name || "товар")}"><svg><use href="assets/icons/lucide.svg#x"></use></svg></button>
      <div class="cart-quantity"><button type="button" data-about-index="${index}" data-about-delta="-1" aria-label="Уменьшить количество" ${itemQuantity <= 1 ? "disabled" : ""}><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${itemQuantity}</span><button type="button" data-about-index="${index}" data-about-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div>
      <div class="cart-row-total">${giftQuantity ? `<del>${aboutMoney(gross)}</del><strong>${aboutMoney(paid)}</strong>` : `<strong>${aboutMoney(gross)}</strong>`}</div>
    </div>`;
  }).join("")}<a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>${window.FluidePromotions?.totalsMarkup(promotion, aboutMoney) || `<section class="cart-order-summary"><div class="cart-order-total"><span>Итого</span><strong>${aboutMoney(promotion.total)}</strong></div><button class="cart-summary-checkout checkout-button" type="button">Оформить заказ · ${quantity} шт.</button></section>`}`;
}

function openAboutCart() {
  renderAboutCart();
  aboutCartDrawer.classList.add("is-open");
  aboutCartDrawer.setAttribute("aria-hidden", "false");
  aboutCartBackdrop.classList.add("is-open");
  document.body.classList.add("is-locked");
}

function closeAboutCart() {
  aboutCartDrawer.classList.remove("is-open");
  aboutCartDrawer.setAttribute("aria-hidden", "true");
  aboutCartBackdrop.classList.remove("is-open");
  document.body.classList.remove("is-locked");
}

function showAboutToast(message) {
  aboutToast.textContent = message;
  aboutToast.classList.add("visible");
  clearTimeout(aboutToastTimer);
  aboutToastTimer = setTimeout(() => aboutToast.classList.remove("visible"), 2600);
}

function openAboutInfo(type) {
  const content = {
    delivery: { title: "Доставка и оплата", html: "<p>Заказ можно оформить с доставкой по России, в пункт выдачи СДЭК или самовывозом во Владимире.</p><p>Стоимость доставки рассчитывается при оформлении заказа.</p>" },
    contacts: { title: "Связаться с FLUIDE", html: "<p>FLUIDE Atelier — парфюмерный бренд из Владимира.</p><p>Напишите нам через раздел контактов на главной странице — поможем с выбором и расскажем о встречах.</p><a class=\"about-text-link\" href=\"index.html#contacts\">Перейти к контактам</a>" },
    privacy: { title: "Персональные данные", html: "<p>Корзина, избранное и выбор cookie сохраняются локально в вашем браузере.</p><p>Контакты и адрес из формы используются только для оформления и доставки заказа.</p>" }
  }[type];
  if (!content) return;
  aboutInfoDialog.querySelector(".info-title").textContent = content.title;
  aboutInfoDialog.querySelector(".info-content").innerHTML = content.html;
  aboutInfoDialog.showModal();
}

aboutCartButton.addEventListener("click", openAboutCart);
document.querySelector(".drawer-close").addEventListener("click", closeAboutCart);
aboutCartBackdrop.addEventListener("click", closeAboutCart);
aboutCartItems.addEventListener("click", event => {
  const quantityButton = event.target.closest("[data-about-index]");
  const removeButton = event.target.closest("[data-about-remove]");
  if (quantityButton) {
    const row = aboutCart[Number(quantityButton.dataset.aboutIndex)];
    if (!row) return;
    row.quantity = Math.max(1, (Number(row.quantity) || 1) + Number(quantityButton.dataset.aboutDelta));
    saveAboutCart(aboutCart);
    renderAboutCart();
  }
  if (removeButton) {
    aboutCart.splice(Number(removeButton.dataset.aboutRemove), 1);
    saveAboutCart(aboutCart);
    renderAboutCart();
  }
});
document.addEventListener("keydown", event => { if (event.key === "Escape" && aboutCartDrawer.classList.contains("is-open")) closeAboutCart(); });

document.querySelector("[data-account]").addEventListener("click", () => { window.location.href = "account.html"; });
document.querySelector(".focus-search").addEventListener("click", () => { window.location.href = "catalog.html#catalog-search"; });
document.querySelector(".favorites-button").addEventListener("click", () => { window.location.href = "account.html#favorites"; });
aboutMenuToggle.addEventListener("click", () => {
  const open = aboutMobileNav.classList.toggle("is-open");
  aboutMenuToggle.setAttribute("aria-expanded", String(open));
});
aboutMobileNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  aboutMobileNav.classList.remove("is-open");
  aboutMenuToggle.setAttribute("aria-expanded", "false");
}));

document.querySelectorAll("[data-info]").forEach(button => button.addEventListener("click", () => openAboutInfo(button.dataset.info)));
document.querySelector(".info-close").addEventListener("click", () => aboutInfoDialog.close());
aboutInfoDialog.addEventListener("click", event => { if (event.target === aboutInfoDialog) aboutInfoDialog.close(); });

const aboutNotices = ["Доставка по России · бесплатно от 5 000 ₽", "Три любимых аромата по цене двух", "Откройте свой аромат с FLUIDE"];
let aboutNoticeIndex = 0;
document.querySelectorAll("[data-service]").forEach(button => button.addEventListener("click", () => {
  aboutNoticeIndex = (aboutNoticeIndex + Number(button.dataset.service) + aboutNotices.length) % aboutNotices.length;
  document.querySelector("#service-message").textContent = aboutNotices[aboutNoticeIndex];
}));

const aboutCookie = document.querySelector(".cookie");
try { aboutCookie.hidden = localStorage.getItem("fluide-cookie-consent") === "accepted"; } catch { aboutCookie.hidden = false; }
document.querySelector("[data-cookie-accept]").addEventListener("click", () => {
  try { localStorage.setItem("fluide-cookie-consent", "accepted"); } catch {}
  aboutCookie.hidden = true;
});
document.querySelector("[data-cookie-settings]").addEventListener("click", () => { aboutCookie.hidden = false; });

window.addEventListener("scroll", () => document.querySelector(".catalog-header").classList.toggle("scrolled", scrollY > 40), { passive: true });
window.addEventListener("storage", event => { if (event.key === "fluide-cart") renderAboutCart(); });
renderAboutCart();

const aboutRevealItems = [...document.querySelectorAll("[data-reveal]")];
if (aboutRevealItems.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.body.classList.add("has-motion");
  const aboutRevealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      aboutRevealObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
  aboutRevealItems.forEach(item => aboutRevealObserver.observe(item));
}
