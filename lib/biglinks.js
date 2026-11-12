// BigLinks na saída do suprema.blog (pedido do Kbsa em 12/11/2026: "consegue integrar BigLink em todos?").
// Os botões de conversão das páginas (WhatsApp de suporte, Telegram do clube, download do app, Fichas 24 Horas) saem por
// https://l.kbsa.app/<slug>?src=suprema_<página>, com nofollow: o BigLinks conta o clique por página e marca o de gente.
// Só o <a href> muda: JSON-LD, llms.txt e textos continuam com os endereços oficiais. Referências (jogo consciente,
// notícias, política de privacidade) ficam diretas. O WhatsApp da LP leva o e-mail do jogador no texto e é montado no
// navegador (public/app.js): fica direto, para o dado pessoal não passar pelo encurtador; o contador do Portal conta o clique.
const WA = 'https://wa.me/5511952138293?text=';
export const DESTINOS = {
  [`${WA}Oi%2C%20vim%20do%20blog%20do%20Clube%20Suprema%20e%20preciso%20de%20ajuda.`]: 'sx-wa-ajuda',
  [`${WA}Oi%2C%20vim%20do%20suprema.blog%20e%20quero%20suporte.`]: 'sx-wa-suporte',
  [`${WA}Oi%2C%20li%20o%20blog%20do%20Clube%20Suprema%20e%20tenho%20uma%20d%C3%BAvida.`]: 'sx-wa-duvida',
  'https://t.me/clubsupremapokerxx': 'sx-tg-clube',
  'https://www.supremapoker.net/': 'sx-app-site',
  'https://apps.apple.com/br/app/suprema-poker/id1583176410': 'sx-app-ios',
  'https://play.google.com/store/apps/details?id=com.opt.supremapoker&hl=pt_BR': 'sx-app-android',
  'https://security.supremapoker.com.br/download': 'sx-app-download',
  'https://fichas24horas.com.br/auto-atendimento': 'sx-f24-auto',
  'https://apps.apple.com/br/app/fichas-24-horas/id6469055865': 'sx-f24-ios',
  'https://play.google.com/store/apps/details?id=com.mycompany.fichas24horas&hl=pt_BR': 'sx-f24-android',
};

/** "/blog/como-entrar" -> "como_entrar"; "/" -> "home"; "/torneios" -> "torneios". Só [a-z0-9_]. */
export function paginaDe(pathname) {
  const c = String(pathname || '/').split('?')[0].replace(/^\/+|\/+$/g, '');
  const p = !c ? 'home' : c.startsWith('blog/') ? c.slice(5) : c;
  return p.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
}

/** Link curto do BigLinks para um destino mapeado (ou null). Usado também no navegador pelo botão de comprar fichas. */
export function curto(destino, pagina) {
  const slug = DESTINOS[String(destino || '').replace(/&amp;/g, '&')];
  return slug ? `https://l.kbsa.app/${slug}?src=${`suprema_${pagina}`.slice(0, 80)}` : null;
}

export function comBigLinks(html, pathname) {
  const s = String(html);
  if (!s.includes('href=')) return s;
  const pagina = paginaDe(pathname);
  return s.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>/gi, (tag, antes, href, depois) => {
    const novo = curto(href, pagina);
    if (!novo) return tag;
    let resto = `${antes}${depois}`;
    const rel = /\srel="([^"]*)"/i.exec(resto);
    if (rel) {
      const v = rel[1].split(/\s+/).filter(Boolean);
      if (!v.includes('nofollow')) v.unshift('nofollow');
      resto = resto.replace(rel[0], ` rel="${v.join(' ')}"`);
    } else resto += ' rel="nofollow noopener"';
    return `<a${resto.replace(/\s{2,}/g, ' ').replace(/\s+$/, '')} href="${novo}">`;
  });
}
