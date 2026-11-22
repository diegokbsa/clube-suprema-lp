// Blog do Clube Suprema: posts em Markdown (content/blog/*.md) renderizados no servidor,
// com os metadados que buscadores e assistentes de IA usam: título/descrição, canonical,
// Open Graph, JSON-LD (BlogPosting, BreadcrumbList, FAQPage, Organization, WebSite),
// sitemap com imagens, feed RSS e llms.txt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml, inline, slugify } from './markdown.js';
import { config } from '../config.js';
import { hhmm, brl, kilo, modality, dayLabel, shortDay, highlights } from './torneios.js';

const CONTENT_DIR = fileURLToPath(new URL('../content/blog/', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const ABOUT_FILE = fileURLToPath(new URL('../content/sobre.md', import.meta.url));
const ABOUT_UPDATED = '2026-11-15'; // atualize ao revisar content/sobre.md (a data do arquivo muda a cada deploy)

// Entidades citadas nos dados estruturados (ajudam buscadores e IAs a ligar o clube ao app, ao grupo e à liga)
const APP_ENTITY = { '@type': 'Thing', name: 'Suprema Poker', url: 'https://www.supremapoker.net/', description: 'App de poker online organizado em clubes, para Android, iPhone e Windows.' };
const SX_ENTITY = { '@type': 'Organization', name: 'SX Poker', url: 'https://www.sx-co.com', description: 'Grupo de clubes de poker criado em 2021 (SX Intermediações S/A, sede registrada em Belo Horizonte, MG).' };
const LIGA_ENTITY = { '@type': 'Organization', name: 'Liga Suprema', description: 'Liga de clubes do app Suprema Poker que divide o mesmo pool de jogadores.' };
const mentionsLeague = (p) => /\bSX\b|Liga Suprema/.test(p.markdown);

export const SITE = {
  url: 'https://suprema.blog',
  name: 'Clube Suprema',
  blogName: 'Blog do Clube Suprema',
  description: 'Guias do app Suprema Poker, como entrar no clube, fichas por PIX, formatos de torneio e as respostas que o suporte mais dá.',
  logo: 'https://suprema.blog/img/logo.png',
  ogImage: 'https://suprema.blog/img/og-clube-suprema-2.jpg',
  lang: 'pt-BR',
  locale: 'pt_BR',
};

const abs = (u) => (/^https?:\/\//i.test(u) ? u : `${SITE.url}${u.startsWith('/') ? '' : '/'}${u}`);
const fmtDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' });
const dateIso = (d) => new Date(`${d}T12:00:00-03:00`).toISOString();
const dateHuman = (d) => fmtDate.format(new Date(`${d}T12:00:00-03:00`));

// ---------- Front matter (subconjunto de YAML: chave: valor, [a, b] e listas de objetos) ----------

function parseValue(v) {
  const s = String(v).trim();
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return s.replace(/^["']|["']$/g, '');
}

function parseFrontMatter(text) {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  const data = {};
  const lines = m[1].split('\n');
  let i = 0;
  while (i < lines.length) {
    const kv = lines[i].match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) { i++; continue; }
    const [, key, val] = kv;
    if (val !== '') { data[key] = parseValue(val); i++; continue; }
    const list = [];
    i++;
    while (i < lines.length && /^\s+/.test(lines[i])) {
      const item = lines[i].match(/^\s+-\s+(?:([a-zA-Z_]+):\s*(.*)|(.*))$/);
      if (!item) { i++; continue; }
      if (item[1]) {
        const obj = { [item[1]]: parseValue(item[2]) };
        i++;
        while (i < lines.length && /^\s{3,}[a-zA-Z_]+:/.test(lines[i])) {
          const sub = lines[i].match(/^\s+([a-zA-Z_]+):\s*(.*)$/);
          obj[sub[1]] = parseValue(sub[2]);
          i++;
        }
        list.push(obj);
      } else {
        list.push(parseValue(item[3]));
        i++;
      }
    }
    data[key] = list;
  }
  return { data, body: m[2] };
}

// ---------- Carga dos posts (com cache por data de modificação) ----------

let cache = { key: '', posts: [] };

function readPost(file) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const { data, body } = parseFrontMatter(raw);
  const slug = data.slug || slugify(file.replace(/\.md$/, ''));
  const md = renderMarkdown(body);
  const tags = Array.isArray(data.tags) ? data.tags : [];
  return {
    slug,
    title: data.title || slug,
    seoTitle: data.seoTitle || '',
    description: data.description || '',
    date: data.date || '2026-01-01',
    updated: data.updated || data.date || '2026-01-01',
    cover: data.cover || '',
    coverAlt: data.coverAlt || data.title || '',
    tags,
    faq: Array.isArray(data.faq) ? data.faq.filter((f) => f && f.q && f.a) : [],
    resumo: data.resumo || '',
    relacionados: Array.isArray(data.relacionados) ? data.relacionados : [],
    passos: Array.isArray(data.passos) ? data.passos.filter(Boolean) : [],
    passosTitulo: data.passosTitulo || '',
    markdown: body.trim(),
    html: md.html,
    headings: md.headings.filter((h) => h.level === 2),
    images: md.images,
    words: md.words,
    readingMin: Math.max(1, Math.round(md.words / 200)),
  };
}

export function getPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md')).sort();
  const key = files.map((f) => `${f}:${fs.statSync(path.join(CONTENT_DIR, f)).mtimeMs}`).join('|');
  if (key !== cache.key) {
    const posts = files.map(readPost).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    cache = { key, posts };
  }
  return cache.posts;
}

export const getPost = (slug) => getPosts().find((p) => p.slug === slug) || null;

const STOP = new Set(['de', 'do', 'da', 'no', 'na', 'em', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'para', 'por', 'com', 'que', 'como', 'poker', 'suprema', 'clube', 'guia']);
const tokens = (s) => new Set(String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
function related(post, n = 3) {
  const all = getPosts();
  const manual = (post.relacionados || []).map((s) => all.find((p) => p.slug === s)).filter(Boolean).filter((p) => p.slug !== post.slug);
  const mine = tokens(`${post.slug.replace(/-/g, ' ')} ${post.title} ${post.description}`);
  const score = (p) => {
    const tag = p.tags.filter((t) => post.tags.includes(t)).length * 10;
    const other = tokens(`${p.slug.replace(/-/g, ' ')} ${p.title} ${p.description}`);
    let w = 0; for (const x of other) if (mine.has(x)) w++;
    return tag + w;
  };
  const rest = all.filter((p) => p.slug !== post.slug && !manual.includes(p)).sort((a, b) => score(b) - score(a) || (a.slug < b.slug ? -1 : 1));
  return [...manual, ...rest].slice(0, n);
}

// ---------- Pedaços de página ----------

// No blog, os scripts de terceiros (GTM-N46659WQ, Google tag AW-970454313 + GA4, Microsoft Clarity z41gk7muip e,
// com META_PIXEL_ID, o Pixel da Meta para remarketing de quem leu um post)
// entram no primeiro toque/rolagem ou 3 s depois da página carregar. No celular lento eles somavam ~600 KB e
// ~600 ms de processamento bem na hora em que o título é desenhado. As chamadas ficam na fila (dataLayer e
// clarity.q) e são enviadas quando os scripts chegam. Na LP (anúncios) o Google tag segue a mesma regra desde 31/10/2026,
// e o Clarity da LP, desde 09/11/2026, só carrega na primeira interação (PageSpeed: cookies de terceiros).
// Antes de tudo, o primeiro contato do visitante (UTMs, site de onde veio e post de entrada) fica em clube.utm, o mesmo
// registro que a LP lê no cadastro (captureUtm em public/app.js): assim a planilha mostra por qual post o lead chegou.
const TRACKING_HEAD = `
  <script>
    window.clubeConsent=function(){try{return localStorage.getItem('clube.consent')==='yes'}catch(e){return false}};
    (function(){try{var k='clube.utm',s=JSON.parse(localStorage.getItem(k)||'{}'),q=new URLSearchParams(location.search),o={},
    ks=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','ref'],c=function(u){return ks.some(function(x){return u[x]})};
    ks.forEach(function(x){var v=q.get(x);if(v)o[x]=v.slice(0,200)});if(s.at&&!(c(o)&&!c(s)))return;
    var r='';try{r=new URL(document.referrer).hostname}catch(e){}if(r===location.hostname)r='';
    o.referrer=r;o.landing=location.pathname;o.at=new Date().toISOString();localStorage.setItem(k,JSON.stringify(o))}catch(e){}})();
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    ${config.tracking.ga4Id ? `gtag('config', '${config.tracking.ga4Id}');` : ''}
    dataLayer.push({'gtm.start': new Date().getTime(), event: 'gtm.js'});
    window.clarity = window.clarity || function(){(window.clarity.q = window.clarity.q || []).push(arguments)};${config.tracking.metaPixelId ? `
    !function(w){var f=w.fbq=w._fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments)};f.push=f;f.loaded=!0;f.version='2.0';f.queue=[];}(window);
    fbq('init', '${config.tracking.metaPixelId}');fbq('track', 'PageView');` : ''}
    (function(w,d){var ok=0;function add(src){var s=d.createElement('script');s.async=true;s.src=src;d.head.appendChild(s);}
    function go(){if(ok||!w.clubeConsent())return;ok=1;add('https://www.googletagmanager.com/gtag/js?id='+'${config.tracking.ga4Id}');
    add('https://www.clarity.ms/tag/z41gk7muip');${config.tracking.metaPixelId ? `add('https://connect.facebook.net/en_US/fbevents.js');` : ''}}
    function arm(){w.addEventListener('clube:consent',go);setTimeout(go,3000);['scroll','pointerdown','keydown','touchstart'].forEach(function(e){w.addEventListener(e,go,{once:true,passive:true});});}
    if(d.readyState==='complete')arm();else w.addEventListener('load',arm);})(window,document);
  </script>`;

const TRACKING_BODY = ''; // sem Google Tag Manager nem Google Ads (regra do poker, 22/11/2026)



const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE.url}/#organizacao`,
  name: SITE.name,
  url: SITE.url,
  logo: { '@type': 'ImageObject', url: SITE.logo, width: 512, height: 512 },
  description: `Clube de poker online no app Suprema Poker. Guias, grade de torneios e fichas por PIX.`,
  areaServed: 'BR',
  memberOf: [SX_ENTITY, LIGA_ENTITY],
  knowsAbout: ['Poker online', 'Suprema Poker', "Texas Hold'em", 'Omaha', 'Spin Suprema', 'Torneios de poker', 'Clubes de poker'],
  sameAs: [config.links.telegram],
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: ['Portuguese', 'English', 'Spanish'], url: `${SITE.url}/contato`, hoursAvailable: 'Mo-Su 00:00-23:59' }],
});

const websiteLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE.url}/#site`,
  url: SITE.url,
  name: SITE.name,
  inLanguage: SITE.lang,
  publisher: { '@type': 'Organization', name: SITE.name, url: SITE.url },
});

const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(url) })),
});

// Capa em WebP (600 e 1200 px, de tools/imagens/capas_webp.py) quando existir; o JPG fica no og:image e no RSS.
function coverSrcset(cover, sizes) {
  const dir = cover.endsWith('/cover.jpg') ? cover.slice(0, -'cover.jpg'.length) : '';
  if (!dir || !['cover-600.webp', 'cover.webp'].every((f) => fs.existsSync(path.join(PUBLIC_DIR, dir, f)))) return '';
  return ` srcset="${dir}cover-600.webp 600w, ${dir}cover.webp 1200w" sizes="${sizes}"`;
}

const jsonLdScript = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

// Barra fixa no celular nos posts: aparece depois que o título sai da tela e some quando o convite do fim do post
// ou o rodapé aparecem (quem chega pelo Google lê o post inteiro e o botão do fim fica longe).
const POST_DOCK = `
  <div class="post-dock" id="post-dock" aria-hidden="true">
    <a class="btn post-dock-cta" href="/#cadastro" tabindex="-1">Quero jogar <span class="btn-arrow" aria-hidden="true">→</span></a>
  </div>
  <script>
    (function(){var d=document.getElementById('post-dock'),h=document.querySelector('.post-head'),fim=document.querySelectorAll('.post-cta-end, .footer');
    if(!d||!h||!('IntersectionObserver' in window))return;var topo=true,visto=new Map();
    function set(){var on=!topo&&![].some.call(fim,function(el){return visto.get(el)});d.classList.toggle('is-on',on);
    d.setAttribute('aria-hidden',on?'false':'true');d.querySelectorAll('a').forEach(function(a){a.tabIndex=on?0:-1});}
    new IntersectionObserver(function(x){topo=x[0].isIntersecting;set();}).observe(h);
    var io=new IntersectionObserver(function(x){x.forEach(function(i){visto.set(i.target,i.isIntersecting)});set();});
    fim.forEach(function(el){io.observe(el)});})();
  </script>`;

// headTitle: título curto da aba e do Google (o Google corta perto de 60 caracteres); o title vai no Open Graph.
// O " · Clube Suprema" só entra quando cabe nesses 60.
// Rodapé único do site (blog, páginas institucionais e LP): o servidor troca o rodapé de qualquer HTML por este
// (comVisitas em server.js), então não há cópia para esquecer. Aviso de jogo responsável sempre presente.
const COOKIE_BANNER = `
  <style>#aviso-cookies:not([hidden]){display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}</style>
  <div id="aviso-cookies" role="dialog" aria-label="Aviso de cookies" hidden style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#0b0b0b;color:#f2f2f2;border-top:2px solid #ef8a1f;padding:8px 12px;font:13px/1.35 system-ui,Segoe UI,sans-serif">
    <p style="margin:0;flex:1 1 220px">Medição (Google Analytics e Microsoft Clarity) <strong>só se você aceitar</strong>. <a href="/privacidade" style="color:#ef8a1f">Privacidade</a></p>
    <span style="display:flex;gap:8px"><button type="button" data-consent="no" style="padding:7px 14px;border:2px solid #f2f2f2;background:#0b0b0b;color:#f2f2f2;font:600 13px system-ui,sans-serif;border-radius:6px;cursor:pointer">Recusar</button>
    <button type="button" data-consent="yes" style="padding:7px 14px;border:2px solid #f2f2f2;background:#0b0b0b;color:#f2f2f2;font:600 13px system-ui,sans-serif;border-radius:6px;cursor:pointer">Aceitar</button></span>
  </div>
  <script>
    (function(){var k='clube.consent',b=document.getElementById('aviso-cookies');if(!b)return;
    function get(){try{return localStorage.getItem(k)}catch(e){return null}}
    if(!get())b.hidden=false;
    b.addEventListener('click',function(e){var t=e.target.closest('[data-consent]');if(!t)return;var antes=get(),r=t.getAttribute('data-consent');
    try{localStorage.setItem(k,r)}catch(x){}b.hidden=true;if(r==='yes')window.dispatchEvent(new Event('clube:consent'));else if(antes==='yes')location.reload();});
    document.addEventListener('click',function(e){var a=e.target.closest('[data-cookies-reabrir]');if(!a)return;e.preventDefault();b.hidden=false;});})();
  </script>`;

export function renderFooter() {
  return `<footer class="footer">
    <p><strong>Clube Suprema</strong> · ${escapeHtml(config.club.name)}</p>
    <p>
      <a href="/">Página inicial</a> ·
      <a href="/blog">Blog</a> ·
      <a href="/torneios">Grade de torneios</a> ·
      <a href="/sobre">Sobre o clube</a> ·
      <a href="/privacidade">Privacidade</a> ·
      <a href="/termos">Termos de uso</a> ·
      <a href="/contato">Contato</a> ·
      <a href="${config.links.telegram}" target="_blank" rel="noopener">Canal no Telegram</a> ·
      <a href="/jogo-responsavel">Jogo responsável</a> ·
      <a href="/divulgacao">Divulgação</a> ·
      <a href="${config.links.responsibleGaming}" target="_blank" rel="noopener">Jogo consciente (Suprema)</a> ·
      <a href="#cookies" data-cookies-reabrir>Preferências de cookies</a> ·
      <a href="/blog/feed.xml">RSS</a>
    </p>
    <p class="muted small">+18 · Jogue com responsabilidade. Poker online envolve risco financeiro e não garante ganho.</p>
    <p class="muted small">Conteúdo com interesse comercial do Clube Suprema.</p>
  </footer>${COOKIE_BANNER}`;
}

function layout({ title, headTitle = title, description, canonical, ogImage = SITE.ogImage, ogType = 'website', jsonLd = [], body, bodyClass = '', extraHead = '', extraBody = '', robots = 'index,follow,max-image-preview:large,max-snippet:-1' }) {
  const suffixed = `${headTitle} · ${SITE.name}`;
  const fullTitle = headTitle.includes(SITE.name) || suffixed.length > 60 ? headTitle : suffixed;
  return `<!doctype html>
<html lang="${SITE.lang}">
<head>
  <meta charset="utf-8">${TRACKING_HEAD}
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${abs(canonical)}">
  <link rel="alternate" hreflang="pt-BR" href="${abs(canonical)}">
  <link rel="alternate" hreflang="x-default" href="${abs(canonical)}">
  <meta name="robots" content="${robots}">
  <meta name="theme-color" content="#000000">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${abs(canonical)}">
  <meta property="og:image" content="${abs(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${SITE.locale}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${abs(ogImage)}">
  <link rel="alternate" type="application/rss+xml" title="${SITE.blogName}" href="${SITE.url}/blog/feed.xml">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preload" href="/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/blog.css">
  ${extraHead}
  ${[organizationLd(), websiteLd(), ...jsonLd].map(jsonLdScript).join('\n  ')}
</head>
<body class="${bodyClass}">${TRACKING_BODY}
  <header class="topbar">
    <a class="brand" href="/" aria-label="Clube Suprema, página inicial">
      <span class="brand-mark" aria-hidden="true"><svg width="38" height="36" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="-172.7 -161.7 345.3 323.4"><defs><linearGradient id="lg-top" x1="0" y1="-161.7" x2="0" y2="161.7" gradientUnits="userSpaceOnUse"><stop offset="0.0" stop-color="#ffc24d"/><stop offset="0.5" stop-color="#ffa51f"/><stop offset="1.0" stop-color="#f5850c"/></linearGradient></defs><path fill="url(#lg-top)" d="M-61.13 -145.49A38 38 0 0 1 1.13 -145.49L67.08 -51.29A4 4 0 0 1 63.81 -45L8.57 -45A4 4 0 0 1 5.3 -46.71L-21.81 -85.42A10 10 0 0 0 -38.19 -85.42L-75.28 -32.44A6 6 0 0 0 -70.37 -23L165.66 -23A7 7 0 0 1 171.39 -11.98L61.13 145.49A38 38 0 0 1 -1.13 145.49L-67.08 51.29A4 4 0 0 1 -63.81 45L-8.57 45A4 4 0 0 1 -5.3 46.71L21.81 85.42A10 10 0 0 0 38.19 85.42L75.28 32.44A6 6 0 0 0 70.37 23L-165.66 23A7 7 0 0 1 -171.39 11.98Z"/></svg></span>
      <span class="brand-text"><strong>Clube Suprema</strong><small>Blog do clube</small></span>
    </a>
    <nav class="topnav topnav-blog" aria-label="Seções">
      <a href="/#como-funciona" class="btn-mesa"><span class="bt-fita" aria-hidden="true">SUPREMA</span><span class="bt-mesa">Como funciona</span></a>
      <a href="/#acao" class="btn-mesa"><span class="bt-fita" aria-hidden="true">SUPREMA</span><span class="bt-mesa">Ação 24h</span></a>
      <a href="/blog" class="btn-mesa"><span class="bt-fita" aria-hidden="true">SUPREMA</span><span class="bt-mesa">Blog</span></a>
      <a href="/#faq" class="btn-mesa"><span class="bt-fita" aria-hidden="true">SUPREMA</span><span class="bt-mesa">Dúvidas</span></a>
    </nav>
    <div class="topbar-acoes">
      <a href="/torneios" class="btn-mesa btn-torneios" aria-label="Torneios de hoje na Suprema"><span class="bt-fita" aria-hidden="true">SUPREMA</span><span class="bt-mesa"><span class="bt-online" aria-hidden="true"></span>Torneios</span></a>
      <a class="btn btn-sm" href="/#cadastro">Quero jogar</a>
    </div>
  </header>
  ${body}
  ${renderFooter()}
${extraBody}
</body>
</html>`;
}

const ctaBlock = (title = 'Pronto para sentar na mesa?', text = 'Entre no Clube Suprema em 2 minutos: abra o app pelo nosso link, compre fichas por PIX e acompanhe as novidades no Telegram.') => `
<aside class="post-cta post-cta-end">
  <span class="cta-label">Divulgação do clube</span>
  <strong class="box-title">${escapeHtml(title)}</strong>
  <p>${escapeHtml(text)}</p>
  <p class="cta-actions"><a class="btn" href="/#cadastro">Quero jogar <span class="btn-arrow" aria-hidden="true">→</span></a> <a class="btn btn-ghost" href="/#como-funciona">Como funciona</a></p>
  <p class="cta-telegram muted small">Torneios e novidades no nosso <a href="${config.links.telegram}" target="_blank" rel="noopener">canal do Telegram</a>.</p>
</aside>`;

const postCard = (p) => `
<article class="post-card glow-card">
  ${p.cover ? `<a class="post-card-cover" href="/blog/${p.slug}" tabindex="-1" aria-hidden="true"><img src="${p.cover}"${coverSrcset(p.cover, '(max-width: 700px) calc(100vw - 32px), 360px')} alt="" width="1200" height="630" loading="lazy" decoding="async"></a>` : ''}
  <div class="post-card-body">
    <p class="post-tags">${p.tags.slice(0, 3).map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</p>
    <h2><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a></h2>
    <p class="muted">${escapeHtml(p.description)}</p>
    <p class="post-meta"><time datetime="${p.updated}">${dateHuman(p.updated)}</time> · ${p.readingMin} min de leitura</p>
  </div>
</article>`;

// ---------- Páginas ----------

export function renderBlogIndex() {
  const posts = getPosts();
  const body = `
  <main class="blog">
    <nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> › <span>Blog</span></nav>
    <header class="blog-head">
      <p class="eyebrow">${SITE.blogName}</p>
      <h1>Guias do app, do clube<br>e das <span class="gold">mesas</span></h1>
      <p class="lead">${escapeHtml(SITE.description)}</p>
    </header>
    <section class="post-grid" aria-label="Artigos">
      ${posts.map(postCard).join('\n')}
    </section>
    ${ctaBlock()}
  </main>`;
  return layout({
    title: `${SITE.blogName}: guias do app Suprema Poker, clube e fichas`,
    headTitle: `${SITE.blogName}: guias do Suprema Poker e fichas`,
    description: SITE.description,
    canonical: '/blog',
    jsonLd: [
      breadcrumbLd([['Início', '/'], ['Blog', '/blog']]),
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        '@id': `${SITE.url}/blog#blog`,
        name: SITE.blogName,
        url: `${SITE.url}/blog`,
        description: SITE.description,
        inLanguage: SITE.lang,
        publisher: { '@id': `${SITE.url}/#organizacao` },
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', '@id': `${SITE.url}/blog/${p.slug}#post`, headline: p.title, description: p.description, url: `${SITE.url}/blog/${p.slug}`, mainEntityOfPage: `${SITE.url}/blog/${p.slug}`, datePublished: dateIso(p.date), dateModified: dateIso(p.updated), image: p.cover ? abs(p.cover) : SITE.ogImage, author: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/sobre` }, publisher: { '@id': `${SITE.url}/#organizacao` } })),
      },
    ],
    body,
    bodyClass: 'page-blog',
  });
}

export function renderBlogPost(slug) {
  const post = getPost(slug);
  if (!post) return null;
  const canonical = `/blog/${post.slug}`;
  const rel = related(post);
  const toc = post.headings.length >= 3
    ? `<nav class="toc" aria-label="Neste artigo"><strong>Neste artigo</strong><ol>${post.headings.map((h) => `<li><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')}</ol></nav>`
    : '';
  const faq = post.faq.length
    ? `<section class="post-faq" id="perguntas-frequentes"><h2>Perguntas frequentes</h2>${post.faq.map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${inline(f.a)}</p></details>`).join('')}</section>`
    : '';
  const body = `
  <main class="blog">
    <nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> › <a href="/blog">Blog</a> › <span>${escapeHtml(post.title)}</span></nav>
    <article class="post">
      <header class="post-head">
        <p class="post-tags">${post.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="lead">${escapeHtml(post.description)}</p>
        <p class="post-meta">Por <span>Equipe editorial do Clube Suprema</span> · Publicado em <time datetime="${post.date}">${dateHuman(post.date)}</time>${post.updated !== post.date ? ` · Atualizado em <time datetime="${post.updated}">${dateHuman(post.updated)}</time>` : ''} · ${post.readingMin} min de leitura</p>
        ${post.cover ? `<figure class="post-cover"><img src="${post.cover}"${coverSrcset(post.cover, '(max-width: 800px) calc(100vw - 32px), 760px')} alt="${escapeHtml(post.coverAlt)}" width="1200" height="630" decoding="async" fetchpriority="high"></figure>` : ''}
      </header>
      ${post.resumo ? `<aside class="post-note post-answer"><strong class="box-title">Resposta rápida</strong><p>${inline(post.resumo)}</p></aside>` : ''}
      ${toc}
      <div class="prose">
        ${post.html}
      </div>
      ${faq}
      ${ctaBlock()}
      <footer class="post-foot">
        <p class="muted small">Escrito pela equipe do Clube Suprema, clube do grupo SX que joga na Liga Suprema, no app Suprema Poker. Revisado em <time datetime="${post.updated}">${dateHuman(post.updated)}</time>. Veja <a href="/sobre">quem somos e como produzimos o conteúdo</a>. Regras e telas do app podem mudar com as atualizações; em caso de dúvida, veja a página de <a href="/contato">contato</a>. O Clube Suprema tem interesse comercial em que você jogue por ele; veja a <a href="/divulgacao">divulgação</a>. Somente maiores de 18 anos. Jogue com responsabilidade.</p>
      </footer>
    </article>
    ${rel.length ? `<section class="related" aria-label="Leia também"><h2>Leia <span class="gold">também</span></h2><div class="post-grid">${rel.map(postCard).join('')}</div></section>` : ''}
  </main>`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${SITE.url}${canonical}#post`,
      headline: post.title,
      description: post.description,
      image: post.cover ? [abs(post.cover)] : [SITE.ogImage],
      datePublished: dateIso(post.date),
      dateModified: dateIso(post.updated),
      author: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/sobre` },
      publisher: { '@id': `${SITE.url}/#organizacao` },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.url}${canonical}` },
      inLanguage: SITE.lang,
      isPartOf: { '@id': `${SITE.url}/blog#blog` },
      keywords: post.tags.join(', '),
      articleSection: post.tags[0] || 'Guias',
      wordCount: post.words,
      ...(post.resumo ? { abstract: post.resumo } : {}),
      about: APP_ENTITY,
      ...(mentionsLeague(post) ? { mentions: [SX_ENTITY, LIGA_ENTITY] } : {}),
    },
    breadcrumbLd([['Início', '/'], ['Blog', '/blog'], [post.title, canonical]]),
  ];
  if (post.faq.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  if (post.passos.length) {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: post.passosTitulo || post.title,
      inLanguage: SITE.lang,
      step: post.passos.map((t, i) => ({ '@type': 'HowToStep', position: i + 1, name: t.replace(/\.$/, ''), text: t })),
    });
  }
  return layout({
    title: post.title,
    headTitle: post.seoTitle || post.title,
    description: post.description,
    canonical,
    ogImage: post.cover || SITE.ogImage,
    ogType: 'article',
    jsonLd,
    body,
    bodyClass: 'page-post',
    extraBody: POST_DOCK,
    extraHead: `<meta property="article:published_time" content="${dateIso(post.date)}">\n  <meta property="article:modified_time" content="${dateIso(post.updated)}">\n  ${post.tags.map((t) => `<meta property="article:tag" content="${escapeHtml(t)}">`).join('\n  ')}`,
  });
}


export function renderAbout() {
  const md = renderMarkdown(fs.existsSync(ABOUT_FILE) ? fs.readFileSync(ABOUT_FILE, 'utf8') : '');
  const updated = ABOUT_UPDATED;
  const body = `
  <main class="blog">
    <nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> › <span>Sobre o clube</span></nav>
    <article class="post">
      <header class="post-head">
        <p class="post-tags"><span>Sobre</span><span>Grupo SX</span><span>Liga Suprema</span></p>
        <h1>Sobre o Clube Suprema</h1>
        <p class="lead">Clube de poker online no app Suprema Poker, do grupo SX e da Liga Suprema.</p>
        <p class="post-meta">Atualizado em <time datetime="${updated}">${dateHuman(updated)}</time></p>
      </header>
      <div class="prose">
        ${md.html}
      </div>
    </article>
  </main>`;
  return layout({
    title: 'Sobre o Clube Suprema: quem somos, grupo SX e Liga Suprema',
    headTitle: 'Sobre o Clube Suprema: grupo SX e Liga Suprema',
    description: 'Quem é o Clube Suprema no app Suprema Poker, do grupo SX e da Liga Suprema: fichas por PIX e o nosso blog.',
    canonical: '/sobre',
    jsonLd: [
      breadcrumbLd([['Início', '/'], ['Sobre o clube', '/sobre']]),
      { '@context': 'https://schema.org', '@type': 'AboutPage', '@id': `${SITE.url}/sobre#pagina`, url: `${SITE.url}/sobre`, name: 'Sobre o Clube Suprema', inLanguage: SITE.lang, dateModified: updated, about: { '@id': `${SITE.url}/#organizacao` }, isPartOf: { '@id': `${SITE.url}/#site` } },
    ],
    body,
    bodyClass: 'page-post',
    extraBody: POST_DOCK,
  });
}

// ---------- Páginas institucionais: privacidade, termos e contato (content/<slug>.md) ----------

const LEGAL_UPDATED = '2026-11-15'; // atualize ao revisar qualquer uma das três
export const LEGAL_PAGES = {
  privacidade: { h1: 'Política de privacidade', tag: 'LGPD', lead: 'Que dados o suprema.blog coleta, para que usamos e como você pede acesso ou exclusão.', title: 'Política de privacidade do suprema.blog (LGPD)', description: 'Quais dados o suprema.blog coleta (e-mail, visitas, cliques e ferramentas de medição), para que servem e como pedir acesso ou exclusão pela LGPD.', schema: 'WebPage' },
  termos: { h1: 'Termos de uso', tag: 'Termos', lead: 'O suprema.blog é informativo e educativo: não é casa de jogo, não processa pagamentos e não promete ganho.', title: 'Termos de uso do suprema.blog: conteúdo informativo, +18', description: 'Regras do suprema.blog: conteúdo informativo, sem promessa de ganho, só para maiores de 18 anos. O site não é casa de jogo nem processa pagamentos.', schema: 'WebPage' },
  'jogo-responsavel': { h1: 'Jogo responsável', tag: 'Jogo responsável', lead: 'Poker online é só para maiores de 18 anos e envolve risco de perda de dinheiro. Veja como se proteger e onde buscar ajuda.', title: 'Jogo responsável no poker online (+18): limites e onde buscar ajuda', description: 'Como jogar poker online com limite de tempo e de dinheiro, sinais de alerta e canais de ajuda. Somente maiores de 18 anos.', schema: 'WebPage' },
  divulgacao: { h1: 'Divulgação de publicidade e afiliação', tag: 'Transparência', lead: 'Quem mantém o suprema.blog, qual é o interesse comercial do Clube Suprema e como isso aparece no site.', title: 'Divulgação de publicidade e relação comercial do suprema.blog', description: 'O suprema.blog é mantido pelo Clube Suprema, que tem interesse comercial em que você jogue por ele. Veja como a relação aparece no site.', schema: 'WebPage' },
  contato: { h1: 'Contato', tag: 'Contato', lead: 'Os canais que a equipe do Clube Suprema mantém abertos: canal do Telegram e a forma de pedir privacidade ou corrigir um erro.', title: 'Contato do Clube Suprema: Telegram e pedidos de privacidade', description: 'Fale com a equipe do Clube Suprema: canal no Telegram, pedidos de privacidade e correção de erros no site.', schema: 'ContactPage' },
};

export function renderLegal(slug) {
  const meta = LEGAL_PAGES[slug];
  const file = fileURLToPath(new URL(`../content/${slug}.md`, import.meta.url));
  if (!meta || !fs.existsSync(file)) return null;
  const md = renderMarkdown(fs.readFileSync(file, 'utf8'));
  const body = `
  <main class="blog">
    <nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> › <span>${escapeHtml(meta.h1)}</span></nav>
    <article class="post">
      <header class="post-head">
        <p class="post-tags"><span>${escapeHtml(meta.tag)}</span></p>
        <h1>${escapeHtml(meta.h1)}</h1>
        <p class="lead">${escapeHtml(meta.lead)}</p>
        <p class="post-meta">Atualizado em <time datetime="${LEGAL_UPDATED}">${dateHuman(LEGAL_UPDATED)}</time></p>
      </header>
      <div class="prose">
        ${md.html}
      </div>
    </article>
  </main>`;
  return layout({
    title: meta.title,
    headTitle: meta.title,
    description: meta.description,
    canonical: `/${slug}`,
    jsonLd: [
      breadcrumbLd([['Início', '/'], [meta.h1, `/${slug}`]]),
      { '@context': 'https://schema.org', '@type': meta.schema, '@id': `${SITE.url}/${slug}#pagina`, url: `${SITE.url}/${slug}`, name: meta.h1, inLanguage: SITE.lang, dateModified: LEGAL_UPDATED, isPartOf: { '@id': `${SITE.url}/#site` } },
    ],
    body,
    bodyClass: 'page-post',
    extraBody: POST_DOCK,
  });
}

// ---------- Grade de torneios (/torneios; dados de lib/torneios.js) ----------

const hourBr = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(d));
const PERIODS = [['Manhã', '7h às 12h', (h) => h >= 7 && h < 12], ['Tarde', '12h às 18h', (h) => h >= 12 && h < 18],
  ['Noite', '18h à meia-noite', (h) => h >= 18], ['Madrugada', 'meia-noite às 7h', (h) => h < 7]];

const mttItem = (e, now) => {
  const lateOpen = e.start <= now && (!e.late || now < e.late);
  const tags = [modality(e.type), e.ko && 'KO', e.mainEvent && 'Main Event', e.satellite && 'Satélite'].filter(Boolean);
  const info = [
    `Buy-in <b>${e.buyin ? brl(e.buyin) : 'grátis'}</b>`,
    e.guaranteed ? `Garantido <b>${brl(e.guaranteed)}</b>` : '',
    e.stack ? `Stack ${kilo(e.stack)}` : '',
    e.blinds ? `Blinds ${e.blinds} min` : '',
    e.late ? `Late até ${hhmm(e.late)}` : '',
  ].filter(Boolean);
  return `<li class="mtt${e.mainEvent ? ' is-main' : ''}${lateOpen ? ' is-late' : ''}">
        <time class="mtt-hora" datetime="${e.start.toISOString()}">${hhmm(e.start)}</time>
        <div class="mtt-main">
          <p class="mtt-nome">${escapeHtml(e.name)} <span class="mtt-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}${lateOpen ? '<span class="mtt-tag-late">Late aberto</span>' : ''}</span></p>
          <p class="mtt-info">${info.map((s) => `<span>${s}</span>`).join('')}</p>
        </div>${lateOpen ? '\n        <span class="mtt-status">Late aberto</span>' : ''}
      </li>`;
};

// Perguntas da grade com as respostas montadas a partir dos torneios do dia (para quem busca e para os assistentes de IA).
function torneiosFaq(grade) {
  const ev = grade.events;
  const best = highlights(ev, 3);
  const mains = ev.filter((e) => e.mainEvent);
  const list = (xs) => xs.map((e) => `${e.name} às ${hhmm(e.start)}${e.guaranteed ? ` (${brl(e.guaranteed)} garantidos)` : ''}`).join(', ');
  return [
    { q: 'Quais são os torneios desta grade no Suprema Poker?',
      a: `Na grade de ${dayLabel(grade).toLowerCase()}, a Liga Suprema tem ${ev.length} torneios, do primeiro às ${hhmm(ev[0].start)} ao último às ${hhmm(ev[ev.length - 1].start)} (horário de Brasília). Os maiores garantidos são ${list(best)}. A lista completa, com buy-in, stack, blinds e late, está nesta página e é atualizada ao longo do dia (o dia de poker vai das 7h às 7h do dia seguinte).` },
    ...(mains.length ? [{ q: 'Quais são os Main Events desta grade na Liga Suprema?',
      a: `Os Main Events desta grade são ${list(mains.slice(0, 6))}.` }] : []),
    { q: 'O que é late reg nos torneios?',
      a: 'Late reg (registro tardio) é o tempo depois do início em que ainda dá para se inscrever no torneio. Quem entra no late recebe o stack inicial cheio, mas os blinds já subiram. Nesta grade, o horário do fim do late aparece em cada torneio, e o selo "Late aberto" mostra os que já começaram e ainda aceitam inscrição.' },
    { q: 'Como jogar os torneios da Liga Suprema?',
      a: `Os torneios ficam no lobby dos clubes da Liga Suprema no app Suprema Poker. No Clube Suprema, baixe o app, entre no clube pelo link oficial e compre fichas por PIX no Fichas 24h. Somente maiores de 18 anos.` },
  ];
}

// Os maiores torneios do dia como Event (schema.org), para buscadores e assistentes entenderem a grade.
const eventsLd = (grade) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: `Grade de torneios de ${shortDay(grade)} na Liga Suprema`,
  itemListElement: highlights(grade.events, 10).map((e, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: {
      '@type': 'Event',
      name: `${e.name} · Liga Suprema (${modality(e.type)})`,
      startDate: e.start.toISOString(),
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url: `${SITE.url}/torneios` },
      organizer: { '@type': 'Organization', name: 'Liga Suprema', url: `${SITE.url}/torneios` },
      image: SITE.ogImage,
      description: `Torneio de poker ${modality(e.type)} no app Suprema Poker${e.guaranteed ? `, ${brl(e.guaranteed)} garantidos` : ''}${e.stack ? `, stack ${kilo(e.stack)}` : ''}${e.blinds ? `, blinds de ${e.blinds} min` : ''}. Somente maiores de 18 anos.`,
      offers: { '@type': 'Offer', price: e.buyin, priceCurrency: 'BRL', availability: 'https://schema.org/InStock', url: `${SITE.url}/torneios` },
    },
  })),
});

const diaFim = (grade) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(grade.to);
export function renderTorneios(grade, now = new Date()) {
  const open = grade ? grade.events.filter((e) => (e.late || e.start) > now) : [];
  const closed = grade ? grade.events.length - open.length : 0;
  const top = highlights(open, 3);
  const day = grade ? dayLabel(grade) : '';
  const periods = PERIODS.map(([name, range, test]) => [name, range, open.filter((e) => test(hourBr(e.start)))]).filter(([, , list]) => list.length);
  const best = grade ? highlights(grade.events, 1)[0] : null;
  const faq = grade && grade.events.length ? torneiosFaq(grade) : [];
  const body = `
  <main class="blog">
    <nav class="crumbs" aria-label="Você está em"><a href="/">Início</a> › <span>Grade de torneios</span></nav>
    <header class="blog-head">
      <p class="eyebrow">Liga Suprema · horário de Brasília</p>
      <h1>Grade de torneios <span class="gold">${grade ? escapeHtml(`de ${day.toLowerCase()}`) : 'da Liga Suprema'}</span></h1>
      <p class="lead">Os torneios do Suprema Poker no Clube Suprema: horário, buy-in, garantido, stack, blinds e até quando dá para entrar.</p>
      ${grade ? `<p class="grade-date">${escapeHtml(day)} (${shortDay(grade)}) · dia de poker das 7h até as 7h de ${diaFim(grade)} · atualizada às ${hhmm(now)}</p>` : ''}
    </header>
    ${best ? `<p class="grade-resumo">Nesta grade a Liga Suprema tem <b>${grade.events.length} torneios</b>. O maior garantido é o <b>${escapeHtml(best.name)}</b>, com <b>${brl(best.guaranteed)}</b>, às ${hhmm(best.start)}. ${open.length ? `Ainda dá para entrar em ${open.length}.` : 'O registro de todos já fechou.'}</p>` : ''}
    ${!grade ? `<aside class="post-note"><strong class="box-title">Grade indisponível agora</strong><p>Não conseguimos carregar a grade da Liga Suprema. Tente de novo em alguns minutos ou veja os torneios direto no lobby do app.</p></aside>` : ''}
    ${grade && !open.length ? `<aside class="post-note"><strong class="box-title">Sem torneios abertos agora</strong><p>O registro de todos os torneios desta grade já fechou. A grade do dia seguinte aparece aqui a partir das 7h.</p></aside>` : ''}
    ${top.length ? `<section class="grade-top" aria-label="Destaques de hoje">
      ${top.map((e) => `<article class="grade-destaque glow-card">
        <p class="grade-destaque-hora">${hhmm(e.start)}</p>
        <h2>${escapeHtml(e.name)}</h2>
        <p class="grade-destaque-gtd">${e.guaranteed ? `${brl(e.guaranteed)} garantidos` : escapeHtml(modality(e.type))}</p>
        <p class="muted small">${escapeHtml(modality(e.type))} · buy-in ${e.buyin ? brl(e.buyin) : 'grátis'}${e.stack ? ` · stack ${kilo(e.stack)}` : ''}</p>
      </article>`).join('\n      ')}
    </section>` : ''}
    ${periods.map(([name, range, list]) => `<section class="grade" aria-label="${name}">
      <h2 class="grade-period">${name} <small>${range}</small></h2>
      <ol class="mtt-list">
      ${list.map((e) => mttItem(e, now)).join('\n      ')}
      </ol>
    </section>`).join('\n    ')}
    ${grade ? `<p class="muted small grade-fonte">${open.length} torneios ainda abertos${closed ? ` · ${closed} já fecharam o registro hoje` : ''}. Horários de Brasília. Garantido é o valor mínimo de premiação que o torneio promete pagar. Fonte: grade da Liga Suprema, a mesma de <a href="https://www.sx-co.com/torneios" target="_blank" rel="noopener">sx-co.com/torneios</a>. A grade pode mudar: confira sempre no lobby do app antes de se inscrever. Versão em texto: <a href="/torneios.txt">/torneios.txt</a>. Somente maiores de 18 anos. Jogue com responsabilidade.</p>` : ''}
    ${faq.length ? `<section class="post-faq grade" aria-labelledby="faq-torneios">
      <h2 id="faq-torneios">Perguntas sobre os torneios desta grade</h2>
      ${faq.map((f) => `<details><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`).join('\n      ')}
    </section>` : ''}
    ${ctaBlock('Quer jogar esses torneios?', 'Os torneios da Liga Suprema ficam no lobby do Clube Suprema. Entre no clube em 2 minutos, compre fichas por PIX e acompanhe as novidades no Telegram.')}
  </main>`;
  return layout({
    title: grade ? `Grade de ${dayLabel(grade).toLowerCase()} (${shortDay(grade)}) no Suprema Poker: Liga Suprema` : 'Grade de torneios de hoje no Suprema Poker (Liga Suprema)',
    headTitle: grade ? `Grade de torneios de ${shortDay(grade)} no Suprema Poker · Liga Suprema` : 'Grade de torneios de hoje no Suprema Poker (Liga Suprema)',
    description: best
      ? `Grade de ${day.toLowerCase()} (${shortDay(grade)}) na Liga Suprema: ${grade.events.length} torneios, maior garantido ${best.name} (${brl(best.guaranteed)}) às ${hhmm(best.start)}. Horário de Brasília, buy-in e late reg.`
      : 'Torneios de hoje no Suprema Poker, na Liga Suprema: horário de Brasília, buy-in, garantido e late reg, atualizados ao longo do dia.',
    canonical: '/torneios',
    jsonLd: [
      breadcrumbLd([['Início', '/'], ['Grade de torneios', '/torneios']]),
      { '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${SITE.url}/torneios#pagina`, url: `${SITE.url}/torneios`, name: 'Grade de torneios da Liga Suprema no Suprema Poker', inLanguage: SITE.lang, dateModified: now.toISOString(), isPartOf: { '@id': `${SITE.url}/#site` } },
      ...(grade && grade.events.length ? [eventsLd(grade)] : []),
      ...(faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }] : []),
    ],
    body,
    bodyClass: 'page-blog page-torneios',
  });
}

// /torneios.txt: a mesma grade em texto simples, fácil de ler para assistentes de IA e buscadores.
export function renderTorneiosTxt(grade, now = new Date()) {
  if (!grade) return `# Grade de torneios da Liga Suprema\n\nA grade não carregou agora. Veja ${SITE.url}/torneios em alguns minutos.\n`;
  const line = (e) => `- ${hhmm(e.start)} | ${e.name} | ${modality(e.type)} | buy-in ${e.buyin ? brl(e.buyin) : 'grátis'} | garantido ${e.guaranteed ? brl(e.guaranteed) : '-'} | stack ${e.stack ? kilo(e.stack) : '-'} | blinds ${e.blinds ? `${e.blinds} min` : '-'} | late até ${e.late ? hhmm(e.late) : '-'}${e.mainEvent ? ' | Main Event' : ''}${e.ko ? ' | KO' : ''}${e.satellite ? ' | satélite' : ''}`;
  return `# Grade de torneios da Liga Suprema (Suprema Poker): ${dayLabel(grade)} (dia de poker das 7h às 7h do dia seguinte)

Fonte: grade oficial da Liga Suprema, a mesma de https://www.sx-co.com/torneios. Atualizada às ${hhmm(now)} (horário de Brasília).
Página completa: ${SITE.url}/torneios
Para jogar: Clube Suprema, no app Suprema Poker (${SITE.url}). Como entrar: ${SITE.url}/blog/como-entrar-no-clube-suprema. Somente maiores de 18 anos.

## Destaques (maiores garantidos)
${highlights(grade.events, 5).map(line).join('\n')}

## Todos os torneios do dia (${grade.events.length}), das 7h às 7h do dia seguinte
Formato: horário | nome | modalidade | buy-in | garantido | stack inicial | tempo de blind | fim do registro tardio
${grade.events.map(line).join('\n')}
`;
}

export function renderNotFound() {
  const posts = getPosts().slice(0, 3);
  const body = `
  <main class="blog">
    <header class="blog-head">
      <p class="eyebrow">Erro 404</p>
      <h1>Essa página <span class="gold">não existe</span></h1>
      <p class="lead">O endereço pode ter mudado. Veja o que você estava procurando:</p>
      <p class="cta-actions"><a class="btn" href="/">Página inicial</a> <a class="btn btn-ghost" href="/blog">Blog</a></p>
    </header>
    ${posts.length ? `<section class="post-grid" aria-label="Artigos recentes">${posts.map(postCard).join('')}</section>` : ''}
  </main>`;
  return layout({ title: 'Página não encontrada', description: 'Essa página não existe no Clube Suprema.', canonical: '/404', body, bodyClass: 'page-blog', robots: 'noindex,follow' });
}

// ---------- Sitemap, feed e llms.txt ----------

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function renderSitemap() {
  const posts = getPosts();
  const latest = posts[0]?.updated || new Date().toISOString().slice(0, 10);
  const entries = [
    { loc: '/', lastmod: latest, images: ['/img/og-clube-suprema-2.jpg', '/img/app-mesa.webp', '/img/app-abertura.webp'] },
    { loc: '/blog', lastmod: latest, images: posts.map((p) => p.cover).filter(Boolean) },
    { loc: '/sobre', lastmod: ABOUT_UPDATED, images: ['/img/logo.png'] },
    ...Object.keys(LEGAL_PAGES).map((slug) => ({ loc: `/${slug}`, lastmod: LEGAL_UPDATED, images: [] })),
    { loc: '/torneios', lastmod: new Date().toISOString().slice(0, 10), images: [] }, // muda todo dia
    ...posts.map((p) => ({ loc: `/blog/${p.slug}`, lastmod: p.updated, images: [p.cover, ...p.images.map((i) => i.src)].filter(Boolean) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((e) => `  <url>
    <loc>${xml(abs(e.loc))}</loc>
    <lastmod>${e.lastmod}</lastmod>
${[...new Set(e.images)].map((img) => `    <image:image><image:loc>${xml(abs(img))}</image:loc></image:image>`).join('\n')}
  </url>`).join('\n')}
</urlset>
`;
}

export function renderFeed() {
  const posts = getPosts();
  const absolutize = (html) => html.replace(/(src|href)="\/(?!\/)/g, `$1="${SITE.url}/`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xml(SITE.blogName)}</title>
    <link>${SITE.url}/blog</link>
    <description>${xml(SITE.description)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date(dateIso(posts[0]?.updated || '2026-01-01')).toUTCString()}</lastBuildDate>
    <atom:link href="${SITE.url}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <image><url>${SITE.logo}</url><title>${xml(SITE.blogName)}</title><link>${SITE.url}/blog</link></image>
${posts.map((p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${SITE.url}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE.url}/blog/${p.slug}</guid>
      <pubDate>${new Date(dateIso(p.date)).toUTCString()}</pubDate>
      <description>${xml(p.description)}</description>
      ${p.tags.map((t) => `<category>${xml(t)}</category>`).join('')}
      ${p.cover ? `<enclosure url="${xml(abs(p.cover))}" type="image/jpeg" length="0"/>` : ''}
      <content:encoded><![CDATA[${absolutize(post_html_for_feed(p))}]]></content:encoded>
    </item>`).join('\n')}
  </channel>
</rss>
`;
}

function post_html_for_feed(p) {
  return `${p.cover ? `<p><img src="${p.cover}" alt="${escapeHtml(p.coverAlt)}"></p>` : ''}${p.html}${p.faq.length ? `<h2>Perguntas frequentes</h2>${p.faq.map((f) => `<h3>${escapeHtml(f.q)}</h3><p>${inline(f.a)}</p>`).join('')}` : ''}<p><a href="/blog/${p.slug}">Leia no site</a></p>`;
}

export function renderLlms() {
  const posts = getPosts();
  return `# Clube Suprema

> Clube de poker online que opera dentro do app Suprema Poker . O jogador entra no clube pelo link oficial, compra fichas por PIX no Fichas 24h e acompanha novidades pelo canal do Telegram. Somente maiores de 18 anos.

## Fatos essenciais

- Site oficial do clube: ${SITE.url}
- App: Suprema Poker (Android, iPhone e Windows). Link oficial do clube abre o app já no clube.
- Fichas: compra por PIX pelo Fichas 24h; saque na chave PIX do próprio CPF.
- Contato: canal do Telegram do clube e a página /contato.
- Grupo e liga: o Clube Suprema faz parte do grupo SX (criado em 2021, mais de 100 clubes parceiros segundo https://www.sx-co.com/sobre; a empresa SX Intermediações S/A, CNPJ 43.787.764/0001-81, tem sede registrada em Belo Horizonte-MG) e joga na Liga Suprema, liga de clubes do app que divide o mesmo pool de jogadores.
- App Suprema Poker: do grupo Suprema Gaming, criado em 2018; mais de 500 clubes filiados, segundo https://www.supremapoker.net/ (o site supremapoker.com.br informa 300 clubes filiados e download em mais de 70 países). Downloads oficiais para Android (Google Play e APK), iPhone (App Store) e Windows; não há versão oficial para macOS.
- Público: maiores de 18 anos; jogo responsável.
- Quem somos e política editorial: ${SITE.url}/sobre

## Perguntas rápidas

- Qual é o ID do Clube Suprema? Os números estão em ${SITE.url}/blog/como-entrar-no-clube-suprema.
- Como entrar no clube? Pelo link oficial no celular (${SITE.url}/baixar) ou, no app, em entrar em um clube, com o clube e o agente de ${SITE.url}/blog/como-entrar-no-clube-suprema.
- Como comprar fichas? Por PIX, de uma conta no próprio CPF, pelo Fichas 24h. Na primeira compra, informar o ID da Suprema, o clube e o agente de ${SITE.url}/blog/como-entrar-no-clube-suprema.
- Como sacar? Pelo Fichas 24h, na chave PIX do próprio CPF.
- Tem Suprema Poker para PC? Sim, para Windows, em https://security.supremapoker.com.br/download. Para Mac não há versão oficial.
- O app não abre, o que fazer? Atualizar, reiniciar, desligar a VPN e, se preciso, reinstalar; a conta e as fichas ficam no servidor.

## Páginas

- [Página inicial](${SITE.url}/): como entrar no clube em 2 minutos, PIX e suporte.
- [Sobre o Clube Suprema](${SITE.url}/sobre): quem somos, grupo SX, Liga Suprema e como produzimos o conteúdo.
- [Blog](${SITE.url}/blog): guias do app, do clube e das mesas.
- [Grade de torneios do dia](${SITE.url}/torneios): todos os torneios do dia na Liga Suprema (horário de Brasília, buy-in, garantido, stack, blinds e late), atualizada ao longo do dia. Versão em texto simples: ${SITE.url}/torneios.txt
- [Feed RSS](${SITE.url}/blog/feed.xml)
- [Sitemap](${SITE.url}/sitemap.xml)
- [Conteúdo completo dos artigos em Markdown](${SITE.url}/llms-full.txt)

## Artigos

${posts.map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}): ${p.resumo || p.description}`).join('\n')}
`;
}

export function renderLlmsFull() {
  const posts = getPosts();
  return `${renderLlms()}
---

${posts.map((p) => `# ${p.title}

URL: ${SITE.url}/blog/${p.slug}
Publicado: ${p.date} · Atualizado: ${p.updated}
Resposta rápida: ${p.resumo || p.description}

${p.markdown}
${p.faq.length ? `\n## Perguntas frequentes\n\n${p.faq.map((f) => `**${f.q}**\n\n${f.a}\n`).join('\n')}` : ''}
`).join('\n---\n\n')}`;
}
