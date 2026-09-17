CREATE TABLE analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name TEXT NOT NULL
    CHECK (event_name IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'purchase')),
  visitor_id UUID NOT NULL,
  session_id UUID NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT,
  product_key TEXT,
  value_minor BIGINT CHECK (value_minor IS NULL OR value_minor >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(path) BETWEEN 1 AND 500),
  CHECK (referrer_host IS NULL OR length(referrer_host) <= 255),
  CHECK (product_key IS NULL OR length(product_key) <= 180)
);

CREATE INDEX analytics_events_occurred_idx ON analytics_events (occurred_at DESC);
CREATE INDEX analytics_events_name_occurred_idx ON analytics_events (event_name, occurred_at DESC);
CREATE INDEX analytics_events_visitor_idx ON analytics_events (visitor_id, occurred_at DESC);
CREATE INDEX analytics_events_product_idx ON analytics_events (product_key, occurred_at DESC)
  WHERE product_key IS NOT NULL;
