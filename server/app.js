import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createAuthRouter } from "./routes/auth.js";
import { createAdminRouter } from "./routes/admin.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createHealthRouter } from "./routes/health.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createOrdersRouter } from "./routes/orders.js";
import { createContentRouter } from "./routes/content.js";
import { createPaymentsRouter } from "./routes/payments.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function createApp({ pool, config }) {
  const app = express();
  const allowedOrigins = new Set(config.allowedOrigins);

  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(helmet());
  app.use(express.json({ limit: "32kb", strict: true }));

  app.use((request, response, next) => {
    if (SAFE_METHODS.has(request.method)) return next();
    const origin = request.get("origin");
    if (origin && !allowedOrigins.has(origin)) {
      response.status(403).json({ error: "origin_not_allowed" });
      return;
    }
    next();
  });

  app.use("/api", rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }));

  app.use("/api/health", createHealthRouter(pool));
  app.use("/api/analytics", createAnalyticsRouter(pool));
  app.use("/api/catalog", createCatalogRouter(pool));
  app.use("/api/content", createContentRouter(pool));
  app.use("/api/payments", createPaymentsRouter({ pool, config }));
  app.use("/api/orders", createOrdersRouter({ pool, config }));
  app.use("/api/auth", createAuthRouter({ pool, config }));
  app.use("/api/admin", createAdminRouter({ pool, config }));

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    response.status(500).json({ error: "internal_server_error" });
  });

  return app;
}
