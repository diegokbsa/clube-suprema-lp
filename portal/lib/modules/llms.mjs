// /llms.txt e /llms-full.txt por site (padrão llmstxt.org, como no suprema.blog): resumo da operação, páginas indexáveis
// (construtor publicado sem noindex, páginas próprias indexáveis, /sobre, /torneios) e os posts publicados do blog.
// O "full" acrescenta o texto do /sobre e de cada post em markdown. Só entra o que já é público no site.
import { parse } from '../db.mjs';
import { niche } from '../niches.mjs';
import { templateVars } from '../tenants.mjs';
import { publishedCopy } from './blog.mjs';
import { sobreDoSite } from './sobre.mjs';
import { configTorneios } from './torneios.mjs';

const umaLinha = (s, max = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const semCaixas = (md) => String(md || '').replace(/\r/g, '')
  .replace(/^:::(cta|nota|dica)(?:[ \t]+(.*))?$/gim, (m, tipo, titulo) => (titulo ? `**${titulo.trim()}**` : ''))
  .replace(/^:::\s*$/gm, '');

function dados({ site, tenant, repo, base, origin }) {
  const url = (p = '') => `${origin}${base}${p.startsWith('/') ? p : `/${p}`}`;
  const settings = parse(tenant.settings, {}) || {};
  const vars = templateVars(tenant, settings);
  const seo = parse(site.seo, {}) || {};
  const paginas = repo.all('pages', { site_id: site.id }, { order: 'position ASC', extra: 'published IS NOT NULL' })
    .filter((p) => !parse(p.seo, {})?.noindex)
    .map((p) => ({ titulo: umaLinha(p.title, 120) || (p.slug ? p.slug : 'Página inicial'), url: url(p.slug ? `/${p.slug}` : '/'), descricao: umaLinha(parse(p.seo, {})?.description, 200), slug: p.slug }));
  const proprias = repo.all('paginas_proprias', { site_id: site.id, indexar: 1 }, { order: 'caminho ASC' })
    .map((p) => ({ titulo: umaLinha(p.titulo, 120) || (p.caminho ? p.caminho : 'Página inicial'), url: url(p.caminho ? `/${p.caminho}` : '/'), descricao: '', slug: p.caminho }));
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', limit: 300, extra: 'published_data IS NOT NULL' })
    .map((row) => publishedCopy(row)).filter(Boolean);
  const sobre = sobreDoSite(repo, site.id);
  const torneios = configTorneios(tenant);
  return { url, settings, vars, seo, paginas, proprias, posts, sobre, torneios, n: niche(tenant.niche_id) };
}

/** Texto do /llms.txt do site. */
export function llmsTxt(ctx) {
  const { site, tenant } = ctx;
  const d = dados(ctx);
  const { url, vars, n } = d;
  const resumo = umaLinha(d.seo.description || vars.tagline || d.sobre?.resumo || `${vars.unitLabel || site.name}.`, 400);
  const fatos = [`- Site oficial: ${url('/')}`];
  if (tenant.number) fatos.push(`- ${n?.terms.number || 'Código'}: ${tenant.number}`);
  for (const f of n?.fields || []) {
    const v = umaLinha(d.settings[f.key], 200);
    if (!v) continue;
    fatos.push(f.key === 'inviteLink' ? `- ${f.label}: ${url('/baixar')} (abre o app certo em cada aparelho)` : `- ${f.label}: ${v}`);
  }
  if (vars.whatsapp) fatos.push(`- Atendimento no WhatsApp: ${vars.whatsappLink}`);
  if (vars.email) fatos.push(`- E-mail: ${vars.email}`);
  if (vars.disclaimer) fatos.push(`- Aviso: ${vars.disclaimer}`);
  if (d.sobre) fatos.push(`- Quem somos e política editorial: ${url('/sobre')}`);

  const vistos = new Set();
  const pagina = (titulo, link, descricao) => { if (vistos.has(link)) return null; vistos.add(link); return `- [${titulo}](${link})${descricao ? `: ${descricao}` : ''}`; };
  const linhasPaginas = [
    ...d.proprias.map((p) => pagina(p.titulo, p.url, p.descricao)),
    ...d.paginas.map((p) => pagina(p.titulo, p.url, p.descricao)),
    d.sobre ? pagina(d.sobre.titulo || `Sobre ${site.name}`, url('/sobre'), umaLinha(d.sobre.resumo, 200) || 'quem somos, autor e como produzimos o conteúdo.') : null,
    d.torneios.ativo ? pagina(`Grade de torneios de hoje (${d.torneios.nome})`, url('/torneios'), `todos os torneios do dia, atualizada ao longo do dia. Versão em texto: ${url('/torneios.txt')}`) : null,
    d.posts.length ? pagina('Blog', url('/blog'), 'artigos publicados.') : null,
    d.posts.length ? pagina('Feed RSS', url('/blog/feed.xml')) : null,
    pagina('Sitemap', url('/sitemap.xml')),
    pagina('Conteúdo completo em Markdown', url('/llms-full.txt')),
  ].filter(Boolean);
  if (!vistos.has(url('/'))) linhasPaginas.unshift(`- [Página inicial](${url('/')})`);

  return `# ${umaLinha(site.name, 120)}

> ${resumo}

## Fatos essenciais

${fatos.join('\n')}

## Páginas

${linhasPaginas.join('\n')}
${d.posts.length ? `
## Artigos

${d.posts.map((p) => `- [${umaLinha(p.title, 160)}](${url(`/blog/${encodeURIComponent(p.slug)}`)})${p.excerpt || p.seoDescription ? `: ${umaLinha(p.excerpt || p.seoDescription, 240)}` : ''}`).join('\n')}
` : ''}`;
}

/** Texto do /llms-full.txt: o llms.txt, o /sobre e cada post em markdown. */
export function llmsFullTxt(ctx) {
  const d = dados(ctx);
  const partes = [llmsTxt(ctx)];
  if (d.sobre) partes.push(`# ${umaLinha(d.sobre.titulo || `Sobre ${ctx.site.name}`, 160)}\n\nURL: ${d.url('/sobre')}\nAtualizado: ${String(d.sobre.updated_at).slice(0, 10)}\n\n${semCaixas(d.sobre.conteudo).trim()}\n`);
  for (const p of d.posts) {
    partes.push(`# ${umaLinha(p.title, 160)}\n\nURL: ${d.url(`/blog/${encodeURIComponent(p.slug)}`)}\nAutor: ${umaLinha(p.author, 100)}\nPublicado: ${String(p.publishedAt || '').slice(0, 10)} · Atualizado: ${String(p.dateModified || p.publishedAt || '').slice(0, 10)}${p.excerpt ? `\nResumo: ${umaLinha(p.excerpt, 300)}` : ''}\n\n${semCaixas(p.content).trim()}\n`);
  }
  return partes.join('\n---\n\n');
}

function servir(ctx, full) {
  const { req, res, send } = ctx;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return send(res, 200, full ? llmsFullTxt(ctx) : llmsTxt(ctx), { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=600' });
}

export const publicRoutes = [
  { path: '/llms.txt', handler: (ctx) => servir(ctx, false) },
  { path: '/llms-full.txt', handler: (ctx) => servir(ctx, true) },
];
