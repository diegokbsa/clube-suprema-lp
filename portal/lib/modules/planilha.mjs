// Cópia de cada lead numa planilha do Google (Apps Script publicado como app da Web), por operação.
// É o mesmo envio do suprema.blog (lib/sheets.js + tools/planilha/Code.gs): POST text/plain com JSON, campos iguais,
// e a variante da jornada A/B na coluna "Indicação (ref)" como jornada-a / jornada-b.
// A URL do app da Web é colada em Integrações e fica só no cofre (quem tem a URL escreve na planilha).
// O envio roda pelo gancho onLead, depois da resposta ao visitante: falha nunca atrapalha o lead, só aparece na tela.
import { now, parse } from '../db.mjs';
import { HttpError } from '../http.mjs';

export const KIND = 'google_sheets';
const URL_RX = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
const TIMEOUT_MS = 10_000;
const TENTATIVAS = 3; // 1 + 2 novas tentativas, como no suprema.blog

const ESTADOS = { pendente: 'Pendente de configuração', gravado: 'URL guardada, falta testar', conectado: 'Conectada', erro: 'Erro no último envio' };
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

function integracao(repo) {
  return repo.get('integrations', { kind: KIND }) || repo.insert('integrations', { kind: KIND, status: 'pendente', public_config: '{}' });
}

/** URL mascarada para a tela: só o começo e o fim do id do script. */
export const mascarar = (url) => String(url || '').replace(/(\/macros\/s\/)([A-Za-z0-9_-]{4})[A-Za-z0-9_-]+([A-Za-z0-9_-]{4})(\/exec)$/, '$1$2…$3$4');

/** Linha que vai para o Apps Script (mesmos campos de lib/sheets.js do suprema.blog). */
export function linhaDoLead(lead, { referer = '' } = {}) {
  const u = parse(lead.utm, {}) || {};
  const ref = [u.ref, u.variante && `jornada-${u.variante}`].filter(Boolean).join(' · ');
  return {
    tipo: 'cadastro',
    id: lead.id,
    createdAt: lead.created_at,
    email: lead.email,
    utm_source: u.utm_source || '',
    utm_medium: u.utm_medium || '',
    utm_campaign: u.utm_campaign || '',
    utm_term: u.utm_term || '',
    utm_content: u.utm_content || '',
    gclid: u.gclid || '',
    fbclid: u.fbclid || '',
    ref,
    landing: `/${lead.page_slug || ''}`,
    referrer: referer || '',
    whatsapp: String(lead.phone || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''),
  };
}

const espera = (app, i) => new Promise((r) => setTimeout(r, (app.planilhaEsperaMs ?? 1500) * i));

/** Envia com novas tentativas. Devolve { ok, detalhe }; o detalhe nunca contém a URL. */
export async function enviar(app, url, payload) {
  const fetchImpl = app.fetchImpl || globalThis.fetch;
  let detalhe = '';
  for (let i = 0; i < TENTATIVAS; i++) {
    if (i) await espera(app, i);
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      const texto = typeof r.text === 'function' ? await r.text() : '';
      let data = null;
      try { data = JSON.parse(texto || '{}'); } catch { /* não é JSON */ }
      if (r.status >= 200 && r.status < 300 && data?.ok === true) return { ok: true, detalhe: data.repetido ? 'Já estava na planilha.' : 'Salvo na planilha.', repetido: Boolean(data.repetido) };
      detalhe = data?.ok === false ? `A planilha recusou: ${String(data.erro || 'sem motivo').slice(0, 160)}` : `Resposta inesperada da planilha (${r.status}).`;
    } catch (e) {
      detalhe = `Não deu para falar com a planilha: ${String(e?.message || e).slice(0, 160)}`;
    }
  }
  return { ok: false, detalhe: detalhe.replace(URL_RX, '[url]') };
}

function urlDe(app, row) {
  if (!row?.secret) return null;
  try { return app.vault.open(row.secret); } catch { return null; }
}

/** Manda um lead (uma vez só por lead: lead_events kind=planilha) e atualiza o estado real da integração. */
export async function enviarLead(app, repo, lead, { forcar = false } = {}) {
  const row = repo.get('integrations', { kind: KIND });
  const url = urlDe(app, row);
  if (!url || !lead?.email) return null;
  const anterior = repo.get('lead_events', { lead_id: lead.id, kind: 'planilha' });
  if (anterior && !forcar) return null;
  if (anterior && parse(anterior.data, {}).status === 'salvo') return null;
  const criado = repo.get('lead_events', { lead_id: lead.id, kind: 'criado' });
  const ev = anterior || repo.insert('lead_events', { lead_id: lead.id, kind: 'planilha', data: JSON.stringify({ status: 'enviando' }) });
  const r = await enviar(app, url, linhaDoLead(lead, { referer: parse(criado?.data, {}).referer }));
  repo.update('lead_events', ev.id, { data: JSON.stringify({ status: r.ok ? 'salvo' : 'erro', detalhe: r.detalhe, em: now() }) });
  repo.update('integrations', row.id, r.ok ? { status: 'conectado', last_check: now(), last_error: null } : { status: 'erro', last_check: now(), last_error: r.detalhe });
  return r;
}

// ---------------------------------------------------------------- gancho do lead

export async function onLead({ app, repo, lead }) {
  await enviarLead(app, repo, lead);
}

// ---------------------------------------------------------------- painel (cartão em Integrações)

function saida(repo) {
  const row = integracao(repo);
  const cfg = parse(row.public_config, {}) || {};
  const envios = repo.all('lead_events', { kind: 'planilha' }, { order: 'created_at DESC', limit: 300 }).map((e) => ({ leadId: e.lead_id, criado: e.created_at, ...parse(e.data, {}) }));
  const estado = ESTADOS[row.status] ? row.status : 'pendente';
  return {
    estado, estadoLabel: ESTADOS[estado], temUrl: Boolean(row.secret), urlMascarada: cfg.urlMascarada || null,
    lastCheck: row.last_check || null, lastError: row.last_error || null,
    envios: { salvos: envios.filter((e) => e.status === 'salvo').length, erros: envios.filter((e) => e.status === 'erro').length, ultimos: envios.slice(0, 10) },
    campos: Object.keys(linhaDoLead({ utm: '{}' })),
    ajuda: 'No Apps Script da planilha: Implantar → Nova implantação → App da Web (executar como você, acesso: qualquer pessoa) e cole aqui a URL que termina em /exec. O código do script é o mesmo do suprema.blog (tools/planilha/Code.gs).',
  };
}

export const routes = [
  { method: 'GET', path: '/api/t/:tenant/planilha', perm: 'integrations.read', handler: ({ repo }) => saida(repo) },
  {
    method: 'PUT', path: '/api/t/:tenant/planilha', perm: 'integrations.manage', handler: ({ app, repo, body, audit }) => {
      const row = integracao(repo);
      const url = String(body?.url ?? '').trim();
      need(url, 400, 'Cole a URL do app da Web do Apps Script (termina em /exec).');
      need(URL_RX.test(url), 400, 'URL inválida: use a do app da Web do Apps Script, no formato https://script.google.com/macros/s/…/exec.');
      repo.update('integrations', row.id, { secret: app.vault.seal(url), public_config: JSON.stringify({ urlMascarada: mascarar(url) }), status: 'gravado', last_check: now(), last_error: null });
      audit('planilha.gravar', KIND, {});
      return { ok: true, ...saida(repo), nota: 'URL guardada no cofre. Use "Testar" para ver se a planilha responde.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/planilha/teste', perm: 'integrations.manage', handler: async ({ app, repo, audit }) => {
      const row = integracao(repo);
      const url = urlDe(app, row);
      need(url, 400, 'Integração pendente: cole a URL da planilha antes de testar.');
      // GET no app da Web só confirma que o script está no ar (doGet), sem escrever linha na planilha
      const fetchImpl = app.fetchImpl || globalThis.fetch;
      let ok = false;
      let detalhe = '';
      try {
        const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
        const texto = typeof r.text === 'function' ? await r.text() : '';
        let data = null;
        try { data = JSON.parse(texto || '{}'); } catch { /* não é JSON */ }
        ok = r.status >= 200 && r.status < 300 && data?.ok === true;
        detalhe = ok ? 'A planilha respondeu.' : `Resposta inesperada da planilha (${r.status}). Confira se a implantação é "App da Web" com acesso "qualquer pessoa".`;
      } catch (e) {
        detalhe = `Não deu para falar com a planilha: ${String(e?.message || e).slice(0, 160)}`;
      }
      repo.update('integrations', row.id, ok ? { status: 'conectado', last_check: now(), last_error: null } : { status: 'erro', last_check: now(), last_error: detalhe });
      audit('planilha.teste', KIND, { ok });
      return { ok, detalhe, ...saida(repo) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/planilha/reenviar', perm: 'integrations.manage', handler: async ({ app, repo, audit }) => {
      need(urlDe(app, integracao(repo)), 400, 'Integração pendente: cole a URL da planilha antes de reenviar.');
      const comErro = repo.all('lead_events', { kind: 'planilha' }, { order: 'created_at ASC', limit: 50 }).filter((e) => parse(e.data, {}).status === 'erro');
      let salvos = 0;
      for (const e of comErro) {
        const lead = repo.get('leads', e.lead_id);
        const r = lead ? await enviarLead(app, repo, lead, { forcar: true }) : null;
        if (r?.ok) salvos++;
      }
      audit('planilha.reenviar', KIND, { tentados: comErro.length, salvos });
      return { ok: true, tentados: comErro.length, salvos, ...saida(repo) };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/planilha', perm: 'integrations.manage', handler: ({ repo, audit }) => {
      const row = integracao(repo);
      repo.update('integrations', row.id, { secret: null, public_config: '{}', status: 'pendente', last_check: now(), last_error: null });
      audit('planilha.remover', KIND, {});
      return { ok: true, ...saida(repo), nota: 'URL apagada do cofre. Os próximos leads não vão mais para a planilha.' };
    },
  },
];
