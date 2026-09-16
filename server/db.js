import pg from "pg";

const { Pool } = pg;

export function createPool(databaseConfig) {
  const pool = new Pool({
    ...databaseConfig,
    application_name: "fluide-api",
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });

  return pool;
}
