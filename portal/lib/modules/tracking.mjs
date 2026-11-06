// Mensuração por site: GA4, GTM e Meta Pixel no navegador (só depois do consentimento) e Meta Conversions API no servidor.
// O mesmo event_id sai dos dois lados, então a Meta não conta o evento duas vezes (deduplicação por event_name + event_id).
// Tela do painel: /admin/modules/tracking.js — mostra, por site, o que é "ID instalado" e o que é "conta conectada".
//
// Observação para o coordenador: a tabela tracking_events é criada em init() (CREATE TABLE IF NOT EXISTS) porque esta tarefa
// não podia criar arquivo novo em lib/schema/. O DDL está em SCHEMA_SQL e pode virar lib/schema/40-tracking.sql sem mudar nada.
import { createHash } from 'node:crypto';
import { now, parse } from '../db.mjs';
import { HttpError, readBody, decodeBody, rateLimiter, clientIp, parseCookies, send } from '../http.mjs';

export const tables = ['tracking_events'];
export const nav = { id: 'tracking', label: 'Mensuração e pixels', perm: 'integrations.read' };

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id TEXT,
  event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,                        -- navegador | servidor
  page TEXT,
  value_cents INTEGER,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'registrado',   -- registrado | enviado | pendente | erro
  detail TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, event_id, source)
);
CREATE INDEX IF NOT EXISTS tracking_events_tenant ON tracking_events (tenant_id, created_at);
`;

export async function init(app) {
  app.db.exec(SCHEMA_SQL);
}

// ---------------------------------------------------------------- catálogo de eventos

/** Eventos padrão do portal: a chave é o nome que o navegador usa; ga4 e meta são os nomes de cada plataforma. */
export const EVENTS = {
  page_view: { label: 'Visita', ga4: 'page_view', meta: 'PageView' },
  cta_click: { label: 'Clique em CTA', ga4: 'cta_click', meta: 'Contact' },
  generate_lead: { label: 'Lead', ga4: 'generate_lead', meta: 'Lead' },
  sign_up: { label: 'Cadastro', ga4: 'sign_up', meta: 'CompleteRegistration' },
  purchase: { label: 'Compra', ga4: 'purchase', meta: 'Purchase' },
  journey_step: { label: 'Passo da jornada', ga4: 'journey_step', meta: null },
};

export const ID_RULES = {
  ga4: { rx: /^G-[A-Z0-9]{4,12}$/, label: 'Google Analytics 4 (ID de medição)', exemplo: 'G-XXXXXXXXXX' },
  gtm: { rx: /^GTM-[A-Z0-9]{4,10}$/, label: 'Google Tag Manager', exemplo: 'GTM-XXXXXXX' },
  pixel: { rx: /^\d{8,20}$/, label: 'Meta Pixel', exemplo: '123456789012345' },
};

const ESTADOS = {
  ausente: 'Não configurado',
  instalado: 'ID instalado',
  token_guardado: 'Token guardado, falta validar',
  conectada: 'Conta conectada',
  erro: 'Erro na última chamada',
};

const CAPI_VERSION = 'v21.0';
const EVENT_ID = /^[A-Za-z0-9_-]{8,64}$/;
const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
const dias = (n) => new Date(Date.now() - n * 864e5).toISOString();

/** Lê só os IDs válidos do site; o que não casar com o formato é tratado como ausente. */
export function idsDoSite(site) {
  const t = parse(site?.tracking, {}) || {};
  return Object.fromEntries(Object.entries(ID_RULES).map(([k, r]) => [k, r.rx.test(String(t[k] || '')) ? String(t[k]) : '']));
}

function integracao(repo, kind) {
  return repo.get('integrations', { kind }) || repo.insert('integrations', { kind, status: 'pendente', public_config: '{}' });
}

// ---------------------------------------------------------------- Conversions API da Meta

/** Monta o corpo que vai para a Graph API. Nunca inclui e-mail ou telefone em texto puro: só hash SHA-256. */
export function capiPayload({ evento, pixelId, token, testCode, eventId, sourceUrl, ip, userAgent, email, phone, fbp, fbc }) {
  const nomeMeta = EVENTS[evento.name]?.meta;
  const userData = {};
  if (email) userData.em = [sha256(String(email).trim().toLowerCase())];
  if (phone) userData.ph = [sha256(String(phone).replace(/\D/g, ''))];
  if (ip) userData.client_ip_address = ip;
  if (userAgent) userData.client_user_agent = userAgent;
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  const customData = {};
  if (Number.isFinite(evento.value_cents) && evento.value_cents > 0) {
    customData.value = Number((evento.value_cents / 100).toFixed(2));
    customData.currency = evento.currency || 'BRL';
  }
  const body = {
    data: [{
      event_name: nomeMeta,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,                 // mesmo id do navegador: é por aqui que a Meta deduplica
      action_source: 'website',
      ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
      user_data: userData,
      ...(Object.keys(customData).length ? { custom_data: customData } : {}),
    }],
    access_token: token,
  };
  if (testCode) body.test_event_code = testCode;
  return { url: `https://graph.facebook.com/${CAPI_VERSION}/${pixelId}/events`, body };
}

/** Envia o evento pela Conversions API. Devolve { estado, detalhe } e nunca deixa o token vazar para o retorno. */
export async function enviarCapi(app, { pixelId, token, testCode }, evento, extras = {}) {
  const { url, body } = capiPayload({ evento, pixelId, token, testCode, ...extras });
  const fetchImpl = app.fetchImpl || globalThis.fetch;
  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (r.status >= 200 && r.status < 300) return { estado: 'enviado', detalhe: testCode ? 'Enviado em modo de teste.' : 'Enviado.' };
    let motivo = `A Meta respondeu ${r.status}.`;
    try {
      const data = typeof r.json === 'function' ? await r.json() : null;
      if (data?.error?.message) motivo = `A Meta recusou: ${String(data.error.message).slice(0, 200)}`;
    } catch { /* resposta sem JSON */ }
    return { estado: 'erro', detalhe: motivo };
  } catch (e) {
    return { estado: 'erro', detalhe: `Não deu para falar com a Meta: ${String(e?.message || e).slice(0, 160)}` };
  }
}

/** Configuração da CAPI pronta para uso, ou null quando ainda falta credencial. */
function capiConfig(app, repo) {
  const row = repo.get('integrations', { kind: 'meta_capi' });
  if (!row) return null;
  const cfg = parse(row.public_config, {}) || {};
  const token = row.secret ? app.vault.open(row.secret) : null;
  if (!token || !ID_RULES.pixel.rx.test(String(cfg.pixelId || ''))) return null;
  return { row, pixelId: String(cfg.pixelId), token, testCode: cfg.testCode || '' };
}

// ---------------------------------------------------------------- diagnóstico

function diagnostico(app, { repo, canManage, origin }) {
  const sites = repo.all('sites', {}, { order: 'created_at ASC' });
  const porSite = sites.map((s) => {
    const ids = idsDoSite(s);
    return {
      id: s.id, slug: s.slug, name: s.name, status: s.status, domain: s.domain || null,
      externo: Boolean(s.external_url),
      url: s.external_url || `${s.domain ? `https://${s.domain}` : `${origin}/s/${s.slug}`}`,
      ids, instalados: Object.values(ids).filter(Boolean).length,
    };
  });
  const comId = (k) => porSite.filter((s) => s.ids[k]).map((s) => s.slug);

  const capiRow = integracao(repo, 'meta_capi');
  const capiCfg = parse(capiRow.public_config, {}) || {};
  const temToken = Boolean(capiRow.secret);

  const integracoes = [
    ...['ga4', 'gtm', 'pixel'].map((k) => {
      const kind = k === 'pixel' ? 'meta_pixel' : k;
      const sitesComId = comId(k);
      const estado = sitesComId.length ? 'instalado' : 'ausente';
      return {
        kind, chave: k, label: ID_RULES[k].label, tipo: 'id', exemplo: ID_RULES[k].exemplo,
        instalado: sitesComId.length > 0, conectada: false, estado, estadoLabel: ESTADOS[estado], sites: sitesComId,
        detalhe: sitesComId.length ? `ID colado em ${sitesComId.length} site(s). O script só carrega depois do consentimento do visitante.`
          : 'Nenhum site desta operação tem esse identificador.',
      };
    }),
    (() => {
      const estado = capiRow.status === 'conectada' ? 'conectada' : capiRow.status === 'erro' ? 'erro' : temToken ? 'token_guardado' : 'pendente';
      return {
        kind: 'meta_capi', chave: 'capi', label: 'Meta Conversions API (eventos do servidor)', tipo: 'conta',
        instalado: Boolean(capiCfg.pixelId), conectada: estado === 'conectada',
        estado: estado === 'pendente' ? 'ausente' : estado, estadoLabel: estado === 'pendente' ? 'Pendente de configuração' : ESTADOS[estado],
        sites: [], lastCheck: capiRow.last_check || null, lastError: capiRow.last_error || null,
        detalhe: estado === 'conectada' ? 'Token validado com a Meta: os eventos do servidor saem com o mesmo event_id do navegador.'
          : estado === 'erro' ? 'A última chamada falhou. Confira o token e o número do pixel.'
            : temToken ? 'Token guardado no cofre, mas ainda não validado com a Meta.' : 'Sem token: integração pendente de configuração.',
      };
    })(),
  ];

  const d7 = dias(7);
  const eventos = Object.entries(EVENTS).map(([chave, def]) => {
    const ultimo = repo.all('tracking_events', { name: chave }, { order: 'created_at DESC', limit: 1 })[0] || null;
    return {
      chave, label: def.label, ga4: def.ga4, meta: def.meta,
      navegador7d: repo.count('tracking_events', { name: chave, source: 'navegador' }, 'created_at >= ?', [d7]),
      servidor7d: repo.count('tracking_events', { name: chave, source: 'servidor' }, 'created_at >= ?', [d7]),
      ultimo: ultimo?.created_at || null,
    };
  });

  const recentes = repo.all('tracking_events', {}, { order: 'created_at DESC', limit: 30 }).map((e) => ({
    id: e.id, eventId: e.event_id, name: e.name, label: EVENTS[e.name]?.label || e.name, source: e.source,
    status: e.status, page: e.page, detail: e.detail, createdAt: e.created_at,
    valueCents: e.value_cents == null ? null : Number(e.value_cents), currency: e.currency || null,
  }));
  const pares = new Set(recentes.filter((e) => e.source === 'servidor').map((e) => e.eventId));
  for (const e of recentes) e.deduplicado = pares.has(e.eventId);

  const pendencias = [];
  if (!porSite.some((s) => s.instalados)) pendencias.push('Nenhum site tem identificador de medição. Cole o GA4, o GTM ou o Pixel no site para começar a medir.');
  if (comId('pixel').length && !integracoes[3].conectada) pendencias.push('O Pixel está instalado, mas a Conversions API ainda não: sem ela, os eventos do servidor não chegam à Meta.');
  if (temToken && capiRow.status !== 'conectada') pendencias.push('O token da Conversions API está guardado mas nunca foi validado. Use "Testar conexão".');
  if (capiCfg.testCode) pendencias.push(`A Conversions API está em modo de teste (${capiCfg.testCode}). Tire o código quando terminar de validar.`);
  if (!repo.count('tracking_events', {}, 'created_at >= ?', [d7])) pendencias.push('Nenhum evento recebido nos últimos 7 dias. Visite o site, aceite os cookies e recarregue esta tela.');

  return {
    sites: porSite,
    integracoes,
    eventos,
    recentes,
    pendencias,
    consentimento: { chave: 'pa.consent', texto: 'Nenhum script de medição carrega antes do visitante aceitar; a recusa fica gravada no aparelho dele.' },
    capi: {
      pixelId: capiCfg.pixelId || '', testCode: capiCfg.testCode || '',
      tokenResumo: temToken ? (canManage ? 'Token guardado no cofre (nunca é devolvido para a tela).' : 'Token guardado no cofre.') : null,
      temToken, estado: integracoes[3].estado, estadoLabel: integracoes[3].estadoLabel,
      lastCheck: capiRow.last_check || null, lastError: capiRow.last_error || null,
      endpoint: `https://graph.facebook.com/${CAPI_VERSION}/<pixel>/events`,
    },
    podeGerenciarConta: canManage,
    endpointEventos: '/pa/evento',
  };
}

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/tracking', perm: 'integrations.read',
    handler: ({ app, repo, tenant, user, role, origin }) => diagnostico(app, {
      repo, origin: app.originOf(tenant.edition) || origin,
      canManage: Boolean(user?.is_super) || role === 'admin',
    }),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/tracking/sites/:id', perm: 'site.edit',
    handler: ({ repo, params, body, audit }) => {
      const site = repo.get('sites', String(params.id));
      need(site, 404, 'Site não encontrado.');
      const antes = idsDoSite(site);
      const ids = {};
      for (const [k, r] of Object.entries(ID_RULES)) {
        const v = String(body?.[k] ?? '').trim();
        need(!v || r.rx.test(v), 400, `${r.label}: formato inválido. Exemplo: ${r.exemplo}.`);
        ids[k] = v;
      }
      repo.update('sites', site.id, { tracking: JSON.stringify(ids) });
      for (const [kind, v] of [['ga4', ids.ga4], ['gtm', ids.gtm], ['meta_pixel', ids.pixel]]) {
        const row = integracao(repo, kind);
        repo.update('integrations', row.id, {
          status: v ? 'instalado' : 'pendente',
          public_config: JSON.stringify(v ? { id: v, site: site.id } : {}),
          last_check: now(),
        });
      }
      audit('mensuracao.ids', site.id, { de: Object.keys(antes).filter((k) => antes[k]), para: Object.keys(ids).filter((k) => ids[k]) });
      return { ok: true, ids, nota: 'Identificador salvo. O script só carrega no navegador depois que o visitante aceitar a medição.' };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/tracking/capi', perm: 'integrations.manage',
    handler: ({ app, repo, body, audit }) => {
      const row = integracao(repo, 'meta_capi');
      const antes = parse(row.public_config, {}) || {};
      const pixelId = String(body?.pixelId ?? antes.pixelId ?? '').trim();
      need(!pixelId || ID_RULES.pixel.rx.test(pixelId), 400, 'Número do pixel inválido: só dígitos, de 8 a 20.');
      const testCode = String(body?.testCode ?? antes.testCode ?? '').trim().toUpperCase();
      need(!testCode || /^TEST\d{1,10}$/.test(testCode), 400, 'Código de teste inválido. Exemplo: TEST12345.');
      const token = String(body?.token ?? '').trim();
      need(!token || /^[A-Za-z0-9_.|-]{20,400}$/.test(token), 400, 'Token inválido: confira se copiou o token de acesso inteiro.');
      const patch = { public_config: JSON.stringify({ pixelId, testCode }), last_check: now(), last_error: null };
      if (token) patch.secret = app.vault.seal(token);             // só no cofre; nunca volta para a tela nem para o log
      const temToken = Boolean(token || row.secret);
      patch.status = temToken && pixelId ? 'token_guardado' : 'pendente';  // "conectada" só depois de a Meta responder
      repo.update('integrations', row.id, patch);
      audit('mensuracao.capi.salvar', 'meta_capi', { pixel: Boolean(pixelId), token: temToken, teste: Boolean(testCode) });
      return {
        ok: true, estado: patch.status, estadoLabel: patch.status === 'token_guardado' ? ESTADOS.token_guardado : 'Pendente de configuração',
        nota: temToken && pixelId ? 'Token guardado no cofre. Use "Testar conexão" para a conta aparecer como conectada.'
          : 'Integração pendente de configuração: falta o número do pixel ou o token.',
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/tracking/capi/teste', perm: 'integrations.manage',
    handler: async ({ app, repo, tenant, audit, origin }) => {
      const cfg = capiConfig(app, repo);
      need(cfg, 400, 'Integração pendente de configuração: salve o número do pixel e o token antes de testar.');
      const eventId = `teste-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const evento = { name: 'page_view', value_cents: null, currency: null };
      const r = await enviarCapi(app, cfg, evento, { eventId, sourceUrl: app.originOf(tenant.edition) || origin });
      repo.update('integrations', cfg.row.id, {
        status: r.estado === 'enviado' ? 'conectada' : 'erro',
        last_check: now(),
        last_error: r.estado === 'enviado' ? null : r.detalhe,
      });
      repo.insert('tracking_events', {
        site_id: null, event_id: eventId, name: 'page_view', source: 'servidor', page: null,
        value_cents: null, currency: null, status: r.estado === 'enviado' ? 'enviado' : 'erro', detail: `Teste de conexão · ${r.detalhe}`,
      });
      audit('mensuracao.capi.teste', 'meta_capi', { resultado: r.estado });
      const conectada = r.estado === 'enviado';
      return {
        ok: conectada, estado: conectada ? 'conectada' : 'erro', estadoLabel: conectada ? ESTADOS.conectada : ESTADOS.erro,
        detalhe: r.detalhe, eventId,
      };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/tracking/capi', perm: 'integrations.manage',
    handler: ({ repo, audit }) => {
      const row = integracao(repo, 'meta_capi');
      repo.update('integrations', row.id, { secret: null, status: 'pendente', last_check: now(), last_error: null });
      audit('mensuracao.capi.remover', 'meta_capi', {});
      return { ok: true, estado: 'ausente', nota: 'Token apagado do cofre. A integração voltou a ficar pendente de configuração.' };
    },
  },
];

// ---------------------------------------------------------------- rota pública: evento do navegador

const eventoLimit = rateLimiter(600, 60_000);

export const publicRoutes = [
  {
    // O site chama aqui com o MESMO event_id que mandou para o gtag/fbq; o servidor repassa para a Conversions API.
    path: '/pa/evento', handler: async ({ req, res, app, repo, tenant, site, origin }) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
      if (!eventoLimit(`${tenant.id}|${clientIp(req)}`)) return send(res, 429, { error: 'muitos eventos por minuto' });
      let body;
      try { body = decodeBody(await readBody(req, 8000), req.headers['content-type'] || 'application/json'); } catch { return send(res, 400, { error: 'corpo inválido' }); }
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'corpo inválido' });

      // Sem consentimento não se mede nada: nem no navegador (o script nem carrega) nem aqui.
      if (String(body.consent ?? '') !== '1' && body.consent !== true) return send(res, 204, '');

      const name = String(body.name || '');
      if (!EVENTS[name]) return send(res, 400, { error: 'evento fora do catálogo' });
      const eventId = String(body.event_id || '');
      if (!EVENT_ID.test(eventId)) return send(res, 400, { error: 'event_id inválido' });
      const ids = idsDoSite(site);
      if (!Object.values(ids).some(Boolean)) return send(res, 204, ''); // site sem medição: nada a registrar

      const page = String(body.page ?? '').slice(0, 80);
      const valueCents = Number.isFinite(Number(body.value_cents)) ? Math.max(0, Math.round(Number(body.value_cents))) : null;
      const currency = /^[A-Z]{3}$/.test(String(body.currency || '')) ? String(body.currency) : null;

      let gravado = true;
      try {
        repo.insert('tracking_events', {
          site_id: site.id, event_id: eventId, name, source: 'navegador', page,
          value_cents: valueCents, currency, status: 'registrado', detail: null,
        });
      } catch (e) {
        if (!/UNIQUE/i.test(String(e.message))) throw e;
        gravado = false;                                    // mesmo event_id de novo: já contado, não duplica
      }
      if (!gravado) return send(res, 202, { ok: true, duplicate: true, event_id: eventId });

      const cfg = capiConfig(app, repo);
      if (!cfg || !EVENTS[name].meta) {
        return send(res, 202, { ok: true, event_id: eventId, capi: cfg ? 'sem_equivalente' : 'pendente' });
      }
      const cookies = parseCookies(req.headers.cookie);
      const r = await enviarCapi(app, cfg, { name, value_cents: valueCents, currency }, {
        eventId,
        sourceUrl: `${origin}${site.domain ? '' : `/s/${site.slug}`}/${page}`.replace(/\/$/, ''),
        ip: clientIp(req) || null,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
        email: body.email || null,
        phone: body.phone || null,
        fbp: cookies._fbp || null,
        fbc: cookies._fbc || null,
      });
      try {
        repo.insert('tracking_events', {
          site_id: site.id, event_id: eventId, name, source: 'servidor', page,
          value_cents: valueCents, currency, status: r.estado, detail: r.detalhe,
        });
      } catch (e) { if (!/UNIQUE/i.test(String(e.message))) throw e; }
      if (r.estado !== 'enviado') repo.update('integrations', cfg.row.id, { status: 'erro', last_check: now(), last_error: r.detalhe });
      return send(res, 202, { ok: true, event_id: eventId, capi: r.estado });
    },
  },
];
