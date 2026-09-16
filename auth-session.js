"use strict";

(() => {
  const STORAGE_KEY = "fluide-account";
  let currentAccount;

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);

  function readLocalAccount() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return value && typeof value === "object" && value.phone ? value : null;
    } catch {
      return null;
    }
  }

  function readAccount() {
    return currentAccount ?? null;
  }

  function saveAccount(account) {
    currentAccount = account;
    if (account?.source !== "server") localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    updateHeaderAuth();
  }

  async function clearAccount() {
    if (currentAccount?.source === "server") {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    }
    localStorage.removeItem(STORAGE_KEY);
    currentAccount = null;
    updateHeaderAuth();
  }

  function serverAccount(user) {
    const local = readLocalAccount();
    return {
      source: "server",
      id: user.id,
      name: user.displayName || "",
      phone: formatPhone(String(user.phone || "").replace(/\D/g, "")) || user.phone || "",
      phoneVerified: Boolean(user.phoneVerified),
      phoneRequired: Boolean(user.phoneRequired),
      email: user.email || "",
      createdAt: user.createdAt || new Date().toISOString(),
      loyalty: local?.loyalty || { balance: 300, welcomeBonus: 300, currencyRate: 1, awardedAt: new Date().toISOString() },
    };
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = response.ok ? await response.json() : null;
      currentAccount = payload?.authenticated ? serverAccount(payload.user) : readLocalAccount();
    } catch {
      currentAccount = readLocalAccount();
    }
    updateHeaderAuth();
    return currentAccount;
  }

  async function updateProfile({ name, email }) {
    if (currentAccount?.source !== "server") {
      const updated = { ...currentAccount, name, email };
      saveAccount(updated);
      return updated;
    }

    const response = await fetch("/api/auth/profile", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ displayName: name, email }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "profile_update_failed");
    currentAccount = { ...serverAccount(payload.user), loyalty: currentAccount.loyalty };
    updateHeaderAuth();
    return currentAccount;
  }

  async function addRequiredPhone(phone) {
    const digits = phoneDigits(phone);
    const normalized = /^\d{8,15}$/.test(digits) ? `+${digits}` : "";
    if (!normalized) throw new Error("invalid_phone");

    const response = await fetch("/api/auth/phone", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: normalized }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "phone_update_failed");
    currentAccount = { ...serverAccount(payload.user), loyalty: currentAccount?.loyalty };
    updateHeaderAuth();
    return currentAccount;
  }

  const ready = loadAccount();

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
    </div><p class="auth-legal">При входе через Яндекс данные профиля сохраняются в защищённой базе FLUIDE.</p></div>`;
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

  function renderRequiredPhone(body) {
    body.innerHTML = `<div class="auth-panel auth-panel--phone"><div class="auth-content">
      <p class="auth-kicker">Завершение регистрации</p>
      <h3 class="auth-title">Укажите телефон</h3>
      <p class="auth-subtitle">Яндекс не передал номер. Он нужен для аккаунта FLUIDE.</p>
      <form data-fluide-required-phone-form novalidate>
        <label for="required-phone">Номер телефона</label>
        <input id="required-phone" name="phone" type="tel" value="+7 " placeholder="+7 999 000-00-00" autocomplete="tel" inputmode="tel">
        <button class="auth-phone-button" type="submit">Сохранить номер</button>
        <p id="required-phone-status" role="status"></p>
      </form>
    </div><p class="auth-legal">До подключения SMS номер будет сохранён как неподтверждённый.</p></div>`;
    requestAnimationFrame(() => body.querySelector("#required-phone")?.focus());
  }

  function openRequiredPhone() {
    const host = authHost();
    if (!host?.dialog) return;
    const title = document.querySelector("#panel-title");
    if (title) title.textContent = "Завершите регистрацию";
    renderRequiredPhone(host.body);
    if (!host.dialog.open) host.dialog.showModal();
    document.body.classList.add("is-locked");
    document.body.style.overflow = "hidden";
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
        if (provider.dataset.authProvider === "Яндекс ID") {
          window.location.assign("/api/auth/yandex/start");
          return;
        }
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
    const requiredPhoneForm = event.target.closest("[data-fluide-required-phone-form]");
    if (requiredPhoneForm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const status = requiredPhoneForm.querySelector("#required-phone-status");
      status.textContent = "Сохраняем…";
      addRequiredPhone(new FormData(requiredPhoneForm).get("phone"))
        .then(() => { window.location.href = "/account.html"; })
        .catch((error) => {
          status.textContent = error.message === "phone_in_use"
            ? "Этот номер уже используется в другом аккаунте."
            : "Введите номер в международном формате.";
        });
      return;
    }

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

    ready.then(() => {
      const params = new URLSearchParams(window.location.search);
      const authError = params.get("auth_error");
      if (currentAccount?.source === "server" && currentAccount.phoneRequired) {
        requestAnimationFrame(openRequiredPhone);
      } else if (authError) {
        const messages = {
          access_denied: "Вход через Яндекс был отменён.",
          invalid_state: "Сессия входа устарела. Попробуйте ещё раз.",
          account_conflict: "Этот email или телефон уже связан с другим аккаунтом.",
        };
        currentAccount = null;
        openAuth();
        const status = authHost()?.body.querySelector(".auth-inline-status");
        if (status) status.textContent = messages[authError] || "Не удалось войти через Яндекс. Попробуйте ещё раз.";
      } else if (params.get("login") === "1" && !readAccount()) {
        requestAnimationFrame(openAuth);
      }

      if (params.has("login") || params.has("auth_error") || params.has("auth")) {
        params.delete("login");
        params.delete("auth_error");
        params.delete("auth");
        const query = params.toString();
        const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        history.replaceState(null, "", cleanUrl);
      }
    });
  }

  window.FluideAccount = {
    read: readAccount,
    save: saveAccount,
    clear: clearAccount,
    open: openAuth,
    format: formatPhone,
    formatPhone,
    ready,
    addRequiredPhone,
    updateProfile,
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
