-- Núcleo do portal. Toda tabela de dados de operação tem tenant_id NOT NULL e só é lida pelo repositório com escopo (lib/repo.mjs).
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  number TEXT,
  niche_id TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  modules TEXT NOT NULL DEFAULT '[]',
  limits TEXT NOT NULL DEFAULT '{}',
  webhook_secret TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  is_super INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (user_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  template_id TEXT,
  template_version INTEGER,
  domain TEXT UNIQUE,
  theme TEXT NOT NULL DEFAULT '{}',
  seo TEXT NOT NULL DEFAULT '{}',
  tracking TEXT NOT NULL DEFAULT '{}',
  external_url TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sites_tenant ON sites (tenant_id);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  seo TEXT NOT NULL DEFAULT '{}',
  draft TEXT NOT NULL DEFAULT '[]',
  published TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS pages_tenant ON pages (tenant_id);

CREATE TABLE IF NOT EXISTS page_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  blocks TEXT NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS page_versions_page ON page_versions (page_id);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  page_slug TEXT,
  email TEXT,
  name TEXT,
  phone TEXT,
  utm TEXT NOT NULL DEFAULT '{}',
  click_id TEXT,
  affiliate_id TEXT,
  stage TEXT NOT NULL DEFAULT 'novo',
  owner_id TEXT,
  consent INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_tenant ON leads (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS lead_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  by_user TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS affiliates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS clicks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  affiliate_id TEXT NOT NULL,
  site_id TEXT,
  landing TEXT,
  utm TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value_cents INTEGER NOT NULL DEFAULT 0,
  lead_id TEXT,
  affiliate_id TEXT,
  click_id TEXT,
  attribution TEXT NOT NULL DEFAULT '{}',
  verified INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, source, external_id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  public_config TEXT NOT NULL DEFAULT '{}',
  secret TEXT,
  last_check TEXT,
  last_error TEXT,
  UNIQUE (tenant_id, kind)
);

CREATE TABLE IF NOT EXISTS calendar (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  creative_id TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  idem_key TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, idem_key)
);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_tenant ON audit (tenant_id, created_at);
