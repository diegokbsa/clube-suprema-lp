// Configuração do clube, dos links e do modo de cada integração.
// SUPREMA_MODE e F24H_MODE: "mock" (simulado) ou "real" (quando a camada real estiver pronta).
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

  club: { id: '10001', name: 'Clube Suprema', agentId: '1439098' },
  supportWhatsapp: '5511952138293',

  deposit: { min: 20, max: 5000, presets: [20, 50, 100, 200], pixTtlMinutes: 15 },

  // A senha do jogador fica só em memória, e só por este tempo.
  passwordTtlMinutes: 30,
  maxAutoRetries: 3,

  links: {
    // Link oficial de convite do clube (OneLink): abre o app, ou a loja, já com clube e agente.
    // Se parar de funcionar, gere um novo no app e cole aqui.
    clubInvite: 'https://supremapoker.onelink.me/xDgV?deep_link_value=eyJsaW5rdHlwZSI6MSwiY2x1YmlkIjoxMDAwMSwiYWdlbnRpZCI6MTQzOTA5OCwicGxheWVyaWQiOjE0MzkwOTgsImNyZWF0ZXRpbWUiOiIxNzkyNzg0NzM0NjAzIn0',
    android: 'https://play.google.com/store/apps/details?id=com.opt.supremapoker&hl=pt_BR',
    ios: 'https://apps.apple.com/br/app/suprema-poker/id1583176410',
    windows: 'https://security.supremapoker.com.br/download',
    apk: 'https://www.supremapoker.net/',
    buyChips: 'https://fichas24horas.com.br/auto-atendimento',
    responsibleGaming: 'https://supremapoker.com.br/jogo-consciente',
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
