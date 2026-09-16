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
  const yandexClientId = readString("YANDEX_CLIENT_ID");
  const yandexClientSecret = readString("YANDEX_CLIENT_SECRET");
  const vkClientId = readString("VK_CLIENT_ID");
  const smsProvider = readString("SMS_PROVIDER", nodeEnv === "production" ? "disabled" : "console").toLowerCase();
  const smsRuApiKey = readString("SMS_RU_API_KEY");

  if (sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  if (Boolean(yandexClientId) !== Boolean(yandexClientSecret)) {
    throw new Error("YANDEX_CLIENT_ID and YANDEX_CLIENT_SECRET must be set together");
  }
  if (vkClientId && !/^\d+$/.test(vkClientId)) {
    throw new Error("VK_CLIENT_ID must contain only digits");
  }
  if (!["disabled", "console", "smsru"].includes(smsProvider)) {
    throw new Error("SMS_PROVIDER must be disabled, console, or smsru");
  }
  if (nodeEnv === "production" && smsProvider === "console") {
    throw new Error("SMS_PROVIDER=console is forbidden in production");
  }
  if (smsProvider === "smsru" && !smsRuApiKey) {
    throw new Error("SMS_RU_API_KEY is required when SMS_PROVIDER=smsru");
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
      cookieName: nodeEnv === "production" ? "__Host-fluide_session" : "fluide_session",
      ttlDays: readInteger("SESSION_TTL_DAYS", 30, { min: 1, max: 365 }),
    }),
    yandex: Object.freeze({
      enabled: Boolean(yandexClientId && yandexClientSecret),
      clientId: yandexClientId,
      clientSecret: yandexClientSecret,
      redirectUri: readString(
        "YANDEX_REDIRECT_URI",
        nodeEnv === "production"
          ? "https://fluide-atelier.ru/api/auth/yandex/callback"
          : "http://127.0.0.1:3000/api/auth/yandex/callback",
      ),
    }),
    vk: Object.freeze({
      enabled: Boolean(vkClientId),
      clientId: vkClientId,
      redirectUri: readString(
        "VK_REDIRECT_URI",
        nodeEnv === "production"
          ? "https://fluide-atelier.ru/api/auth/vk/callback"
          : "http://127.0.0.1:3000/api/auth/vk/callback",
      ),
    }),
    sms: Object.freeze({
      enabled: smsProvider === "console" || (smsProvider === "smsru" && Boolean(smsRuApiKey)),
      provider: smsProvider,
      apiKey: smsRuApiKey,
      sender: readString("SMS_SENDER"),
      codeTtlMinutes: readInteger("SMS_CODE_TTL_MINUTES", 10, { min: 2, max: 30 }),
      maxAttempts: readInteger("SMS_CODE_MAX_ATTEMPTS", 5, { min: 3, max: 10 }),
      resendSeconds: readInteger("SMS_RESEND_SECONDS", 60, { min: 30, max: 600 }),
      dailyPerPhone: readInteger("SMS_DAILY_PER_PHONE", 5, { min: 1, max: 20 }),
      dailyPerIp: readInteger("SMS_DAILY_PER_IP", 30, { min: 5, max: 200 }),
      dailyGlobal: readInteger("SMS_DAILY_GLOBAL", 100, { min: 10, max: 10000 }),
    }),
    allowedOrigins: Object.freeze([
      "https://fluide-atelier.ru",
      "https://www.fluide-atelier.ru",
      ...(nodeEnv === "production" ? [] : ["http://127.0.0.1:8765", "http://localhost:8765"]),
    ]),
  });
}
