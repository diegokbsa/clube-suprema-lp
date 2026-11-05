CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  tags TEXT NOT NULL DEFAULT '[]',
  author TEXT NOT NULL,
  cover_url TEXT,
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'revisao', 'agendado', 'publicado')),
  scheduled_at TEXT,
  published_at TEXT,
  published_slug TEXT,
  published_data TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, slug),
  UNIQUE (site_id, published_slug)
);
CREATE INDEX IF NOT EXISTS posts_tenant_site ON posts (tenant_id, site_id, status);
CREATE INDEX IF NOT EXISTS posts_schedule ON posts (status, scheduled_at);
