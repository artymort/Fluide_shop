"use strict";

(() => {
  const STORAGE_KEY = "fluide-account";

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);

  function readAccount() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return value && typeof value === "object" && value.phone ? value : null;
    } catch {
      return null;
    }
  }

  function saveAccount(account) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    updateHeaderAuth();
  }

  function clearAccount() {
    localStorage.removeItem(STORAGE_KEY);
    updateHeaderAuth();
  }

  function phoneDigits(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) digits = `7${digits}`;
    if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
    return digits;
  }

  function formatPhone(digits) {
    if (!/^7\d{10}$/.test(digits)) return "";
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }

  function authHost() {
    const body = document.querySelector("#account-dialog-body") || document.querySelector("#panel-body");
    if (!body) return null;
    return { body, dialog: body.closest("dialog") };
  }

  function renderIntro(body) {
    body.classList.remove("cart-panel-body");
    body.innerHTML = `<div class="auth-panel"><div class="auth-content">
      <p class="auth-kicker">Добро пожаловать в FLUIDE</p>
      <h3 class="auth-title">Войти или<br>зарегистрироваться</h3>
      <p class="auth-subtitle">Сохраняйте избранное, корзину<br>и персональные рекомендации.</p>
      <p class="auth-method-label">Войти с помощью</p>
      <div class="auth-providers">
        <button class="auth-provider" type="button" data-auth-provider="Яндекс ID"><span><img src="assets/icons/yandex-id.svg" alt=""></span><b>Яндекс ID</b></button>
        <button class="auth-provider" type="button" data-auth-provider="VK ID"><span><img src="assets/icons/vk-id.svg?v=2" alt=""></span><b>VK ID</b></button>
      </div>
      <div class="auth-divider"><span>или</span></div>
      <button class="auth-phone-button" type="button" data-auth-phone>По номеру телефона</button>
      <p class="auth-inline-status" role="status"></p>
    </div><p class="auth-legal">Демо-режим: номер и данные профиля сохраняются только в этом браузере.</p></div>`;
  }

  function renderPhone(body) {
    body.innerHTML = `<div class="auth-panel auth-panel--phone"><div class="auth-content">
      <button class="auth-back" type="button" data-auth-back-main><span aria-hidden="true">←</span> Назад</button>
      <p class="auth-kicker">Вход по номеру телефона</p>
      <h3 class="auth-title">Введите номер</h3>
      <p class="auth-subtitle">На следующем шаге введите любые шесть цифр. Настоящее SMS в прототипе не отправляется.</p>
      <form data-fluide-phone-form novalidate>
        <label for="auth-phone">Номер телефона</label>
        <input id="auth-phone" name="phone" type="tel" value="+7 " placeholder="+7 999 000-00-00" autocomplete="tel" inputmode="tel">
        <button class="auth-phone-button" type="submit">Получить код</button>
        <p id="auth-phone-status" role="status"></p>
      </form>
    </div><p class="auth-legal">Продолжая, вы соглашаетесь на локальную обработку данных в демонстрационной версии сайта.</p></div>`;
    requestAnimationFrame(() => body.querySelector("#auth-phone")?.focus());
  }

  function renderCode(body, phone) {
    body.innerHTML = `<div class="auth-panel auth-panel--phone auth-panel--code"><div class="auth-content">
      <button class="auth-back" type="button" data-auth-change-phone><span aria-hidden="true">←</span> Изменить номер</button>
      <p class="auth-kicker">Код подтверждения</p>
      <h3 class="auth-title">Введите код</h3>
      <p class="auth-subtitle">Для прототипа подойдет любая комбинация из шести цифр.<br><strong>${escapeHtml(phone)}</strong></p>
      <form data-fluide-code-form data-phone="${escapeHtml(phone)}" novalidate>
        <label for="auth-code">Шестизначный код</label>
        <input class="auth-code-input" id="auth-code" name="code" type="text" maxlength="6" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}">
        <button class="auth-phone-button" type="submit" disabled>Войти в кабинет</button>
        <p id="auth-code-status" role="status">SMS не отправляется — введите любые 6 цифр.</p>
      </form>
    </div><p class="auth-legal">После входа профиль останется доступен только на этом устройстве.</p></div>`;
    requestAnimationFrame(() => body.querySelector("#auth-code")?.focus());
  }

  function updateHeaderAuth() {
    const account = readAccount();
    document.querySelectorAll('[data-login], [data-open="login"]').forEach((trigger) => {
      const label = trigger.querySelector("span");
      if (label) label.textContent = account ? "Кабинет" : "Войти";
      trigger.setAttribute("aria-label", account ? "Открыть личный кабинет" : "Войти или зарегистрироваться");
      trigger.classList.toggle("is-authenticated", Boolean(account));
    });
  }

  function openAuth() {
    if (readAccount()) {
      window.location.href = "account.html";
      return;
    }
    const host = authHost();
    if (!host?.dialog) return;
    const title = document.querySelector("#panel-title");
    if (title) title.textContent = "Личный кабинет";
    renderIntro(host.body);
    if (!host.dialog.open) host.dialog.showModal();
    document.body.classList.add("is-locked");
    document.body.style.overflow = "hidden";
  }

  function closeAuth(dialog) {
    if (dialog?.open) dialog.close();
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest('[data-login], [data-open="login"]');
    if (trigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAuth();
      return;
    }

    const closeButton = event.target.closest("[data-account-close]");
    if (closeButton) {
      closeAuth(closeButton.closest("dialog"));
      return;
    }

    const host = authHost();
    if (!host) return;
    if (event.target.closest("[data-auth-phone]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderPhone(host.body);
    } else if (event.target.closest("[data-auth-back-main]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderIntro(host.body);
    } else if (event.target.closest("[data-auth-change-phone]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderPhone(host.body);
    } else {
      const provider = event.target.closest("[data-auth-provider]");
      if (provider) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const status = host.body.querySelector(".auth-inline-status");
        if (status) status.textContent = `${provider.dataset.authProvider} подключим после серверной авторизации.`;
      }
    }
  }, true);

  document.addEventListener("input", (event) => {
    if (!event.target.matches("#auth-code")) return;
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6);
    const button = event.target.form?.querySelector('button[type="submit"]');
    if (button) button.disabled = event.target.value.length !== 6;
  });

  document.addEventListener("submit", (event) => {
    const phoneForm = event.target.closest("[data-fluide-phone-form]");
    if (phoneForm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const digits = phoneDigits(new FormData(phoneForm).get("phone"));
      const formatted = formatPhone(digits);
      if (!formatted) {
        phoneForm.querySelector("#auth-phone-status").textContent = "Введите российский номер из 10 цифр после +7.";
        return;
      }
      renderCode(authHost().body, formatted);
      return;
    }

    const codeForm = event.target.closest("[data-fluide-code-form]");
    if (!codeForm) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const code = String(new FormData(codeForm).get("code") || "");
    if (!/^\d{6}$/.test(code)) {
      codeForm.querySelector("#auth-code-status").textContent = "Введите ровно шесть цифр.";
      return;
    }
    const previous = readAccount();
    const now = new Date().toISOString();
    saveAccount({
      phone: codeForm.dataset.phone,
      name: previous?.name || "",
      email: previous?.email || "",
      createdAt: previous?.createdAt || now,
      lastLoginAt: now,
      loyalty: previous?.loyalty || { balance: 300, welcomeBonus: 300, currencyRate: 1, awardedAt: now },
    });
    window.location.href = "account.html";
  }, true);

  function init() {
    updateHeaderAuth();
    document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) {
        document.body.classList.remove("is-locked");
        document.body.style.overflow = "";
      }
    }));

    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "1" && !readAccount()) {
      params.delete("login");
      const query = params.toString();
      const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      history.replaceState(null, "", cleanUrl);
      requestAnimationFrame(openAuth);
    }
  }

  window.FluideAccount = { read: readAccount, save: saveAccount, clear: clearAccount, open: openAuth, formatPhone };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
