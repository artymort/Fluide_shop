const AUTHORIZE_URL = "https://id.vk.ru/authorize";
const TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";

const cleanText = (value, max = 120) => String(value || "").trim().slice(0, max) || null;

const normalizePhone = (value) => {
  const phone = String(value || "").replace(/[^+\d]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
};

const normalizeBirthDate = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.includes("0000") || text.includes("-00")) return null;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
};

const normalizeGender = (value) => {
  if (value === 1 || String(value).toLowerCase() === "female") return "female";
  if (value === 2 || String(value).toLowerCase() === "male") return "male";
  return null;
};

const normalizeAvatar = (profile) => {
  const value = String(profile.avatar || profile.avatar_200 || profile.photo_200 || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value.slice(0, 2048) : null;
  } catch {
    return null;
  }
};

export class VkOAuthError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "VkOAuthError";
    this.code = code;
  }
}

export function buildVkAuthorizeUrl({ clientId, redirectUri, state, challenge }) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    app_id: clientId,
    redirect_uri: redirectUri,
    scope: "email",
    state,
    code_challenge: challenge,
    code_challenge_method: "s256",
  }).toString();
  return url.toString();
}

async function readJson(response, errorCode) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new VkOAuthError(errorCode);
  }
  if (!response.ok || body?.error) {
    throw new VkOAuthError(errorCode, body?.error_description || body?.error || errorCode);
  }
  return body;
}

export async function fetchVkProfile({
  fetchImpl = globalThis.fetch,
  config,
  code,
  deviceId,
  verifier,
  state,
}) {
  const tokenUrl = new URL(TOKEN_URL);
  tokenUrl.search = new URLSearchParams({
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
    state,
    device_id: deviceId,
  }).toString();
  const tokenResponse = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ code }),
    signal: AbortSignal.timeout(10_000),
  });
  const token = await readJson(tokenResponse, "vk_token_exchange_failed");
  if (typeof token.access_token !== "string" || !token.access_token || token.state !== state) {
    throw new VkOAuthError("vk_token_exchange_failed");
  }

  const profileUrl = new URL(USER_INFO_URL);
  profileUrl.searchParams.set("client_id", config.clientId);
  const profileResponse = await fetchImpl(profileUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ access_token: token.access_token }),
    signal: AbortSignal.timeout(10_000),
  });
  const profile = await readJson(profileResponse, "vk_profile_request_failed");
  return normalizeVkProfile(profile.user);
}

export function normalizeVkProfile(profile) {
  const subject = String(profile?.user_id || "").trim();
  if (!subject) throw new VkOAuthError("vk_profile_invalid");

  const email = String(profile.email || "").trim().toLowerCase();
  const firstName = cleanText(profile.first_name);
  const lastName = cleanText(profile.last_name);
  const displayName = [firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .slice(0, 120) || null;
  const phone = normalizePhone(profile.phone);
  const birthDate = normalizeBirthDate(profile.birthday || profile.birth_date);
  const gender = normalizeGender(profile.sex ?? profile.gender);
  const avatarUrl = normalizeAvatar(profile);

  return {
    subject,
    displayName,
    firstName,
    lastName,
    email: email && email.length <= 320 ? email : null,
    phone,
    birthDate,
    gender,
    avatarUrl,
    profile: {
      id: subject,
      displayName,
      firstName,
      lastName,
      email: email && email.length <= 320 ? email : null,
      phone,
      birthDate,
      gender,
      avatarUrl,
    },
  };
}
