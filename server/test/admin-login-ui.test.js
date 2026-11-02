import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

test("CMS loads the dashboard after the browser clears the submit event target", async () => {
  const source = readFileSync(new URL("../../admin/app.js", import.meta.url), "utf8");
  const start = source.indexOf('elements["login-form"].addEventListener("submit", async (event) => {');
  const end = source.indexOf('\nelements["logout-button"]', start);
  assert.ok(start >= 0 && end > start);

  let submit;
  let reset = false;
  let shown = false;
  let openedSection = "";
  const form = { reset() { reset = true; } };
  const event = { currentTarget: form, preventDefault() {} };
  const elements = {
    "login-form": { addEventListener(_type, listener) { submit = listener; } },
    "login-message": { textContent: "" },
  };
  class FakeFormData {
    constructor(target) { assert.equal(target, form); }
    get(key) { return key === "email" ? "owner@example.test" : "test-password"; }
  }
  runInNewContext(source.slice(start, end), {
    elements,
    FormData: FakeFormData,
    api: async () => {
      event.currentTarget = null;
      return { admin: { displayName: "Owner" } };
    },
    showCms: () => { shown = true; },
    switchSection: async (section) => { openedSection = section; },
    location: { hash: "#dashboard" },
    console,
  });

  await submit(event);
  assert.equal(shown, true);
  assert.equal(reset, true);
  assert.equal(openedSection, "dashboard");
});
