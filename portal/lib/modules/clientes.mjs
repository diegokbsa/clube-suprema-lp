// Base única de clientes. Uma pessoa existe uma vez (contacts); o relacionamento com cada operação está nos leads dela.
//   - Operação: vê só as pessoas que chegaram por ela, com o histórico dela (o CRM próprio da operação).
//   - Superadmin: vê a base inteira da edição em que entrou e por quais operações cada pessoa passou.
import { parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { unitLabel } from '../niches.mjs';

export const nav = { id: 'clientes', label: 'Clientes', perm: 'leads.read' };

const like = (q) => `%${String(q || '').trim().toLowerCase().replace(/[%_]/g, '').slice(0, 60)}%`;

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/clientes', perm: 'leads.read', handler: ({ db, tenant, query }) => {
      const q = String(query.q || '').trim();
      const rows = db.prepare(`SELECT c.id, c.name, c.email, c.phone, COUNT(l.id) leads, MIN(l.created_at) primeiro, MAX(l.created_at) ultimo,
          (SELECT stage FROM leads x WHERE x.tenant_id = ? AND x.contact_id = c.id ORDER BY x.created_at DESC LIMIT 1) etapa,
          (SELECT json_extract(utm, '$.utm_source') FROM leads x WHERE x.tenant_id = ? AND x.contact_id = c.id ORDER BY x.created_at ASC LIMIT 1) origem
        FROM leads l JOIN contacts c ON c.id = l.contact_id
        WHERE l.tenant_id = ? ${q ? 'AND (lower(c.name) LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)' : ''}
        GROUP BY c.id ORDER BY ultimo DESC LIMIT 500`).all(tenant.id, tenant.id, tenant.id, ...(q ? [like(q), like(q), like(q)] : []));
      return { clientes: rows, total: db.prepare('SELECT COUNT(DISTINCT contact_id) n FROM leads WHERE tenant_id = ? AND contact_id IS NOT NULL').get(tenant.id).n };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/clientes/:id', perm: 'leads.read', handler: ({ db, repo, tenant, params }) => {
      const leads = repo.all('leads', { contact_id: params.id }, { order: 'created_at DESC' });
      if (!leads.length) throw new HttpError(404, 'Cliente não encontrado nesta operação.'); // não revela pessoas de outras operações
      const c = db.prepare('SELECT id, name, email, phone, created_at FROM contacts WHERE id = ?').get(params.id);
      const ids = leads.map((l) => l.id);
      const eventos = ids.length ? db.prepare(`SELECT * FROM lead_events WHERE tenant_id = ? AND lead_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 200`).all(tenant.id, ...ids) : [];
      const conversoes = repo.all('conversions', {}, { extra: `lead_id IN (${ids.map(() => '?').join(',')})`, extraParams: ids, order: 'created_at DESC' });
      return { cliente: c, leads: leads.map((l) => ({ id: l.id, etapa: l.stage, pagina: l.page_slug, utm: parse(l.utm, {}), afiliado: l.affiliate_id, criado: l.created_at })),
        eventos: eventos.map((e) => ({ ...e, data: parse(e.data, {}) })), conversoes: conversoes.map((v) => ({ tipo: v.kind, valor: v.value_cents, verificada: Boolean(v.verified), quando: v.occurred_at })) };
    },
  },
  {
    method: 'GET', path: '/api/admin/clientes', super: true, handler: ({ db, edition, query }) => {
      const q = String(query.q || '').trim();
      const rows = db.prepare(`SELECT c.id, c.name, c.email, c.phone, COUNT(DISTINCT l.tenant_id) operacoes, COUNT(l.id) leads, MAX(l.created_at) ultimo
        FROM contacts c JOIN leads l ON l.contact_id = c.id JOIN tenants t ON t.id = l.tenant_id
        WHERE t.edition = ? ${q ? 'AND (lower(c.name) LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)' : ''}
        GROUP BY c.id ORDER BY ultimo DESC LIMIT 500`).all(edition.id, ...(q ? [like(q), like(q), like(q)] : []));
      const totals = db.prepare(`SELECT COUNT(*) pessoas, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) multiplas FROM
        (SELECT l.contact_id, COUNT(DISTINCT l.tenant_id) n FROM leads l JOIN tenants t ON t.id = l.tenant_id WHERE t.edition = ? AND l.contact_id IS NOT NULL GROUP BY l.contact_id)`).get(edition.id);
      return { clientes: rows, totais: { pessoas: totals.pessoas || 0, emMaisDeUma: totals.multiplas || 0 } };
    },
  },
  {
    method: 'GET', path: '/api/admin/clientes/:id', super: true, handler: ({ db, edition, params }) => {
      const c = db.prepare('SELECT id, name, email, phone, created_at FROM contacts WHERE id = ?').get(params.id);
      if (!c) throw new HttpError(404, 'Cliente não encontrado.');
      const rel = db.prepare(`SELECT t.slug, t.name, t.niche_id, t.number, l.stage, l.utm, l.created_at FROM leads l JOIN tenants t ON t.id = l.tenant_id
        WHERE l.contact_id = ? AND t.edition = ? ORDER BY l.created_at DESC`).all(c.id, edition.id);
      if (!rel.length) throw new HttpError(404, 'Cliente não encontrado nesta edição.');
      return { cliente: c, relacionamentos: rel.map((r) => ({ operacao: `${unitLabel(r.niche_id, r.number)} · ${r.name}`, slug: r.slug, etapa: r.stage, origem: parse(r.utm, {}).utm_source || 'direto', quando: r.created_at })) };
    },
  },
];
