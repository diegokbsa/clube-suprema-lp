// Blog editorial por operação. A API e a agenda mantêm rascunhos separados da versão pública.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from '../http.mjs';
import { can } from '../auth.mjs';
import { esc } from '../blocks.mjs';
import { now, parse, tx } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { slugify } from '../tenants.mjs';
import { themeCss } from '../site.mjs';
import { tagMedicao } from './paginas.mjs';

export const tables = ['posts'];
export const nav = { id: 'blog', label: 'Blog', perm: 'blog.read' };

const PUBLIC_CSP = "default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; script-src 'self' https://www.googletagmanager.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms https://www.googleadservices.com https://googleads.g.doubleclick.net https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com https://*.clarity.ms https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://*.doubleclick.net; frame-src https://www.googletagmanager.com https://td.doubleclick.net; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const text = (value, max) => String(value ?? '').trim().slice(0, max);

function tagsOf(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map((tag) => text(tag, 40)).filter(Boolean))].slice(0, 20);
}

function safeCover(value) {
  const cover = text(value, 1000);
  if (!cover) return null;
  if (cover.startsWith('/') && !cover.startsWith('//')) return cover;
  try {
    const url = new URL(cover);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

export function cleanArticle(input, current = null) {
  const title = text(input.title ?? current?.title, 120);
  const content = String(input.content ?? current?.content ?? '').trim();
  const slug = slugify(input.slug ?? current?.slug ?? title);
  const author = text(input.author ?? current?.author, 100);
  const category = text(input.category ?? current?.category ?? 'Geral', 80) || 'Geral';
  const excerpt = text(input.excerpt ?? current?.excerpt, 300);
  const coverValue = input.coverUrl ?? input.cover_url ?? current?.cover_url;
  const coverUrl = safeCover(coverValue);
  const tags = tagsOf(input.tags ?? parse(current?.tags, []));
  const seoTitle = text(input.seoTitle ?? input.seo_title ?? current?.seo_title ?? title, 70);
  const seoDescription = text(input.seoDescription ?? input.seo_description ?? current?.seo_description ?? excerpt, 170);

  if (!title) throw new HttpError(400, 'Informe o título do artigo.');
  if (!slug) throw new HttpError(400, 'Informe um slug válido.');
  if (!content || content.length > 80_000) throw new HttpError(400, 'O conteúdo deve ter até 80.000 caracteres.');
  if (!author) throw new HttpError(400, 'Informe o autor do artigo.');
  if (coverValue && !coverUrl) throw new HttpError(400, 'A capa deve usar um endereço HTTPS ou um caminho local.');
  return { title, slug, excerpt, content, category, tags: JSON.stringify(tags), author, cover_url: coverUrl, seo_title: seoTitle, seo_description: seoDescription };
}

function postOut(row, suggestions = [], siteName = '') {
  return {
    id: row.id, siteId: row.site_id, title: row.title, slug: row.slug, excerpt: row.excerpt, content: row.content,
    category: row.category, tags: parse(row.tags, []), author: row.author, coverUrl: row.cover_url,
    seoTitle: row.seo_title, seoDescription: row.seo_description, status: row.status,
    scheduledAt: row.scheduled_at, publishedAt: row.published_at, publishedSlug: row.published_slug,
    hasPublishedVersion: Boolean(row.published_data), createdAt: row.created_at, updatedAt: row.updated_at,
    seoChecklist: postSeoChecklist(row, suggestions, siteName), suggestedInternalLinks: suggestions,
  };
}

export function publishedData(row, dateModified = now()) {
  const previous = parse(row.published_data, null);
  return {
    title: row.title, slug: row.slug, excerpt: row.excerpt, content: row.content, category: row.category,
    tags: parse(row.tags, []), author: row.author, coverUrl: row.cover_url,
    seoTitle: row.seo_title || row.title, seoDescription: row.seo_description || row.excerpt,
    datePublished: previous?.datePublished || row.published_at || dateModified,
    dateModified,
  };
}

function slugTaken(repo, siteId, slug, exceptId = null) {
  const current = repo.get('posts', { site_id: siteId, slug });
  if (current && current.id !== exceptId) return true;
  const live = repo.get('posts', { site_id: siteId, published_slug: slug });
  return Boolean(live && live.id !== exceptId);
}

function requireSite(repo, siteId) {
  const site = repo.get('sites', String(siteId || ''));
  if (!site) throw new HttpError(404, 'Site não encontrado nesta operação.');
  return site;
}

function requirePost(repo, id) {
  const post = repo.get('posts', String(id || ''));
  if (!post) throw new HttpError(404, 'Artigo não encontrado.');
  return post;
}

export function publishedCopy(row) {
  const data = parse(row.published_data, null);
  return data && row.published_slug ? { ...data, slug: row.published_slug,
    publishedAt: data.datePublished || row.published_at, dateModified: data.dateModified || row.published_at } : null;
}

function suggestInternalLinks(rows, article, exceptId = null) {
  const tags = new Set(tagsOf(article.tags || []));
  const category = text(article.category, 80);
  return rows.map((row) => {
    if (row.id === exceptId) return null;
    const post = publishedCopy(row);
    if (!post) return null;
    const matches = (Array.isArray(post.tags) ? post.tags : []).filter((tag) => tags.has(tag));
    const sameCategory = Boolean(category && category !== 'Geral' && post.category === category);
    const score = matches.length * 2 + Number(sameCategory);
    if (!score) return null;
    return {
      title: post.title, slug: post.slug, excerpt: post.excerpt,
      url: `/blog/${encodeURIComponent(post.slug)}`,
      reason: sameCategory && matches.length ? 'Categoria e tags em comum' : sameCategory ? 'Categoria em comum' : `Tags em comum: ${matches.join(', ')}`,
      score, publishedAt: post.publishedAt || '',
    };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 3)
    .map(({ score, publishedAt, ...post }) => post);
}

function postSeoChecklist(row, suggestions = [], siteName = '') {
  const title = String(row.seo_title || row.title || '').trim();
  const pageTitle = `${title}${siteName ? ` · ${siteName}` : ''}`;
  const description = String(row.seo_description || row.excerpt || '').trim();
  const content = String(row.content || '');
  const words = content.match(/[\p{L}\p{N}]+/gu)?.length || 0;
  const hasCover = Boolean(row.cover_url);
  return [
    { id: 'titulo', ok: pageTitle.length >= 15 && pageTitle.length <= 70, nivel: 'alto', msg: `Título SEO publicado com ${pageTitle.length} caracteres, incluindo o nome do site (ideal: 15 a 70).` },
    { id: 'descricao', ok: description.length >= 70 && description.length <= 170, nivel: 'alto', msg: description ? `Descrição SEO com ${description.length} caracteres (ideal: 70 a 170).` : 'Falta a descrição SEO do artigo.' },
    { id: 'h1', ok: Boolean(row.title), nivel: 'alto', msg: row.title ? 'O título do artigo é exibido como H1.' : 'Informe o título do artigo para gerar o H1.' },
    { id: 'linksInternos', ok: suggestions.length > 0, nivel: 'medio', msg: suggestions.length ? `${suggestions.length} sugestão(ões) de links internos para posts relacionados.` : 'Nenhum post relacionado publicado para sugerir links internos.' },
    { id: 'altCapa', ok: hasCover, nivel: 'medio', msg: hasCover ? 'O texto alternativo da capa usa o título do artigo.' : 'Adicione uma capa; o título será usado como texto alternativo.' },
    { id: 'tamanho', ok: words >= 150 && content.length <= 80_000, nivel: 'medio', msg: `${words} palavras e ${content.length} caracteres (referência editorial: ao menos 150 palavras).` },
  ];
}

function postResponse(repo, row) {
  const published = repo.all('posts', { site_id: row.site_id }, { order: 'published_at DESC', limit: 100, extra: 'published_data IS NOT NULL' });
  const suggestions = suggestInternalLinks(published, { title: row.title, category: row.category, tags: parse(row.tags, []) }, row.id);
  const site = repo.get('sites', row.site_id);
  return postOut(row, suggestions, site?.name || '');
}

const CAIXAS = { cta: { cls: 'blog-box blog-box-cta', titulo: '' }, nota: { cls: 'blog-box blog-box-nota', titulo: 'Nota' }, dica: { cls: 'blog-box blog-box-dica', titulo: 'Dica' } };
const ABRE_CAIXA = /^:::(cta|nota|dica)(?:\s+(.*))?$/;
const FECHA_CAIXA = /^:::\s*$/;

function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+?)\)/g, '$1') // imagem no meio da frase não vira "!<a>": fica só o texto alternativo
    .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (m, txt, href) => {
      const h = href.replace(/&amp;/g, '&');
      const ok = (h.startsWith('/') && !h.startsWith('//')) || h.startsWith('#') || /^https:\/\/[^\s"'<>]+$/i.test(h);
      if (!ok) return txt;
      const fora = /^https:/i.test(h);
      // Link de afiliado (Kiwify/Hotmart, ou o link curto l.kbsa.app do BigLinks) leva "sponsored nofollow", como pede o Google.
      const afiliado = /^https:\/\/([a-z0-9-]+\.)*(kiwify\.(app|com\.br)|hotmart\.com|hotm\.art)(\/|$)|^https:\/\/l\.kbsa\.app\//i.test(h);
      const rel = afiliado ? 'sponsored nofollow noopener' : 'noopener';
      return `<a href="${esc(h)}"${fora ? ` rel="${rel}" target="_blank"` : ''}>${txt}</a>`;
    });
}

/** Texto do post em HTML seguro. Aceita um markdown curto: "## " e "### " (títulos), listas "- " e "1. ", **negrito**,
 *  [texto](/caminho | https://...) e as caixas ":::cta Título", ":::nota" e ":::dica", fechadas por ":::" (como no suprema.blog).
 *  Tudo o mais é escapado (HTML cru do conteúdo nunca passa); post antigo sem markdown continua saindo em parágrafos. */
export function htmlText(value) {
  const linhas = String(value || '').replace(/\r/g, '').split('\n');
  const out = [];
  let solto = [];
  const soltar = () => { if (solto.length) out.push(blocosHtml(solto.join('\n'))); solto = []; };
  for (let i = 0; i < linhas.length; i++) {
    const abre = ABRE_CAIXA.exec(linhas[i].trim());
    if (!abre) { solto.push(linhas[i]); continue; }
    const fim = linhas.findIndex((l, j) => j > i && FECHA_CAIXA.test(l.trim()));
    if (fim < 0) { solto.push(linhas[i]); continue; } // caixa sem fechamento: a linha sai como texto comum
    soltar();
    const def = CAIXAS[abre[1]];
    const titulo = (abre[2] || '').trim() || def.titulo;
    out.push(`<aside class="${def.cls}">${titulo ? `<strong class="blog-box-title">${inline(titulo)}</strong>` : ''}${blocosHtml(linhas.slice(i + 1, fim).join('\n'))}</aside>`);
    i = fim;
  }
  soltar();
  return out.join('');
}

const TITULO_FAQ = /^##\s+(perguntas frequentes|perguntas e respostas|d[uú]vidas frequentes|faq)(\s|$|[:.!?])/i;
const textoPlano = (s) => String(s || '').replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, '$1').replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();

/** Perguntas e respostas do post: a seção "## Perguntas frequentes" (ou "## FAQ", "## Dúvidas frequentes") com cada pergunta
 *  num "### " e a resposta nas linhas seguintes. Vira o JSON-LD FAQPage do artigo. Sem a seção, devolve []. */
export function faqDoTexto(value) {
  const linhas = String(value || '').replace(/\r/g, '').split('\n');
  const ini = linhas.findIndex((l) => TITULO_FAQ.test(l.trim()));
  if (ini < 0) return [];
  const faq = [];
  let atual = null;
  for (const bruta of linhas.slice(ini + 1)) {
    const l = bruta.trim();
    if (/^##\s/.test(l)) break; // a próxima seção encerra o FAQ
    const q = /^###\s+(.+)$/.exec(l);
    if (q) { atual = { q: textoPlano(q[1]), a: [] }; faq.push(atual); continue; }
    if (!atual || !l || ABRE_CAIXA.test(l) || FECHA_CAIXA.test(l)) continue;
    atual.a.push(l.replace(/^([-*]|\d+[.)])\s+/, ''));
  }
  return faq.map((f) => ({ q: f.q.slice(0, 300), a: textoPlano(f.a.join(' ')).slice(0, 2000) })).filter((f) => f.q && f.a).slice(0, 20);
}

/** JSON-LD FAQPage a partir de [{ q, a }] em texto plano. */
export function faqLd(faq, id = '') {
  return { '@type': 'FAQPage', ...(id ? { '@id': id } : {}),
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

// Imagem do próprio portal (portal/public/assets/...): só caminho local, sem "..", com extensão de imagem.
const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
export const IMG_LOCAL = /^\/assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:png|jpe?g|webp)$/i;
const dimCache = new Map();
/** Largura e altura reais do PNG (cabeçalho IHDR); outro formato ou arquivo ausente usa o padrão informado. */
export function dimensoesImagem(src, padrao = [1200, 675]) {
  if (dimCache.has(src)) return dimCache.get(src);
  let wh = padrao;
  try {
    const fd = fs.openSync(path.join(PUBLIC_DIR, src.replace(/^\/+/, '')), 'r');
    const b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd);
    if (b.toString('latin1', 1, 4) === 'PNG') wh = [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { /* arquivo ainda não copiado: fica o padrão */ }
  dimCache.set(src, wh);
  return wh;
}
/** "![alt](/assets/...)" sozinho na linha: figura com alt, tamanho e carregamento preguiçoso. */
function figuraHtml(alt, src) {
  const [w, h] = dimensoesImagem(src);
  return `<figure class="blog-fig"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" width="${w}" height="${h}"></figure>`;
}

function blocosHtml(value) {
  const out = [];
  for (const bloco of String(value || '').split(/\n{2,}/)) {
    const linhas = bloco.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!linhas.length) continue;
    const img = linhas.length === 1 && /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(linhas[0].trim());
    if (img) { if (IMG_LOCAL.test(img[2])) out.push(figuraHtml(img[1].trim(), img[2])); continue; } // imagem de fora não entra
    const t = /^(#{2,3})\s+(.+)$/.exec(linhas[0].trim());
    if (t && linhas.length === 1) { const n = t[1].length; out.push(`<h${n}>${inline(t[2])}</h${n}>`); continue; }
    if (linhas.every((l) => /^\s*[-*]\s+/.test(l))) { out.push(`<ul>${linhas.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`); continue; }
    if (linhas.every((l) => /^\s*\d+[.)]\s+/.test(l))) { out.push(`<ol>${linhas.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`); continue; }
    if (t) { const n = t[1].length; out.push(`<h${n}>${inline(t[2])}</h${n}>`, `<p>${inline(linhas.slice(1).join(' '))}</p>`); continue; }
    out.push(`<p>${inline(linhas.join(' '))}</p>`);
  }
  return out.join('');
}

export function absoluteSiteUrl(origin, base, path) {
  if (/^https:\/\//i.test(String(path || ''))) return String(path);
  return `${origin}${base}${String(path || '').startsWith('/') ? path : `/${path || ''}`}`;
}

export function absoluteAssetUrl(origin, path) {
  if (/^https:\/\//i.test(String(path || ''))) return String(path);
  return `${origin}${String(path || '').startsWith('/') ? path : `/${path || ''}`}`;
}

export function safeJsonLd(value) {
  const escaped = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => escaped[char]);
}

function articleStructuredData({ site, post, origin, base }) {
  const home = absoluteSiteUrl(origin, base, '/');
  const blog = absoluteSiteUrl(origin, base, '/blog');
  const canonical = absoluteSiteUrl(origin, base, `/blog/${encodeURIComponent(post.slug)}`);
  const faq = faqDoTexto(post.content);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${canonical}#article`,
        headline: post.title, datePublished: post.publishedAt, dateModified: post.dateModified || post.publishedAt,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        author: { '@type': 'Person', name: post.author },
        ...(post.coverUrl ? { image: absoluteAssetUrl(origin, post.coverUrl) } : {}),
        publisher: { '@type': 'Organization', name: site.name, url: home },
        ...(post.seoDescription || post.excerpt ? { description: post.seoDescription || post.excerpt } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Início', item: home },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: blog },
          { '@type': 'ListItem', position: 3, name: post.title, item: canonical },
        ],
      },
      ...(faq.length ? [faqLd(faq, `${canonical}#perguntas-frequentes`)] : []),
    ],
  };
}

/** Cabeçalho das páginas geradas no servidor (blog, /sobre, /torneios): tema do site, canonical, Open Graph e JSON-LD escapado. */
export function head({ site, origin, base, title, description, canonical, image, structuredData = null, ogType = 'article', extraCss = '' }) {
  const canonicalUrl = absoluteSiteUrl(origin, base, canonical);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonicalUrl)}">
    <meta property="og:url" content="${esc(canonicalUrl)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="${esc(ogType)}">
    ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}<link rel="stylesheet" href="/assets/site.css">
    ${structuredData ? `<script type="application/ld+json">${safeJsonLd(structuredData)}</script>` : ''}${tagMedicao(site)}
    <style>${themeCss(parse(site.theme, {}))}
      .blog-wrap{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:44px 0 72px;color:var(--text);font:400 16px/1.65 var(--font,system-ui,sans-serif)}
      .blog-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--border)}
      .blog-top a{color:var(--primary);text-decoration:none;font-weight:650}.blog-brand{font-size:1.1rem;color:var(--text)!important}
      .blog-intro{max-width:680px;margin:48px auto 30px;text-align:center}.blog-intro h1,.blog-article h1{font:700 clamp(2rem,5vw,3.5rem)/1.12 var(--font-head,var(--font));letter-spacing:-.035em;margin:0 0 12px}
      .blog-intro p,.blog-meta{color:var(--muted)}.blog-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}
      .blog-card{overflow:hidden;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.blog-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
      .blog-card-body{padding:18px}.blog-card h2{font:650 1.3rem/1.25 var(--font-head,var(--font));margin:6px 0 8px}.blog-card h2 a{color:var(--text);text-decoration:none}.blog-card p{color:var(--muted);margin:0 0 12px}
      .blog-meta{font-size:.87rem}.blog-article{max-width:760px;margin:50px auto 0}.blog-cover{display:block;width:100%;max-height:440px;object-fit:cover;border-radius:var(--radius);margin:28px 0}
      .blog-content{font-size:1.08rem;line-height:1.85}.blog-content p{margin:0 0 1.3em}
      .blog-content h2{font:700 clamp(1.45rem,3vw,1.9rem)/1.2 var(--font-head,var(--font));margin:1.9em 0 .55em}.blog-content h3{font:650 1.2rem/1.3 var(--font-head,var(--font));margin:1.5em 0 .45em}
      .blog-content ul,.blog-content ol{margin:0 0 1.3em;padding-left:1.3em}.blog-content li{margin:.3em 0}.blog-content a{color:var(--primary);text-underline-offset:.2em}
      .blog-content strong{color:var(--text)}.blog-back{display:inline-block;margin-top:24px;color:var(--primary);font-weight:650;text-decoration:none}
      .blog-related{margin:34px 0 0;padding-top:20px;border-top:1px solid var(--border)}.blog-related h2{font:650 1.3rem/1.25 var(--font-head,var(--font));margin:0 0 12px}.blog-related ul{padding-left:20px}.blog-related li{margin:10px 0}.blog-related a{color:var(--primary);font-weight:650}.blog-related p{margin:3px 0;color:var(--muted)}
      .blog-tags{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.blog-tags span{border:1px solid var(--border);border-radius:999px;padding:2px 9px;color:var(--muted);font-size:.8rem}
      .blog-fig{margin:1.6em 0}.blog-fig img{width:100%;height:auto;border-radius:var(--radius)}
      .blog-box{margin:0 0 1.4em;padding:16px 18px;border:1px solid var(--border);border-left:4px solid var(--primary);border-radius:var(--radius);background:var(--surface)}
      .blog-box p:last-child,.blog-box ul:last-child,.blog-box ol:last-child{margin-bottom:0}.blog-box-title{display:block;margin:0 0 6px;font-weight:700;color:var(--text)}
      .blog-box-cta,.blog-box-dica{border-left-color:var(--accent,var(--primary))}
      @media(max-width:600px){.blog-wrap{padding-top:26px}.blog-intro{margin:34px auto 22px}.blog-article{margin-top:34px}}${extraCss}
    </style></head>`;
}

export function sendHtml(send, res, html) {
  return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PUBLIC_CSP,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'public, max-age=60' });
}

function blogIndex({ res, send, site, repo, base, origin }) {
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', extra: 'published_data IS NOT NULL' })
    .map((row) => publishedCopy(row)).filter(Boolean);
  const cards = posts.map((post) => `<article class="blog-card">${post.coverUrl ? `<img src="${esc(post.coverUrl)}" alt="${esc(post.title)}" loading="lazy">` : ''}
    <div class="blog-card-body"><span class="blog-meta">${esc(post.category)} · ${esc(post.author)}</span><h2><a href="${esc(`${base}/blog/${encodeURIComponent(post.slug)}`)}">${esc(post.title)}</a></h2>
    <p>${esc(post.excerpt || post.seoDescription)}</p><time class="blog-meta" datetime="${esc(post.publishedAt || '')}">${esc(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : '')}</time></div></article>`).join('');
  // SEO do índice (09/11/2026): título e descrição com o tema do site, og:image da capa mais nova e CollectionPage/ItemList.
  const seo = parse(site.seo, {});
  const title = `Blog ${site.name}: guias, dicas e novidades`.slice(0, 70);
  const base_desc = String(seo.description || '').trim();
  const description = (base_desc.length >= 70 ? base_desc
    : `Guias, dicas e novidades de ${site.name}: ${posts.length} artigo${posts.length === 1 ? '' : 's'} publicado${posts.length === 1 ? '' : 's'}, do básico ao avançado.`).slice(0, 160);
  const capa = posts.find((p) => p.coverUrl)?.coverUrl;
  const blogUrl = absoluteSiteUrl(origin, base, '/blog');
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', '@id': `${blogUrl}#blog`, url: blogUrl, name: title, description, inLanguage: 'pt-BR',
      isPartOf: { '@type': 'WebSite', name: site.name, url: absoluteSiteUrl(origin, base, '/') },
      mainEntity: { '@type': 'ItemList', itemListElement: posts.slice(0, 50).map((p, i) => ({ '@type': 'ListItem', position: i + 1,
        url: absoluteSiteUrl(origin, base, `/blog/${encodeURIComponent(p.slug)}`), name: p.title })) } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: absoluteSiteUrl(origin, base, '/') },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: blogUrl }] },
  ] };
  return sendHtml(send, res, `${head({ site, origin, base, title, description, canonical: '/blog', image: capa ? absoluteAssetUrl(origin, capa) : '', structuredData, ogType: 'website' })}<body><main class="blog-wrap">
    <nav class="blog-top"><a class="blog-brand" href="${esc(`${base}/`)}">${esc(site.name)}</a><a href="${esc(`${base}/`)}">Página inicial</a></nav>
    <header class="blog-intro"><h1>Blog</h1><p>Artigos e informações publicados por ${esc(site.name)}.</p></header>
    ${posts.length ? `<section class="blog-list" aria-label="Artigos publicados">${cards}</section>` : '<div class="blog-empty">Ainda não há artigos publicados.</div>'}
    </main></body></html>`);
}

function blogArticle({ res, send, site, repo, base, origin, params }) {
  const rows = repo.all('posts', { site_id: site.id, published_slug: params.slug }, { limit: 1, extra: 'published_data IS NOT NULL' });
  const post = rows.length ? publishedCopy(rows[0]) : null;
  if (!post) return send(res, 404, 'Artigo não encontrado.');
  const title = `${post.seoTitle || post.title} · ${site.name}`;
  const description = post.seoDescription || post.excerpt || '';
  const tags = post.tags.map((tag) => `<span>${esc(tag)}</span>`).join('');
  const related = suggestInternalLinks(repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', limit: 100, extra: 'published_data IS NOT NULL' }), post, rows[0].id);
  const relatedHtml = related.length ? `<aside class="blog-related" aria-labelledby="blog-related-title"><h2 id="blog-related-title">Posts relacionados</h2><ul>${related.map((item) => `<li><a href="${esc(`${base}${item.url}`)}">${esc(item.title)}</a>${item.excerpt ? `<p>${esc(item.excerpt)}</p>` : ''}</li>`).join('')}</ul></aside>` : '';
  const cover = post.coverUrl ? absoluteAssetUrl(origin, post.coverUrl) : '';
  const html = `${head({ site, origin, base, title, description, canonical: `/blog/${encodeURIComponent(post.slug)}`, image: cover,
    structuredData: articleStructuredData({ site, post, origin, base }) })}<body><main class="blog-wrap">
    <nav class="blog-top"><a class="blog-brand" href="${esc(`${base}/`)}">${esc(site.name)}</a><a href="${esc(`${base}/blog`)}">Todos os artigos</a></nav>
    <article class="blog-article"><p class="blog-meta">${esc(post.category)} · ${esc(post.author)} · <time datetime="${esc(post.publishedAt || '')}">${esc(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : '')}</time></p>
    <h1>${esc(post.title)}</h1>${post.excerpt ? `<p class="blog-meta">${esc(post.excerpt)}</p>` : ''}${tags ? `<div class="blog-tags" aria-label="Tags">${tags}</div>` : ''}
    ${post.coverUrl ? `<img class="blog-cover" src="${esc(post.coverUrl)}" alt="${esc(post.title)}">` : ''}<div class="blog-content">${htmlText(post.content)}</div>
    ${relatedHtml}<a class="blog-back" href="${esc(`${base}/blog`)}">Voltar ao blog</a></article></main></body></html>`;
  return sendHtml(send, res, html);
}

function xmlText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function blogFeed({ res, send, site, repo, base, origin }) {
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', extra: 'published_data IS NOT NULL' })
    .map((row) => publishedCopy(row)).filter(Boolean);
  const blogUrl = absoluteSiteUrl(origin, base, '/blog');
  const feedUrl = absoluteSiteUrl(origin, base, '/blog/feed.xml');
  const items = posts.map((post) => {
    const link = absoluteSiteUrl(origin, base, `/blog/${encodeURIComponent(post.slug)}`);
    const timestamp = Date.parse(post.publishedAt || '');
    const pubDate = Number.isFinite(timestamp) ? new Date(timestamp).toUTCString() : '';
    return `<item><title>${xmlText(post.title)}</title><link>${xmlText(link)}</link><guid isPermaLink="true">${xmlText(link)}</guid>${pubDate ? `<pubDate>${xmlText(pubDate)}</pubDate>` : ''}
      <description>${xmlText(post.seoDescription || post.excerpt || '')}</description><content:encoded>${xmlText(htmlText(post.content))}</content:encoded></item>`;
  }).join('');
  const latest = Date.parse(posts[0]?.dateModified || posts[0]?.publishedAt || '');
  const lastBuildDate = Number.isFinite(latest) ? `<lastBuildDate>${new Date(latest).toUTCString()}</lastBuildDate>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <title>${xmlText(`Blog · ${site.name}`)}</title><link>${xmlText(blogUrl)}</link><description>${xmlText(`Artigos e informações de ${site.name}.`)}</description><language>pt-BR</language>
    <atom:link href="${xmlText(feedUrl)}" rel="self" type="application/rss+xml"/>${lastBuildDate}${items}</channel></rss>`;
  return send(res, 200, xml, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=300' });
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/posts', perm: 'blog.read', handler: ({ repo, query }) => {
      if (query.siteId) requireSite(repo, query.siteId);
      const where = query.siteId ? { site_id: String(query.siteId) } : {};
      const posts = repo.all('posts', where, { order: 'updated_at DESC' });
      const sites = repo.all('sites', {}, { order: 'created_at ASC' });
      const siteNames = new Map(sites.map((site) => [site.id, site.name]));
      const publishedBySite = new Map();
      return { posts: posts.map((post) => {
        if (!publishedBySite.has(post.site_id)) publishedBySite.set(post.site_id,
          repo.all('posts', { site_id: post.site_id }, { order: 'published_at DESC', limit: 100, extra: 'published_data IS NOT NULL' }));
        const suggestions = suggestInternalLinks(publishedBySite.get(post.site_id),
          { title: post.title, category: post.category, tags: parse(post.tags, []) }, post.id);
        return postOut(post, suggestions, siteNames.get(post.site_id) || '');
      }),
        sites: sites.map((s) => ({ id: s.id, slug: s.slug, name: s.name })) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts', perm: 'blog.edit', handler: ({ repo, body, audit }) => {
      const site = requireSite(repo, body.siteId);
      const article = cleanArticle(body);
      if (slugTaken(repo, site.id, article.slug)) throw new HttpError(409, 'Já existe um artigo com esse slug neste site.');
      let post;
      try { post = repo.insert('posts', { site_id: site.id, ...article, status: 'rascunho', scheduled_at: null, published_at: null, published_slug: null, published_data: null }); }
      catch (error) { if (/UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, 'Já existe um artigo com esse slug neste site.'); throw error; }
      audit('blog.artigo.criar', post.id, { siteId: site.id, slug: post.slug });
      return { status: 201, body: { post: postResponse(repo, post) } };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/posts/:id', perm: 'blog.edit', handler: ({ repo, params, body, audit }) => {
      const current = requirePost(repo, params.id);
      if (body.siteId && String(body.siteId) !== current.site_id) throw new HttpError(400, 'O site do artigo não pode ser alterado.');
      const article = cleanArticle(body, current);
      if (slugTaken(repo, current.site_id, article.slug, current.id)) throw new HttpError(409, 'Já existe um artigo com esse slug neste site.');
      const status = current.status === 'publicado' || current.status === 'agendado' ? 'revisao' : current.status;
      let post;
      try { post = repo.update('posts', current.id, { ...article, status, scheduled_at: null }); }
      catch (error) { if (/UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, 'Já existe um artigo com esse slug neste site.'); throw error; }
      audit('blog.artigo.editar', post.id, { slug: post.slug, estado: post.status });
      return { post: postResponse(repo, post) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/review', perm: 'blog.edit', handler: ({ repo, params, audit }) => {
      const post = requirePost(repo, params.id);
      const updated = repo.update('posts', post.id, { status: 'revisao', scheduled_at: null });
      audit('blog.artigo.enviar_revisao', post.id, { slug: post.slug });
      return { post: postResponse(repo, updated) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/publish', perm: 'blog.publish', handler: ({ repo, params, audit, app, tenant }) => {
      const post = requirePost(repo, params.id);
      if (slugTaken(repo, post.site_id, post.slug, post.id)) throw new HttpError(409, 'Já existe outro artigo publicado com esse slug.');
      const at = now();
      let updated;
      try { updated = repo.update('posts', post.id, { status: 'publicado', scheduled_at: null, published_at: at,
        published_slug: post.slug, published_data: JSON.stringify(publishedData(post, at)) }); }
      catch (error) { if (/UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, 'Já existe outro artigo publicado com esse slug.'); throw error; }
      audit('blog.artigo.publicar', post.id, { slug: post.slug });
      announcePost(app, tenant, repo, updated); // fluxo de SEO do núcleo: IndexNow + sitemap (sem esperar)
      return { post: postResponse(repo, updated) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/schedule', perm: 'blog.publish', handler: ({ repo, params, body, audit }) => {
      const post = requirePost(repo, params.id);
      const parsed = Date.parse(String(body.scheduledAt || ''));
      if (!Number.isFinite(parsed) || parsed <= Date.now()) throw new HttpError(400, 'Escolha um horário futuro para publicar.');
      if (slugTaken(repo, post.site_id, post.slug, post.id)) throw new HttpError(409, 'Já existe outro artigo com esse slug neste site.');
      const scheduledAt = new Date(parsed).toISOString();
      const updated = repo.update('posts', post.id, { status: 'agendado', scheduled_at: scheduledAt });
      audit('blog.artigo.agendar', post.id, { slug: post.slug, scheduledAt });
      return { post: postResponse(repo, updated) };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/posts/:id/schedule', perm: 'blog.publish', handler: ({ repo, params, body, audit, user, role }) => {
      if (!can(user, role, 'blog.edit')) throw new HttpError(403, 'Seu papel nesta operação não permite editar artigos.');
      const post = requirePost(repo, params.id);
      if (body.siteId && String(body.siteId) !== post.site_id) throw new HttpError(400, 'O site do artigo não pode ser alterado.');
      const parsed = Date.parse(String(body.scheduledAt || ''));
      if (!Number.isFinite(parsed) || parsed <= Date.now()) throw new HttpError(400, 'Escolha um horário futuro para publicar.');
      const article = cleanArticle(body, post);
      if (slugTaken(repo, post.site_id, article.slug, post.id)) throw new HttpError(409, 'Já existe outro artigo com esse slug neste site.');
      const scheduledAt = new Date(parsed).toISOString();
      let updated;
      try { updated = repo.update('posts', post.id, { ...article, status: 'agendado', scheduled_at: scheduledAt }); }
      catch (error) { if (/UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, 'Já existe outro artigo com esse slug neste site.'); throw error; }
      audit('blog.artigo.agendar', post.id, { slug: post.slug, scheduledAt });
      return { post: postResponse(repo, updated) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/unpublish', perm: 'blog.publish', handler: ({ repo, params, audit, app, tenant }) => {
      const post = requirePost(repo, params.id);
      const updated = repo.update('posts', post.id, { status: 'rascunho', scheduled_at: null, published_at: null, published_slug: null, published_data: null });
      audit('blog.artigo.despublicar', post.id, { slug: post.slug });
      if (post.published_slug) announcePost(app, tenant, repo, { ...post, published_slug: post.published_slug }, 'remocao');
      return { post: postResponse(repo, updated) };
    },
  },
];

export const publicRoutes = [
  { path: '/blog/feed.xml', handler: blogFeed },
  { path: '/blog', handler: blogIndex },
  { path: '/blog/:slug', handler: blogArticle },
];

/** Gancho do núcleo: posts publicados entram no sitemap do site com a data de publicação. */
export const sitemapEntries = ({ site, repo }) => {
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', extra: 'published_data IS NOT NULL' });
  if (!posts.length) return [];
  const lastmod = (post) => parse(post.published_data, {})?.dateModified || post.published_at;
  return [{ path: '/blog', lastmod: lastmod(posts[0]) }, ...posts.map((post) => ({ path: `/blog/${encodeURIComponent(post.published_slug)}`, lastmod: lastmod(post) }))];
};

/** Avisa os buscadores (IndexNow) do post e do índice do blog. Nunca derruba a publicação. */
function announcePost(app, tenant, repo, post, reason = 'publicacao') {
  try {
    const site = repo.get('sites', post.site_id);
    if (site && app?.seo) app.seo.announce(tenant, site, [`/blog/${encodeURIComponent(post.published_slug)}`, '/blog'], reason);
  } catch (e) { console.error('[blog] aviso de SEO falhou:', e.message); }
}

/** Publica cada agendamento vencido uma única vez dentro de uma transação SQLite. */
export function publishDuePosts(db, at = now(), onPublished = null) {
  return tx(db, () => {
    const due = db.prepare("SELECT * FROM posts WHERE status = 'agendado' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC").all(at);
    const update = db.prepare(`UPDATE posts SET status = 'publicado', scheduled_at = NULL, published_at = ?, published_slug = ?, published_data = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = 'agendado' AND scheduled_at <= ?`);
    let count = 0;
    for (const post of due) {
      const duplicate = db.prepare('SELECT id FROM posts WHERE tenant_id = ? AND site_id = ? AND published_slug = ? AND id != ?').get(post.tenant_id, post.site_id, post.slug, post.id);
      if (duplicate) {
        db.prepare("UPDATE posts SET status = 'revisao', scheduled_at = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'agendado'")
          .run(at, post.tenant_id, post.id);
        continue;
      }
      const stamp = now();
      const result = update.run(stamp, post.slug, JSON.stringify(publishedData(post, stamp)), stamp, post.tenant_id, post.id, at);
      count += result.changes;
      if (result.changes && onPublished) onPublished({ ...post, published_slug: post.slug, published_at: stamp });
    }
    return count;
  });
}

export function init(app) {
  const aoPublicar = (post) => {
    const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(post.tenant_id);
    if (tenant) setImmediate(() => announcePost(app, tenant, scoped(app.db, tenant.id), post));
  };
  publishDuePosts(app.db, now(), aoPublicar);
  const timer = setInterval(() => {
    try { publishDuePosts(app.db, now(), aoPublicar); }
    catch { console.error('Falha ao verificar artigos agendados do blog.'); }
  }, 1000);
  timer.unref?.();
  return timer;
}
