// Configuração do clube, dos links e do modo de cada integração.
// SUPREMA_MODE: "mock" (simulado), "app" (o jogador cria a conta no app pelo link do clube e informa o ID aqui)
//   ou "real" (quando houver API da Suprema). F24H_MODE: "mock", "real" (só com o OK formal da Sayplus) ou
//   "guiado" (sem chamar o Fichas 24h: o jogador termina o cadastro no sistema deles, com os dados prontos para copiar).
export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  // FLOW: "convite" (padrão) = LP com e-mail + link oficial do clube + Fichas 24h, sem integrações.
  //       "completo" = cadastro único com a camada por trás (Suprema + Fichas 24h + PIX na página).
  flow: process.env.FLOW === 'completo' ? 'completo' : 'convite',
  modes: {
    suprema: process.env.SUPREMA_MODE || 'mock',
    fichas24h: process.env.F24H_MODE || 'mock',
  },
  // Sem token, o painel /admin só abre neste computador.
  adminToken: process.env.ADMIN_TOKEN || '',
  // Tarefas de fundo (IndexNow, Telegram, Bluesky, grade das 9h, robô dos grupos, cópia na planilha): ligadas no Render
  // e, no servidor Bigue, só quando TAREFAS_FUNDO=1 (o instalador liga na virada do domínio). TAREFAS_FUNDO=0 desliga em qualquer lugar.
  tarefasFundo: process.env.TAREFAS_FUNDO ? process.env.TAREFAS_FUNDO === '1' : Boolean(process.env.RENDER),

  club: { id: '10001', name: 'Clube Suprema', agentId: '1439098' },
  supportWhatsapp: '5511952138293',

  deposit: { min: 20, max: 5000, presets: [20, 50, 100, 200], pixTtlMinutes: 15 },

  // Fichas 24h (Sayplus/Asaas): endereços vistos no app web app.fichas24horas.com.br (docs/integracao-fichas24h.md).
  // F24H_CLUB_ID é o id interno do clube 10001 no Fichas 24h; vazio = procurar na lista de clubes da Suprema.
  fichas24h: {
    apiBase: process.env.F24H_API || 'https://apis.fichas24horas.com.br',
    supabaseUrl: process.env.F24H_SUPABASE_URL || 'https://lxaoltgkxlyvsdwburpq.supabase.co',
    supabaseAnonKey: process.env.F24H_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4YW9sdGdreGx5dnNkd2J1cnBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE2ODU2Mjk2ODMsImV4cCI6MjAwMTIwNTY4M30.fsNC1fQiXupe4FOdIf8_quPCuj0-gcHIKes2Qdj3noQ',
    platformId: 10, // Suprema Poker em /platforms/public/list
    clubName: process.env.F24H_CLUB_NAME || 'SX | XX POKER', // como o clube 10001 aparece no "Cadastrar ID" do Fichas 24h
    signupUrl: 'https://app.fichas24horas.com.br/signup',
    homeUrl: 'https://app.fichas24horas.com.br/home',
    clubId: process.env.F24H_CLUB_ID || '',
    itemId: process.env.F24H_ITEM_ID || '', // item de fichas do auto-atendimento; vazio = o primeiro da lista
  },

  // A senha do jogador fica só em memória, e só por este tempo.
  passwordTtlMinutes: 30,
  maxAutoRetries: 3,

  links: {
    // Link oficial de convite do clube (OneLink): abre o app, ou a loja, já com clube e agente.
    // Se parar de funcionar, gere um novo no app e cole aqui.
    clubInvite: 'https://supremapoker.onelink.me/xDgV?deep_link_value=eyJsaW5rdHlwZSI6MSwiY2x1YmlkIjoxMDAwMSwiYWdlbnRpZCI6MTQzOTA5OCwicGxheWVyaWQiOjE0MzkwOTgsImNyZWF0ZXRpbWUiOiIxNzkzOTEwNjkxODE4In0',
    android: 'https://play.google.com/store/apps/details?id=com.opt.supremapoker&hl=pt_BR',
    ios: 'https://apps.apple.com/br/app/suprema-poker/id1583176410',
    windows: 'https://security.supremapoker.com.br/download',
    apk: 'https://www.supremapoker.net/',
    buyChips: 'https://fichas24horas.com.br/auto-atendimento',
    responsibleGaming: 'https://supremapoker.com.br/jogo-consciente',
    // Canal do clube no Telegram: novos posts do blog entram sozinhos (.github/workflows/novos-posts.yml).
    telegram: 'https://t.me/clubsupremapokerxx',
    // Perfil do clube no Bluesky: os posts novos também entram sozinhos (lib/novos-posts.js, com BLUESKY_APP_PASSWORD).
    bluesky: 'https://bsky.app/profile/supremapoker.bsky.social',
  },

  tracking: {
    ga4Id: process.env.GA4_ID || 'G-ZXS59RV8GR', // propriedade GA4 "Clube Suprema", fluxo suprema.blog
    metaPixelId: process.env.META_PIXEL_ID || '',
  },

  // Planilha do Google que recebe uma cópia de cada cadastro (Apps Script publicado como app da Web).
  // Vazio = desligado. Código do script em tools/planilha/Code.gs.
  sheets: {
    // Planilha "Cadastros · Clube Suprema" (Drive de h2odiegokbsa), projeto Apps Script "Cadastros Clube Suprema".
    webhookUrl: process.env.SHEETS_WEBHOOK_URL || 'https://script.google.com/macros/s/AKfycbyRFSDt6RJOU9RIh_MUB9KltHLC81yqyM13_38_iAVaR7vsB_H-OwRu0ENpL75yMUA3bw/exec',
  },

};

export const testMode = config.flow === 'completo' && (config.modes.suprema === 'mock' || config.modes.fichas24h === 'mock');
