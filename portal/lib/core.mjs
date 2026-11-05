// Rotas do núcleo. Contrato de rota (o mesmo dos módulos em lib/modules/*.mjs):
//   { method, path, perm?, super?, auth?, handler(ctx) }
//   - path com /api/t/:tenant/... => o servidor resolve a operação, o papel do usuário e checa `perm` ANTES do handler.
//   - ctx = { req, res, url, params, query, body, raw, user, role, tenant, repo, db, app, audit(action, target, data) }
//   - o handler devolve um objeto (vira JSON 200) ou { status, body, headers } ; erro com .status vira resposta de erro.
import { randomBytes } from 'node:crypto';
import { parse, now } from './db.mjs';
import { HttpError } from './http.mjs';
import { createUser, checkPassword, passwordProblem, can, permsOf, ROLES, mask } from './auth.mjs';
import { createTenant, publicTenant, INTEGRATIONS, slugify, cleanSettings } from './tenants.mjs';
import { publicNiches, niche } from './niches.mjs';
import { templateList, cleanTheme, FONTS, loadTemplates } from './templates.mjs';
import { blockSchema, cleanBlocks } from './blocks.mjs';
import { affiliateLink } from './attribution.mjs';
import { seoChecklist, siteBase } from './seo.mjs';
import { publicEdition } from './edition.mjs';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const STAGES = ['novo', 'contato', 'qualificado', 'convertido', 'perdido'];
const days = (n) => new Date(Date.now() - n * 864e5).toISOString();

function pageOut(p) {
  return { id: p.id, siteId: p.site_id, slug: p.slug, title: p.title, position: p.position, seo: parse(p.seo, {}), draft: parse(p.draft, []),
    published: Boolean(p.published), publishedAt: p.published_at, updatedAt: p.updated_at,
    dirty: Boolean(p.published) && p.published !== p.draft };
}
function siteOut(s) {
  return { id: s.id, slug: s.slug, name: s.name, templateId: s.template_id, templateVersion: s.template_version, domain: s.domain,
    theme: parse(s.theme, {}), seo: parse(s.seo, {}), tracking: parse(s.tracking, {}), externalUrl: s.external_url, status: s.status, createdAt: s.created_at };
}

function dashboard(repo) {
  const d30 = days(30);
  return {
    leads30: repo.count('leads', {}, 'created_at >= ?', [d30]),
    leadsTotal: repo.count('leads'),
    conversions30: repo.count('conversions', {}, 'created_at >= ? AND verified = 1', [d30]),
    affiliates: repo.count('affiliates', { status: 'ativo' }),
    clicks30: repo.count('clicks', {}, 'created_at >= ?', [d30]),
    sites: repo.count('sites'),
    published: repo.count('pages', {}, 'published IS NOT NULL'),
    pendingIntegrations: repo.count('integrations', { status: 'pendente' }),
  };
}

export const coreRoutes = [
  // ---------- sessão ----------
  { method: 'POST', path: '/api/login', auth: false, handler: (ctx) => ctx.app.login(ctx) },
  { method: 'POST', path: '/api/logout', auth: false, handler: (ctx) => ctx.app.logout(ctx) },
  {
    method: 'GET', path: '/api/me', handler: ({ db, user, csrf }) => {
      const rows = user.is_super ? db.prepare('SELECT * FROM tenants ORDER BY created_at').all().map((t) => ({ t, role: 'super' }))
        : db.prepare('SELECT t.*, m.role FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? ORDER BY t.created_at').all(user.id)
          .map((t) => ({ t, role: t.role }));
      return { user: { id: user.id, email: user.email, name: user.name, isSuper: Boolean(user.is_super) }, csrf,
        tenants: rows.map(({ t, role }) => ({ ...publicTenant(t), role, perms: permsOf(user, role === 'super' ? null : role) })) };
    },
  },
  {
    method: 'POST', path: '/api/me/password', handler: ({ db, user, body, audit }) => {
      const row = db.prepare('SELECT pass FROM users WHERE id = ?').get(user.id);
      need(checkPassword(body.current, row.pass), 400, 'Senha atual incorreta.');
      const p = passwordProblem(body.next);
      need(!p, 400, p);
      db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(ctxHash(body.next), user.id);
      audit('usuario.trocar_senha', user.id);
      return { ok: true };
    },
  },

  { method: 'GET', path: '/api/edition', auth: false, handler: ({ app }) => publicEdition(app.edition) },

  // ---------- catálogo ----------
  {
    method: 'GET', path: '/api/meta', handler: ({ app, query }) => ({ edition: { ...publicEdition(app.edition), siteTheme: app.edition.siteTheme },
      niches: publicNiches().filter((n) => app.edition.allowsNiche(n.id)),
      templates: templateList(query.niche || '').filter((t) => t.niches.includes('*') || t.niches.some((n) => app.edition.allowsNiche(n)))
        .sort((a, b) => app.edition.templateOrder(a) - app.edition.templateOrder(b)), blocks: blockSchema(),
      roles: ROLES, fonts: FONTS, stages: STAGES, integrations: INTEGRATIONS, modules: app.moduleNav }),
  },

  // ---------- administração central (superadmin) ----------
  {
    method: 'GET', path: '/api/admin/overview', super: true, handler: ({ db }) => {
      const tenants = db.prepare('SELECT * FROM tenants ORDER BY created_at').all();
      const d30 = days(30);
      const per = tenants.map((t) => {
        const q = (sql, ...p) => db.prepare(sql).get(t.id, ...p).n;
        return { ...publicTenant(t),
          sites: q('SELECT COUNT(*) n FROM sites WHERE tenant_id = ?'),
          leads30: q('SELECT COUNT(*) n FROM leads WHERE tenant_id = ? AND created_at >= ?', d30),
          conversions30: q('SELECT COUNT(*) n FROM conversions WHERE tenant_id = ? AND verified = 1 AND created_at >= ?', d30),
          affiliates: q("SELECT COUNT(*) n FROM affiliates WHERE tenant_id = ? AND status = 'ativo'"),
          integrations: db.prepare('SELECT kind, status, last_error FROM integrations WHERE tenant_id = ?').all(t.id) };
      });
      const audit = db.prepare('SELECT a.*, u.email FROM audit a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 30').all()
        .map((a) => ({ ...a, data: parse(a.data, {}) }));
      return { tenants: per, totals: { tenants: tenants.length, users: db.prepare('SELECT COUNT(*) n FROM users').get().n,
        leads30: per.reduce((s, t) => s + t.leads30, 0), conversions30: per.reduce((s, t) => s + t.conversions30, 0) }, audit,
      costs: { note: 'Custos de IA e serviços externos aparecem aqui quando houver provedor configurado com relatório de uso.', items: [] } };
    },
  },
  {
    method: 'POST', path: '/api/tenants', super: true, handler: ({ db, body, user, app }) => {
      need(app.edition.allowsNiche(body.niche || app.edition.defaultNiche), 400, `A edição ${app.edition.name} não trabalha com esse nicho.`);
      const { tenant, site } = createTenant(db, { ...body, niche: body.niche || app.edition.defaultNiche, theme: { ...(app.edition.siteTheme || {}), ...(body.theme || {}) } }, { userId: user.id });
      return { status: 201, body: { tenant: publicTenant(tenant), site: site && siteOut(site), adminUrl: `/admin/#/t/${tenant.slug}`,
        siteUrl: site ? `${app.origin}/s/${site.slug}/` : null } };
    },
  },

  // ---------- operação ----------
  {
    method: 'GET', path: '/api/t/:tenant', perm: 'tenant.read', handler: ({ tenant, repo, role, user }) => ({
      tenant: publicTenant(tenant), role: user.is_super ? 'super' : role, dashboard: dashboard(repo), niche: niche(tenant.niche_id),
      recentLeads: repo.all('leads', {}, { order: 'created_at DESC', limit: 8 }).map((l) => ({ id: l.id, email: l.email, name: l.name, stage: l.stage, createdAt: l.created_at, utm: parse(l.utm, {}) })),
    }),
  },
  {
    method: 'PATCH', path: '/api/t/:tenant', perm: 'tenant.manage', handler: ({ db, tenant, body, audit }) => {
      const settings = { ...parse(tenant.settings, {}), ...cleanSettings(tenant.niche_id, { ...parse(tenant.settings, {}), ...(body.settings || {}) }) };
      const n = niche(tenant.niche_id);
      const modules = Array.isArray(body.modules) ? body.modules.filter((m) => n.modules.includes(m)) : parse(tenant.modules, []);
      const name = body.name ? String(body.name).trim().slice(0, 80) : tenant.name;
      db.prepare('UPDATE tenants SET name = ?, settings = ?, modules = ? WHERE id = ?').run(name, JSON.stringify(settings), JSON.stringify(modules), tenant.id);
      audit('operacao.editar', tenant.id, { campos: Object.keys(body) });
      return { tenant: publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id)) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/users', perm: 'users.manage', handler: ({ db, tenant }) => ({
      users: db.prepare('SELECT u.id, u.email, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.email').all(tenant.id),
    }),
  },
  {
    method: 'POST', path: '/api/t/:tenant/users', perm: 'users.manage', handler: ({ db, tenant, body, audit }) => {
      need(ROLES[body.role], 400, 'Papel inválido.');
      const email = String(body.email || '').trim().toLowerCase();
      need(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 400, 'E-mail inválido.');
      let u = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
      let tempPassword = null;
      if (!u) {
        tempPassword = body.password || `${randomBytes(6).toString('base64url')}9a`;
        const p = passwordProblem(tempPassword);
        need(!p, 400, p);
        u = createUser(db, { email, name: body.name || email, password: tempPassword });
      }
      db.prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, tenant_id) DO UPDATE SET role = excluded.role')
        .run(u.id, tenant.id, body.role);
      audit('usuario.vincular', u.id, { email, role: body.role });
      return { status: 201, body: { user: { id: u.id, email: u.email, role: body.role }, tempPassword: body.password ? null : tempPassword } };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/users/:userId', perm: 'users.manage', handler: ({ db, tenant, params, user, audit }) => {
      need(params.userId !== user.id, 400, 'Você não pode remover o próprio acesso.');
      const r = db.prepare('DELETE FROM memberships WHERE user_id = ? AND tenant_id = ?').run(params.userId, tenant.id);
      need(r.changes, 404, 'Usuário não está nesta operação.');
      audit('usuario.remover', params.userId);
      return { ok: true };
    },
  },
  { method: 'GET', path: '/api/t/:tenant/audit', perm: 'audit.read', handler: ({ repo }) => ({ audit: repo.all('audit', {}, { order: 'created_at DESC', limit: 200 }).map((a) => ({ ...a, data: parse(a.data, {}) })) }) },

  // ---------- sites e páginas ----------
  { method: 'GET', path: '/api/t/:tenant/sites', perm: 'site.read', handler: ({ repo, app }) => ({ sites: repo.all('sites', {}, { order: 'created_at ASC' }).map((s) => ({ ...siteOut(s), url: s.external_url || `${app.origin}/s/${s.slug}/`, pages: repo.all('pages', { site_id: s.id }, { order: 'position ASC' }).map(pageOut) })) }) },
  {
    method: 'POST', path: '/api/t/:tenant/sites', perm: 'site.edit', handler: ({ db, tenant, body, user, audit, repo }) => {
      const limits = parse(tenant.limits, {});
      need(repo.count('sites') < (limits.sites || 5), 400, `Limite de ${limits.sites || 5} sites desta operação.`);
      const t = loadTemplates().get(body.template);
      need(t, 400, 'Escolha um modelo.');
      need(t.niches.includes('*') || t.niches.includes(tenant.niche_id), 400, 'Esse modelo não é deste nicho.');
      const site = ctxCreateSite(db, tenant, t, { theme: body.theme, userId: user.id, slug: body.slug });
      audit('site.criar', site.id, { template: t.id });
      return { status: 201, body: { site: siteOut(site) } };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/sites/:id', perm: 'site.edit', handler: ({ repo, params, body, audit, db }) => {
      const s = repo.get('sites', params.id);
      need(s, 404, 'Site não encontrado.');
      const patch = {};
      if (body.name) patch.name = String(body.name).slice(0, 80);
      if (body.theme) patch.theme = JSON.stringify(cleanTheme({ ...parse(s.theme, {}), ...body.theme }));
      if (body.seo) patch.seo = JSON.stringify({ title: String(body.seo.title || '').slice(0, 70), description: String(body.seo.description || '').slice(0, 170), image: String(body.seo.image || '').slice(0, 300) });
      if (body.tracking) {
        const t = body.tracking;
        patch.tracking = JSON.stringify({ ga4: /^G-[A-Z0-9]{4,12}$/.test(t.ga4 || '') ? t.ga4 : '', gtm: /^GTM-[A-Z0-9]{4,10}$/.test(t.gtm || '') ? t.gtm : '', pixel: /^\d{8,20}$/.test(t.pixel || '') ? t.pixel : '' });
        const tr = parse(patch.tracking, {});
        for (const [kind, v] of [['ga4', tr.ga4], ['gtm', tr.gtm], ['meta_pixel', tr.pixel]]) {
          const integ = repo.get('integrations', { kind });
          if (integ) repo.update('integrations', integ.id, { status: v ? 'instalado' : 'pendente', public_config: JSON.stringify(v ? { id: v, site: s.id } : {}), last_check: now() });
        }
      }
      if ('domain' in body) {
        const d = String(body.domain || '').trim().toLowerCase();
        need(!d || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d), 400, 'Domínio inválido.');
        const other = d && db.prepare('SELECT tenant_id FROM sites WHERE domain = ? AND id != ?').get(d, s.id);
        need(!other, 409, 'Esse domínio já está em uso em outro site.');
        patch.domain = d || null;
      }
      const out = repo.update('sites', s.id, patch);
      audit('site.editar', s.id, { campos: Object.keys(patch) });
      return { site: siteOut(out) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/sites/:id/pages', perm: 'site.edit', handler: ({ repo, tenant, params, body, audit, user }) => {
      const s = repo.get('sites', params.id);
      need(s, 404, 'Site não encontrado.');
      const limits = parse(tenant.limits, {});
      need(repo.count('pages', { site_id: s.id }) < (limits.pages || 60), 400, 'Limite de páginas atingido.');
      let blocks = [];
      let title = String(body.title || 'Nova página').slice(0, 80);
      if (body.duplicateFrom) {
        const src = repo.get('pages', String(body.duplicateFrom));
        need(src, 404, 'Página de origem não encontrada.');
        blocks = parse(src.draft, []);
        title = body.title || `${src.title} (cópia)`;
      }
      let slug = slugify(body.slug || title);
      need(slug, 400, 'Endereço da página inválido.');
      for (let i = 2; repo.get('pages', { site_id: s.id, slug }); i++) slug = `${slugify(body.slug || title)}-${i}`;
      const page = repo.insert('pages', { site_id: s.id, slug, title, position: repo.count('pages', { site_id: s.id }), seo: '{}', draft: JSON.stringify(cleanBlocks(blocks)) });
      repo.insert('page_versions', { page_id: page.id, blocks: page.draft, note: body.duplicateFrom ? 'duplicada' : 'criada', created_by: user.id });
      audit('pagina.criar', page.id, { slug });
      return { status: 201, body: { page: pageOut(page) } };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/pages/:id', perm: 'site.read', handler: ({ repo, params }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      const versions = repo.all('page_versions', { page_id: p.id }, { order: 'created_at DESC', limit: 30 }).map((v) => ({ id: v.id, note: v.note, createdAt: v.created_at, blocks: parse(v.blocks, []).length }));
      const site = repo.get('sites', p.site_id);
      return { page: pageOut(p), site: siteOut(site), versions, seo: seoChecklist({ page: p, blocks: parse(p.draft, []), site }) };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/pages/:id/draft', perm: 'site.edit', handler: ({ repo, params, body }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      let blocks;
      try { blocks = cleanBlocks(body.blocks); } catch (e) { throw new HttpError(400, e.message); }
      const patch = { draft: JSON.stringify(blocks) };
      if (body.title) patch.title = String(body.title).slice(0, 80);
      if (body.seo) patch.seo = JSON.stringify({ title: String(body.seo.title || '').slice(0, 70), description: String(body.seo.description || '').slice(0, 170), image: String(body.seo.image || '').slice(0, 300), noindex: Boolean(body.seo.noindex) });
      if (body.slug != null && p.slug !== '') {
        const slug = slugify(body.slug);
        need(slug, 400, 'Endereço inválido.');
        need(!repo.all('pages', { site_id: p.site_id, slug }).some((x) => x.id !== p.id), 409, 'Já existe página com esse endereço.');
        patch.slug = slug;
      }
      const saved = repo.update('pages', p.id, patch);
      return { page: pageOut(saved), savedAt: now(), seo: seoChecklist({ page: saved, blocks, site: repo.get('sites', p.site_id) }) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pages/:id/publish', perm: 'site.publish', handler: ({ repo, params, user, audit, app, tenant }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      const at = now();
      repo.update('pages', p.id, { published: p.draft, published_at: at });
      repo.insert('page_versions', { page_id: p.id, blocks: p.draft, note: 'publicada', created_by: user.id });
      repo.update('sites', p.site_id, { status: 'publicado' });
      audit('pagina.publicar', p.id, { slug: p.slug });
      if (!parse(p.seo, {}).noindex) app.seo.announce(tenant, repo.get('sites', p.site_id), [`/${p.slug}`], 'publicacao'); // fluxo de SEO, sem esperar
      return { page: pageOut(repo.get('pages', p.id)) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pages/:id/unpublish', perm: 'site.publish', handler: ({ repo, params, audit, app, tenant }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      repo.update('pages', p.id, { published: null, published_at: null });
      audit('pagina.despublicar', p.id, { slug: p.slug });
      app.seo.announce(tenant, repo.get('sites', p.site_id), [`/${p.slug}`], 'remocao'); // buscador revisita e vê o 404
      return { page: pageOut(repo.get('pages', p.id)) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pages/:id/restore', perm: 'site.edit', handler: ({ repo, params, body, user, audit }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      const v = repo.get('page_versions', String(body.versionId || ''));
      need(v && v.page_id === p.id, 404, 'Versão não encontrada.');
      repo.insert('page_versions', { page_id: p.id, blocks: p.draft, note: 'antes de restaurar', created_by: user.id });
      repo.update('pages', p.id, { draft: v.blocks });
      audit('pagina.restaurar', p.id, { versao: v.id });
      return { page: pageOut(repo.get('pages', p.id)) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pages/:id/snapshot', perm: 'site.edit', handler: ({ repo, params, body, user }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      repo.insert('page_versions', { page_id: p.id, blocks: p.draft, note: String(body.note || 'versão salva').slice(0, 80), created_by: user.id });
      return { ok: true };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/pages/:id', perm: 'site.edit', handler: ({ repo, params, audit }) => {
      const p = repo.get('pages', params.id);
      need(p, 404, 'Página não encontrada.');
      need(p.slug !== '', 400, 'A página inicial não pode ser apagada.');
      repo.remove('pages', p.id);
      audit('pagina.apagar', p.id, { slug: p.slug });
      return { ok: true };
    },
  },
  { method: 'GET', path: '/api/t/:tenant/pages/:id/preview', perm: 'site.read', handler: (ctx) => ctx.app.preview(ctx) },

  // ---------- CRM ----------
  {
    method: 'GET', path: '/api/t/:tenant/leads', perm: 'leads.read', handler: ({ repo, query }) => {
      const where = STAGES.includes(query.stage) ? { stage: query.stage } : {};
      const aff = Object.fromEntries(repo.all('affiliates').map((a) => [a.id, a.name]));
      return { stages: STAGES, leads: repo.all('leads', where, { order: 'created_at DESC', limit: 500 }).map((l) => ({ id: l.id, email: l.email, name: l.name, phone: l.phone,
        stage: l.stage, ownerId: l.owner_id, page: l.page_slug, utm: parse(l.utm, {}), affiliate: l.affiliate_id ? aff[l.affiliate_id] || '—' : null, demo: Boolean(l.demo), createdAt: l.created_at })) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/leads/:id', perm: 'leads.read', handler: ({ repo, params }) => {
      const l = repo.get('leads', params.id);
      need(l, 404, 'Lead não encontrado.');
      return { lead: { ...l, utm: parse(l.utm, {}) }, events: repo.all('lead_events', { lead_id: l.id }, { order: 'created_at DESC' }).map((e) => ({ ...e, data: parse(e.data, {}) })) };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/leads/:id', perm: 'leads.edit', handler: ({ repo, params, body, user }) => {
      const l = repo.get('leads', params.id);
      need(l, 404, 'Lead não encontrado.');
      const patch = {};
      if (body.stage) { need(STAGES.includes(body.stage), 400, 'Etapa inválida.'); patch.stage = body.stage; }
      if ('ownerId' in body) patch.owner_id = body.ownerId || null;
      const out = repo.update('leads', l.id, patch);
      repo.insert('lead_events', { lead_id: l.id, kind: 'edicao', data: JSON.stringify({ de: { stage: l.stage, owner: l.owner_id }, para: { stage: out.stage, owner: out.owner_id }, nota: String(body.note || '').slice(0, 500) }), by_user: user.id });
      return { lead: out };
    },
  },

  // ---------- afiliados ----------
  {
    method: 'GET', path: '/api/t/:tenant/affiliates', perm: 'affiliates.read', handler: ({ repo, tenant, app }) => {
      const site = repo.all('sites', {}, { order: 'created_at ASC', limit: 1 })[0];
      return { affiliates: repo.all('affiliates', {}, { order: 'created_at DESC' }).map((a) => ({ id: a.id, name: a.name, email: a.email, code: a.code, status: a.status, createdAt: a.created_at,
        clicks: repo.count('clicks', { affiliate_id: a.id }), leads: repo.count('leads', { affiliate_id: a.id }),
        conversions: repo.count('conversions', { affiliate_id: a.id, verified: 1 }),
        link: affiliateLink(app.origin, tenant.slug, a.code, { medium: 'link' }), siteSlug: site?.slug || null })) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/affiliates', perm: 'affiliates.manage', handler: ({ repo, body, audit }) => {
      const name = String(body.name || '').trim().slice(0, 80);
      need(name.length >= 2, 400, 'Informe o nome do afiliado.');
      const code = slugify(body.code || name).replace(/-/g, '').slice(0, 20) || randomBytes(4).toString('hex');
      need(!repo.get('affiliates', { code }), 409, 'Esse código já está em uso nesta operação.');
      const a = repo.insert('affiliates', { name, email: String(body.email || '').trim().toLowerCase().slice(0, 120) || null, code, status: 'ativo' });
      audit('afiliado.criar', a.id, { code });
      return { status: 201, body: { affiliate: a } };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/affiliates/:id', perm: 'affiliates.manage', handler: ({ repo, params, body, audit }) => {
      const a = repo.get('affiliates', params.id);
      need(a, 404, 'Afiliado não encontrado.');
      need(['ativo', 'pausado'].includes(body.status), 400, 'Status inválido.');
      audit('afiliado.status', a.id, { de: a.status, para: body.status });
      return { affiliate: repo.update('affiliates', a.id, { status: body.status }) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/conversions', perm: 'commissions.read', handler: ({ repo }) => ({
      conversions: repo.all('conversions', {}, { order: 'created_at DESC', limit: 300 }).map((c) => ({ ...c, attribution: parse(c.attribution, {}) })),
    }),
  },

  // ---------- SEO ----------
  {
    method: 'GET', path: '/api/t/:tenant/seo', perm: 'site.read', handler: ({ repo, app }) => {
      const sites = repo.all('sites', {}, { order: 'created_at ASC' }).filter((s) => !s.external_url);
      return {
        engines: [
          { id: 'indexnow', label: 'Bing, Yandex, Seznam, Naver e Yep (IndexNow)', how: 'Aviso automático a cada publicação, sem conta.', status: 'ativo' },
          { id: 'google', label: 'Google', how: 'Sitemap com data de atualização, robots.txt, canonical e dados estruturados (JSON-LD) em toda página. Com o Search Console conectado, o sitemap é enviado a cada publicação.', status: repo.get('integrations', { kind: 'google_search_console' })?.status === 'conectado' ? 'conectado' : 'pendente' },
          { id: 'bing_webmaster', label: 'Bing Webmaster Tools', how: 'Opcional: relatórios de indexação do Bing. O envio de URLs já sai pelo IndexNow.', status: repo.get('integrations', { kind: 'bing_webmaster' })?.status === 'conectado' ? 'conectado' : 'pendente' },
        ],
        sites: sites.map((s) => {
          const { origin, base } = siteBase(app, s);
          return { id: s.id, name: s.name, sitemap: `${origin}${base}/sitemap.xml`, robots: `${origin}${base}/robots.txt`, indexnowKey: `${origin}${base}/${app.seo.key(s)}.txt`,
            pages: repo.all('pages', { site_id: s.id }, { order: 'position ASC' }).map((p) => ({ id: p.id, title: p.title, slug: p.slug, published: Boolean(p.published),
              checks: seoChecklist({ page: p, blocks: parse(p.draft, []), site: s }) })) };
        }),
        events: repo.all('seo_events', {}, { order: 'created_at DESC', limit: 100 }).map((e) => ({ ...e, urls: parse(e.urls, []) })),
      };
    },
  },

  // ---------- integrações ----------
  {
    method: 'GET', path: '/api/t/:tenant/integrations', perm: 'integrations.read', handler: ({ repo, tenant, app, user, role }) => {
      const rows = Object.fromEntries(repo.all('integrations').map((i) => [i.kind, i]));
      const showSecret = can(user, role, 'integrations.manage');
      return { integrations: INTEGRATIONS.map((i) => {
        const r = rows[i.kind] || {};
        const extra = i.kind === 'webhook_conversoes'
          ? { url: `${app.origin}/api/hooks/${tenant.slug}/conversion`, secret: showSecret ? mask(tenant.webhook_secret) : null, header: 'X-Portal-Signature: sha256=<hmac do corpo>' }
          : {};
        return { ...i, status: r.status || (i.kind === 'indexnow' ? 'ativo' : 'pendente'), config: parse(r.public_config, {}), lastCheck: r.last_check || null, lastError: r.last_error || null, ...extra };
      }) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/webhook/rotate', perm: 'integrations.manage', handler: ({ db, tenant, audit }) => {
      const secret = randomBytes(24).toString('base64url');
      db.prepare('UPDATE tenants SET webhook_secret = ? WHERE id = ?').run(secret, tenant.id);
      audit('webhook.trocar_segredo', tenant.id);
      return { secret, note: 'Copie agora: este segredo não é mostrado de novo.' };
    },
  },
];

// pequenas pontes para não importar ciclos
import { hashPassword } from './auth.mjs';
import { createSiteFromTemplate } from './tenants.mjs';
const ctxHash = (p) => hashPassword(p);
const ctxCreateSite = (...a) => createSiteFromTemplate(...a);
