-- CRM de conversas: caixa de entrada por operação (PA-120).
-- Organização inspirada no DeskcommCRM (licença MIT): conversa com status e atendente, mensagens em linha do tempo
-- e notas internas. Nenhum trecho de código de lá foi copiado; o esquema e as regras abaixo são deste portal.
--
-- Regras que valem aqui:
--   - tenant_id em tudo: a conversa de uma operação não existe para outra (leitura e escrita só por ctx.repo).
--   - contact_id liga a conversa à pessoa da base única (contacts); lead_id liga ao relacionamento daquela operação.
--   - idempotência: (tenant_id, channel, external_id) é único em conversations e em messages, então reenviar
--     a mesma mensagem do WhatsApp/Telegram não duplica nada.

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contact_id TEXT,                            -- pessoa na base única (contacts)
  lead_id TEXT,                               -- relacionamento desta operação com a pessoa
  contact_name TEXT,                          -- retrato local do contato, sem criar lead
  contact_email TEXT,
  contact_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'manual',     -- whatsapp | telegram | email | site | manual
  external_id TEXT,                           -- id da conversa no canal de origem (nulo quando aberta no painel)
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'aberta',      -- aberta | aguardando | resolvida
  owner_id TEXT,                              -- atendente (usuário com papel nesta operação)
  unread INTEGER NOT NULL DEFAULT 0,          -- mensagens recebidas ainda não abertas no painel
  messages INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_direction TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS conversations_tenant ON conversations (tenant_id, status, last_message_at);
CREATE INDEX IF NOT EXISTS conversations_contact ON conversations (tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS conversations_owner ON conversations (tenant_id, owner_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  contact_id TEXT,
  direction TEXT NOT NULL,                    -- entrada (cliente) | saida (atendente) | nota (interna, o cliente não vê)
  channel TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,                           -- id da mensagem no canal: chave de idempotência
  author_user TEXT,                           -- usuário do painel que escreveu
  author_name TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registrada',  -- registrada | pendente_envio (sem integração nada é enviado de verdade)
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS messages_conversa ON messages (tenant_id, conversation_id, occurred_at);
CREATE INDEX IF NOT EXISTS messages_contact ON messages (tenant_id, contact_id);

CREATE TABLE IF NOT EXISTS conversation_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,                         -- aberta | status | atendente | assunto
  data TEXT NOT NULL DEFAULT '{}',
  by_user TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS conversation_events_conversa ON conversation_events (tenant_id, conversation_id, created_at);
