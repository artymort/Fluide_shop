CREATE TABLE content_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  draft_content JSONB NOT NULL DEFAULT '{}'::JSONB,
  published_content JSONB,
  updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,99}$')
);

CREATE TRIGGER content_pages_set_updated_at
BEFORE UPDATE ON content_pages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO content_pages (slug) VALUES ('home')
ON CONFLICT (slug) DO NOTHING;
