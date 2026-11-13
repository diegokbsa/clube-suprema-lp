const xmlInvalidos = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function limparSubstitutos(valor) {
  const entrada = String(valor ?? '');
  let saida = '';
  for (let i = 0; i < entrada.length; i += 1) {
    const atual = entrada.charCodeAt(i);
    if (atual >= 0xD800 && atual <= 0xDBFF) {
      const proximo = entrada.charCodeAt(i + 1);
      if (proximo >= 0xDC00 && proximo <= 0xDFFF) {
        saida += entrada[i] + entrada[i + 1];
        i += 1;
      }
      continue;
    }
    if (atual >= 0xDC00 && atual <= 0xDFFF) continue;
    saida += entrada[i];
  }
  return saida;
}

export function escaparXml(valor) {
  return limparSubstitutos(valor).replace(xmlInvalidos, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const escaparAtributoHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const INICIO_CONTEUDO = '<!--rss-conteudo-inicio-->';
const FIM_CONTEUDO = '<!--rss-conteudo-fim-->';

export function extrairConteudoRss(html) {
  const texto = String(html || '');
  const inicio = texto.indexOf(INICIO_CONTEUDO);
  const fim = texto.indexOf(FIM_CONTEUDO, inicio + INICIO_CONTEUDO.length);
  return inicio >= 0 && fim >= 0 ? texto.slice(inicio + INICIO_CONTEUDO.length, fim).trim() : null;
}

/** Ajusta o BigLinks que já saiu no HTML do artigo para atribuir a leitura ao feed deste post. */
export function marcarOrigemRss(html, slug, siteUrl = '') {
  const origem = `rss_${String(slug || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44)}`;
  if (!/^rss_[a-z0-9_]+$/.test(origem)) return String(html || '');
  let texto = String(html || '');
  if (siteUrl) {
    texto = texto.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (m, atributo, aspas, bruto) => {
      if (!bruto.startsWith('/')) return m;
      try {
        const absoluto = new URL(bruto.replace(/&amp;/g, '&'), siteUrl).href;
        return `${atributo}=${aspas}${escaparAtributoHtml(absoluto)}${aspas}`;
      } catch { return m; }
    });
  }
  return texto.replace(/\bhref=(['"])(https:\/\/l\.kbsa\.app\/[^'"]+)\1/gi, (_m, aspas, bruto) => {
    try {
      const url = new URL(bruto.replace(/&amp;/g, '&'));
      url.searchParams.set('src', origem);
      url.searchParams.set('utm_source', 'kbsa_blogs');
      url.searchParams.set('utm_campaign', origem);
      return `href=${aspas}${escaparAtributoHtml(url.toString())}${aspas}`;
    } catch { return `href=${aspas}${bruto}${aspas}`; }
  });
}

function dataValida(item) {
  const ms = Date.parse(item?.publishedAt || '');
  return Number.isFinite(ms) ? ms : null;
}

function itemXml(item) {
  const link = String(item.link || '');
  const ms = dataValida(item);
  if (!link || ms === null || /\{\{LINK:/.test(String(item.content || ''))) return '';
  const imagem = item.coverUrl ? `<media:content url="${escaparXml(item.coverUrl)}" medium="image" type="${escaparXml(item.coverType || 'image/webp')}" width="1200" height="675"/>` : '';
  return `<item><title>${escaparXml(item.title)}</title><link>${escaparXml(link)}</link><guid isPermaLink="true">${escaparXml(item.guid || link)}</guid><pubDate>${escaparXml(new Date(ms).toUTCString())}</pubDate><description>${escaparXml(item.excerpt || '')}</description>${imagem}<content:encoded>${escaparXml(item.content || '')}</content:encoded></item>`;
}

export function gerarRss({ title, siteUrl, feedUrl, description = '', language = 'pt-BR', items = [] }) {
  const ordenados = [...items].map((item, ordem) => ({ item, ordem, ms: dataValida(item) }))
    .filter((x) => x.ms !== null)
    .sort((a, b) => b.ms - a.ms || a.ordem - b.ordem)
    .slice(0, 40);
  const ultimo = ordenados[0]?.ms;
  const buildDate = ultimo === undefined ? '' : `<lastBuildDate>${escaparXml(new Date(ultimo).toUTCString())}</lastBuildDate>`;
  const corpo = ordenados.map(({ item }) => itemXml(item)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${escaparXml(title)}</title><link>${escaparXml(siteUrl)}</link><description>${escaparXml(description)}</description><language>${escaparXml(language)}</language><atom:link href="${escaparXml(feedUrl)}" rel="self" type="application/rss+xml"/>${buildDate}${corpo}</channel></rss>\n`;
}
