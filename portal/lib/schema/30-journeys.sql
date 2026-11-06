-- Jornadas com teste A/B: o usuário monta os passos de cada variante, divide o tráfego e mede cada passo.
CREATE TABLE IF NOT EXISTS journeys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho',   -- rascunho | rodando | pausada | encerrada
  winner TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS journeys_tenant ON journeys (tenant_id);

CREATE TABLE IF NOT EXISTS journey_variants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  key TEXT NOT NULL,                         -- a, b, c...
  name TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 50,        -- parte do tráfego (as variantes somam o total)
  steps TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (journey_id, key)
);

CREATE TABLE IF NOT EXISTS journey_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  visitor TEXT NOT NULL,
  step INTEGER NOT NULL,
  kind TEXT NOT NULL,                        -- ver | concluir | clicar
  created_at TEXT NOT NULL,
  UNIQUE (journey_id, visitor, step, kind)   -- recarregar a página não conta duas vezes
);
CREATE INDEX IF NOT EXISTS journey_events_j ON journey_events (journey_id, variant, step, kind);
