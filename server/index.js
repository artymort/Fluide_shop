import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { startTelegramOrderWorker } from "./telegram/orders.js";

const config = loadConfig();
const pool = createPool(config.database);
const app = createApp({ pool, config });
const stopTelegramOrderWorker = startTelegramOrderWorker(pool, config.telegramOrders);

const server = app.listen(config.port, config.host, () => {
  console.log(`FLUIDE API listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopTelegramOrderWorker();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
