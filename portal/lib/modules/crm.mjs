// CRM avançado: funil, histórico, responsáveis e exportação da operação.
import { HttpError } from '../http.mjs';

const STAGES = ['novo', 'contato', 'qualificado', 'convertido', 'perdido'];
const need = (condition, status, message) => { if (!condition) throw new HttpError(status, message); };

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f\ufeff]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function leadsCsv(leads, owners, affiliates) {
  const header = ['id', 'email', 'nome', 'telefone', 'etapa', 'responsavel', 'afiliado', 'pagina', 'utm', 'criado_em'];
  const rows = leads.map((lead) => [lead.id, lead.email, lead.name, lead.phone, lead.stage,
    owners.get(lead.owner_id) || '', affiliates.get(lead.affiliate_id) || '', lead.page_slug, lead.utm, lead.created_at]);
  return `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export const nav = { id: 'crm', label: 'Funil e histórico', perm: 'leads.read' };

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/crm/responsaveis', perm: 'leads.read',
    handler: ({ db, tenant }) => ({ responsaveis: db.prepare(`
      SELECT u.id, u.name, m.role
      FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = ? AND m.role IN ('admin', 'marketing')
      ORDER BY u.name COLLATE NOCASE, u.id
    `).all(tenant.id) }),
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/crm/leads/:id/etapa', perm: 'leads.edit',
    handler: ({ repo, params, body, user, audit }) => {
      const lead = repo.get('leads', params.id);
      need(lead, 404, 'Lead não encontrado.');
      const stage = String(body.stage || '');
      need(STAGES.includes(stage), 400, 'Etapa inválida.');
      if (stage === lead.stage) return { lead, changed: false };

      const updated = repo.update('leads', lead.id, { stage });
      const nota = String(body.note || '').trim().slice(0, 500);
      repo.insert('lead_events', { lead_id: lead.id, kind: 'etapa', data: JSON.stringify({
        de: lead.stage, para: stage, ...(nota ? { nota } : {}),
      }), by_user: user.id });
      audit('crm.etapa', lead.id, { de: lead.stage, para: stage });
      return { lead: updated, changed: true };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/crm/leads/:id/responsavel', perm: 'leads.edit',
    handler: ({ repo, db, tenant, params, body, user, audit }) => {
      const lead = repo.get('leads', params.id);
      need(lead, 404, 'Lead não encontrado.');
      const ownerId = body.ownerId == null || body.ownerId === '' ? null : String(body.ownerId).trim();
      if (ownerId) {
        const member = db.prepare(`SELECT 1 FROM memberships
          WHERE user_id = ? AND tenant_id = ? AND role IN ('admin', 'marketing')`).get(ownerId, tenant.id);
        need(member, 400, 'O responsável deve ser administrador ou marketing desta operação.');
      }
      const currentOwner = lead.owner_id || null;
      if (ownerId === currentOwner) return { lead, changed: false };

      const updated = repo.update('leads', lead.id, { owner_id: ownerId });
      const nota = String(body.note || '').trim().slice(0, 500);
      repo.insert('lead_events', { lead_id: lead.id, kind: 'responsavel', data: JSON.stringify({
        de: currentOwner, para: ownerId, ...(nota ? { nota } : {}),
      }), by_user: user.id });
      audit('crm.responsavel', lead.id, { de: currentOwner, para: ownerId });
      return { lead: updated, changed: true };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/leads.csv', perm: 'leads.export',
    handler: ({ repo, db, tenant, query }) => {
      const stage = String(query.stage || '');
      need(!stage || STAGES.includes(stage), 400, 'Etapa inválida.');
      const where = stage ? { stage } : {};
      const leads = repo.all('leads', where, { order: 'created_at DESC', limit: 5000 });
      const owners = new Map(db.prepare(`SELECT u.id, u.name FROM memberships m
        JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ?`).all(tenant.id).map((u) => [u.id, u.name]));
      const affiliates = new Map(repo.all('affiliates').map((a) => [a.id, a.name]));
      const body = leadsCsv(leads, owners, affiliates);
      return { status: 200, body, headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="leads-${tenant.slug}.csv"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      } };
    },
  },
];
