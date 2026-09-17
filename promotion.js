"use strict";

(() => {
  const CAMPAIGN = Object.freeze({
    code: "perfume-3-plus-1",
    title: "3 + 1 на парфюм",
    description: "Каждый четвёртый флакон — в подарок",
    groupSize: 4,
  });

  const quantityOf = (item) => Math.max(0, Math.floor(Number(item?.quantity) || 0));
  const priceOf = (item) => Math.max(0, Number(item?.product?.price) || 0);
  const isEligible = (item) => /^fragrance-\d{3}-\d+$/i.test(String(item?.id || ""));

  function calculate(cart = []) {
    const items = Array.isArray(cart) ? cart : [];
    const subtotal = items.reduce((sum, item) => sum + priceOf(item) * quantityOf(item), 0);
    const itemCount = items.reduce((sum, item) => sum + quantityOf(item), 0);
    const eligibleUnits = items
      .filter(isEligible)
      .flatMap((item) => Array.from({ length: quantityOf(item) }, () => ({
        id: String(item.id),
        price: priceOf(item),
      })))
      .sort((left, right) => left.price - right.price);
    const giftCount = Math.floor(eligibleUnits.length / CAMPAIGN.groupSize);
    const gifts = eligibleUnits.slice(0, giftCount);
    const discount = gifts.reduce((sum, item) => sum + item.price, 0);
    const giftItemCounts = gifts.reduce((counts, item) => {
      counts[item.id] = (counts[item.id] || 0) + 1;
      return counts;
    }, {});

    return {
      campaign: CAMPAIGN,
      subtotal,
      discount,
      total: Math.max(0, subtotal - discount),
      itemCount,
      eligibleCount: eligibleUnits.length,
      giftCount,
      remainingForGift: giftCount > 0 && eligibleUnits.length % CAMPAIGN.groupSize === 0
        ? CAMPAIGN.groupSize
        : CAMPAIGN.groupSize - (eligibleUnits.length % CAMPAIGN.groupSize),
      giftItemIds: gifts.map((item) => item.id),
      giftItemCounts,
    };
  }

  function bannerMarkup() {
    return `<section class="cart-promo" aria-label="Акция 3 плюс 1 на парфюм">
      <div class="cart-promo-copy"><span>Акция</span><strong>${CAMPAIGN.title}</strong><small>Каждый четвёртый флакон —<br>в подарок</small></div>
    </section>`;
  }

  function totalsMarkup(result, formatMoney) {
    const money = typeof formatMoney === "function" ? formatMoney : (value) => `${value} ₽`;
    return `<section class="cart-order-summary" aria-label="Сумма заказа">
      <h3>Сумма заказа</h3>
      <div class="cart-summary-row"><span>Стоимость товаров</span><i></i><strong>${money(result.subtotal)}</strong></div>
      ${result.discount ? `<div class="cart-summary-row cart-summary-row--discount"><span>Скидка 3+1</span><i></i><strong>− ${money(result.discount)}</strong></div>` : ""}
      <div class="cart-order-total"><span>Итого</span><strong>${money(result.total)}</strong></div>
      <button class="cart-summary-checkout checkout-button" type="button">Оформить заказ · ${result.itemCount} шт.</button>
    </section>`;
  }

  const compactFooterObservers = new WeakMap();

  function setupCompactFooter(scroller, footer, result, formatMoney) {
    if (!scroller || !footer || !result) return;
    const money = typeof formatMoney === "function" ? formatMoney : (value) => `${value} ₽`;
    compactFooterObservers.get(footer)?.disconnect();
    footer.classList.remove("is-summary-visible");
    footer.hidden = false;
    footer.innerHTML = `<div class="cart-compact-values">
      ${result.discount ? `<span class="cart-compact-discount-group"><small>Скидка</small><strong class="cart-compact-discount">− ${money(result.discount)}</strong></span>` : ""}
      <span><small>Итого</small><strong class="cart-compact-total">${money(result.total)}</strong></span>
    </div><button class="checkout-button" type="button">Оформить заказ · ${result.itemCount} шт.</button>`;

    const summary = scroller.querySelector(".cart-order-summary");
    if (!summary || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(([entry]) => {
      footer.classList.toggle("is-summary-visible", entry.isIntersecting);
    }, { root: scroller, threshold: 0.12 });
    observer.observe(summary);
    compactFooterObservers.set(footer, observer);
  }

  window.FluidePromotions = Object.freeze({ CAMPAIGN, calculate, bannerMarkup, totalsMarkup, setupCompactFooter, isEligible });
})();
