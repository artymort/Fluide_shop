import assert from "node:assert/strict";
import test from "node:test";
import { buildYandexAuthorizeUrl, fetchYandexProfile, normalizeYandexProfile } from "../oauth/yandex.js";

test("Yandex authorization URL uses state and PKCE", () => {
  const url = new URL(buildYandexAuthorizeUrl({
    clientId: "client-id",
    redirectUri: "https://example.test/api/auth/yandex/callback",
    state: "state-value",
    challenge: "challenge-value",
  }));

  assert.equal(url.origin, "https://oauth.yandex.ru");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("scope"), /login:default_phone/);
});

test("Yandex profile normalization keeps permitted customer fields", () => {
  const profile = normalizeYandexProfile({
    id: 12345,
    login: "user-login",
    real_name: "Иван Иванов",
    default_email: "USER@EXAMPLE.COM",
    default_phone: { id: 999, number: "+7 999 000-00-00" },
    birthday: "1980-01-01",
    first_name: "Иван",
    last_name: "Иванов",
    sex: "male",
    default_avatar_id: "123/avatar",
    is_avatar_empty: false,
  });

  assert.equal(profile.subject, "12345");
  assert.equal(profile.displayName, "Иван Иванов");
  assert.equal(profile.email, "user@example.com");
  assert.equal(profile.phone, "+79990000000");
  assert.equal(profile.firstName, "Иван");
  assert.equal(profile.lastName, "Иванов");
  assert.equal(profile.birthDate, "1980-01-01");
  assert.equal(profile.gender, "male");
  assert.equal(profile.avatarUrl, "https://avatars.yandex.net/get-yapic/123/avatar/islands-200");
  assert.equal(profile.profile.phone, "+79990000000");
});

test("Yandex token exchange does not persist or return OAuth tokens", async () => {
  const requests = [];
  const responses = [
    new Response(JSON.stringify({ access_token: "temporary-access-token" }), { status: 200 }),
    new Response(JSON.stringify({
      id: "42",
      client_id: "client-id",
      display_name: "FLUIDE User",
      default_phone: { number: "+79990000000" },
    }), { status: 200 }),
  ];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return responses.shift();
  };

  const result = await fetchYandexProfile({
    fetchImpl,
    config: { clientId: "client-id", clientSecret: "client-secret" },
    code: "authorization-code",
    verifier: "pkce-verifier",
  });

  assert.equal(result.subject, "42");
  assert.equal(result.phone, "+79990000000");
  assert.equal(JSON.stringify(result).includes("temporary-access-token"), false);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.headers.Authorization, "OAuth temporary-access-token");
});
