const readString = (name, fallback = "") => {
  const value = process.env[name]?.trim();
  return value || fallback;
};

const readInteger = (name, fallback, { min = 1, max = 65535 } = {}) => {
  const raw = readString(name, String(fallback));
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const required = (name) => {
  const value = readString(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

export function loadConfig() {
  const nodeEnv = readString("NODE_ENV", "development");
  const sessionSecret = required("SESSION_SECRET");

  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === "production",
    host: readString("HOST", "127.0.0.1"),
    port: readInteger("PORT", 3000),
    database: Object.freeze({
      host: readString("PGHOST", "127.0.0.1"),
      port: readInteger("PGPORT", 5432),
      database: required("PGDATABASE"),
      user: required("PGUSER"),
      password: required("PGPASSWORD"),
      max: readInteger("PGPOOL_MAX", 10, { min: 1, max: 50 }),
    }),
    session: Object.freeze({
      secret: sessionSecret,
      cookieName: "__Host-fluide_session",
      ttlDays: readInteger("SESSION_TTL_DAYS", 30, { min: 1, max: 365 }),
    }),
    allowedOrigins: Object.freeze([
      "https://fluide-atelier.ru",
      "https://www.fluide-atelier.ru",
      ...(nodeEnv === "production" ? [] : ["http://127.0.0.1:8765", "http://localhost:8765"]),
    ]),
  });
}
