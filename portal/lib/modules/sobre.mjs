// Página /sobre por site: quem somos, autor e política editorial (E-E-A-T), editável no painel, com JSON-LD AboutPage,
// Organization e Person. O texto usa o markdown curto do blog (htmlText: tudo escapado, nada de HTML cru do conteúdo).
// Desativada ou sem texto, /sobre segue para a página do construtor (se houver) ou 404.
import { HttpError } from '../http.mjs';
import { esc } from '../blocks.mjs';
import { parse } from '../db.mjs';
import { head, sendHtml, htmlText, absoluteSiteUrl, absoluteAssetUrl } from './blog.mjs';

export const tables = ['sobre_sites'];
// tela do painel: public/admin/modules/recursos.js (torneios, /baixar, /sobre e llms.txt)
export const nav = { id: 'recursos', label: 'Recursos do site', perm: 'site.read' };

const txt = (v, max) => String(v ?? '').trim().slice(0, max);
const umaLinha = (v, max) => txt(v, max).replace(/[\r\n]+/g, ' ');

function caminhoOuHttps(v) {
  const s = txt(v, 1000);
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}

function linksDe(v) {
  const lista = Array.isArray(v) ? v : String(v || '').split(/[\s,]+/);
  const ok = [];
  for (const item of lista.map((x) => txt(x, 300)).filter(Boolean)) {
    let u;
    try { u = new URL(item); } catch { throw new HttpError(400, `Link inválido: ${item.slice(0, 80)}`); }
    if (u.protocol !== 'https:') throw new HttpError(400, 'Os perfis oficiais precisam começar com https://');
    if (!ok.includes(u.href)) ok.push(u.href);
  }
  return ok.slice(0, 10);
}

/** Linha do /sobre do site em formato de tela (ou o padrão vazio). */
export function sobreOut(row) {
  return { ativo: Boolean(row?.ativo), titulo: row?.titulo || '', resumo: row?.resumo || '', conteudo: row?.conteudo || '', tipo: row?.tipo || 'Organization',
    autorNome: row?.autor_nome || '', autorCargo: row?.autor_cargo || '', autorBio: row?.autor_bio || '', autorFoto: row?.autor_foto || '',
    links: parse(row?.links, []), atualizadoEm: row?.updated_at || null };
}

/** /sobre publicado do site, ou null. */
export function sobreDoSite(repo, siteId) {
  const row = repo.get('sobre_sites', { site_id: siteId });
  return row && row.ativo && row.conteudo.trim() ? row : null;
}

function limpar(body) {
  const ativo = body?.ativo === true || body?.ativo === 'true' || body?.ativo === 1;
  const conteudo = String(body?.conteudo ?? '').replace(/\r/g, '').trim();
  if (conteudo.length > 40_000) throw new HttpError(400, 'O texto do /sobre deve ter até 40.000 caracteres.');
  if (ativo && conteudo.length < 40) throw new HttpError(400, 'Escreva ao menos um parágrafo (40 caracteres) antes de ativar o /sobre.');
  const tipo = body?.tipo === 'Person' ? 'Person' : 'Organization';
  const fotoBruta = body?.autorFoto ?? body?.autor_foto;
  const foto = caminhoOuHttps(fotoBruta);
  if (txt(fotoBruta, 1000) && !foto) throw new HttpError(400, 'A foto do autor deve usar https:// ou um caminho local.');
  return { ativo: ativo ? 1 : 0, titulo: umaLinha(body?.titulo, 120), resumo: umaLinha(body?.resumo, 300), conteudo, tipo,
    autor_nome: umaLinha(body?.autorNome, 100), autor_cargo: umaLinha(body?.autorCargo, 100), autor_bio: txt(body?.autorBio, 1000),
    autor_foto: foto, links: JSON.stringify(linksDe(body?.links)) };
}

function siteDa(repo, id) {
  const s = repo.get('sites', String(id || ''));
  if (!s) throw new HttpError(404, 'Site não encontrado nesta operação.');
  return s;
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/sites/:site/sobre', perm: 'site.read', handler: ({ repo, params }) => {
      siteDa(repo, params.site);
      return { sobre: sobreOut(repo.get('sobre_sites', { site_id: params.site })) };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/sites/:site/sobre', perm: 'site.edit', handler: ({ repo, params, body, audit }) => {
      siteDa(repo, params.site);
      const dados = limpar(body);
      const atual = repo.get('sobre_sites', { site_id: params.site });
      const row = atual ? repo.update('sobre_sites', atual.id, dados) : repo.insert('sobre_sites', { site_id: params.site, ...dados });
      audit('sobre.gravar', params.site, { ativo: Boolean(dados.ativo), tipo: dados.tipo });
      return { sobre: sobreOut(row) };
    },
  },
];

function estruturado({ site, tenant, row, origin, base }) {
  const home = absoluteSiteUrl(origin, base, '/');
  const url = absoluteSiteUrl(origin, base, '/sobre');
  const settings = parse(tenant.settings, {}) || {};
  const logo = caminhoOuHttps(settings.logo);
  const sameAs = parse(row.links, []);
  const org = { '@type': 'Organization', '@id': `${home}#organizacao`, name: site.name, url: home,
    ...(logo ? { logo: absoluteAssetUrl(origin, logo) } : {}), ...(row.tipo === 'Organization' && sameAs.length ? { sameAs } : {}),
    ...(row.resumo ? { description: row.resumo } : {}) };
  const pessoa = row.autor_nome ? { '@type': 'Person', '@id': `${url}#autor`, name: row.autor_nome,
    ...(row.autor_cargo ? { jobTitle: row.autor_cargo } : {}), ...(row.autor_bio ? { description: row.autor_bio } : {}),
    ...(row.autor_foto ? { image: absoluteAssetUrl(origin, row.autor_foto) } : {}), ...(row.tipo === 'Person' && sameAs.length ? { sameAs } : {}),
    worksFor: { '@id': `${home}#organizacao` } } : null;
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'AboutPage', '@id': `${url}#pagina`, url, name: row.titulo || `Sobre ${site.name}`, inLanguage: 'pt-BR', dateModified: row.updated_at,
      about: { '@id': row.tipo === 'Person' && pessoa ? pessoa['@id'] : org['@id'] }, isPartOf: { '@type': 'WebSite', name: site.name, url: home } },
    org, ...(pessoa ? [pessoa] : []),
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Início', item: home }, { '@type': 'ListItem', position: 2, name: 'Sobre', item: url }] },
  ] };
}

const CSS = `.sobre-autor{display:flex;gap:16px;align-items:flex-start;margin:30px 0 0;padding:18px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}
  .sobre-autor img{width:72px;height:72px;border-radius:50%;object-fit:cover;flex:none}.sobre-autor h2{font:650 1.15rem/1.25 var(--font-head,var(--font));margin:0 0 4px}.sobre-autor p{margin:4px 0;color:var(--muted)}
  .sobre-links{display:flex;flex-wrap:wrap;gap:8px 14px;margin:10px 0 0;padding:0;list-style:none}.sobre-links a{color:var(--primary);font-weight:650}`;

function pagina({ res, send, req, site, tenant, repo, base, origin }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const row = sobreDoSite(repo, site.id);
  if (!row) return false; // sem /sobre ativo: segue para a página do construtor (se houver)
  const titulo = row.titulo || `Sobre ${site.name}`;
  const links = parse(row.links, []);
  const rotulo = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const autor = row.autor_nome ? `<section class="sobre-autor" aria-labelledby="sobre-autor">${row.autor_foto ? `<img src="${esc(row.autor_foto)}" alt="${esc(row.autor_nome)}" loading="lazy">` : ''}
    <div><h2 id="sobre-autor">${esc(row.autor_nome)}</h2>${row.autor_cargo ? `<p>${esc(row.autor_cargo)}</p>` : ''}${row.autor_bio ? `<p>${esc(row.autor_bio)}</p>` : ''}</div></section>` : '';
  const html = `${head({ site, origin, base, title: `${titulo} · ${site.name}`, description: row.resumo || `Quem somos: ${site.name}.`, canonical: '/sobre', image: '',
    structuredData: estruturado({ site, tenant, row, origin, base }), ogType: 'website', extraCss: CSS })}<body><main class="blog-wrap">
    <nav class="blog-top"><a class="blog-brand" href="${esc(`${base}/`)}">${esc(site.name)}</a><a href="${esc(`${base}/`)}">Página inicial</a></nav>
    <article class="blog-article"><p class="blog-meta">Sobre · atualizado em <time datetime="${esc(row.updated_at)}">${esc(new Date(row.updated_at).toLocaleDateString('pt-BR'))}</time></p>
    <h1>${esc(titulo)}</h1>${row.resumo ? `<p class="blog-meta">${esc(row.resumo)}</p>` : ''}<div class="blog-content">${htmlText(row.conteudo)}</div>
    ${autor}${links.length ? `<ul class="sobre-links" aria-label="Perfis oficiais">${links.map((u) => `<li><a href="${esc(u)}" rel="noopener me" target="_blank">${esc(rotulo(u))}</a></li>`).join('')}</ul>` : ''}
    </article></main></body></html>`;
  sendHtml(send, res, html);
  return undefined;
}

export const publicRoutes = [{ path: '/sobre', handler: pagina }];

/** Sitemap: /sobre quando ativo (e sem página do construtor publicada no mesmo caminho). */
export function sitemapEntries({ site, repo }) {
  const row = sobreDoSite(repo, site.id);
  if (!row) return [];
  if (repo.all('pages', { site_id: site.id, slug: 'sobre' }, { limit: 1, extra: 'published IS NOT NULL' }).length) return [];
  return [{ path: '/sobre', lastmod: row.updated_at }];
}
