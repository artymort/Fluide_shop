import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../analytics.js", import.meta.url), "utf8");

function runAnalytics({ consent, hostname }) {
  const scripts = [];
  const events = [];
  const firstScript = {
    src: "/analytics.js",
    parentNode: { insertBefore(script) { scripts.push(script); } },
  };
  const document = {
    scripts: [firstScript],
    referrer: "",
    title: "FLUIDE Atelier",
    addEventListener() {},
    createElement() { return {}; },
    getElementsByTagName() { return [firstScript]; },
  };
  const storage = new Map(consent ? [["fluide-cookie-consent", "accepted"]] : []);
  const localStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  };
  const window = {};
  runInNewContext(source, {
    window, document, localStorage, sessionStorage: localStorage,
    location: { hostname, pathname: "/", search: "", href: `https://${hostname}/` },
    crypto: { randomUUID: () => "test-id" },
    fetch: (...args) => { events.push(args); return Promise.resolve(); },
    URL, URLSearchParams, Date,
  });
  return { scripts, events, window };
}

test("Yandex Metrika loads on the production storefront without waiting for the cookie button", () => {
  const { scripts, events, window } = runAnalytics({ consent: false, hostname: "fluide-atelier.ru" });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "https://mc.yandex.ru/metrika/tag.js?id=113817251");
  assert.equal(window.ym.a.length, 1);
  assert.equal(window.ym.a[0][0], 113817251);
  assert.equal(window.ym.a[0][1], "init");
  assert.equal(events.length, 0, "internal analytics still waits for consent");
});

test("Yandex Metrika does not count local previews", () => {
  const { scripts, window } = runAnalytics({ consent: true, hostname: "localhost" });
  assert.equal(scripts.length, 0);
  window.FluideEcommerce.productViewed({ id: "fragrance-001-30", name: "FLUIDE 1", price: 3490 });
  assert.equal(window.dataLayer, undefined);
});

test("storefront sends product views and cart quantity changes to the Metrika data layer", () => {
  const { window } = runAnalytics({ consent: false, hostname: "fluide-atelier.ru" });
  const product = { name: "FLUIDE 1 Amber Wood", price: 3490, category: "Парфюм" };
  const row = (quantity) => ({ id: "fragrance-001-30", quantity, product });
  window.FluideEcommerce.productViewed({ id: row(1).id, ...product });
  window.FluideEcommerce.cartUpdated([row(2)]);
  window.FluideEcommerce.cartUpdated([row(1)]);
  assert.equal(window.dataLayer.length, 3);
  assert.equal(window.dataLayer[0].ecommerce.detail.products[0].id, row(1).id);
  assert.equal(window.dataLayer[1].ecommerce.add.products[0].quantity, 2);
  assert.equal(window.dataLayer[2].ecommerce.remove.products[0].quantity, 1);
  assert.equal(window.dataLayer[1].ecommerce.currencyCode, "RUB");
});

test("confirmed order creates one purchase with server total and no customer data", () => {
  const { window } = runAnalytics({ consent: false, hostname: "fluide-atelier.ru" });
  const order = {
    orderNumber: "FL-123",
    valueMinor: 399000,
    checkoutToken: "private-token",
    cart: [{ id: "fragrance-001-30", quantity: 1, product: { name: "FLUIDE 1", price: 3490 } }],
  };
  window.FluideEcommerce.purchase(order);
  window.FluideEcommerce.purchase(order);
  assert.equal(window.dataLayer.length, 1);
  assert.equal(window.dataLayer[0].ecommerce.purchase.actionField.revenue, 3990);
  assert.equal(window.dataLayer[0].ecommerce.purchase.actionField.id, "FL-123");
  assert.equal(JSON.stringify(window.dataLayer).includes("private-token"), false);
});
