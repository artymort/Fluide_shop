import assert from "node:assert/strict";
import test from "node:test";
import { buildVkAuthorizeUrl, fetchVkProfile, normalizeVkProfile } from "../oauth/vk.js";

test("VK authorization URL uses state, PKCE, and only the email scope", () => {
  const url = new URL(buildVkAuthorizeUrl({
    clientId: "54774890",
    redirectUri: "https://example.test/api/auth/vk/callback",
    state: "state-value",
    challenge: "challenge-value",
  }));

  assert.equal(url.origin, "https://id.vk.ru");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "54774890");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.equal(url.searchParams.get("scope"), "email");
});

test("VK profile normalization keeps only required identity fields", () => {
  const profile = normalizeVkProfile({
    user_id: 42,
    first_name: "Иван",
    last_name: "Иванов",
    email: "USER@EXAMPLE.COM",
    phone: "+79990000000",
    birthday: "1980-01-01",
    avatar: "https://example.test/avatar.jpg",
  });

  assert.equal(profile.subject, "42");
  assert.equal(profile.displayName, "Иван Иванов");
  assert.equal(profile.email, "user@example.com");
  assert.equal("phone" in profile.profile, false);
  assert.equal("birthday" in profile.profile, false);
  assert.equal("avatar" in profile.profile, false);
});

test("VK token exchange uses PKCE and does not return OAuth tokens", async () => {
  const requests = [];
  const responses = [
    new Response(JSON.stringify({ access_token: "temporary-access-token", state: "state-value" }), { status: 200 }),
    new Response(JSON.stringify({
      user: {
        user_id: "42",
        first_name: "FLUIDE",
        last_name: "User",
        email: "user@example.com",
      },
    }), { status: 200 }),
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    return responses.shift();
  };

  const result = await fetchVkProfile({
    fetchImpl,
    config: {
      clientId: "54774890",
      redirectUri: "https://example.test/api/auth/vk/callback",
    },
    code: "authorization-code",
    deviceId: "device-id",
    verifier: "pkce-verifier",
    state: "state-value",
  });

  assert.equal(result.subject, "42");
  assert.equal(JSON.stringify(result).includes("temporary-access-token"), false);
  assert.equal(requests.length, 2);
  const tokenUrl = new URL(requests[0].url);
  assert.equal(tokenUrl.searchParams.get("code_verifier"), "pkce-verifier");
  assert.equal(tokenUrl.searchParams.get("device_id"), "device-id");
  assert.equal(requests[1].options.body.get("access_token"), "temporary-access-token");
});
