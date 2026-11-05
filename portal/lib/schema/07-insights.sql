-- Insights do pesquisador de IA (pesquisa na internet a cada 20 min). Globais da instalação, não de uma operação.
-- Nada é aplicado sozinho: o superadmin aceita, descarta ou marca como aplicado.
CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  tema TEXT NOT NULL,
  titulo TEXT NOT NULL,
  resumo TEXT NOT NULL,
  fonte_url TEXT NOT NULL,
  fonte_data TEXT,
  tipo TEXT NOT NULL,
  aplicavel TEXT NOT NULL DEFAULT '[]',
  acao TEXT NOT NULL,
  impacto INTEGER NOT NULL DEFAULT 3,
  esforco INTEGER NOT NULL DEFAULT 3,
  confianca INTEGER NOT NULL DEFAULT 3,
  urgente INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'novo',      -- novo | aceito | descartado | aplicado
  nota TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS insights_status ON insights (status, created_at);
