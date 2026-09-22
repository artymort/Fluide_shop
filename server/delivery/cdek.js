import { createHmac, timingSafeEqual } from "node:crypto";

const CURRENCY = "RUB";
const QUOTE_TTL_SECONDS = 15 * 60;
const MAX_DELIVERY_MINOR = 500_000;
const OFFICE_TO_DOOR = 3;
const OFFICE_TO_OFFICE = 4;

export class CdekError extends Error {
  constructor(code, status = 502, details = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const cleanText = (value, maximum = 300) => String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum);

const encode = (value) => Buffer.from(value).toString("base64url");
const decode = (value) => Buffer.from(value, "base64url").toString("utf8");

const signatureFor = (payload, secret) => createHmac("sha256", secret).update(payload).digest();

export function signCdekQuote(payload, secret, now = Date.now()) {
  const body = encode(JSON.stringify({
    version: 1,
    provider: "cdek",
    expiresAt: Math.floor(now / 1000) + QUOTE_TTL_SECONDS,
    ...payload,
  }));
  return `${body}.${signatureFor(body, secret).toString("base64url")}`;
}

export function verifyCdekQuote(token, secret, now = Date.now()) {
  const [body, encodedSignature, extra] = String(token || "").split(".");
  if (!body || !encodedSignature || extra) throw new CdekError("delivery_quote_invalid", 409);

  let actualSignature;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new CdekError("delivery_quote_invalid", 409);
  }
  const expectedSignature = signatureFor(body, secret);
  if (actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new CdekError("delivery_quote_invalid", 409);
  }

  let payload;
  try {
    payload = JSON.parse(decode(body));
  } catch {
    throw new CdekError("delivery_quote_invalid", 409);
  }
  if (payload?.version !== 1 || payload?.provider !== "cdek") {
    throw new CdekError("delivery_quote_invalid", 409);
  }
  if (!Number.isInteger(payload.expiresAt) || payload.expiresAt < Math.floor(now / 1000)) {
    throw new CdekError("delivery_quote_expired", 409);
  }
  if (!Number.isSafeInteger(payload.deliveryMinor)
    || payload.deliveryMinor < 0
    || payload.deliveryMinor > MAX_DELIVERY_MINOR
    || payload.currency !== CURRENCY
    || !["pvz", "door"].includes(payload.mode)
    || !cleanText(payload.city, 120)
    || !/^\d{6}$/.test(String(payload.postalCode || ""))
    || !cleanText(payload.address, 300)
    || !Number.isInteger(payload.tariffCode)
    || (payload.mode === "pvz" && !cleanText(payload.pointCode, 40))) {
    throw new CdekError("delivery_quote_invalid", 409);
  }
  return payload;
}

const tariffAmountMinor = (tariff) => {
  const amount = Number(tariff?.total_sum ?? tariff?.delivery_sum);
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) && minor >= 0 && minor <= MAX_DELIVERY_MINOR ? minor : null;
};

export function selectCdekTariff(tariffs, mode) {
  const deliveryModes = mode === "pvz"
    ? new Set([OFFICE_TO_OFFICE])
    : new Set([OFFICE_TO_DOOR]);
  const candidates = (Array.isArray(tariffs) ? tariffs : [])
    .map((tariff) => ({ ...tariff, deliveryMinor: tariffAmountMinor(tariff) }))
    .filter((tariff) => deliveryModes.has(Number(tariff.delivery_mode)) && tariff.deliveryMinor !== null)
    .sort((left, right) => left.deliveryMinor - right.deliveryMinor
      || Number(left.period_max || 999) - Number(right.period_max || 999));
  return candidates[0] || null;
}

export function normalizeCdekPoint(point) {
  const code = cleanText(point?.code, 40);
  const location = point?.location && typeof point.location === "object" ? point.location : {};
  const address = cleanText(location.address || point?.address, 300);
  if (!code || !address) return null;
  return {
    code,
    name: cleanText(point?.name || code, 160),
    type: point?.type === "POSTAMAT" ? "postamat" : "pvz",
    address,
    workTime: cleanText(point?.work_time, 200),
    latitude: Number.isFinite(Number(location.latitude)) ? Number(location.latitude) : null,
    longitude: Number.isFinite(Number(location.longitude)) ? Number(location.longitude) : null,
  };
}

const providerErrorDetails = (response, body) => ({
  status: response.status,
  code: cleanText(body?.code || body?.errors?.[0]?.code, 80) || null,
  message: cleanText(body?.message || body?.errors?.[0]?.message, 160) || null,
});

export function createCdekClient(config, { fetchImpl = globalThis.fetch } = {}) {
  let accessToken = null;
  let accessTokenExpiresAt = 0;
  let originPromise = null;

  async function authorize() {
    if (accessToken && accessTokenExpiresAt > Date.now() + 60_000) return accessToken;
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.account,
      client_secret: config.securePassword,
    });
    let response;
    try {
      response = await fetchImpl(`${config.apiBase}/oauth/token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new CdekError("cdek_provider_unavailable", 503, error?.name || "network_error");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      throw new CdekError("cdek_authorization_failed", 502, providerErrorDetails(response, payload));
    }
    accessToken = payload.access_token;
    accessTokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
    return accessToken;
  }

  async function request(path, { method = "GET", query = null, body = null } = {}) {
    const url = new URL(`${config.apiBase}/${path.replace(/^\/+/, "")}`);
    Object.entries(query || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${await authorize()}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      if (error instanceof CdekError) throw error;
      throw new CdekError("cdek_provider_unavailable", 503, error?.name || "network_error");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new CdekError("cdek_provider_rejected", 502, providerErrorDetails(response, payload));
    }
    return payload;
  }

  async function findCity({ city, postalCode }) {
    const cities = await request("location/cities", {
      query: {
        country_codes: "RU",
        ...(postalCode ? { postal_code: postalCode } : { city, size: 20 }),
      },
    });
    const normalizedCity = cleanText(city, 120).toLocaleLowerCase("ru-RU");
    const matches = (Array.isArray(cities) ? cities : []).filter((candidate) => {
      const candidateName = cleanText(candidate?.city, 120).toLocaleLowerCase("ru-RU");
      return !normalizedCity || candidateName === normalizedCity;
    });
    const selected = matches[0] || (Array.isArray(cities) ? cities[0] : null);
    if (!selected?.code) throw new CdekError("cdek_city_not_found", 404);
    return {
      code: Number(selected.code),
      city: cleanText(selected.city || city, 120),
      region: cleanText(selected.region, 160),
      postalCode: cleanText(postalCode, 20),
    };
  }

  async function quote({ destination, mode }) {
    if (!originPromise) {
      originPromise = findCity({ city: config.fromCity, postalCode: "" })
        .catch((error) => {
          originPromise = null;
          throw error;
        });
    }
    const origin = await originPromise;
    const payload = await request("calculator/tarifflist", {
      method: "POST",
      body: {
        type: 1,
        currency: 1,
        lang: "rus",
        from_location: { code: origin.code },
        to_location: { code: destination.code },
        packages: [{
          weight: config.package.weightGrams,
          length: config.package.lengthCm,
          width: config.package.widthCm,
          height: config.package.heightCm,
        }],
      },
    });
    const tariff = selectCdekTariff(payload?.tariff_codes, mode);
    if (!tariff) throw new CdekError("cdek_tariff_unavailable", 422);
    return tariff;
  }

  async function pickupPoints(cityCode) {
    const points = await request("deliverypoints", {
      query: { city_code: cityCode, is_handout: true },
    });
    return (Array.isArray(points) ? points : [])
      .map(normalizeCdekPoint)
      .filter(Boolean)
      .filter((point) => point.type === "pvz")
      .sort((left, right) => left.address.localeCompare(right.address, "ru"))
      .slice(0, 200);
  }

  return Object.freeze({ findCity, quote, pickupPoints });
}

export function quotePayload({ destination, tariff, mode, address, point = null }) {
  return {
    mode,
    city: destination.city,
    cityCode: destination.code,
    region: destination.region || null,
    postalCode: destination.postalCode,
    address: cleanText(point?.address || address, 300),
    pointCode: point?.code || null,
    pointName: point?.name || null,
    pointType: point?.type || null,
    tariffCode: Number(tariff.tariff_code),
    tariffName: cleanText(tariff.tariff_name, 160),
    deliveryMode: Number(tariff.delivery_mode),
    deliveryMinor: tariff.deliveryMinor,
    currency: CURRENCY,
    periodMin: Number(tariff.period_min) || null,
    periodMax: Number(tariff.period_max) || null,
    shipmentCreation: false,
  };
}
