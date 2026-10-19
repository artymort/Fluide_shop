CREATE TABLE cdek_shipments (
  order_id UUID PRIMARY KEY REFERENCES commerce_orders(id) ON DELETE CASCADE,
  external_number TEXT NOT NULL UNIQUE,
  shipment_point TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'submitting', 'accepted', 'created', 'needs_review', 'failed')),
  cdek_uuid UUID,
  cdek_number TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cdek_shipments_pending_idx ON cdek_shipments (next_check_at, created_at)
  WHERE status IN ('queued', 'submitting', 'accepted');
