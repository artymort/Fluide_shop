const AUTHORIZE_URL = "https://id.vk.ru/authorize";
const TOKEN_URL = "https://id.vk.ru/oauth2/auth";
const USER_INFO_URL = "https://id.vk.ru/oauth2/user_info";

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
  const displayName = [profile.first_name, profile.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 120) || null;

  return {
    subject,
    displayName,
    email: email && email.length <= 320 ? email : null,
    profile: {
      id: subject,
      displayName,
      email: email && email.length <= 320 ? email : null,
    },
  };
}
