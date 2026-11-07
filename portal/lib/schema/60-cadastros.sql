-- Cadastro no app + Fichas 24h guiado (a jornada do suprema.blog levada para todas as operações).
-- A senha NUNCA vem para cá: fica só na memória do servidor por 30 minutos (lib/modules/cadastro.mjs).
-- CPF, nascimento e celular do Fichas 24h também não: ficam só no aparelho do visitante.
CREATE TABLE IF NOT EXISTS cadastros (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  journey_id TEXT,
  variant TEXT,
  lead_id TEXT,
  contact_id TEXT,
  email TEXT NOT NULL,
  apelido TEXT,
  id_app TEXT,                               -- ID do jogador no app (ex.: ID Suprema), informado pelo próprio jogador
  status TEXT NOT NULL DEFAULT 'em_andamento', -- em_andamento | aguardando_jogador | pronto | falhou
  needs TEXT,                                -- o que falta o jogador fazer (ex.: entrar_clube)
  steps TEXT NOT NULL DEFAULT '{}',
  utm TEXT NOT NULL DEFAULT '{}',
  log TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cadastros_tenant ON cadastros (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS cadastros_journey ON cadastros (journey_id, variant);
