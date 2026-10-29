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
  const { scripts } = runAnalytics({ consent: true, hostname: "localhost" });
  assert.equal(scripts.length, 0);
});
