import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { startTelegramOrderWorker } from "./telegram/orders.js";
import { startCdekShipmentWorker } from "./delivery/cdek-shipments.js";
import { startRussianPostShipmentWorker } from "./delivery/russian-post-shipments.js";

const config = loadConfig();
const pool = createPool(config.database);
const app = createApp({ pool, config });
const stopTelegramOrderWorker = startTelegramOrderWorker(pool, config.telegramOrders);
const stopCdekShipmentWorker = startCdekShipmentWorker(pool, config.cdek);
const stopRussianPostShipmentWorker = startRussianPostShipmentWorker(pool, config.russianPost);

const server = app.listen(config.port, config.host, () => {
  console.log(`FLUIDE API listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  stopTelegramOrderWorker();
  stopCdekShipmentWorker();
  stopRussianPostShipmentWorker();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
