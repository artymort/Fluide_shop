"use strict";

const selectionEngine = window.FluideSelectionEngine;
const form = document.querySelector("#selection-form");
const optionsContainer = document.querySelector("#selection-options");
const title = document.querySelector("#selection-title");
const help = document.querySelector("#selection-help");
const kicker = document.querySelector("#selection-kicker");
const stepCount = document.querySelector("#selection-step-count");
const progressBar = document.querySelector("#selection-progress-bar");
const status = document.querySelector("#selection-status");
const backButton = document.querySelector("#selection-back");
const skipButton = document.querySelector("#selection-skip");
const nextButton = document.querySelector(".selection-next");
const nextLabel = nextButton.querySelector("span");
const answerList = document.querySelector("#selection-answer-list");

const steps = [
  {
    key: "gender",
    title: "Кому подбираем аромат?",
    help: "Выберите один вариант",
    type: "single",
    options: [
      { value: "женский", label: "Для нее", caption: "Женские и унисекс ароматы" },
      { value: "мужской", label: "Для него", caption: "Мужские и унисекс ароматы" },
      { value: "унисекс", label: "Унисекс", caption: "Только универсальные ароматы" },
    ],
  },
  {
    key: "occasion",
    title: "Для какого случая?",
    help: "Можно выбрать несколько вариантов",
    type: "multi",
    options: [
      { value: "everyday", label: "На каждый день", caption: "Спокойные и универсальные" },
      { value: "evening", label: "Вечер", caption: "Более выразительные" },
      { value: "date", label: "Свидание", caption: "Мягкие и запоминающиеся" },
      { value: "gym", label: "Спорт", caption: "Чистые и легкие" },
      { value: "walk", label: "Прогулка", caption: "Свежие и непринужденные" },
    ],
  },
  {
    key: "family",
    title: "Какие ноты вам ближе?",
    help: "Выберите одно или несколько направлений",
    type: "multi",
    options: [
      { value: "Цветочные", label: "Цветочные", caption: "Роза, жасмин, пион" },
      { value: "Фруктовые", label: "Фруктовые", caption: "Ягоды, персик, груша" },
      { value: "Цитрусовые", label: "Цитрусовые", caption: "Бергамот, лимон, мандарин" },
      { value: "Древесные", label: "Древесные", caption: "Кедр, сандал, ветивер" },
      { value: "Сладкие", label: "Сладкие", caption: "Ваниль, пралине, какао" },
      { value: "Свежие", label: "Свежие", caption: "Морские, зеленые, чайные" },
      { value: "Пряные и восточные", label: "Пряные и восточные", caption: "Перец, амбра, шафран" },
    ],
  },
  {
    key: "season",
    title: "Для какого времени года?",
    help: "Можно выбрать несколько сезонов",
    type: "multi",
    options: [
      { value: "spring", label: "Весна", caption: "Цветочные и чистые" },
      { value: "summer", label: "Лето", caption: "Легкие и свежие" },
      { value: "autumn", label: "Осень", caption: "Теплые и мягкие" },
      { value: "winter", label: "Зима", caption: "Плотные и стойкие" },
    ],
  },
];

const selectionParams = new URLSearchParams(window.location.search);
if (selectionParams.get("restart") === "1") {
  sessionStorage.removeItem("fluide-selection");
  history.replaceState(null, "", window.location.pathname);
}
const answers = readStoredObject("fluide-selection");
const requestedStep = Number(selectionParams.get("step")) || 1;
let currentStep = Math.min(steps.length - 1, Math.max(0, requestedStep - 1));
let fragrances = [];
let cart = readStoredArray("fluide-cart");
let toastTimer;

function readStoredObject(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
}

function answerValues(key) {
  const value = answers[key];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function saveAnswers() {
  sessionStorage.setItem("fluide-selection", JSON.stringify(answers));
}

function setAnswer(key, value, type, checked) {
  if (type === "single") {
    answers[key] = value;
  } else {
    const values = new Set(answerValues(key));
    if (checked) values.add(value);
    else values.delete(value);
    answers[key] = [...values];
  }
  saveAnswers();
}

function criteria() {
  return {
    gender: answers.gender || "",
    occasions: answerValues("occasion"),
    families: answerValues("family"),
    seasons: answerValues("season"),
  };
}

function optionMarkup(option, step) {
  const selected = answerValues(step.key).includes(option.value);
  return `<label class="selection-option${selected ? " is-selected" : ""}">
    <input type="${step.type === "single" ? "radio" : "checkbox"}" name="${escapeHtml(step.key)}" value="${escapeHtml(option.value)}"${selected ? " checked" : ""}>
    <span class="selection-option-mark" aria-hidden="true"></span>
    <span class="selection-option-title">${escapeHtml(option.label)}</span>
    <span class="selection-option-caption">${escapeHtml(option.caption)}</span>
  </label>`;
}

function allSelectedLabels() {
  return steps.flatMap((step) => step.options
    .filter((option) => answerValues(step.key).includes(option.value))
    .map((option) => option.label));
}

function renderSummary() {
  const labels = allSelectedLabels();
  answerList.innerHTML = labels.length
    ? labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")
    : "<span>Ответы появятся здесь</span>";
}

function updateStatus() {
  if (currentStep !== steps.length - 1) {
    status.textContent = "";
    return;
  }
  if (!fragrances.length) {
    status.textContent = "Загружаем коллекцию…";
    return;
  }
  if (!allSelectedLabels().length) {
    status.textContent = "";
    return;
  }
  const result = selectionEngine.rankRecommendations(fragrances, criteria(), 6);
  const shown = Math.min(6, result.total);
  status.textContent = result.total
    ? `По текущим ответам подходит: ${shown} ${plural(shown, "аромат", "аромата", "ароматов")}`
    : "Пока точных совпадений нет — измените один из ответов или пропустите шаг.";
  nextLabel.textContent = result.total ? `Показать ${shown} ${plural(shown, "аромат", "аромата", "ароматов")}` : "Открыть каталог";
}

function plural(number, one, few, many) {
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function renderStep() {
  const step = steps[currentStep];
  const number = String(currentStep + 1).padStart(2, "0");
  kicker.textContent = `Шаг ${currentStep + 1}`;
  stepCount.textContent = `${number} / ${String(steps.length).padStart(2, "0")}`;
  progressBar.style.width = `${(currentStep + 1) / steps.length * 100}%`;
  title.textContent = step.title;
  help.textContent = step.help;
  optionsContainer.dataset.type = step.type;
  optionsContainer.innerHTML = step.options.map((option) => optionMarkup(option, step)).join("");
  backButton.hidden = currentStep === 0;
  skipButton.hidden = step.type === "single";
  nextLabel.textContent = currentStep === steps.length - 1 ? "Показать ароматы" : "Продолжить";
  nextButton.disabled = answerValues(step.key).length === 0;

  optionsContainer.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      setAnswer(step.key, input.value, step.type, input.checked);
      if (step.type === "single") {
        optionsContainer.querySelectorAll(".selection-option").forEach((card) => card.classList.remove("is-selected"));
      }
      input.closest(".selection-option").classList.toggle("is-selected", input.checked);
      nextButton.disabled = answerValues(step.key).length === 0;
      renderSummary();
      updateStatus();
    });
  });
  renderSummary();
  updateStatus();
}

function catalogUrl() {
  const params = new URLSearchParams({ mode: "selection", view: "results" });
  if (answers.gender) params.set("gender", answers.gender);
  ["occasion", "family", "season"].forEach((key) => {
    answerValues(key).forEach((value) => params.append(key, value));
  });
  return `catalog.html?${params.toString()}`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentStep < steps.length - 1) {
    currentStep += 1;
    renderStep();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  window.location.href = catalogUrl();
});

backButton.addEventListener("click", () => {
  if (currentStep === 0) return;
  currentStep -= 1;
  renderStep();
});

skipButton.addEventListener("click", () => {
  delete answers[steps[currentStep].key];
  saveAnswers();
  if (currentStep < steps.length - 1) {
    currentStep += 1;
    renderStep();
  } else {
    window.location.href = catalogUrl();
  }
});

function formatPriceMarkup(value) {
  return `${new Intl.NumberFormat("ru-RU").format(value)}&nbsp;<span class="price-ruble">₽</span>`;
}

function saveCart() {
  localStorage.setItem("fluide-cart", JSON.stringify(cart));
}

function renderCart() {
  const detailed = cart.map((row, index) => ({ row, index })).filter(({ row }) => row && row.product);
  const quantity = cart.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const total = detailed.reduce((sum, { row }) => sum + Number(row.product.price || 0) * Number(row.quantity || 0), 0);
  const badge = document.querySelector(".cart-count");
  const footer = document.querySelector(".cart-footer");
  const items = document.querySelector(".cart-items");
  badge.textContent = quantity || "";
  badge.hidden = quantity === 0;
  footer.hidden = true;
  document.querySelector(".cart-total").innerHTML = formatPriceMarkup(total);
  items.innerHTML = detailed.length ? `${detailed.map(({ row, index }) => `<div class="cart-row">
    <img src="${escapeHtml(row.product.image || "assets/brand/logo-blue.svg")}" alt="${escapeHtml(row.product.name)}">
    <div><h3>${escapeHtml(row.product.name)}</h3><p>${formatPriceMarkup(Number(row.product.price) || 0)}</p><div class="cart-quantity"><button type="button" data-cart-index="${index}" data-cart-delta="-1" aria-label="Уменьшить количество"><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${Number(row.quantity) || 1}</span><button type="button" data-cart-index="${index}" data-cart-delta="1" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div></div>
    <button type="button" data-remove-cart="${escapeHtml(row.id)}" aria-label="Удалить ${escapeHtml(row.product.name)}"><svg aria-hidden="true"><use href="assets/icons/lucide.svg#trash-2"></use></svg></button>
  </div>`).join("")}<div class="cart-total"><span>Итого</span><span>${formatPriceMarkup(total)}</span></div><p class="cart-note">Товары сохранены в корзине. Онлайн-оформление заказа пока не подключено.</p><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a>` : `<div class="cart-empty"><div class="cart-empty-content"><p>В корзине пока пусто</p><small>Добавьте аромат из коллекции</small><a class="cart-continue" href="catalog.html"><span>Продолжить выбор</span><svg aria-hidden="true"><use href="assets/icons/lucide.svg#move-right"></use></svg></a></div></div>`;
}

function openCart() {
  document.querySelector(".cart-drawer").classList.add("is-open");
  document.querySelector(".cart-drawer").setAttribute("aria-hidden", "false");
  document.querySelector(".drawer-backdrop").classList.add("is-open");
  document.body.classList.add("is-locked");
}

function closeCart() {
  document.querySelector(".cart-drawer").classList.remove("is-open");
  document.querySelector(".cart-drawer").setAttribute("aria-hidden", "true");
  document.querySelector(".drawer-backdrop").classList.remove("is-open");
  if (!document.querySelector("dialog[open]")) document.body.classList.remove("is-locked");
}

function renderAccountMain() {
  document.querySelector("#account-dialog-body").innerHTML = `<div class="auth-panel"><div class="auth-content">
    <p class="auth-kicker">Добро пожаловать в FLUIDE</p><h3 class="auth-title">Войти или<br>зарегистрироваться</h3>
    <p class="auth-subtitle">Сохраняйте избранное, историю заказов<br>и персональные рекомендации.</p><p class="auth-method-label">Войти с помощью</p>
    <div class="auth-providers"><button class="auth-provider" type="button" data-auth-provider="Яндекс ID"><span><img src="assets/icons/yandex-id.svg" alt=""></span><b>Яндекс ID</b></button><button class="auth-provider" type="button" data-auth-provider="VK ID"><span><img src="assets/icons/vk-id.svg?v=2" alt=""></span><b>VK ID</b></button></div>
    <div class="auth-divider"><span>или</span></div><button class="auth-phone-button" type="button" data-auth-phone>По номеру телефона</button>
  </div><p class="auth-legal">Продолжая, вы соглашаетесь на обработку персональных данных в соответствии с политикой обработки персональных данных.</p></div>`;
}

function showToast(message) {
  const toast = document.querySelector(".toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

document.querySelector(".cart-button").addEventListener("click", openCart);
document.querySelector(".drawer-close").addEventListener("click", closeCart);
document.querySelector(".drawer-backdrop").addEventListener("click", closeCart);
document.querySelector(".cart-items").addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-cart-index]");
  if (quantityButton) {
    const row = cart[Number(quantityButton.dataset.cartIndex)];
    if (row) {
      row.quantity = (Number(row.quantity) || 0) + Number(quantityButton.dataset.cartDelta);
      cart = cart.filter((item) => item.quantity > 0);
      saveCart();
      renderCart();
    }
    return;
  }
  const button = event.target.closest("[data-remove-cart]");
  if (!button) return;
  cart = cart.filter((row) => row.id !== button.dataset.removeCart);
  saveCart();
  renderCart();
});

const accountDialog = document.querySelector("#account-dialog");
document.querySelector("[data-login]").addEventListener("click", () => {
  renderAccountMain();
  accountDialog.showModal();
  document.body.classList.add("is-locked");
});
document.querySelector("[data-account-close]").addEventListener("click", () => accountDialog.close());
accountDialog.addEventListener("click", (event) => { if (event.target === accountDialog) accountDialog.close(); });
accountDialog.addEventListener("close", () => document.body.classList.remove("is-locked"));
document.querySelector("#account-dialog-body").addEventListener("click", (event) => {
  const provider = event.target.closest("[data-auth-provider]");
  if (provider) showToast(`${provider.dataset.authProvider}: авторизация будет подключена позже`);
  if (event.target.closest("[data-auth-phone]")) showToast("Вход по телефону будет подключен позже");
});

const infoDialog = document.querySelector("#info-dialog");
document.querySelectorAll("[data-info]").forEach((button) => button.addEventListener("click", () => {
  const content = {
    delivery: ["Доставка и оплата", "Доставка по России. Условия и способы оплаты уточняются при оформлении заказа."],
    contacts: ["Связаться с FLUIDE", "FLUIDE Atelier — парфюмерный бренд из Владимира."],
    privacy: ["Персональные данные", "Корзина и ответы подбора сохраняются только в вашем браузере."],
  }[button.dataset.info];
  document.querySelector(".info-title").textContent = content[0];
  document.querySelector(".info-content").innerHTML = `<p>${content[1]}</p>`;
  infoDialog.showModal();
}));
document.querySelector(".info-close").addEventListener("click", () => infoDialog.close());

const menuToggle = document.querySelector(".menu-toggle");
const mobileNav = document.querySelector(".mobile-nav");
menuToggle.addEventListener("click", () => {
  const open = mobileNav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

const serviceMessages = ["Доставка по России · бесплатно от 5 000 ₽", "Три любимых аромата по цене двух", "Откройте свой аромат с FLUIDE"];
let serviceIndex = 0;
document.querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => {
  serviceIndex = (serviceIndex + Number(button.dataset.service) + serviceMessages.length) % serviceMessages.length;
  document.querySelector("#service-message").textContent = serviceMessages[serviceIndex];
}));

const pageHeader = document.querySelector(".catalog-header");
window.addEventListener("scroll", () => pageHeader.classList.toggle("scrolled", scrollY > 60), { passive: true });

const cookie = document.querySelector(".cookie");
try { cookie.hidden = localStorage.getItem("fluide-cookie-consent") === "accepted"; } catch { cookie.hidden = false; }
document.querySelector("[data-cookie-accept]").addEventListener("click", () => {
  try { localStorage.setItem("fluide-cookie-consent", "accepted"); } catch {}
  cookie.hidden = true;
});
document.querySelector("[data-cookie-settings]").addEventListener("click", () => { cookie.hidden = false; });

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCart(); });

window.FluideCatalogData.load()
  .then((catalog) => {
    fragrances = catalog.fragrances.filter((item) => item && item.id);
    updateStatus();
  })
  .catch((error) => {
    status.textContent = "Не удалось загрузить коллекцию. Обновите страницу и попробуйте снова.";
    console.error(error);
  });

renderStep();
renderCart();
