"use strict";

(() => {
  const CART_KEY = "fluide-cart";
  const PENDING_PAYMENT_KEY = "fluide-pending-payment";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
  const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Number(value) || 0)} ₽`;
  const promotions = window.FluidePromotions;

  function readCart() {
    try {
      const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(cart) ? cart.filter((item) => item?.id && Number(item.quantity) > 0) : [];
    } catch {
      return [];
    }
  }

  function checkoutItems(cart) {
    return cart.map((item) => ({ key: String(item.id), quantity: Number(item.quantity) }));
  }

  function pricingFor(cart) {
    return promotions?.calculate(cart) || {
      subtotal: cart.reduce((sum, item) => sum + (Number(item.product?.price) || 0) * (Number(item.quantity) || 0), 0),
      discount: 0,
      giftItemIds: [],
      total: cart.reduce((sum, item) => sum + (Number(item.product?.price) || 0) * (Number(item.quantity) || 0), 0),
    };
  }

  function renderRows(cart, pricing = pricingFor(cart)) {
    return cart.map((item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.product?.price) || 0;
      const giftCount = Number(pricing.giftItemCounts?.[String(item.id)]) || 0;
      const giftLabel = giftCount
        ? '<span class="cart-gift-label">Подарок по акции 3+1</span>'
        : "";
      const rowTotal = price * quantity;
      const paidTotal = price * Math.max(0, quantity - giftCount);
      return `<div class="checkout-product-row" data-cart-key="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.product?.image || "assets/brand/logo-blue.svg")}" alt="" loading="lazy" decoding="async">
        <div class="checkout-product-copy"><strong>${escapeHtml(item.product?.name || "Товар FLUIDE")}</strong>${giftLabel}</div>
        <button class="checkout-product-remove" type="button" data-cart-action="remove" aria-label="Удалить ${escapeHtml(item.product?.name || "товар")}"><svg><use href="assets/icons/lucide.svg#x"></use></svg></button>
        <div class="checkout-product-quantity"><button type="button" data-cart-action="decrease" aria-label="Уменьшить количество" ${quantity <= 1 ? "disabled" : ""}><svg><use href="assets/icons/lucide.svg#minus"></use></svg></button><span>${quantity}</span><button type="button" data-cart-action="increase" aria-label="Увеличить количество"><svg><use href="assets/icons/lucide.svg#plus"></use></svg></button></div>
        <div class="checkout-product-total">${giftCount ? `<del>${money(rowTotal)}</del><strong>${money(paidTotal)}</strong>` : `<strong>${money(rowTotal)}</strong>`}</div>
      </div>`;
    }).join("");
  }

  function goToCheckout(event) {
    const trigger = event.target.closest("[data-checkout], .checkout-button, .cart-footer > button");
    if (!trigger) return;
    event.preventDefault();
    if (readCart().length) window.location.assign("checkout.html");
  }

  const page = document.querySelector("[data-checkout-page]");
  if (!page) {
    document.addEventListener("click", goToCheckout);
    return;
  }

  function readPendingPayment() {
    try {
      const value = JSON.parse(sessionStorage.getItem(PENDING_PAYMENT_KEY) || "null");
      return value?.orderId && value?.checkoutToken ? value : null;
    } catch {
      return null;
    }
  }

  function writePendingPayment(value) {
    sessionStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify(value));
  }

  function clearPendingPayment() {
    sessionStorage.removeItem(PENDING_PAYMENT_KEY);
  }

  async function paymentRequest(path, pending) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ checkoutToken: pending.checkoutToken }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error || "payment_failed"), { code: payload.error });
    return payload;
  }

  function renderPaymentResult({ title, orderNumber, message, retry = false }) {
    page.innerHTML = `<section class="checkout-success checkout-payment-result">
      <span class="checkout-success-icon"><svg><use href="assets/icons/lucide.svg#check"></use></svg></span>
      <p>${escapeHtml(title)}</p>
      <h2>${escapeHtml(orderNumber || "")}</h2>
      <div>${escapeHtml(message)}</div>
      <button class="checkout-payment-retry" type="button" data-payment-retry ${retry ? "" : "hidden"}>Перейти к оплате</button>
      <a href="catalog.html">Продолжить покупки</a>
    </section>`;
  }

  async function startPendingPayment(pending) {
    const payload = await paymentRequest(`/api/payments/orders/${encodeURIComponent(pending.orderId)}/yookassa`, pending);
    if (payload.payment?.status === "succeeded") {
      localStorage.removeItem(CART_KEY);
      clearPendingPayment();
      window.FluideAnalytics?.track("purchase", {
        valueMinor: Number(pending.valueMinor),
        metadata: { orderNumber: pending.orderNumber },
      });
      renderPaymentResult({
        title: "Заказ оплачен",
        orderNumber: pending.orderNumber,
        message: "Платёж подтверждён. Мы начали обработку заказа.",
      });
      return;
    }
    if (!payload.payment?.confirmationUrl) {
      throw Object.assign(new Error("payment_confirmation_missing"), { code: "payment_confirmation_missing" });
    }
    window.location.assign(payload.payment.confirmationUrl);
  }

  async function renderPaymentReturn() {
    const pending = readPendingPayment();
    if (!pending) {
      renderPaymentResult({
        title: "Не удалось найти заказ",
        message: "Вернитесь в каталог или свяжитесь с нами, если оплата уже была выполнена.",
      });
      return;
    }
    renderPaymentResult({
      title: "Проверяем оплату",
      orderNumber: pending.orderNumber,
      message: "Подождите несколько секунд — подтверждаем статус платежа в ЮKassa.",
    });
    try {
      const payload = await paymentRequest(
        `/api/payments/orders/${encodeURIComponent(pending.orderId)}/yookassa/status`,
        pending,
      );
      if (payload.payment?.status === "succeeded") {
        localStorage.removeItem(CART_KEY);
        clearPendingPayment();
        window.FluideAnalytics?.track("purchase", {
          valueMinor: Number(pending.valueMinor),
          metadata: { orderNumber: pending.orderNumber },
        });
        renderPaymentResult({
          title: "Заказ оплачен",
          orderNumber: pending.orderNumber,
          message: "Платёж подтверждён. Мы начали обработку заказа.",
        });
      } else if (payload.payment?.status === "cancelled") {
        renderPaymentResult({
          title: "Платёж не завершён",
          orderNumber: pending.orderNumber,
          message: "Деньги не списаны. Можно попробовать оплатить заказ ещё раз.",
          retry: true,
        });
      } else {
        renderPaymentResult({
          title: "Платёж обрабатывается",
          orderNumber: pending.orderNumber,
          message: "Подтверждение ещё не получено. Обновите страницу через минуту.",
        });
      }
    } catch {
      renderPaymentResult({
        title: "Проверка временно недоступна",
        orderNumber: pending.orderNumber,
        message: "Заказ сохранён. Попробуйте обновить страницу немного позже.",
      });
    }
  }

  if (new URLSearchParams(window.location.search).get("payment") === "return") {
    page.addEventListener("click", (event) => {
      const retry = event.target.closest("[data-payment-retry]");
      if (!retry) return;
      const pending = readPendingPayment();
      if (!pending) return;
      retry.disabled = true;
      startPendingPayment(pending).catch(() => { retry.disabled = false; });
    });
    renderPaymentReturn();
    return;
  }

  let activeCart = readCart();
  if (!activeCart.length) {
    page.innerHTML = `<section class="checkout-empty"><h1>Корзина пуста</h1><p>Добавьте товары, чтобы перейти к оформлению заказа.</p><a href="catalog.html">Перейти в каталог</a></section>`;
    return;
  }

  const pricing = pricingFor(activeCart);
  const total = pricing.total;
  const quantity = activeCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  page.innerHTML = `<div class="checkout-page-shell">
    <h1>Оформление заказа</h1>
    <div class="checkout-body">
      <form class="checkout-form" id="checkout-form" novalidate>
        <section class="checkout-section"><h2>Контакты</h2><div class="checkout-fields checkout-fields--two">
          <label><span>Имя и фамилия</span><input name="customerName" autocomplete="name" required maxlength="120"></label>
          <label><span>Телефон</span><input name="customerPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+7 999 000-00-00" required></label>
          <label class="checkout-field-wide"><span>Email <small>необязательно</small></span><input name="customerEmail" type="email" autocomplete="email" maxlength="320"></label>
        </div></section>
        <section class="checkout-section"><h2>Доставка</h2><div class="checkout-delivery">
          <label><input type="radio" name="deliveryMethod" value="cdek" checked><span class="checkout-delivery-choice"><span class="checkout-delivery-copy"><b>СДЭК</b><small>ПВЗ или курьерская доставка</small></span><img src="assets/brand/cdek.svg" alt="" aria-hidden="true"></span></label>
          <label><input type="radio" name="deliveryMethod" value="russian_post"><span class="checkout-delivery-choice"><span class="checkout-delivery-copy"><b>Почта России</b><small>В отделение или до двери</small></span><img class="checkout-delivery-logo--post" src="assets/brand/russian-post.svg" alt="" aria-hidden="true"></span></label>
          <label><input type="radio" name="deliveryMethod" value="pickup"><span class="checkout-delivery-choice"><span class="checkout-delivery-copy"><b>Самовывоз</b><small>Из пространства FLUIDE во Владимире</small></span></span></label>
        </div><div class="checkout-fields checkout-fields--two" data-checkout-address>
          <label><span>Город</span><input name="city" autocomplete="address-level2" maxlength="120" required></label>
          <label><span>Индекс <small data-postal-hint>необязательно</small></span><input name="postalCode" autocomplete="postal-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}"></label>
          <label class="checkout-field-wide"><span>Адрес или желаемый ПВЗ</span><input name="address" autocomplete="street-address" maxlength="300" required></label>
        </div></section>
        <section class="checkout-section"><h2>Комментарий</h2><label><textarea name="customerComment" rows="3" maxlength="1000" placeholder="Например, удобное время для звонка"></textarea></label></section>
        <label class="checkout-consent"><input type="checkbox" name="consent" required><span>Я согласен на обработку персональных данных</span></label>
        <p class="checkout-error" role="alert" hidden></p>
        <button class="checkout-submit" type="submit"><span>Оформить заказ</span><b data-checkout-submit-total>${money(total)}</b></button>
        <p class="checkout-payment-note">Оплата — после подтверждения заказа. Менеджер свяжется с вами.</p>
      </form>
      <aside class="checkout-sidebar">${promotions?.bannerMarkup() || ""}<section class="checkout-products"><div class="checkout-products-head"><h2>Ваш заказ</h2><span data-checkout-count>${quantity} шт.</span></div><div class="checkout-product-list" data-checkout-product-list>${renderRows(activeCart, pricing)}</div></section><section class="checkout-summary"><h2>Сумма заказа</h2><div class="checkout-summary-rows">
          <div class="checkout-summary-row"><span>Товары, <span data-checkout-count>${quantity} шт.</span></span><i></i><strong data-checkout-subtotal>${money(pricing.subtotal)}</strong></div>
          <div class="checkout-summary-row"><span>Доставка</span><i></i><strong data-checkout-delivery-price>после расчёта</strong></div>
          <div class="checkout-summary-row checkout-summary-row--discount"><span>Скидка 3+1</span><i></i><strong data-checkout-discount>${pricing.discount ? `− ${money(pricing.discount)}` : "—"}</strong></div>
        </div><div class="checkout-total"><span>Итого</span><span class="checkout-total-prices"><del data-checkout-original-total ${pricing.discount ? "" : "hidden"}>${money(pricing.subtotal)}</del><strong data-checkout-grand-total>${money(total)}</strong></span></div><small data-checkout-delivery-note>Итог изменится после автоматического расчёта доставки.</small></section></aside>
    </div>
    <div class="checkout-success" hidden><span class="checkout-success-icon"><svg><use href="assets/icons/lucide.svg#check"></use></svg></span><p data-order-result-title>Заказ принят</p><h2 data-order-number></h2><div data-order-result-message>Мы свяжемся с вами, чтобы подтвердить состав, доставку и оплату.</div><button class="checkout-payment-retry" type="button" data-payment-retry hidden>Перейти к оплате</button><a href="catalog.html">Продолжить покупки</a></div>
  </div>`;

  const form = page.querySelector("#checkout-form");
  const addressBlock = page.querySelector("[data-checkout-address]");
  const errorMessages = {
    customer_name_invalid: "Укажите имя и фамилию.",
    customer_phone_invalid: "Проверьте номер телефона.",
    customer_email_invalid: "Проверьте email.",
    delivery_address_required: "Укажите город и адрес доставки.",
    delivery_postal_code_required: "Для Почты России укажите шестизначный индекс.",
    catalog_item_unavailable: "Один из товаров больше недоступен. Обновите корзину.",
    order_items_invalid: "Корзина пуста или повреждена.",
    payment_provider_disabled: "Онлайн-оплата временно недоступна. Заказ сохранён.",
    payment_provider_unavailable: "ЮKassa временно недоступна. Заказ сохранён — попробуйте оплатить его ещё раз.",
    payment_provider_rejected: "ЮKassa не приняла запрос. Заказ сохранён — попробуйте оплатить его ещё раз.",
  };

  function showCreatedOrder(orderNumber, message, retry = false) {
    page.querySelector(".checkout-body").hidden = true;
    page.querySelector(".checkout-success").hidden = false;
    page.querySelector("[data-order-number]").textContent = orderNumber;
    page.querySelector("[data-order-result-message]").textContent = message;
    page.querySelector("[data-payment-retry]").hidden = !retry;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function prefillAccount() {
    if (!window.FluideAccount) return;
    await window.FluideAccount.ready.catch(() => {});
    const account = window.FluideAccount.read();
    if (!account) return;
    if (!form.elements.customerName.value) form.elements.customerName.value = account.name || "";
    if (!form.elements.customerPhone.value) form.elements.customerPhone.value = account.phone || "";
    if (!form.elements.customerEmail.value) form.elements.customerEmail.value = account.email || "";
  }

  function updateCartView() {
    if (!activeCart.length) {
      localStorage.removeItem(CART_KEY);
      window.location.reload();
      return;
    }
    const nextPricing = pricingFor(activeCart);
    const nextTotal = nextPricing.total;
    const nextQuantity = activeCart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    page.querySelector("[data-checkout-product-list]").innerHTML = renderRows(activeCart, nextPricing);
    page.querySelectorAll("[data-checkout-count]").forEach((node) => { node.textContent = `${nextQuantity} шт.`; });
    page.querySelector("[data-checkout-subtotal]").textContent = money(nextPricing.subtotal);
    page.querySelector("[data-checkout-discount]").textContent = nextPricing.discount ? `− ${money(nextPricing.discount)}` : "—";
    const originalTotal = page.querySelector("[data-checkout-original-total]");
    originalTotal.textContent = money(nextPricing.subtotal);
    originalTotal.hidden = !nextPricing.discount;
    page.querySelector("[data-checkout-grand-total]").textContent = money(nextTotal);
    page.querySelector("[data-checkout-submit-total]").textContent = money(nextTotal);
  }

  page.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) return;
    const row = button.closest("[data-cart-key]");
    const index = activeCart.findIndex((item) => String(item.id) === row?.dataset.cartKey);
    if (index < 0) return;
    const action = button.dataset.cartAction;
    if (action === "increase") activeCart[index].quantity = Number(activeCart[index].quantity || 0) + 1;
    if (action === "decrease" && Number(activeCart[index].quantity) > 1) activeCart[index].quantity -= 1;
    if (action === "remove") activeCart.splice(index, 1);
    localStorage.setItem(CART_KEY, JSON.stringify(activeCart));
    updateCartView();
  });

  form.addEventListener("change", (event) => {
    if (event.target.name !== "deliveryMethod") return;
    const method = form.elements.deliveryMethod.value;
    const requiresAddress = method !== "pickup";
    const requiresPostalCode = method === "russian_post";
    addressBlock.hidden = !requiresAddress;
    form.elements.city.required = requiresAddress;
    form.elements.address.required = requiresAddress;
    form.elements.postalCode.required = requiresPostalCode;
    form.elements.city.disabled = !requiresAddress;
    form.elements.address.disabled = !requiresAddress;
    form.elements.postalCode.disabled = !requiresAddress;
    page.querySelector("[data-postal-hint]").textContent = requiresPostalCode ? "обязательно" : "необязательно";
    page.querySelector("[data-checkout-delivery-price]").textContent = method === "pickup" ? "0 ₽" : "после расчёта";
    page.querySelector("[data-checkout-delivery-note]").textContent = method === "pickup"
      ? "Забрать заказ можно будет после подтверждения готовности."
      : "Автоматический расчёт станет доступен после подключения API службы.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = page.querySelector(".checkout-error");
    if (!form.reportValidity()) return;
    const submit = form.querySelector(".checkout-submit");
    submit.disabled = true;
    submit.classList.add("is-loading");
    errorNode.hidden = true;
    const data = new FormData(form);
    let createdOrder = null;
    let pendingPayment = null;
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          customerName: data.get("customerName"),
          customerPhone: data.get("customerPhone"),
          customerEmail: data.get("customerEmail"),
          deliveryMethod: data.get("deliveryMethod"),
          deliveryAddress: {
            city: data.get("city"), address: data.get("address"), postalCode: data.get("postalCode"),
          },
          customerComment: data.get("customerComment"),
          items: checkoutItems(activeCart),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error || "order_create_failed"), { code: payload.error });

      createdOrder = payload.order;
      window.dispatchEvent(new CustomEvent("fluide:order-created", { detail: payload.order }));
      if (payload.payment?.available) {
        pendingPayment = {
          orderId: payload.order.id,
          orderNumber: payload.order.order_number,
          checkoutToken: payload.checkoutToken,
          valueMinor: Number(payload.order.total_minor),
        };
        writePendingPayment(pendingPayment);
        await startPendingPayment(pendingPayment);
        return;
      }

      localStorage.removeItem(CART_KEY);
      window.FluideAnalytics?.track("purchase", {
        valueMinor: Number(payload.order.total_minor),
        metadata: { orderNumber: payload.order.order_number },
      });
      showCreatedOrder(payload.order.order_number, "Мы свяжемся с вами, чтобы подтвердить состав, доставку и оплату.");
    } catch (error) {
      if (createdOrder && pendingPayment) {
        showCreatedOrder(
          createdOrder.order_number,
          errorMessages[error.code] || "Заказ сохранён, но перейти к оплате не удалось. Попробуйте ещё раз.",
          true,
        );
        return;
      }
      errorNode.textContent = errorMessages[error.code] || "Не удалось создать заказ. Проверьте связь и попробуйте ещё раз.";
      errorNode.hidden = false;
      errorNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } finally {
      submit.disabled = false;
      submit.classList.remove("is-loading");
    }
  });

  page.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-payment-retry]");
    if (!retry) return;
    const pending = readPendingPayment();
    if (!pending) return;
    retry.disabled = true;
    startPendingPayment(pending).catch((error) => {
      page.querySelector("[data-order-result-message]").textContent = errorMessages[error.code]
        || "Не удалось перейти к оплате. Попробуйте ещё раз немного позже.";
      retry.disabled = false;
    });
  });

  prefillAccount();
})();
