-- Conexão das IAs dos usuários (Claude, ChatGPT, Kimi, Codex...) ao portal.
-- OAuth 2.1 (com registro dinâmico de cliente e PKCE) para os conectores MCP; tokens pessoais para as linhas de comando.
CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  challenge TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,              -- access | refresh | pat
  client_id TEXT,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  family TEXT NOT NULL,            -- liga access e refresh da mesma conexão (revogar a família derruba os dois)
  expires_at INTEGER,
  last_used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_tokens_user ON oauth_tokens (user_id, tenant_id);

-- Chave de API do provedor de IA (opcional): só para rotinas automáticas que rodam sem ninguém conversando.
CREATE TABLE IF NOT EXISTS ai_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  secret TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'nao_testada',
  last_error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, user_id, provider)
);

-- Serviços que o usuário liga (notícias no blog, Instagram, YouTube, criativos).
CREATE TABLE IF NOT EXISTS ai_services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  config TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, user_id, service)
);
