// Insights do pesquisador de IA. Entrada por máquina com o token de serviço (Bearer); leitura e decisão pelo superadmin.
import { createHash, timingSafeEqual } from 'node:crypto';
import { id as newId, now, parse } from './db.mjs';
import { HttpError } from './http.mjs';

export const TIPOS = ['seo', 'produto', 'mercado', 'integracao', 'conteudo', 'conversao', 'risco', 'seguranca'];
export const SISTEMAS = ['sx', 'geral', 'suprema.blog', 'orquestrador', 'todos'];
const clampN = (v) => Math.max(1, Math.min(5, Math.round(Number(v) || 3)));
const s = (v, n) => String(v ?? '').trim().slice(0, n);

export const insightHash = (i) => createHash('sha256').update(`${s(i.fonte_url, 500).toLowerCase().replace(/[?#].*$/, '')}|${s(i.titulo, 200).toLowerCase()}`).digest('hex');

export function cleanInsight(i) {
  const url = s(i.fonte_url, 500);
  if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(url)) throw new Error('fonte_url precisa ser um link http(s) real');
  if (s(i.titulo, 200).length < 8 || s(i.resumo, 2000).length < 30 || s(i.acao, 1000).length < 15) throw new Error('título, resumo e ação são obrigatórios e precisam de conteúdo');
  const aplic = (Array.isArray(i.aplicavel_em) ? i.aplicavel_em : Array.isArray(i.aplicavel) ? i.aplicavel : ['todos']).map(String).filter((x) => SISTEMAS.includes(x));
  return { tema: s(i.tema, 60) || 'geral', titulo: s(i.titulo, 200), resumo: s(i.resumo, 2000), fonte_url: url, fonte_data: s(i.fonte_data, 30) || null,
    tipo: TIPOS.includes(i.tipo) ? i.tipo : 'mercado', aplicavel: JSON.stringify(aplic.length ? aplic : ['todos']), acao: s(i.acao, 1000),
    impacto: clampN(i.impacto), esforco: clampN(i.esforco), confianca: clampN(i.confianca), urgente: i.urgente ? 1 : 0 };
}

function serviceOk(app, header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || ''));
  const tokens = [].concat(app.serviceToken || [], app.serviceTokensExtra || []).filter(Boolean);
  if (!m || !tokens.length) return false;
  const a = createHash('sha256').update(m[1]).digest();
  return tokens.some((t) => timingSafeEqual(a, createHash('sha256').update(t).digest()));
}

const visible = (ed, row) => {
  const ap = parse(row.aplicavel, []);
  return ap.includes('todos') || ap.includes(ed.id) || (ed.id === 'sx' && ap.includes('suprema.blog')) || ap.includes('orquestrador');
};
const out = (r) => ({ ...r, aplicavel: parse(r.aplicavel, []), urgente: Boolean(r.urgente) });

export const insightRoutes = [
  {
    method: 'POST', path: '/api/service/insights', auth: false, handler: ({ app, req, body, db }) => {
      if (!serviceOk(app, req.headers.authorization)) throw new HttpError(401, 'token de serviço inválido');
      const list = Array.isArray(body.insights) ? body.insights.slice(0, 50) : [];
      const res = { recebidos: list.length, novos: 0, repetidos: 0, recusados: [] };
      for (const raw of list) {
        let c;
        try { c = cleanInsight(raw); } catch (e) { res.recusados.push({ titulo: s(raw?.titulo, 80), motivo: e.message }); continue; }
        const hash = insightHash(c);
        if (db.prepare('SELECT 1 FROM insights WHERE hash = ?').get(hash)) { res.repetidos++; continue; }
        db.prepare(`INSERT INTO insights (id, hash, tema, titulo, resumo, fonte_url, fonte_data, tipo, aplicavel, acao, impacto, esforco, confianca, urgente, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?)`).run(newId(), hash, c.tema, c.titulo, c.resumo, c.fonte_url, c.fonte_data, c.tipo, c.aplicavel, c.acao, c.impacto, c.esforco, c.confianca, c.urgente, now(), now());
        res.novos++;
      }
      return { status: 201, body: res };
    },
  },
  {
    method: 'GET', path: '/api/admin/insights', super: true, handler: ({ edition, db, query }) => {
      const st = ['novo', 'aceito', 'descartado', 'aplicado'].includes(query.status) ? query.status : null;
      const rows = db.prepare(`SELECT * FROM insights ${st ? 'WHERE status = ?' : ''} ORDER BY urgente DESC, created_at DESC LIMIT 300`).all(...(st ? [st] : [])).filter((r) => visible(edition, r));
      const counts = Object.fromEntries(['novo', 'aceito', 'descartado', 'aplicado'].map((k) => [k, db.prepare('SELECT COUNT(*) n FROM insights WHERE status = ?').get(k).n]));
      return { insights: rows.map(out), counts, tipos: TIPOS };
    },
  },
  {
    method: 'PATCH', path: '/api/admin/insights/:id', super: true, handler: ({ db, params, body, audit }) => {
      if (!['novo', 'aceito', 'descartado', 'aplicado'].includes(body.status)) throw new HttpError(400, 'Situação inválida.');
      const r = db.prepare('UPDATE insights SET status = ?, nota = ?, updated_at = ? WHERE id = ?').run(body.status, s(body.nota, 500) || null, now(), params.id);
      if (!r.changes) throw new HttpError(404, 'Insight não encontrado.');
      audit('insight.decidir', params.id, { status: body.status });
      return { ok: true };
    },
  },
];
