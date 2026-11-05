// Site público de uma operação: página publicada (ou rascunho, na prévia) -> HTML completo, com tema, SEO e mensuração com consentimento.
import { esc, renderBlocks } from './blocks.mjs';
import { cleanTheme } from './templates.mjs';
import { parse } from './db.mjs';
import { niche } from './niches.mjs';
import { jsonLd } from './seo.mjs';

const fontsUrl = (t) => {
  const fam = [...new Set([t.fontHead, t.font])].map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${fam}&display=swap`;
};

export function themeCss(theme) {
  const t = cleanTheme(theme);
  return `:root{--bg:${t.bg};--surface:${t.surface};--text:${t.text};--muted:${t.muted};--primary:${t.primary};--primary-text:${t.primaryText};`
    + `--accent:${t.accent};--border:${t.border};--radius:${t.radius}px;--font:'${t.font}',system-ui,sans-serif;--font-head:'${t.fontHead}',var(--font);color-scheme:${t.mode === 'claro' ? 'light' : 'dark'}}`;
}

/**
 * site, page: linhas do banco. blocks: lista já escolhida (publicada ou rascunho).
 * opts: { base, origin, preview, tenant, pages }
 */
export function renderPage({ site, page, blocks, tenant, base, origin, preview = false, pages = [] }) {
  const theme = cleanTheme(parse(site.theme, {}));
  const siteSeo = parse(site.seo, {});
  const seo = parse(page.seo, {});
  const tracking = parse(site.tracking, {});
  const n = niche(tenant.niche_id);
  const title = seo.title || (page.slug ? `${page.title} · ${site.name}` : siteSeo.title || site.name);
  const description = seo.description || siteSeo.description || '';
  const ogImage = seo.image || siteSeo.image || '';
  const canonical = origin ? `${origin}${base}/${page.slug}`.replace(/\/$/, '') || origin : '';
  const ctx = { site, page, tenant, base, formAction: `/f/${site.id}`, disclaimer: n?.disclaimer || '', pages };
  const ga4 = /^G-[A-Z0-9]{4,12}$/.test(tracking.ga4 || '') ? tracking.ga4 : '';
  const gtm = /^GTM-[A-Z0-9]{4,10}$/.test(tracking.gtm || '') ? tracking.gtm : '';
  const pixel = /^\d{8,20}$/.test(tracking.pixel || '') ? tracking.pixel : '';
  const needsConsent = Boolean(ga4 || gtm || pixel);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${canonical && !preview ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
${preview || seo.noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">` : ''}
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsUrl(theme)}">
<link rel="stylesheet" href="/assets/site.css">
<style>${themeCss(theme)}</style>
${preview ? '' : `<script type="application/ld+json">${jsonLd({ site, page, tenant, canonical: canonical || `${origin}${base}/${page.slug}`, origin: origin || '', base, description, logo: parse(tenant.settings, {}).logo })}</script>`}
</head>
<body class="mode-${theme.mode}" data-site="${esc(site.id)}" data-page="${esc(page.slug)}" data-base="${esc(base)}"${preview ? ' data-preview="1"' : ''} data-ga4="${esc(ga4)}" data-gtm="${esc(gtm)}" data-pixel="${esc(pixel)}">
${preview ? '<div class="preview-bar">Prévia do rascunho · não publicado</div>' : ''}
${tenant.demo ? '<div class="demo-bar">Site de demonstração: dados e textos de exemplo.</div>' : ''}
<main>
${renderBlocks(blocks, ctx)}
</main>
${needsConsent ? `<div class="consent" id="consent" hidden><p>Usamos cookies de medição (Google e Meta) para entender o que funciona neste site. Você escolhe.</p>
<div><button class="btn btn-sm" type="button" data-consent="sim">Aceitar</button><button class="btn btn-ghost btn-sm" type="button" data-consent="nao">Recusar</button></div></div>` : ''}
<script src="/assets/site.js" defer></script>
</body>
</html>`;
}

/** extras: entradas de módulos (posts do blog etc.): [{ path: '/blog/x', lastmod: ISO }] */
export function sitemapXml(origin, base, pages, extras = []) {
  const urls = pages.filter((p) => p.published && !parse(p.seo, {}).noindex)
    .map((p) => `<url><loc>${esc(`${origin}${base}/${p.slug}`.replace(/\/$/, '') || origin)}</loc><lastmod>${esc((p.published_at || '').slice(0, 10))}</lastmod></url>`)
    .concat(extras.filter((x) => x?.path).map((x) => `<url><loc>${esc(`${origin}${base}${x.path}`)}</loc>${x.lastmod ? `<lastmod>${esc(String(x.lastmod).slice(0, 10))}</lastmod>` : ''}</url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
}

export const robotsTxt = (origin, base) => `User-agent: *\nAllow: /\nSitemap: ${origin}${base}/sitemap.xml\n`;
