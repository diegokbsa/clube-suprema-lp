// BigLinks na saída do site (pedido do Kbsa em 12/11/2026: "consegue integrar BigLink em todos?").
// Sites que não passam pelo instalador de afiliação (hotpoker.club) têm os botões de conversão escritos direto no HTML:
// WhatsApp, onelink do clube, lojas de app, Fichas 24 Horas, Instagram e grupo. Aqui, na hora de servir, cada destino
// mapeado em conteudo/biglinks-destinos.json vira https://l.kbsa.app/<slug>?src=<site>_<página>, com rel nofollow.
// Destino fora da tabela (referência, notícia, jogo consciente) fica como está.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARQ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'conteudo', 'biglinks-destinos.json');
let tabela = null;
function carregar() {
  if (tabela) return tabela;
  try { tabela = JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch { tabela = {}; }
  return tabela;
}
/** Só para os testes: troca a tabela carregada do disco. */
export function definirTabela(t) { tabela = t; }

const des = (s) => String(s).replace(/&amp;/g, '&');
/** "blog/como-entrar" -> "como_entrar"; "" -> "home"; "1" -> "pagina_1". Só [a-z0-9_]. */
export function paginaDe(caminho) {
  const c = String(caminho || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const p = !c ? 'home' : /^\d+$/.test(c) ? `pagina_${c}` : c.startsWith('blog/') ? c.slice(5) : c;
  return p.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'home';
}

/** Reescreve os href mapeados do site. `site` é a chave da tabela (domínio); `prefixo` vai na frente do src. */
export function comBigLinks(html, site, caminho) {
  const mapa = carregar()[site];
  if (!mapa || typeof html !== 'string' || !html.includes('href=')) return html;
  const src = `${mapa._prefixo || site.split('.')[0]}_${paginaDe(caminho)}`.slice(0, 80);
  return html.replace(/<a\b([^>]*?)href="([^"]+)"([^>]*)>/gi, (tag, antes, href, depois) => {
    const slug = mapa[des(href)];
    if (!slug || slug.startsWith('_')) return tag;
    let resto = `${antes}${depois}`;
    const rel = /\srel="([^"]*)"/i.exec(resto);
    if (rel) {
      const v = rel[1].split(/\s+/).filter(Boolean);
      if (!v.includes('nofollow')) v.unshift('nofollow');
      resto = resto.replace(rel[0], ` rel="${v.join(' ')}"`);
    } else resto += ' rel="nofollow noopener"';
    resto = resto.replace(/\s{2,}/g, ' ').replace(/\s+$/, '');
    return `<a${resto} href="https://l.kbsa.app/${slug}?src=${src}">`;
  });
}
