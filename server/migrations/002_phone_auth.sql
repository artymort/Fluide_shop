CREATE INDEX otp_challenges_active_phone_idx
  ON otp_challenges (phone_e164, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE UNIQUE INDEX auth_identities_user_provider_unique
  ON auth_identities (user_id, provider);

DROP INDEX users_email_active_unique;

CREATE INDEX users_email_active_idx
  ON users (lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;
