// Cadastro no app + Fichas 24h guiado: a jornada do suprema.blog (FLOW=completo, SUPREMA_MODE=app, F24H_MODE=guiado)
// para qualquer operação, como passos do catálogo de jornadas (conta_app, entrar_clube, fichas24h em journeys.mjs).
//
// Como anda um cadastro (o mesmo orquestrador por etapas do suprema.blog, só com as etapas da conta):
//   1. conta_app: o visitante cria o acesso (e-mail e senha) no site. Vira lead no CRM da operação, com a variante A/B e as UTMs.
//      A conta do app é criada pelo próprio jogador, no app aberto pelo link de convite do clube (settings.inviteLink, que já
//      põe o jogador no clube com o agente): o cadastro fica "aguardando_jogador" com needs = entrar_clube.
//   2. O jogador cola o ID de jogador do app; a página consulta o estado a cada 1,2 s e segue sozinha quando fica "pronto".
//   3. Fichas 24h guiado: o servidor NÃO fala com o Fichas 24h. A página mostra os dados prontos para copiar (CPF, nascimento
//      e celular ficam só no aparelho) e abre o sistema oficial deles.
// Segurança: a senha fica só na memória deste processo, por 30 minutos, e nunca vai para o banco, para o log ou para o lead.
import { randomInt } from 'node:crypto';
import { now, parse } from '../db.mjs';
import { HttpError, readBody, decodeBody, rateLimiter, clientIp, parseCookies, send } from '../http.mjs';
import { cookieName, pickUtm, windowDaysOf } from '../attribution.mjs';
import { upsertContact } from '../migrations.mjs';

export const tables = ['cadastros'];
export const nav = { id: 'cadastros', label: 'Cadastros no app e fichas', perm: 'leads.read' };

export const SENHA_TTL_MIN = 30;
export const ETAPAS = [
  { key: 'conta_app', label: 'Conta no app e entrada no clube' },
  { key: 'email_app', label: 'E-mail confirmado' },
];

// Regras de senha do app da Suprema (as mesmas do suprema.blog): a mesma senha vale no site, no app e no Fichas 24h.
export const REGRAS_SENHA = [
  { label: '6 a 16 caracteres', test: (p) => p.length >= 6 && p.length <= 16 },
  { label: 'uma letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { label: 'um número', test: (p) => /\d/.test(p) },
  { label: 'um símbolo: ! @ # $ % *', test: (p) => /[!@#$%*]/.test(p) },
  { label: 'sem acento nem espaço', test: (p) => p.length > 0 && /^[A-Za-z0-9!@#$%*]+$/.test(p) },
];
export function senhaProblema(senha) {
  const falta = REGRAS_SENHA.filter((r) => !r.test(String(senha ?? '')));
  return falta.length ? `A senha precisa de: ${falta.map((r) => r.label).join(', ')}.` : null;
}

// ---------------------------------------------------------------- senha só na memória

const senhas = new Map(); // cadastroId -> { senha, expira }
function guardarSenha(id, senha) {
  const t = Date.now();
  for (const [k, v] of senhas) if (v.expira < t) senhas.delete(k);
  senhas.set(id, { senha: String(senha), expira: t + SENHA_TTL_MIN * 60_000 });
}
/** Senha do cadastro enquanto vale (30 min), para um adaptador que precise dela. null depois disso. */
export function senhaDe(id) {
  const s = senhas.get(id);
  if (!s || s.expira < Date.now()) { senhas.delete(id); return null; }
  return s.senha;
}
export const senhasEmMemoria = () => senhas.size;

// ---------------------------------------------------------------- adaptador

// "app" é o modo de produção do suprema.blog (SUPREMA_MODE=app): sem API do aplicativo, o jogador cria a conta no app pelo
// link de convite e informa o ID aqui. Um adaptador com API de verdade entra em app.cadastroAdaptador com a mesma forma.
export const ADAPTADOR_APP = {
  viaApp: true,
  async criarConta() { return { viaApp: true }; },
  async vincularId({ idApp }) {
    if (!/^\d{4,12}$/.test(String(idApp))) throw new HttpError(400, 'Confira o ID: só números, como aparece no seu perfil no app.');
    return { ok: true };
  },
};
const adaptador = (app) => app.cadastroAdaptador || ADAPTADOR_APP;

class PrecisaJogador extends Error { constructor(need) { super(need); this.need = need; } }

const rodando = new Set();

async function executar(app, c, key) {
  const ad = adaptador(app);
  if (key === 'conta_app') {
    if (c.id_app) return;
    const r = await ad.criarConta({ email: c.email, apelido: c.apelido, senha: senhaDe(c.id) });
    if (r?.viaApp || r?.exists) throw new PrecisaJogador('entrar_clube');
    return;
  }
  if (key === 'email_app') {
    if (ad.viaApp) return; // conta criada no app: o próprio app confirma o e-mail
  }
}

/** Anda o cadastro pelas etapas a partir da primeira que não está "ok" (falha recomeça dela, não do zero). */
export async function rodar(app, repo, id) {
  if (rodando.has(id)) return;
  const c = repo.get('cadastros', id);
  if (!c || c.status === 'pronto') return;
  rodando.add(id);
  const steps = parse(c.steps, {});
  const log = parse(c.log, []);
  const salvar = (patch = {}) => repo.update('cadastros', id, { steps: JSON.stringify(steps), log: JSON.stringify(log.slice(-40)), ...patch });
  let atual = null;
  try {
    salvar({ status: 'em_andamento', needs: null, error: null });
    for (const { key } of ETAPAS) {
      if (steps[key]?.state === 'ok') continue;
      atual = key;
      steps[key] = { state: 'rodando', at: now() };
      salvar();
      await executar(app, { ...c, ...repo.get('cadastros', id) }, key);
      steps[key] = { state: 'ok', at: now() };
      salvar();
    }
    senhas.delete(id); // pronto: a senha não é mais necessária
    log.push({ at: now(), msg: 'Conta pronta: falta só o Fichas 24h (guiado na página)' });
    salvar({ status: 'pronto' });
    if (c.lead_id) repo.insert('lead_events', { lead_id: c.lead_id, kind: 'cadastro_pronto', data: JSON.stringify({ cadastro: id, id_app: repo.get('cadastros', id).id_app }) });
  } catch (e) {
    if (e instanceof PrecisaJogador) {
      if (atual) steps[atual] = { state: 'aguardando', at: now() };
      salvar({ status: 'aguardando_jogador', needs: e.need });
      return;
    }
    const msg = e instanceof HttpError ? e.message : 'Falhou uma etapa do cadastro. Tente de novo em instantes.';
    if (atual) steps[atual] = { state: 'erro', at: now(), error: msg };
    log.push({ at: now(), msg: `Erro em "${atual}": ${msg}` });
    salvar({ status: 'falhou', error: msg });
  } finally {
    rodando.delete(id);
  }
}

export function publico(c) {
  const steps = parse(c.steps, {});
  return { id: c.id, status: c.status, needs: c.needs || null, error: c.error || null, pronto: c.status === 'pronto', email: c.email, idApp: c.id_app || null,
    steps: ETAPAS.map((e) => ({ key: e.key, label: e.label, state: steps[e.key]?.state || 'pendente' })) };
}

// ---------------------------------------------------------------- lead no CRM

const limpa = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

/** Lead da operação com a mesma regra do formulário do site (base única, último clique, UTMs, variante A/B) e os ganchos onLead. */
export function gravarLead({ app, db, req, tenant, site, repo, email, nome, telefone, pagina, utmEntrada = {}, journeyId, variante, via }) {
  const clickId = parseCookies(req.headers.cookie)[cookieName(tenant.slug)] || null;
  const click = clickId ? repo.get('clicks', String(clickId)) : null;
  const fresh = click && (Date.now() - Date.parse(click.created_at)) / 864e5 <= windowDaysOf(tenant);
  const utm = { ...(click ? parse(click.utm, {}) : {}), ...pickUtm(utmEntrada) };
  for (const k of ['gclid', 'fbclid', 'ref']) if (utmEntrada[k]) utm[k] = limpa(utmEntrada[k], 200);
  if (journeyId && variante) Object.assign(utm, { jornada_id: journeyId, variante });
  const contactId = upsertContact(db, { email, phone: telefone, name: nome });
  const lead = repo.insert('leads', { contact_id: contactId, site_id: site.id, page_slug: limpa(pagina, 60).replace(/[^a-z0-9/-]/gi, ''), email, name: limpa(nome, 80) || null,
    phone: String(telefone || '').replace(/[^\d+]/g, '').slice(0, 20) || null, utm: JSON.stringify(utm), click_id: fresh ? click.id : null,
    affiliate_id: fresh ? click.affiliate_id : null, consent: 1, stage: 'novo', demo: tenant.demo });
  repo.insert('lead_events', { lead_id: lead.id, kind: 'criado', data: JSON.stringify({ origem: utm.utm_source || (fresh ? 'afiliado' : 'direto'), pagina: lead.page_slug,
    referer: String(req.headers.referer || '').slice(0, 200), via }) });
  for (const fn of app.onLead) { // depois da resposta; nunca derruba o cadastro
    setImmediate(() => { Promise.resolve().then(() => fn({ app, db, tenant, site, repo, lead })).catch((e) => console.error(`[portal] gancho de lead: ${e.message}`)); });
  }
  return lead;
}

// ---------------------------------------------------------------- rotas públicas (dentro do site da operação)

const inicioLimit = rateLimiter(10, 10 * 60_000);
const idLimit = rateLimiter(30, 10 * 60_000);
const UUID = /^[0-9a-f-]{36}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function apelidoDe(email) {
  const base = email.split('@')[0].normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  return (base.length >= 2 ? base : 'jogador') + randomInt(1000, 9999);
}

async function corpo(req) {
  try { return decodeBody(await readBody(req, 8000), String(req.headers['content-type'] || '').includes('urlencoded') ? 'application/x-www-form-urlencoded' : 'application/json'); }
  catch { throw new HttpError(400, 'Envio inválido.'); }
}

function responder(res, fn) {
  return Promise.resolve().then(fn).catch((e) => send(res, e.status || 500, { error: e.status ? e.message : 'Erro interno. Tente de novo.' }));
}

export const publicRoutes = [
  {
    path: '/cad/:id/inicio', handler: ({ req, res, app, db, repo, tenant, site, params }) => responder(res, async () => {
      if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
      if (!UUID.test(params.id)) return send(res, 404, { error: 'jornada indisponível' });
      if (!inicioLimit(`${clientIp(req)}|${site.id}`)) return send(res, 429, { error: 'Muitos cadastros. Tente de novo em alguns minutos.' });
      const b = await corpo(req);
      if (b.website) return send(res, 201, { ok: true }); // armadilha para robôs
      const j = repo.get('journeys', params.id);
      if (!j || (j.site_id && j.site_id !== site.id) || j.status !== 'rodando') return send(res, 404, { error: 'Esta jornada não está disponível agora.' });
      const variante = String(b.variant || '');
      if (!/^[a-h]$/.test(variante) || !repo.get('journey_variants', { journey_id: j.id, key: variante })) return send(res, 400, { error: 'Variante inválida.' });
      const email = String(b.email || '').trim().toLowerCase();
      const erros = {};
      if (!EMAIL.test(email) || email.length > 120) erros.email = 'Confira o e-mail.';
      const sp = senhaProblema(b.password);
      if (sp) erros.password = sp;
      if (!b.consent || b.consent === '0') erros.consent = 'Confirme que tem 18 anos ou mais e aceita o contato.';
      if (Object.keys(erros).length) return send(res, 422, { error: Object.values(erros)[0], errors: erros });

      // mesmo e-mail na mesma jornada há pouco tempo: retoma o cadastro em vez de criar outro lead
      const recente = repo.all('cadastros', { journey_id: j.id, email }, { order: 'created_at DESC', limit: 1, extra: "status != 'pronto' AND created_at >= ?", extraParams: [new Date(Date.now() - SENHA_TTL_MIN * 60_000).toISOString()] })[0];
      if (recente) {
        guardarSenha(recente.id, b.password);
        await rodar(app, repo, recente.id);
        return send(res, 200, { ...publico(repo.get('cadastros', recente.id)), retomado: true });
      }
      const utmEntrada = b.utm && typeof b.utm === 'object' ? b.utm : b;
      const lead = gravarLead({ app, db, req, tenant, site, repo, email, nome: b.name, telefone: b.phone, pagina: b.page, utmEntrada, journeyId: j.id, variante, via: 'cadastro_app' });
      const c = repo.insert('cadastros', { site_id: site.id, journey_id: j.id, variant: variante, lead_id: lead.id, contact_id: lead.contact_id, email, apelido: apelidoDe(email),
        status: 'em_andamento', steps: JSON.stringify(Object.fromEntries(ETAPAS.map((e) => [e.key, { state: 'pendente', at: null }]))), utm: lead.utm,
        log: JSON.stringify([{ at: now(), msg: 'Cadastro recebido' }]) });
      repo.insert('lead_events', { lead_id: lead.id, kind: 'cadastro_app', data: JSON.stringify({ cadastro: c.id, jornada: j.id, variante }) });
      guardarSenha(c.id, b.password);
      await rodar(app, repo, c.id);
      return send(res, 201, publico(repo.get('cadastros', c.id)));
    }),
  },
  {
    path: '/cad/:id/status', handler: ({ req, res, repo, params }) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'use GET' });
      const c = UUID.test(params.id) ? repo.get('cadastros', params.id) : null;
      if (!c) return send(res, 404, { error: 'Cadastro não encontrado.' });
      return send(res, 200, publico(c), { 'Cache-Control': 'no-store' });
    },
  },
  {
    path: '/cad/:id/id-app', handler: ({ req, res, app, repo, site, params }) => responder(res, async () => {
      if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
      if (!idLimit(`${clientIp(req)}|${site.id}`)) return send(res, 429, { error: 'Muitas tentativas. Espere alguns minutos.' });
      const c = UUID.test(params.id) ? repo.get('cadastros', params.id) : null;
      if (!c) return send(res, 404, { error: 'Cadastro não encontrado.' });
      const b = await corpo(req);
      return send(res, 200, await informarId(app, repo, c, b.idApp ?? b.supremaId ?? b.id_app, { por: 'jogador' }));
    }),
  },
];

/** Grava o ID do jogador no app e termina as etapas da conta. Usado pela página e pelo painel (suporte). */
export async function informarId(app, repo, c, bruto, { por = 'jogador', userId = null } = {}) {
  if (c.status === 'pronto' && c.id_app) return publico(c);
  const idApp = String(bruto ?? '').replace(/\D/g, '');
  if (idApp.length < 4 || idApp.length > 12) throw new HttpError(400, 'Confira o ID: só números, como aparece no seu perfil no app.');
  await adaptador(app).vincularId({ idApp, email: c.email });
  const steps = parse(c.steps, {});
  steps.conta_app = { state: 'ok', at: now() };
  const log = parse(c.log, []);
  log.push({ at: now(), msg: `ID do app informado (${idApp})${por === 'painel' ? ' pelo painel' : ''}` });
  repo.update('cadastros', c.id, { id_app: idApp, needs: null, status: 'em_andamento', steps: JSON.stringify(steps), log: JSON.stringify(log.slice(-40)) });
  if (c.lead_id) repo.insert('lead_events', { lead_id: c.lead_id, kind: 'id_app', data: JSON.stringify({ id_app: idApp, cadastro: c.id, por }), by_user: userId });
  await rodar(app, repo, c.id);
  return publico(repo.get('cadastros', c.id));
}

// ---------------------------------------------------------------- painel

const cOut = (c, nomes) => ({ ...publico(c), variant: c.variant, journeyId: c.journey_id, journeyName: nomes.get(c.journey_id) || null, leadId: c.lead_id,
  log: parse(c.log, []), utm: parse(c.utm, {}), createdAt: c.created_at, updatedAt: c.updated_at });

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/cadastros', perm: 'leads.read', handler: ({ repo }) => {
      const nomes = new Map(repo.all('journeys', {}, { limit: 500 }).map((j) => [j.id, j.name]));
      const lista = repo.all('cadastros', {}, { order: 'created_at DESC', limit: 300 });
      const n = (st) => repo.count('cadastros', st ? { status: st } : {});
      const grupos = new Map();
      for (const c of repo.all('cadastros', {}, { order: 'created_at DESC', limit: 5000 })) {
        const k = `${c.journey_id}|${c.variant}`;
        const g = grupos.get(k) || { journeyId: c.journey_id, journeyName: nomes.get(c.journey_id) || '(jornada apagada)', variant: c.variant, cadastros: 0, comId: 0, prontos: 0 };
        g.cadastros++; if (c.id_app) g.comId++; if (c.status === 'pronto') g.prontos++;
        grupos.set(k, g);
      }
      return {
        funil: { cadastros: n(), aguardando: n('aguardando_jogador'), prontos: n('pronto'), falhas: n('falhou'), comId: repo.count('cadastros', {}, 'id_app IS NOT NULL') },
        porVariante: [...grupos.values()].sort((a, b) => (a.journeyName || '').localeCompare(b.journeyName || '') || String(a.variant).localeCompare(String(b.variant))),
        cadastros: lista.map((c) => cOut(c, nomes)),
        etapas: ETAPAS, senhaTtlMin: SENHA_TTL_MIN, modoFichas: 'guiado',
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/cadastros/:id/id-app', perm: 'leads.edit', handler: async ({ app, repo, params, body, user, audit }) => {
      const c = repo.get('cadastros', String(params.id));
      if (!c) throw new HttpError(404, 'Cadastro não encontrado.');
      const out = await informarId(app, repo, c, body.idApp, { por: 'painel', userId: user.id });
      audit('cadastro.id_app', c.id, { por: 'painel' });
      return { cadastro: out };
    },
  },
];
