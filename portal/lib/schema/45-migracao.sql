-- PA-140 · Trilha "Migrar para o pôquer" (só edição SX).
-- Candidatura pública (antes de existir operação: tem edição, não tem tenant_id), fila do superadmin,
-- primeiro acesso do agente, kit de 7 dias, revisão da página de perguntas e chaves de configuração da edição.

-- Candidatura vinda de /migrar. Não cria operação, usuário nem página: só entra na fila.
CREATE TABLE IF NOT EXISTS migracao_candidaturas (
  id TEXT PRIMARY KEY,
  edition TEXT NOT NULL DEFAULT 'sx',
  nome TEXT NOT NULL,
  contato TEXT NOT NULL,                  -- WhatsApp (só dígitos, com DDI) ou e-mail, como a pessoa informou
  contato_tipo TEXT NOT NULL,             -- whatsapp | email
  canal TEXT NOT NULL,                    -- telegram | whatsapp | instagram | tiktok | youtube | outro
  audiencia TEXT NOT NULL,                -- faixa (ate-1k, 1k-10k, 10k-50k, 50k-200k, 200k-mais)
  nicho TEXT,                             -- sobre o que é o canal, nas palavras da pessoa
  origem TEXT NOT NULL,                   -- afiliado-bet | criador | dono-grupo | tipster | outro
  maior18 INTEGER NOT NULL DEFAULT 0,
  consentimento TEXT NOT NULL,            -- versão do texto de consentimento aceito
  consentido_em TEXT NOT NULL,
  ip_hash TEXT,                           -- só o hash do IP (para limite e abuso), nunca o IP
  status TEXT NOT NULL DEFAULT 'nova',    -- nova | aprovada | recusada
  motivo TEXT,                            -- motivo da recusa (opcional, interno)
  decidido_por TEXT,
  decidido_em TEXT,
  tenant_id TEXT,                         -- operação criada na aprovação
  codigo_agente TEXT,                     -- código de agente informado pelo superadmin na aprovação
  afiliado_id TEXT,                       -- afiliado criado na operação (o link rastreado do agente)
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS migracao_cand_status ON migracao_candidaturas (edition, status, created_at);

-- Link de primeiro acesso: o agente nasce sem senha e define a dele por este link (validade curta, uso único).
-- Guarda só o hash do token. O portal não envia o link: o superadmin copia e decide se manda.
CREATE TABLE IF NOT EXISTS migracao_primeiro_acesso (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  criado_por TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS migracao_pa_user ON migracao_primeiro_acesso (user_id);

-- Kit de 7 dias: pautas honestas por canal, já passadas pelo preflight. O Estúdio de UGC (PA-141) produz as peças depois.
CREATE TABLE IF NOT EXISTS migracao_kits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  canal TEXT NOT NULL,
  dia INTEGER NOT NULL,
  formato TEXT NOT NULL,
  gancho TEXT NOT NULL,
  tema TEXT NOT NULL,
  chamada TEXT NOT NULL,
  link TEXT NOT NULL,
  preflight TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, canal, dia)
);

-- Página "O pôquer também foi proibido?" criada em rascunho: fica aguardando a revisão do Kbsa antes de publicar.
CREATE TABLE IF NOT EXISTS migracao_revisoes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando_revisao',  -- aguardando_revisao | revisado
  revisado_em_texto TEXT NOT NULL,                     -- data de revisão das fontes impressa na página (DD/MM/AAAA)
  revisado_por TEXT,
  revisado_em TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, page_id)
);

-- Chaves de configuração por edição (ex.: migracao.ativa). Sem linha = valor padrão do código.
CREATE TABLE IF NOT EXISTS edicao_config (
  edition TEXT NOT NULL,
  chave TEXT NOT NULL,
  valor TEXT NOT NULL,
  atualizado_por TEXT,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (edition, chave)
);
