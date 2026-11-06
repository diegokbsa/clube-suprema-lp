-- Páginas próprias (HTML feito à mão) de um site com domínio próprio: a raiz e páginas extras (ex.: hotpoker.club e /1 a /4).
-- Só o superadministrador grava. O servidor entrega o documento como está, com o envio do formulário ligado ao CRM do portal.
CREATE TABLE IF NOT EXISTS paginas_proprias (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  caminho TEXT NOT NULL,                 -- '' = raiz; '1', 'como-entrar'... (sem barra)
  titulo TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  indexar INTEGER NOT NULL DEFAULT 1,    -- 1 entra no sitemap; 0 fica fora (a página aponta o canonical para outra)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (site_id, caminho)
);
CREATE INDEX IF NOT EXISTS paginas_proprias_tenant ON paginas_proprias (tenant_id);
