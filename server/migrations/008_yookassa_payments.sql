ALTER TABLE commerce_orders
  ADD COLUMN checkout_token_hash TEXT;

ALTER TABLE commerce_orders
  ADD CONSTRAINT commerce_orders_checkout_token_hash_format
  CHECK (checkout_token_hash IS NULL OR checkout_token_hash ~ '^[a-f0-9]{64}$');
