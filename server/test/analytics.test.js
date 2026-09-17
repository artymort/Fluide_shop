import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import { createAnalyticsRouter } from "../routes/analytics.js";

async function withAnalyticsServer(run) {
  const queries = [];
  const pool = { query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } };
  const app = express();
  app.use(express.json());
  app.use("/api/analytics", createAnalyticsRouter(pool));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`, queries);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("analytics accepts consented pseudonymous events without raw IP fields", async () => {
  await withAnalyticsServer(async (root, queries) => {
    const response = await fetch(`${root}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: true,
        eventName: "page_view",
        visitorId: randomUUID(),
        sessionId: randomUUID(),
        path: "/catalog.html",
        referrerHost: "yandex.ru",
        metadata: {},
      }),
    });
    assert.equal(response.status, 204);
    assert.equal(queries.length, 1);
    assert.doesNotMatch(queries[0].sql, /ip_address/i);
  });
});

test("analytics rejects events without explicit consent", async () => {
  await withAnalyticsServer(async (root, queries) => {
    const response = await fetch(`${root}/api/analytics/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: false,
        eventName: "page_view",
        visitorId: randomUUID(),
        sessionId: randomUUID(),
        path: "/",
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(queries.length, 0);
  });
});
