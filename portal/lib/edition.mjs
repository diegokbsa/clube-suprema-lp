// Edições do portal: o mesmo código roda em duas instâncias (banco e endereço próprios), escolhidas por PORTAL_EDITION.
//   sx    -> painel do grupo SX: só poker, operações = clubes do grupo, paleta e modelos da SX (sx.kbsa.app)
//   geral -> todos os produtos e programas de afiliação, todos os nichos, identidade própria (portal.kbsa.app)
// Nada de marca de terceiros fica no código: nome, logo e frase da edição SX vêm da configuração (PORTAL_BRAND_*).
import { NICHES } from './niches.mjs';

const SX_SITE_THEME = { mode: 'escuro', bg: '#0f0f0f', surface: '#171717', text: '#f4f6f7', muted: '#a1a9ae', primary: '#39bcff', primaryText: '#04141d',
  accent: '#0f5561', border: '#262c30', font: 'Montserrat', fontHead: 'Montserrat', radius: 12 };

export const EDITIONS = {
  sx: {
    id: 'sx',
    name: 'SX',
    tagline: 'Painel do grupo: clubes, agentes e afiliados',
    niches: ['poker'],
    defaultNiche: 'poker',
    terms: { operations: 'Clubes do grupo', newOperation: 'Novo clube' },
    siteTheme: SX_SITE_THEME,              // tema padrão dos sites criados nesta edição (o modelo ainda pode mudar)
    templateOrder: (t) => (t.inspiredBy === 'sx' ? 0 : t.niches.includes('poker') ? 1 : 2),
    presets: ['cadastro-app-fichas24h', 'jornada-guiada-poker', 'captacao-simples'],
    origin: 'https://sx.kbsa.app',
  },
  geral: {
    id: 'geral',
    name: 'Portal de Afiliação',
    tagline: 'Sites, conteúdo e afiliados para qualquer produto',
    niches: Object.keys(NICHES),
    defaultNiche: null,
    terms: { operations: 'Operações', newOperation: 'Nova operação' },
    siteTheme: null,
    templateOrder: (t) => (t.niches.includes('*') ? 1 : 0),
    presets: null,                         // todos
    origin: 'https://portal.kbsa.app',
  },
};

export function edition(id = process.env.PORTAL_EDITION, origin) {
  const e = EDITIONS[id] || EDITIONS.geral;
  return {
    ...e,
    origin: origin || e.origin,
    name: (e.id === 'sx' ? process.env.PORTAL_BRAND_NAME : process.env.PORTAL_BRAND_NAME_GERAL) || e.name,
    tagline: process.env.PORTAL_BRAND_TAGLINE || e.tagline,
    logo: process.env.PORTAL_BRAND_LOGO || '',   // URL de imagem fornecida pelo dono da marca; sem ela o painel usa a letra
    allowsNiche: (n) => e.niches.includes(n),
  };
}

/**
 * As duas edições num servidor só (mesmo banco). origins: { geral, sx }; sem origins, todas usam `fallbackOrigin` (dev/testes).
 * portEditions: { 3401: 'sx' } escolhe pela porta local quando o Host não bate com nenhuma origem.
 */
export function buildEditions({ origins = {}, fallbackOrigin, defaultId = process.env.PORTAL_EDITION || 'geral', portEditions = {} } = {}) {
  const editions = Object.fromEntries(Object.keys(EDITIONS).map((k) => [k, edition(k, origins[k] || fallbackOrigin)]));
  const byHost = new Map();
  for (const e of Object.values(editions)) if (origins[e.id]) byHost.set(new URL(e.origin).host.toLowerCase(), e);
  const def = editions[defaultId] || editions.geral;
  return {
    editions,
    default: def,
    forRequest(req) {
      const host = String(req.headers.host || '').toLowerCase();
      if (byHost.has(host)) return byHost.get(host);
      const port = req.socket?.localPort;
      if (port && portEditions[port]) return editions[portEditions[port]];
      return def;
    },
  };
}

export const publicEdition = (e) => ({ id: e.id, name: e.name, tagline: e.tagline, logo: e.logo, niches: e.niches, defaultNiche: e.defaultNiche, terms: e.terms });
