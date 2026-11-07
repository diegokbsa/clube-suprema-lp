-- Automações por operação (PA-151): pauta dos posts automáticos, robô de grupos do Telegram, Bluesky e vigia diário.

-- Configuração de cada automação da operação (chave: 'pauta', 'vigia', 'telegram_grupos').
CREATE TABLE IF NOT EXISTS automacao_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, chave)
);

-- Pauta: fila de temas que o redator externo pega, um por horário de publicação.
CREATE TABLE IF NOT EXISTS pauta_temas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  tema TEXT NOT NULL,
  notas TEXT NOT NULL DEFAULT '',
  posicao INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'fila' CHECK (status IN ('fila', 'reservado', 'entregue', 'pulado')),
  reservado_ate TEXT,
  horario_alvo TEXT,
  post_id TEXT,
  motivo TEXT,
  entregue_em TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pauta_temas_fila ON pauta_temas (tenant_id, status, posicao);
CREATE INDEX IF NOT EXISTS pauta_temas_horario ON pauta_temas (tenant_id, horario_alvo);

-- Grupos do Telegram que adicionaram o bot da operação (grade diária e comandos de grupo).
CREATE TABLE IF NOT EXISTS telegram_grupos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  titulo TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'group',
  situacao TEXT NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo', 'pausado', 'saiu', 'migrou')),
  ultima_grade TEXT,
  ultimo_erro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, chat_id)
);

-- Envios ao Bluesky: um por post do blog ('post:<id>') e um por grade do dia ('grade:<dia>'). A chave única impede repetição.
CREATE TABLE IF NOT EXISTS bluesky_envios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  chave TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'grade')),
  ref TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'erro')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  uri TEXT,
  last_error TEXT,
  enviado_em TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, chave)
);

-- Vigia diário: cada conferência (automática uma vez por dia, ou pedida no painel) com o resultado item por item.
CREATE TABLE IF NOT EXISTS vigia_execucoes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  dia TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('agenda', 'manual')),
  idem_key TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 0,
  pendencias INTEGER NOT NULL DEFAULT 0,
  itens TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, idem_key)
);
CREATE INDEX IF NOT EXISTS vigia_execucoes_dia ON vigia_execucoes (tenant_id, created_at);
