-- Estúdio de UGC (PA-141): 3 influenciadores por operação, 1 por rede. Tudo com tenant_id e só lido por lib/repo.mjs.
-- Banco de produção tem dados: só CREATE ... IF NOT EXISTS. Coluna nova depois disso vai em lib/migrations.mjs.

-- Elenco: a ficha de cada influenciador. Uma rede fixa por influenciador (UNIQUE tenant_id + rede).
CREATE TABLE IF NOT EXISTS ugc_personas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rede TEXT NOT NULL,                      -- youtube | instagram | tiktok
  formato TEXT NOT NULL,                   -- ia (persona de IA) | criador (criador real) | marca (rosto da marca)
  nome TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT '',          -- "o que explica", "o do dia a dia", "o da conversa"
  idade_aparente TEXT,
  voz TEXT NOT NULL DEFAULT '{}',          -- { jeito, bordoes: [], glossario: [] }
  assuntos TEXT NOT NULL DEFAULT '[]',
  nunca TEXT NOT NULL DEFAULT '[]',        -- o que o influenciador nunca fala
  visual TEXT NOT NULL DEFAULT '{}',       -- { paleta: ['#hex'], enquadramento }
  regras TEXT NOT NULL DEFAULT '[]',       -- regras fixas (persona de IA: nunca se apresenta como pessoa real)
  rotulo_ia INTEGER NOT NULL DEFAULT 0,    -- persona de IA: sempre 1
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | ativo | pausado
  pessoa TEXT,                             -- criador real ou rosto da marca: quem aparece
  autorizacao INTEGER NOT NULL DEFAULT 0,  -- "tenho autorização por escrito" (rosto de pessoa real)
  autorizacao_por TEXT,                    -- usuário que marcou
  autorizacao_nome TEXT,
  autorizacao_em TEXT,
  affiliate_id TEXT,                       -- código de afiliado próprio do influenciador (tabela affiliates)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, rede)
);
CREATE INDEX IF NOT EXISTS ugc_personas_tenant ON ugc_personas (tenant_id);

-- Pauta da semana: proposta pelo sistema (agenda, blog, insights ou modelos por nicho) e aprovada pelo dono.
CREATE TABLE IF NOT EXISTS ugc_pautas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  semana TEXT NOT NULL,                    -- AAAA-MM-DD da segunda-feira
  dia TEXT NOT NULL,                       -- AAAA-MM-DD
  ordem INTEGER NOT NULL DEFAULT 0,
  tema TEXT NOT NULL,
  gancho TEXT NOT NULL DEFAULT '',
  formato_peca TEXT NOT NULL DEFAULT '',   -- "Short de 30 a 60 s", "Reel + 3 Stories"...
  origem TEXT NOT NULL DEFAULT 'manual',   -- modelo | agenda | blog | insight | manual
  origem_ref TEXT,
  status TEXT NOT NULL DEFAULT 'proposta', -- proposta | aprovada
  idem_key TEXT NOT NULL,                  -- propor de novo não duplica
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, idem_key)
);
CREATE INDEX IF NOT EXISTS ugc_pautas_semana ON ugc_pautas (tenant_id, semana, dia);

-- Peça pronta: roteiro, legenda, hashtags, capa e briefing. Nunca é postada pelo portal.
CREATE TABLE IF NOT EXISTS ugc_pecas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  pauta_id TEXT,
  rede TEXT NOT NULL,
  titulo TEXT NOT NULL DEFAULT '',
  roteiro TEXT NOT NULL DEFAULT '',
  legenda TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '',
  capa TEXT NOT NULL DEFAULT '',
  briefing TEXT NOT NULL DEFAULT '',
  caminho TEXT NOT NULL DEFAULT 'modelo',  -- mcp (IA conectada) | api (chave própria) | modelo (sem IA) | manual
  modelo_ia TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho', -- rascunho | aprovado | publicado | medido
  preflight TEXT NOT NULL DEFAULT '{}',    -- último resultado de lib/preflight.mjs
  aprovado_por TEXT,
  aprovado_em TEXT,
  publicado_em TEXT,
  post_url TEXT,
  calendar_id TEXT,                        -- rascunho criado no Calendário (canal conectado)
  views INTEGER,
  medido_em TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ugc_pecas_tenant ON ugc_pecas (tenant_id, status, created_at);

-- Números que o dono viu na rede (views), informados à mão em cada medição.
CREATE TABLE IF NOT EXISTS ugc_metricas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  peca_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  informado_por TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ugc_metricas_peca ON ugc_metricas (tenant_id, peca_id, created_at);

-- Cada geração pela chave de API própria (conta para o teto mensal). Nunca guarda a chave.
CREATE TABLE IF NOT EXISTS ugc_geracoes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  mes TEXT NOT NULL,                       -- AAAA-MM
  status TEXT NOT NULL,                    -- ok | erro
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  custo_micros INTEGER NOT NULL DEFAULT 0, -- custo estimado em milionésimos de dólar
  peca_id TEXT,
  erro TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ugc_geracoes_mes ON ugc_geracoes (tenant_id, mes, status);

-- Configuração do estúdio por operação (teto mensal de gerações).
CREATE TABLE IF NOT EXISTS ugc_config (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  teto_mensal INTEGER NOT NULL DEFAULT 300,
  updated_at TEXT NOT NULL
);
