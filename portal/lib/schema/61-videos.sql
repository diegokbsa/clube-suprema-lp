-- Fila de vídeos curtos por operação (Shorts do YouTube, Reels do Instagram...). O painel NÃO posta: um executor externo
-- (ex.: o PC que fala com o celular) pega o próximo envio devido pela API de serviço e devolve publicado/erro com o link.
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  ref TEXT,                                  -- id do roteiro (ex.: all-in-e-side-pot); único por operação
  titulo TEXT NOT NULL,                      -- título do Short
  legenda TEXT NOT NULL DEFAULT '',          -- descrição do YouTube / legenda do Reels
  legenda_instagram TEXT,                    -- legenda própria do Instagram (opcional; vazio = a legenda)
  arquivo_url TEXT,                          -- vídeo num endereço https (ou caminho no executor, ex.: data/shorts/x.mp4)
  arquivo_nome TEXT,                         -- vídeo enviado ao portal (guardado na pasta de vídeos)
  arquivo_bytes INTEGER,
  arquivo_tipo TEXT,
  agendado_para TEXT NOT NULL,               -- ISO: a partir de quando o executor pode publicar
  cancelado INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, ref)
);
CREATE INDEX IF NOT EXISTS videos_tenant ON videos (tenant_id, agendado_para);

CREATE TABLE IF NOT EXISTS video_envios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  canal TEXT NOT NULL,                       -- youtube | instagram | tiktok
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | reservado | publicado | erro
  tentativas INTEGER NOT NULL DEFAULT 0,
  executor TEXT,
  reservado_em TEXT,
  publicado_em TEXT,
  post_url TEXT,
  erro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (video_id, canal)                   -- o mesmo vídeo não sai duas vezes no mesmo canal
);
CREATE INDEX IF NOT EXISTS video_envios_fila ON video_envios (canal, status);
