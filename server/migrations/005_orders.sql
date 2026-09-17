CREATE TABLE commerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'confirmed', 'assembling', 'ready', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'cancelled')),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone_e164 TEXT,
  subtotal_minor BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor BIGINT NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  delivery_minor BIGINT NOT NULL DEFAULT 0 CHECK (delivery_minor >= 0),
  total_minor BIGINT NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  payment_provider TEXT,
  payment_transaction_id TEXT,
  delivery_method TEXT,
  delivery_address JSONB NOT NULL DEFAULT '{}'::JSONB,
  customer_comment TEXT,
  internal_comment TEXT,
  paid_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(order_number) BETWEEN 1 AND 64),
  CHECK (length(customer_name) BETWEEN 1 AND 240),
  CHECK (customer_email IS NULL OR length(customer_email) <= 320),
  CHECK (customer_phone_e164 IS NULL OR customer_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  CHECK (discount_minor <= subtotal_minor),
  CHECK (total_minor = subtotal_minor - discount_minor + delivery_minor)
);

CREATE INDEX commerce_orders_created_idx ON commerce_orders (created_at DESC);
CREATE INDEX commerce_orders_status_idx ON commerce_orders (status, created_at DESC);
CREATE INDEX commerce_orders_payment_status_idx ON commerce_orders (payment_status, created_at DESC);
CREATE INDEX commerce_orders_user_idx ON commerce_orders (user_id, created_at DESC);

CREATE TRIGGER commerce_orders_set_updated_at
BEFORE UPDATE ON commerce_orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE commerce_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES catalog_products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES catalog_variants(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT,
  sku TEXT NOT NULL,
  image_url TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor >= 0),
  total_price_minor BIGINT NOT NULL CHECK (total_price_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (total_price_minor = unit_price_minor * quantity)
);

CREATE INDEX commerce_order_items_order_idx ON commerce_order_items (order_id, created_at, id);

CREATE TABLE commerce_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('payment', 'refund')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  provider TEXT NOT NULL,
  provider_transaction_id TEXT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_transaction_id)
);

CREATE INDEX commerce_payments_order_idx ON commerce_payments (order_id, created_at DESC);

CREATE TRIGGER commerce_payments_set_updated_at
BEFORE UPDATE ON commerce_payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE commerce_order_status_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES commerce_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('new', 'confirmed', 'assembling', 'ready', 'shipped', 'delivered', 'cancelled', 'refunded')),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX commerce_order_status_history_order_idx
  ON commerce_order_status_history (order_id, created_at DESC);
