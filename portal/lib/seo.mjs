// SEO automático. Toda publicação (página do construtor, post do blog, página de módulo) chama app.seo.announce(),
// que avisa os buscadores e registra o resultado em seo_events:
//   - IndexNow (api.indexnow.org): Bing, Yandex, Seznam, Naver e Yep recebem as URLs na hora. O Bing alimenta a busca do ChatGPT e do Copilot.
//   - Google: não tem aviso por URL para páginas comuns (a Indexing API é só para vagas e transmissões ao vivo). O caminho oficial é o
//     sitemap com <lastmod> + robots.txt (já servidos) e, com a conta conectada, o envio do sitemap pela API do Search Console.
//     Sem conta conectada o evento fica "pendente_conexao": nada finge ter sido enviado.
//   - Sitemap e robots.txt de cada site mudam sozinhos (lib/site.mjs), e cada página leva canonical, Open Graph e JSON-LD.
import { createHmac } from 'node:crypto';
import { parse } from './db.mjs';
import { scoped, registerTable } from './repo.mjs';

registerTable('seo_events');

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Chave IndexNow do site: derivada do segredo do servidor, não precisa ser guardada. É pública por definição. */
export const indexNowKey = (secretKey, siteId) => createHmac('sha256', String(secretKey)).update(`indexnow:${siteId}`).digest('hex').slice(0, 32);

/** Onde o site responde em público: domínio próprio ou /s/<slug> no portal. */
export function siteBase(app, site) {
  if (site.domain) return { origin: `https://${site.domain}`, base: '' };
  return { origin: app.origin, base: `/s/${site.slug}` };
}

const isPublicOrigin = (origin) => /^https:\/\//.test(origin) && !/(localhost|127\.0\.0\.1|\[::1\]|\.local|\.test)(:|\/|$)/.test(origin);

export function createSeo(app, { secretKey, fetchImpl = globalThis.fetch } = {}) {
  const record = (tenantId, siteId, reason, engine, status, urls, detail = '') => scoped(app.db, tenantId)
    .insert('seo_events', { site_id: siteId, reason, engine, status, urls: JSON.stringify(urls), detail: String(detail).slice(0, 400) });

  return {
    key: (site) => indexNowKey(secretKey, site.id),

    /**
     * Avisa os buscadores que `paths` mudaram (ex.: ['/', '/blog/meu-post']). Nunca lança erro: o resultado fica em seo_events.
     * Devolve uma Promise que os testes podem aguardar; as rotas não precisam esperar.
     */
    async announce(tenant, site, paths, reason = 'publicacao') {
      const { origin, base } = siteBase(app, site);
      const urls = [...new Set(paths.map((p) => `${origin}${base}${p.startsWith('/') ? p : `/${p}`}`.replace(/\/$/, '') || origin))];
      const sitemap = `${origin}${base}/sitemap.xml`;
      if (!isPublicOrigin(origin)) {
        record(tenant.id, site.id, reason, 'indexnow', 'ignorado_local', urls, `${origin} não é endereço público; nada enviado`);
        return { indexnow: 'ignorado_local' };
      }
      const out = {};
      const key = indexNowKey(secretKey, site.id);
      try {
        const res = await fetchImpl(INDEXNOW_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ host: new URL(origin).host, key, keyLocation: `${origin}${base}/${key}.txt`, urlList: urls }),
          signal: AbortSignal.timeout(15000),
        });
        out.indexnow = res.status === 200 || res.status === 202 ? 'recebido' : 'erro';
        record(tenant.id, site.id, reason, 'indexnow', out.indexnow, urls, `HTTP ${res.status}${res.status === 403 ? ' (chave não encontrada no site)' : res.status === 422 ? ' (URL fora do host da chave)' : ''}`);
      } catch (e) {
        out.indexnow = 'erro';
        record(tenant.id, site.id, reason, 'indexnow', 'erro', urls, e.name === 'TimeoutError' ? 'sem resposta em 15 s' : e.message);
      }
      const repo = scoped(app.db, tenant.id);
      const gsc = repo.get('integrations', { kind: 'google_search_console' });
      if (gsc?.status === 'conectado' && typeof app.seo?.submitSitemapGoogle === 'function') {
        out.google = await app.seo.submitSitemapGoogle(tenant, site, sitemap).catch((e) => `erro: ${e.message}`);
        record(tenant.id, site.id, reason, 'google_search_console', String(out.google).startsWith('erro') ? 'erro' : 'enviado', [sitemap], out.google);
      } else {
        out.google = 'pendente_conexao';
        record(tenant.id, site.id, reason, 'google_search_console', 'pendente_conexao', [sitemap], 'Google lê o sitemap e o robots.txt sozinho; conecte o Search Console para enviar o sitemap a cada publicação e ver a indexação.');
      }
      return out;
    },
  };
}

/** JSON-LD da página: WebSite + Organization na inicial; WebPage + BreadcrumbList nas internas. */
export function jsonLd({ site, page, tenant, canonical, origin, base, description, logo }) {
  const home = `${origin}${base}/`.replace(/\/\/$/, '/');
  const org = { '@type': 'Organization', name: site.name, url: home, ...(logo ? { logo } : {}) };
  const settings = parse(tenant.settings, {});
  const sameAs = [settings.instagram && `https://instagram.com/${String(settings.instagram).replace(/^@/, '')}`,
    settings.telegram && `https://t.me/${String(settings.telegram).replace(/^@/, '')}`].filter(Boolean);
  if (sameAs.length) org.sameAs = sameAs;
  const graph = page.slug === ''
    ? [{ '@type': 'WebSite', name: site.name, url: home, inLanguage: 'pt-BR', ...(description ? { description } : {}) }, org]
    : [{ '@type': 'WebPage', name: page.title, url: canonical, inLanguage: 'pt-BR', isPartOf: { '@type': 'WebSite', name: site.name, url: home }, ...(description ? { description } : {}) },
      { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: home }, { '@type': 'ListItem', position: 2, name: page.title, item: canonical }] }];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

/** Checklist de SEO de uma página (mostrado no editor). Cada item: { ok, nivel, msg }. */
export function seoChecklist({ page, blocks, site }) {
  const seo = parse(page.seo, {});
  const siteSeo = parse(site.seo, {});
  const title = seo.title || page.title || '';
  const desc = seo.description || (page.slug === '' ? siteSeo.description : '') || '';
  const hero = blocks.find((b) => b.type === 'hero');
  const text = JSON.stringify(blocks.map((b) => b.props));
  const internal = (text.match(/"href":"\/[a-z0-9-/]*"|"ctaHref":"\/[a-z0-9-/]*"/g) || []).length;
  const words = text.replace(/"[a-zA-Z]+":/g, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2).length;
  const items = [
    [title.length >= 15 && title.length <= 60, 'alto', `Título para o Google com ${title.length} caracteres (ideal: 15 a 60).`],
    [desc.length >= 70 && desc.length <= 160, 'alto', desc ? `Descrição com ${desc.length} caracteres (ideal: 70 a 160).` : 'Falta a descrição para o Google.'],
    [Boolean(hero?.props?.title), 'alto', hero?.props?.title ? 'A página tem um título principal (H1).' : 'Falta um bloco "Destaque principal" com título (o H1 da página).'],
    [blocks.filter((b) => b.type === 'hero').length <= 1, 'medio', 'Só um H1 por página.'],
    [internal >= 1, 'medio', internal ? `${internal} link(s) interno(s) para outras páginas do site.` : 'Nenhum link interno: ligue esta página a outras do site.'],
    [words >= 150, 'medio', `${words} palavras de conteúdo (páginas com menos de 150 costumam render pouco na busca).`],
    [page.slug === '' || /^[a-z0-9-]{3,60}$/.test(page.slug), 'baixo', 'Endereço curto, sem acento e com hífens.'],
    [Boolean(seo.image || siteSeo.image), 'baixo', seo.image || siteSeo.image ? 'Tem imagem de compartilhamento.' : 'Sem imagem de compartilhamento (Open Graph).'],
    [!seo.noindex, 'alto', seo.noindex ? 'Página escondida dos buscadores (noindex).' : 'Página liberada para os buscadores.'],
  ];
  return items.map(([ok, nivel, msg]) => ({ ok: Boolean(ok), nivel, msg }));
}
