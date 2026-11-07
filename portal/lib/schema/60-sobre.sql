-- Página /sobre de cada site (quem somos, autor, política editorial: E-E-A-T). Texto em markdown curto, renderizado com escape
-- pelo mesmo htmlText do blog. Sem linha ou desativada, /sobre segue para a página do construtor (se houver) ou 404.
CREATE TABLE IF NOT EXISTS sobre_sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 0,
  titulo TEXT NOT NULL DEFAULT '',
  resumo TEXT NOT NULL DEFAULT '',
  conteudo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'Organization' CHECK (tipo IN ('Organization', 'Person')),
  autor_nome TEXT NOT NULL DEFAULT '',
  autor_cargo TEXT NOT NULL DEFAULT '',
  autor_bio TEXT NOT NULL DEFAULT '',
  autor_foto TEXT,
  links TEXT NOT NULL DEFAULT '[]',          -- perfis oficiais (https), viram sameAs no JSON-LD
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sobre_sites_tenant ON sobre_sites (tenant_id);
