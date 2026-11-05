-- Fluxo de SEO: cada publicação (página ou post) registra o que foi avisado a cada buscador e o resultado.
CREATE TABLE IF NOT EXISTS seo_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL,
  urls TEXT NOT NULL DEFAULT '[]',
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seo_events_tenant ON seo_events (tenant_id, created_at);
