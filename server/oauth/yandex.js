const AUTHORIZE_URL = "https://oauth.yandex.ru/authorize";
const TOKEN_URL = "https://oauth.yandex.ru/token";
const USER_INFO_URL = "https://login.yandex.ru/info?format=json";
const SCOPES = ["login:info", "login:email", "login:default_phone"];

export class YandexOAuthError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "YandexOAuthError";
    this.code = code;
  }
}

export function buildYandexAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function readJson(response, errorCode) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new YandexOAuthError(errorCode);
  }
  if (!response.ok) throw new YandexOAuthError(errorCode, body.error_description || body.error || errorCode);
  return body;
}

export async function fetchYandexProfile({ fetchImpl = globalThis.fetch, config, code, verifier }) {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const tokenResponse = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = await readJson(tokenResponse, "token_exchange_failed");
  if (typeof token.access_token !== "string" || !token.access_token) {
    throw new YandexOAuthError("token_exchange_failed");
  }

  const profileResponse = await fetchImpl(USER_INFO_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `OAuth ${token.access_token}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const profile = await readJson(profileResponse, "profile_request_failed");
  if (profile.client_id && profile.client_id !== config.clientId) {
    throw new YandexOAuthError("client_mismatch");
  }
  return normalizeYandexProfile(profile);
}

export function normalizeYandexProfile(profile) {
  const subject = String(profile.id || profile.uid || "").trim();
  if (!subject) throw new YandexOAuthError("profile_invalid");

  const phone = String(profile.default_phone?.number || profile.number || "").replace(/[^+\d]/g, "");
  const normalizedPhone = /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
  const email = String(profile.default_email || profile.email || "").trim().toLowerCase();
  const displayName = String(
    profile.real_name
      || profile.display_name
      || [profile.first_name, profile.last_name].filter(Boolean).join(" ")
      || profile.login
      || "",
  ).trim().slice(0, 120) || null;

  return {
    subject,
    displayName,
    email: email && email.length <= 320 ? email : null,
    phone: normalizedPhone,
    profile: {
      id: subject,
      login: String(profile.login || "").slice(0, 120) || null,
      displayName,
      email: email && email.length <= 320 ? email : null,
      phone: normalizedPhone,
    },
  };
}
