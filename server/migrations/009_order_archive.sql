ALTER TABLE commerce_orders
  ADD COLUMN archived_at TIMESTAMPTZ;

ALTER TABLE commerce_orders
  ADD COLUMN archived_by UUID REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE INDEX commerce_orders_active_created_idx
  ON commerce_orders (created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX commerce_orders_archived_idx
  ON commerce_orders (archived_at DESC)
  WHERE archived_at IS NOT NULL;
