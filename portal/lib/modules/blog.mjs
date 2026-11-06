// Blog editorial por operação. A API e a agenda mantêm rascunhos separados da versão pública.
import { HttpError } from '../http.mjs';
import { can } from '../auth.mjs';
import { esc } from '../blocks.mjs';
import { now, parse, tx } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { slugify } from '../tenants.mjs';
import { themeCss } from '../site.mjs';

export const tables = ['posts'];
export const nav = { id: 'blog', label: 'Blog', perm: 'blog.read' };

const PUBLIC_CSP = "default-src 'none'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
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

function cleanArticle(input, current = null) {
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

function postOut(row) {
  return {
    id: row.id, siteId: row.site_id, title: row.title, slug: row.slug, excerpt: row.excerpt, content: row.content,
    category: row.category, tags: parse(row.tags, []), author: row.author, coverUrl: row.cover_url,
    seoTitle: row.seo_title, seoDescription: row.seo_description, status: row.status,
    scheduledAt: row.scheduled_at, publishedAt: row.published_at, publishedSlug: row.published_slug,
    hasPublishedVersion: Boolean(row.published_data), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function publishedData(row) {
  return {
    title: row.title, slug: row.slug, excerpt: row.excerpt, content: row.content, category: row.category,
    tags: parse(row.tags, []), author: row.author, coverUrl: row.cover_url,
    seoTitle: row.seo_title || row.title, seoDescription: row.seo_description || row.excerpt,
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

function publishedCopy(row) {
  const data = parse(row.published_data, null);
  return data && row.published_slug ? { ...data, slug: row.published_slug, publishedAt: row.published_at } : null;
}

function htmlText(value) {
  return String(value || '').split(/\n{2,}/).map((part) => `<p>${esc(part.replace(/\n/g, ' '))}</p>`).join('');
}

function head({ site, origin, base, title, description, canonical, image }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(`${origin}${base}${canonical}`)}">
    <meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article">
    ${image ? `<meta property="og:image" content="${esc(image)}">` : ''}<link rel="stylesheet" href="/assets/site.css">
    <style>${themeCss(parse(site.theme, {}))}
      .blog-wrap{width:min(1080px,calc(100% - 32px));margin:0 auto;padding:44px 0 72px;color:var(--text);font:400 16px/1.65 var(--font,system-ui,sans-serif)}
      .blog-top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:18px;border-bottom:1px solid var(--border)}
      .blog-top a{color:var(--primary);text-decoration:none;font-weight:650}.blog-brand{font-size:1.1rem;color:var(--text)!important}
      .blog-intro{max-width:680px;margin:48px auto 30px;text-align:center}.blog-intro h1,.blog-article h1{font:700 clamp(2rem,5vw,3.5rem)/1.12 var(--font-head,var(--font));letter-spacing:-.035em;margin:0 0 12px}
      .blog-intro p,.blog-meta{color:var(--muted)}.blog-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:18px}
      .blog-card{overflow:hidden;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)}.blog-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
      .blog-card-body{padding:18px}.blog-card h2{font:650 1.3rem/1.25 var(--font-head,var(--font));margin:6px 0 8px}.blog-card h2 a{color:var(--text);text-decoration:none}.blog-card p{color:var(--muted);margin:0 0 12px}
      .blog-meta{font-size:.87rem}.blog-article{max-width:760px;margin:50px auto 0}.blog-cover{display:block;width:100%;max-height:440px;object-fit:cover;border-radius:var(--radius);margin:28px 0}
      .blog-content{font-size:1.08rem;line-height:1.85}.blog-content p{margin:0 0 1.3em}.blog-back{display:inline-block;margin-top:24px;color:var(--primary);font-weight:650;text-decoration:none}
      .blog-tags{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.blog-tags span{border:1px solid var(--border);border-radius:999px;padding:2px 9px;color:var(--muted);font-size:.8rem}
      @media(max-width:600px){.blog-wrap{padding-top:26px}.blog-intro{margin:34px auto 22px}.blog-article{margin-top:34px}}
    </style></head>`;
}

function sendHtml(send, res, html) {
  return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PUBLIC_CSP,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'public, max-age=60' });
}

function blogIndex({ res, send, site, repo, base, origin }) {
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', extra: 'published_data IS NOT NULL' })
    .map((row) => publishedCopy(row)).filter(Boolean);
  const cards = posts.map((post) => `<article class="blog-card">${post.coverUrl ? `<img src="${esc(post.coverUrl)}" alt="${esc(post.title)}" loading="lazy">` : ''}
    <div class="blog-card-body"><span class="blog-meta">${esc(post.category)} · ${esc(post.author)}</span><h2><a href="${esc(`${base}/blog/${encodeURIComponent(post.slug)}`)}">${esc(post.title)}</a></h2>
    <p>${esc(post.excerpt || post.seoDescription)}</p><time class="blog-meta" datetime="${esc(post.publishedAt || '')}">${esc(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : '')}</time></div></article>`).join('');
  const title = `Blog · ${site.name}`;
  return sendHtml(send, res, `${head({ site, origin, base, title, description: `Artigos e informações de ${site.name}.`, canonical: '/blog', image: '' })}<body><main class="blog-wrap">
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
  const html = `${head({ site, origin, base, title, description, canonical: `/blog/${encodeURIComponent(post.slug)}`, image: post.coverUrl || '' })}<body><main class="blog-wrap">
    <nav class="blog-top"><a class="blog-brand" href="${esc(`${base}/`)}">${esc(site.name)}</a><a href="${esc(`${base}/blog`)}">Todos os artigos</a></nav>
    <article class="blog-article"><p class="blog-meta">${esc(post.category)} · ${esc(post.author)} · <time datetime="${esc(post.publishedAt || '')}">${esc(post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('pt-BR') : '')}</time></p>
    <h1>${esc(post.title)}</h1>${post.excerpt ? `<p class="blog-meta">${esc(post.excerpt)}</p>` : ''}${tags ? `<div class="blog-tags" aria-label="Tags">${tags}</div>` : ''}
    ${post.coverUrl ? `<img class="blog-cover" src="${esc(post.coverUrl)}" alt="${esc(post.title)}">` : ''}<div class="blog-content">${htmlText(post.content)}</div>
    <a class="blog-back" href="${esc(`${base}/blog`)}">Voltar ao blog</a></article></main></body></html>`;
  return sendHtml(send, res, html);
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/posts', perm: 'blog.read', handler: ({ repo, query }) => {
      if (query.siteId) requireSite(repo, query.siteId);
      const where = query.siteId ? { site_id: String(query.siteId) } : {};
      return { posts: repo.all('posts', where, { order: 'updated_at DESC' }).map(postOut),
        sites: repo.all('sites', {}, { order: 'created_at ASC' }).map((s) => ({ id: s.id, slug: s.slug, name: s.name })) };
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
      return { status: 201, body: { post: postOut(post) } };
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
      return { post: postOut(post) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/review', perm: 'blog.edit', handler: ({ repo, params, audit }) => {
      const post = requirePost(repo, params.id);
      const updated = repo.update('posts', post.id, { status: 'revisao', scheduled_at: null });
      audit('blog.artigo.enviar_revisao', post.id, { slug: post.slug });
      return { post: postOut(updated) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/publish', perm: 'blog.publish', handler: ({ repo, params, audit, app, tenant }) => {
      const post = requirePost(repo, params.id);
      if (slugTaken(repo, post.site_id, post.slug, post.id)) throw new HttpError(409, 'Já existe outro artigo publicado com esse slug.');
      const at = now();
      let updated;
      try { updated = repo.update('posts', post.id, { status: 'publicado', scheduled_at: null, published_at: at,
        published_slug: post.slug, published_data: JSON.stringify(publishedData(post)) }); }
      catch (error) { if (/UNIQUE constraint failed/.test(error.message)) throw new HttpError(409, 'Já existe outro artigo publicado com esse slug.'); throw error; }
      audit('blog.artigo.publicar', post.id, { slug: post.slug });
      announcePost(app, tenant, repo, updated); // fluxo de SEO do núcleo: IndexNow + sitemap (sem esperar)
      return { post: postOut(updated) };
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
      return { post: postOut(updated) };
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
      return { post: postOut(updated) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/posts/:id/unpublish', perm: 'blog.publish', handler: ({ repo, params, audit, app, tenant }) => {
      const post = requirePost(repo, params.id);
      const updated = repo.update('posts', post.id, { status: 'rascunho', scheduled_at: null, published_at: null, published_slug: null, published_data: null });
      audit('blog.artigo.despublicar', post.id, { slug: post.slug });
      if (post.published_slug) announcePost(app, tenant, repo, { ...post, published_slug: post.published_slug }, 'remocao');
      return { post: postOut(updated) };
    },
  },
];

export const publicRoutes = [
  { path: '/blog', handler: blogIndex },
  { path: '/blog/:slug', handler: blogArticle },
];

/** Gancho do núcleo: posts publicados entram no sitemap do site com a data de publicação. */
export const sitemapEntries = ({ site, repo }) => {
  const posts = repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', extra: 'published_data IS NOT NULL' });
  if (!posts.length) return [];
  return [{ path: '/blog', lastmod: posts[0].published_at }, ...posts.map((p) => ({ path: `/blog/${encodeURIComponent(p.published_slug)}`, lastmod: p.published_at }))];
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
      const result = update.run(stamp, post.slug, JSON.stringify(publishedData(post)), stamp, post.tenant_id, post.id, at);
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
