CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor'
    CHECK (role IN ('owner', 'admin', 'editor', 'orders', 'analyst')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (email = lower(email)),
  CHECK (length(email) <= 320),
  CHECK (length(display_name) BETWEEN 1 AND 120)
);

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX admin_sessions_user_idx ON admin_sessions (admin_user_id);
CREATE INDEX admin_sessions_active_expiry_idx
  ON admin_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id TEXT UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'product'
    CHECK (kind IN ('product', 'fragrance')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  name TEXT NOT NULL,
  product_type TEXT NOT NULL,
  type_label TEXT,
  brand TEXT NOT NULL DEFAULT 'FLUIDE Atelier',
  short_description TEXT,
  description TEXT,
  fulfillment_mode TEXT NOT NULL DEFAULT 'made_to_order'
    CHECK (fulfillment_mode IN ('made_to_order', 'stocked', 'unavailable')),
  lead_time_days SMALLINT NOT NULL DEFAULT 1
    CHECK (lead_time_days BETWEEN 0 AND 365),
  attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  seo_title TEXT,
  seo_description TEXT,
  canonical_url TEXT,
  noindex BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(name) BETWEEN 1 AND 240),
  CHECK (length(sku) BETWEEN 1 AND 100),
  CHECK (length(slug) BETWEEN 1 AND 180)
);

CREATE INDEX catalog_products_status_idx ON catalog_products (status, updated_at DESC);
CREATE INDEX catalog_products_type_idx ON catalog_products (product_type, status);
CREATE INDEX catalog_products_name_search_idx ON catalog_products (lower(name));

CREATE TRIGGER catalog_products_set_updated_at
BEFORE UPDATE ON catalog_products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE catalog_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT,
  volume_ml INTEGER CHECK (volume_ml IS NULL OR volume_ml > 0),
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  compare_at_price_minor BIGINT CHECK (
    compare_at_price_minor IS NULL OR compare_at_price_minor >= price_minor
  ),
  currency CHAR(3) NOT NULL DEFAULT 'RUB',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX catalog_variants_product_idx
  ON catalog_variants (product_id, active, sort_order, id);

CREATE TRIGGER catalog_variants_set_updated_at
BEFORE UPDATE ON catalog_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE catalog_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES catalog_products(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'image'
    CHECK (media_type IN ('image', 'video')),
  url TEXT NOT NULL,
  alt_text TEXT NOT NULL DEFAULT '',
  original_name TEXT,
  mime_type TEXT,
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX catalog_media_product_idx ON catalog_media (product_id, sort_order, id);
CREATE UNIQUE INDEX catalog_media_product_url_unique
  ON catalog_media (product_id, url)
  WHERE product_id IS NOT NULL;

CREATE TABLE catalog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES catalog_categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published', 'archived')),
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER catalog_categories_set_updated_at
BEFORE UPDATE ON catalog_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE catalog_product_categories (
  product_id UUID NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE TABLE integration_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  external_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'error', 'disabled')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, entity_type, entity_id),
  UNIQUE (provider, entity_type, external_id)
);

CREATE TRIGGER integration_links_set_updated_at
BEFORE UPDATE ON integration_links
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE catalog_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'completed', 'failed')),
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  report JSONB NOT NULL DEFAULT '{}'::JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_entity_idx
  ON admin_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX admin_audit_user_idx
  ON admin_audit_log (admin_user_id, created_at DESC);
