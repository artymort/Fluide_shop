ALTER TABLE users
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT,
  ADD COLUMN contact_phone_e164 TEXT,
  ADD COLUMN birth_date DATE,
  ADD COLUMN gender TEXT,
  ADD COLUMN avatar_url TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_first_name_length CHECK (first_name IS NULL OR length(first_name) <= 120),
  ADD CONSTRAINT users_last_name_length CHECK (last_name IS NULL OR length(last_name) <= 120),
  ADD CONSTRAINT users_contact_phone_format CHECK (
    contact_phone_e164 IS NULL OR contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  ),
  ADD CONSTRAINT users_gender_value CHECK (gender IS NULL OR gender IN ('male', 'female')),
  ADD CONSTRAINT users_avatar_url_length CHECK (avatar_url IS NULL OR length(avatar_url) <= 2048);

-- OAuth accounts deliberately remain separate from accounts created by SMS.
-- The provider phone is therefore a contact field and is not a login identity.
UPDATE users AS u
   SET contact_phone_e164 = candidate.phone
  FROM (
    SELECT DISTINCT ON (user_id)
           user_id,
           profile->>'phone' AS phone
      FROM auth_identities
     WHERE provider IN ('yandex', 'vk')
       AND profile->>'phone' ~ '^\+[1-9][0-9]{7,14}$'
     ORDER BY user_id, last_login_at DESC NULLS LAST, created_at DESC
  ) AS candidate
 WHERE candidate.user_id = u.id
   AND u.contact_phone_e164 IS NULL;
