CREATE TABLE russian_post_shipments (
  order_id UUID PRIMARY KEY REFERENCES commerce_orders(id) ON DELETE CASCADE,
  external_number TEXT NOT NULL UNIQUE,
  shipping_point TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'submitting', 'awaiting_barcode', 'created', 'needs_review', 'failed')),
  post_order_id BIGINT,
  barcode TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX russian_post_shipments_pending_idx ON russian_post_shipments (next_check_at, created_at)
  WHERE status IN ('queued', 'submitting', 'awaiting_barcode');
