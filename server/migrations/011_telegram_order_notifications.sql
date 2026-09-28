CREATE TABLE telegram_order_notifications (
  order_id UUID PRIMARY KEY REFERENCES commerce_orders(id) ON DELETE CASCADE,
  is_test BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  lease_token UUID,
  sent_at TIMESTAMPTZ,
  telegram_message_id BIGINT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX telegram_order_notifications_pending_idx
  ON telegram_order_notifications (next_attempt_at, created_at)
  WHERE sent_at IS NULL;
