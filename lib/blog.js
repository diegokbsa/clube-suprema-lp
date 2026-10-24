// Blog do Clube Suprema: posts em Markdown (content/blog/*.md) renderizados no servidor,
// com os metadados que buscadores e assistentes de IA usam: título/descrição, canonical,
// Open Graph, JSON-LD (BlogPosting, BreadcrumbList, FAQPage, Organization, WebSite),
// sitemap com imagens, feed RSS e llms.txt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown, escapeHtml, inline, slugify } from './markdown.js';
import { config } from '../config.js';

const CONTENT_DIR = fileURLToPath(new URL('../content/blog/', import.meta.url));

export const SITE = {
  url: 'https://suprema.blog',
  name: 'Clube Suprema',
  blogName: 'Blog do Clube Suprema',
  description: 'Guias do app Suprema Poker, como entrar no clube, fichas por PIX, formatos de torneio e as respostas que o suporte mais dá.',
  logo: 'https://suprema.blog/img/logo.png',
  ogImage: 'https://suprema.blog/img/og-clube-suprema.jpg',
  lang: 'pt-BR',
  locale: 'pt_BR',
};

const abs = (u) => (/^https?:\/\//i.test(u) ? u : `${SITE.url}${u.startsWith('/') ? '' : '/'}${u}`);
const waLink = (text) => `https://wa.me/${config.supportWhatsapp}?text=${encodeURIComponent(text)}`;
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
    description: data.description || '',
    date: data.date || '2026-01-01',
    updated: data.updated || data.date || '2026-01-01',
    cover: data.cover || '',
    coverAlt: data.coverAlt || data.title || '',
    tags,
    faq: Array.isArray(data.faq) ? data.faq.filter((f) => f && f.q && f.a) : [],
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

function related(post, n = 3) {
  const others = getPosts().filter((p) => p.slug !== post.slug);
  const score = (p) => p.tags.filter((t) => post.tags.includes(t)).length;
  return others.sort((a, b) => score(b) - score(a)).slice(0, n);
}

// ---------- Pedaços de página ----------

const TRACKING_HEAD = `
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-N46659WQ');</script>
  <!-- End Google Tag Manager -->
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=AW-970454313"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'AW-970454313');
    ${config.tracking.ga4Id ? `gtag('config', '${config.tracking.ga4Id}');` : ''}
  </script>`;

const TRACKING_BODY = `
  <!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N46659WQ"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->`;

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23efa144'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='%231c1c1c'%3E%E2%99%A0%3C/text%3E%3C/svg%3E";

const WA_SVG = '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>';

const organizationLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE.url}/#organizacao`,
  name: SITE.name,
  url: SITE.url,
  logo: { '@type': 'ImageObject', url: SITE.logo, width: 512, height: 512 },
  description: `Clube de poker online no app Suprema Poker (ID ${config.club.id}). Fichas por PIX e suporte 24h no WhatsApp.`,
  areaServed: 'BR',
  contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', availableLanguage: ['Portuguese', 'English', 'Spanish'], url: waLink('Oi, vim do suprema.blog e quero suporte.'), hoursAvailable: 'Mo-Su 00:00-23:59' }],
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

const jsonLdScript = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

function layout({ title, description, canonical, ogImage = SITE.ogImage, ogType = 'website', jsonLd = [], body, bodyClass = '', extraHead = '', robots = 'index,follow,max-image-preview:large,max-snippet:-1' }) {
  const fullTitle = title.includes(SITE.name) ? title : `${title} · ${SITE.name}`;
  return `<!doctype html>
<html lang="${SITE.lang}">
<head>
  <meta charset="utf-8">${TRACKING_HEAD}
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${abs(canonical)}">
  <meta name="robots" content="${robots}">
  <meta name="theme-color" content="#040404">
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
  <link rel="icon" href="${FAVICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800;900&family=Antonio:wght@700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/blog.css">
  ${extraHead}
  ${[organizationLd(), websiteLd(), ...jsonLd].map(jsonLdScript).join('\n  ')}
</head>
<body class="${bodyClass}">${TRACKING_BODY}
  <header class="topbar">
    <a class="brand" href="/" aria-label="Clube Suprema, página inicial">
      <span class="brand-mark" aria-hidden="true">♠</span>
      <span class="brand-text"><strong>Clube Suprema</strong><small>ID ${escapeHtml(config.club.id)}</small></span>
    </a>
    <nav class="topnav topnav-blog" aria-label="Seções">
      <a href="/blog">Blog</a>
      <a href="/#como-funciona">Como funciona</a>
      <a href="/#faq">Dúvidas</a>
    </nav>
    <a class="btn btn-sm" href="/#cadastro">Quero jogar</a>
  </header>
  ${body}
  <footer class="footer">
    <p><strong>Clube Suprema</strong> · ${escapeHtml(config.club.name)} · ID ${escapeHtml(config.club.id)}</p>
    <p>
      <a href="/">Página inicial</a> ·
      <a href="/blog">Blog</a> ·
      <a href="${waLink('Oi, vim do suprema.blog e quero suporte.')}" target="_blank" rel="noopener">Suporte 24h no WhatsApp</a> ·
      <a href="${config.links.responsibleGaming}" target="_blank" rel="noopener">Jogo consciente</a> ·
      <a href="/blog/feed.xml">RSS</a>
    </p>
    <p class="muted small">Jogue com responsabilidade. Proibido para menores de 18 anos.</p>
  </footer>
  <a class="wa-float" href="${waLink('Oi, vim do blog do Clube Suprema e preciso de ajuda.')}" target="_blank" rel="noopener" aria-label="Precisa de ajuda? Fale com o suporte 24h no WhatsApp">
    <span class="wa-float-label">Precisa de ajuda?</span>
    <span class="wa-float-icon" aria-hidden="true">${WA_SVG}</span>
  </a>
</body>
</html>`;
}

const ctaBlock = (title = 'Pronto para sentar na mesa?', text = 'Entre no Clube Suprema em 2 minutos: abra o app pelo nosso link, compre fichas por PIX e conte com suporte 24h.') => `
<aside class="post-cta post-cta-end">
  <strong class="box-title">${escapeHtml(title)}</strong>
  <p>${escapeHtml(text)}</p>
  <p class="cta-actions"><a class="btn" href="/#cadastro">Quero jogar <span class="btn-arrow" aria-hidden="true">→</span></a> <a class="btn btn-ghost" href="/#como-funciona">Como funciona</a></p>
</aside>`;

const postCard = (p) => `
<article class="post-card glow-card">
  ${p.cover ? `<a class="post-card-cover" href="/blog/${p.slug}" tabindex="-1" aria-hidden="true"><img src="${p.cover}" alt="" width="1200" height="630" loading="lazy" decoding="async"></a>` : ''}
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
        blogPost: posts.map((p) => ({ '@type': 'BlogPosting', '@id': `${SITE.url}/blog/${p.slug}#post`, headline: p.title, description: p.description, url: `${SITE.url}/blog/${p.slug}`, mainEntityOfPage: `${SITE.url}/blog/${p.slug}`, datePublished: dateIso(p.date), dateModified: dateIso(p.updated), image: p.cover ? abs(p.cover) : SITE.ogImage, author: { '@type': 'Organization', name: SITE.name, url: SITE.url }, publisher: { '@id': `${SITE.url}/#organizacao` } })),
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
        <p class="post-meta">Por <span>Clube Suprema</span> · Publicado em <time datetime="${post.date}">${dateHuman(post.date)}</time>${post.updated !== post.date ? ` · Atualizado em <time datetime="${post.updated}">${dateHuman(post.updated)}</time>` : ''} · ${post.readingMin} min de leitura</p>
        ${post.cover ? `<figure class="post-cover"><img src="${post.cover}" alt="${escapeHtml(post.coverAlt)}" width="1200" height="630" decoding="async" fetchpriority="high"></figure>` : ''}
      </header>
      ${toc}
      <div class="prose">
        ${post.html}
      </div>
      ${faq}
      ${ctaBlock()}
      <footer class="post-foot">
        <p class="muted small">Conteúdo informativo do Clube Suprema (ID ${escapeHtml(config.club.id)}), clube que opera dentro do app Suprema Poker. Regras e telas do app podem mudar com as atualizações; em caso de dúvida, fale com o <a href="${waLink('Oi, li o blog do Clube Suprema e tenho uma dúvida.')}" target="_blank" rel="noopener">suporte 24h</a>. Somente maiores de 18 anos. Jogue com responsabilidade.</p>
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
      author: { '@type': 'Organization', name: SITE.name, url: SITE.url },
      publisher: { '@id': `${SITE.url}/#organizacao` },
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE.url}${canonical}` },
      inLanguage: SITE.lang,
      isPartOf: { '@id': `${SITE.url}/blog#blog` },
      keywords: post.tags.join(', '),
      articleSection: post.tags[0] || 'Guias',
      wordCount: post.words,
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
  return layout({
    title: post.title,
    description: post.description,
    canonical,
    ogImage: post.cover || SITE.ogImage,
    ogType: 'article',
    jsonLd,
    body,
    bodyClass: 'page-post',
    extraHead: `<meta property="article:published_time" content="${dateIso(post.date)}">\n  <meta property="article:modified_time" content="${dateIso(post.updated)}">\n  ${post.tags.map((t) => `<meta property="article:tag" content="${escapeHtml(t)}">`).join('\n  ')}`,
  });
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
    { loc: '/', lastmod: latest, images: ['/img/og-clube-suprema.jpg', '/img/app-mesa.webp', '/img/app-abertura.webp'] },
    { loc: '/blog', lastmod: latest, images: posts.map((p) => p.cover).filter(Boolean) },
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

> Clube de poker online que opera dentro do app Suprema Poker (clube ID ${config.club.id}, agente ${config.club.agentId}). O jogador entra no clube pelo link oficial, compra fichas por PIX no Fichas 24h e tem suporte humano 24 horas no WhatsApp, em português, inglês e espanhol. Somente maiores de 18 anos.

## Fatos essenciais

- Site oficial do clube: ${SITE.url}
- App: Suprema Poker (Android, iPhone e Windows). Link oficial do clube abre o app já no clube ${config.club.id} com o agente ${config.club.agentId}.
- Fichas: compra por PIX pelo Fichas 24h; saque na chave PIX do próprio CPF.
- Suporte: WhatsApp 24h, todos os dias.
- Público: maiores de 18 anos; jogo responsável.

## Páginas

- [Página inicial](${SITE.url}/): como entrar no clube em 2 minutos, PIX e suporte.
- [Blog](${SITE.url}/blog): guias do app, do clube e das mesas.
- [Feed RSS](${SITE.url}/blog/feed.xml)
- [Sitemap](${SITE.url}/sitemap.xml)
- [Conteúdo completo dos artigos em Markdown](${SITE.url}/llms-full.txt)

## Artigos

${posts.map((p) => `- [${p.title}](${SITE.url}/blog/${p.slug}): ${p.description}`).join('\n')}
`;
}

export function renderLlmsFull() {
  const posts = getPosts();
  return `${renderLlms()}
---

${posts.map((p) => `# ${p.title}

URL: ${SITE.url}/blog/${p.slug}
Publicado: ${p.date} · Atualizado: ${p.updated}
Resumo: ${p.description}

${p.markdown}
${p.faq.length ? `\n## Perguntas frequentes\n\n${p.faq.map((f) => `**${f.q}**\n\n${f.a}\n`).join('\n')}` : ''}
`).join('\n---\n\n')}`;
}
