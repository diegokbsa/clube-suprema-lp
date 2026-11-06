// Jornadas guiadas com teste A/B (o que o suprema.blog faz com as jornadas A e B, agora montável no painel).
// O usuário escolhe passos de um catálogo, cria variantes, divide o tráfego, mede cada passo e declara a vencedora.
// No site: bloco "journey" (botão) abre a jornada; o visitante cai numa variante (sorteio pelo peso, guardado no aparelho;
// ?jornada=b força) e cada passo visto/concluído vira evento único por visitante.
import { id as newId, now, parse } from '../db.mjs';
import { HttpError, readBody, decodeBody, rateLimiter, clientIp, send } from '../http.mjs';
import { templateVars } from '../tenants.mjs';
import { fillPlaceholders } from '../templates.mjs';

export const tables = ['journeys', 'journey_variants', 'journey_events'];
export const nav = { id: 'jornadas', label: 'Jornadas e teste A/B', perm: 'site.read' };

const F = (k, label, t = 'text', extra = {}) => ({ k, label, t, ...extra });
export const STEP_TYPES = {
  formulario: { label: 'Formulário (vai para o CRM)', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('fields', 'Campos', 'select', { options: ['email', 'email_nome', 'email_nome_telefone'] }), F('button', 'Botão'), F('consent', 'Texto de consentimento', 'textarea')] },
  link_app: { label: 'Abrir o app pelo link (convite)', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('button', 'Botão'), F('url', 'Link (ex.: {{inviteLink}})'), F('done', 'Botão depois de abrir')] },
  link_externo: { label: 'Botão para outro sistema', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('button', 'Botão'), F('url', 'Link'), F('done', 'Botão depois de abrir')] },
  copiar: { label: 'Dados para copiar e colar', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('items', 'Dados', 'list', { of: [F('label', 'Nome do dado'), F('value', 'Valor (aceita [[nome]], [[email]], [[telefone]] e {{number}})')] }), F('button', 'Botão')] },
  confirmacao: { label: 'Confirmar que fez', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('button', 'Botão (ex.: Pronto, já fiz)')] },
  texto: { label: 'Instrução', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('button', 'Botão')] },
  final: { label: 'Final (meta da jornada)', fields: [F('title', 'Título'), F('text', 'Texto', 'textarea'), F('button', 'Botão (opcional)'), F('url', 'Link do botão (opcional)')] },
};

export function cleanSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) throw new HttpError(400, 'Cada variante precisa de pelo menos um passo.');
  if (steps.length > 12) throw new HttpError(400, 'No máximo 12 passos por variante.');
  const val = (f, v) => {
    if (f.t === 'list') return (Array.isArray(v) ? v : []).slice(0, 12).map((it) => Object.fromEntries(f.of.map((x) => [x.k, String(it?.[x.k] ?? '').slice(0, 200)])));
    if (f.t === 'select') return f.options.includes(v) ? v : f.options[0];
    return String(v ?? '').slice(0, f.t === 'textarea' ? 1500 : 300);
  };
  return steps.map((s) => {
    const def = STEP_TYPES[s?.type];
    if (!def) throw new HttpError(400, `Tipo de passo desconhecido: ${s?.type}`);
    return { type: s.type, ...Object.fromEntries(def.fields.map((f) => [f.k, val(f, s[f.k])])) };
  });
}

// ---------------------------------------------------------------- modelos prontos

const FORM = { type: 'formulario', title: 'Crie sua conta', text: 'Leva 1 minuto. Seus dados ficam prontos para você copiar e colar nos próximos passos.', fields: 'email_nome_telefone', button: 'Continuar', consent: 'Concordo em receber contato sobre o clube. Somente maiores de 18 anos.' };
const APP = { type: 'link_app', title: 'Entre no clube pelo app', text: 'Abra o {{app}} pelo nosso link: você já entra no {{unitLabel}} com o nosso agente. No computador? Abra este link no celular.', button: 'Abrir o app no clube', url: '{{inviteLink}}', done: 'Pronto, entrei no clube' };
const DADOS = { type: 'copiar', title: 'Seus dados para o cadastro de fichas', text: 'Copie cada um e cole no cadastro, na ordem.', items: [{ label: 'Nome', value: '[[nome]]' }, { label: 'E-mail', value: '[[email]]' }, { label: 'Telefone', value: '[[telefone]]' }, { label: 'Clube', value: '{{number}}' }, { label: 'Agente', value: '{{agentId}}' }], button: 'Continuar' };
const FICHAS = { type: 'link_externo', title: 'Termine seu cadastro de fichas', text: 'Crie sua conta de fichas com os dados acima e ligue o seu ID do app ao clube {{number}}.', button: 'Abrir o cadastro de fichas', url: '{{chipsUrl}}', done: 'Pronto, criei minha conta de fichas' };
const COMPRA = { type: 'confirmacao', title: 'Compre suas fichas por PIX', text: 'No sistema de fichas, escolha o valor e pague o PIX. As fichas caem na sua conta do app.', button: 'Pronto, fichas na conta' };
const FIM = { type: 'final', title: 'Tudo pronto! Agora é só jogar', text: 'Suas fichas caem na sua conta do {{name}}. Precisa de ajuda? Fale com o suporte.', button: 'Falar com o suporte', url: '{{whatsappLink}}' };

export const PRESETS = {
  'jornada-guiada-poker': {
    name: 'Jornada guiada: entrar no clube e comprar fichas', niches: ['poker'],
    description: 'As duas ordens testadas no suprema.blog: A = app primeiro e fichas de uma vez; B = fichas primeiro, app depois e volta para comprar.',
    variants: [
      { key: 'a', name: 'A · App primeiro, fichas de uma vez', weight: 50, steps: [FORM, APP, DADOS, FICHAS, COMPRA, FIM] },
      { key: 'b', name: 'B · Fichas primeiro, app depois', weight: 50, steps: [FORM, DADOS, FICHAS, APP, COMPRA, FIM] },
    ],
  },
  'captacao-simples': {
    name: 'Captação simples: formulário e próximo passo', niches: ['*'],
    description: 'A testa um formulário curto (só e-mail); B testa nome e WhatsApp para atendimento.',
    variants: [
      { key: 'a', name: 'A · Só e-mail', weight: 50, steps: [{ ...FORM, title: 'Receba o acesso', fields: 'email', consent: 'Concordo em receber contato sobre esta oferta.' }, { type: 'final', title: 'Pronto!', text: 'Enviamos o próximo passo para o seu e-mail.', button: '', url: '' }] },
      { key: 'b', name: 'B · Nome e WhatsApp', weight: 50, steps: [{ ...FORM, title: 'Fale com a gente', fields: 'email_nome_telefone', consent: 'Concordo em receber contato sobre esta oferta.' }, { type: 'final', title: 'Pronto!', text: 'Vamos chamar você no WhatsApp.', button: 'Abrir o WhatsApp', url: '{{whatsappLink}}' }] },
    ],
  },
};

// ---------------------------------------------------------------- resultados

const normalCdf = (z) => 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI))); // aproximação suficiente para p-valor

export function results(db, journey, variants) {
  const q = (sql, ...p) => db.prepare(sql).get(journey.tenant_id, journey.id, ...p).n;
  const out = variants.map((v) => {
    const steps = parse(v.steps, []);
    const visitors = q('SELECT COUNT(DISTINCT visitor) n FROM journey_events WHERE tenant_id = ? AND journey_id = ? AND variant = ? AND step = 0 AND kind = ?', v.key, 'ver');
    const funnel = steps.map((s, i) => ({ title: s.title, type: s.type,
      viram: q('SELECT COUNT(DISTINCT visitor) n FROM journey_events WHERE tenant_id = ? AND journey_id = ? AND variant = ? AND step = ? AND kind = ?', v.key, i, 'ver'),
      concluiram: q('SELECT COUNT(DISTINCT visitor) n FROM journey_events WHERE tenant_id = ? AND journey_id = ? AND variant = ? AND step = ? AND kind = ?', v.key, i, 'concluir') }));
    const goal = funnel.length ? (steps[steps.length - 1].type === 'final' ? funnel[funnel.length - 1].viram : funnel[funnel.length - 1].concluiram) : 0;
    const leads = db.prepare("SELECT COUNT(*) n FROM leads WHERE tenant_id = ? AND json_extract(utm, '$.jornada_id') = ? AND json_extract(utm, '$.variante') = ?").get(journey.tenant_id, journey.id, v.key).n;
    return { key: v.key, name: v.name, weight: v.weight, visitors, leads, goal, conversion: visitors ? goal / visitors : 0, funnel };
  });
  const base = out[0];
  for (const r of out.slice(1)) {
    if (base.visitors < 30 || r.visitors < 30) { r.verdict = 'Poucos dados: espere pelo menos 30 visitantes em cada variante.'; continue; }
    const pool = (base.goal + r.goal) / (base.visitors + r.visitors);
    const se = Math.sqrt(pool * (1 - pool) * (1 / base.visitors + 1 / r.visitors));
    const z = se ? (r.conversion - base.conversion) / se : 0;
    const p = 2 * (1 - normalCdf(Math.abs(z)));
    r.lift = base.conversion ? (r.conversion - base.conversion) / base.conversion : null;
    r.pValue = p;
    r.verdict = p < 0.05 ? `${r.conversion > base.conversion ? r.key.toUpperCase() + ' converte mais' : base.key.toUpperCase() + ' converte mais'} que ${r.conversion > base.conversion ? base.key.toUpperCase() : r.key.toUpperCase()} (95% de confiança).` : 'Ainda sem diferença confiável: deixe rodando.';
  }
  return out;
}

// ---------------------------------------------------------------- rotas do painel

const KEYS = 'abcdefgh'.split('');
const jOut = (j) => ({ id: j.id, name: j.name, siteId: j.site_id, status: j.status, winner: j.winner, createdAt: j.created_at, updatedAt: j.updated_at });
const vOut = (v) => ({ key: v.key, name: v.name, weight: v.weight, steps: parse(v.steps, []) });

function load(repo, id) {
  const j = repo.get('journeys', String(id));
  if (!j) throw new HttpError(404, 'Jornada não encontrada.');
  return { j, variants: repo.all('journey_variants', { journey_id: j.id }, { order: 'key ASC' }) };
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/journeys', perm: 'site.read', handler: ({ repo, db, tenant, edition }) => ({
      presets: Object.entries(PRESETS).filter(([id, p]) => (p.niches.includes('*') || p.niches.includes(tenant.niche_id)) && (!edition?.presets || edition.presets.includes(id)))
        .map(([id, p]) => ({ id, name: p.name, description: p.description })),
      journeys: repo.all('journeys', {}, { order: 'created_at DESC' }).map((j) => {
        const variants = repo.all('journey_variants', { journey_id: j.id }, { order: 'key ASC' });
        return { ...jOut(j), variants: results(db, j, variants).map(({ key, name, weight, visitors, conversion }) => ({ key, name, weight, visitors, conversion })) };
      }),
    }),
  },
  {
    method: 'POST', path: '/api/t/:tenant/journeys', perm: 'site.edit', handler: ({ repo, body, audit }) => {
      const preset = PRESETS[body.preset] || PRESETS['captacao-simples'];
      const site = body.siteId ? repo.get('sites', String(body.siteId)) : repo.all('sites', {}, { order: 'created_at ASC', extra: 'external_url IS NULL' })[0];
      const j = repo.insert('journeys', { name: String(body.name || preset.name).slice(0, 80), site_id: site?.id || null, status: 'rascunho' });
      for (const v of preset.variants) repo.insert('journey_variants', { journey_id: j.id, key: v.key, name: v.name, weight: v.weight, steps: JSON.stringify(cleanSteps(v.steps)) });
      audit('jornada.criar', j.id, { preset: body.preset || 'captacao-simples' });
      return { status: 201, body: { journey: jOut(j) } };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/journeys/:id', perm: 'site.read', handler: ({ repo, db, params }) => {
      const { j, variants } = load(repo, params.id);
      return { journey: jOut(j), variants: variants.map(vOut), stepTypes: STEP_TYPES, results: results(db, j, variants),
        pages: repo.all('pages', j.site_id ? { site_id: j.site_id } : {}, { order: 'position ASC' }).map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
        site: j.site_id ? (({ id, slug, name }) => ({ id, slug, name }))(repo.get('sites', j.site_id)) : null };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/journeys/:id', perm: 'site.edit', handler: ({ repo, params, body, audit }) => {
      const { j, variants } = load(repo, params.id);
      const list = Array.isArray(body.variants) ? body.variants : [];
      if (!list.length || list.length > KEYS.length) throw new HttpError(400, 'De 1 a 8 variantes.');
      const clean = list.map((v, i) => ({ key: KEYS[i], name: String(v.name || `Variante ${KEYS[i].toUpperCase()}`).slice(0, 80), weight: Math.max(0, Math.min(100, Math.round(Number(v.weight) || 0))), steps: cleanSteps(v.steps) }));
      if (!clean.some((v) => v.weight > 0)) throw new HttpError(400, 'Pelo menos uma variante precisa receber tráfego.');
      for (const old of variants) repo.remove('journey_variants', old.id);
      for (const v of clean) repo.insert('journey_variants', { journey_id: j.id, key: v.key, name: v.name, weight: v.weight, steps: JSON.stringify(v.steps) });
      repo.update('journeys', j.id, { name: String(body.name || j.name).slice(0, 80) });
      audit('jornada.editar', j.id, { variantes: clean.length, rodando: j.status === 'rodando' });
      return { ok: true, warning: j.status === 'rodando' ? 'A jornada está rodando: mudar passos no meio do teste mistura os resultados. Se a mudança for grande, crie uma jornada nova.' : null };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/journeys/:id/status', perm: 'site.publish', handler: ({ repo, params, body, audit }) => {
      const { j } = load(repo, params.id);
      if (!['rodando', 'pausada', 'encerrada', 'rascunho'].includes(body.status)) throw new HttpError(400, 'Situação inválida.');
      repo.update('journeys', j.id, { status: body.status });
      audit('jornada.status', j.id, { de: j.status, para: body.status });
      return { ok: true };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/journeys/:id/winner', perm: 'site.publish', handler: ({ repo, params, body, audit }) => {
      const { j, variants } = load(repo, params.id);
      const win = variants.find((v) => v.key === body.key);
      if (!win) throw new HttpError(404, 'Variante não encontrada.');
      for (const v of variants) repo.update('journey_variants', v.id, { weight: v.key === win.key ? 100 : 0 });
      repo.update('journeys', j.id, { winner: win.key, status: 'rodando' });
      audit('jornada.vencedora', j.id, { variante: win.key });
      return { ok: true, note: `Todo o tráfego agora vai para a variante ${win.key.toUpperCase()}.` };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/journeys/:id/place', perm: 'site.edit', handler: ({ repo, params, body, audit }) => {
      const { j } = load(repo, params.id);
      const page = repo.get('pages', String(body.pageId || ''));
      if (!page) throw new HttpError(404, 'Página não encontrada.');
      const blocks = parse(page.draft, []);
      const block = { id: Math.random().toString(36).slice(2, 10), type: 'journey', props: { title: String(body.title || 'Comece agora').slice(0, 120), text: String(body.text || '').slice(0, 400), cta: String(body.cta || 'Quero começar').slice(0, 60), journey: j.id, variant: 'cartao', anchor: 'comecar' } };
      const footer = blocks.findIndex((b) => b.type === 'footer');
      blocks.splice(footer === -1 ? blocks.length : footer, 0, block);
      repo.update('pages', page.id, { draft: JSON.stringify(blocks) });
      audit('jornada.colocar', j.id, { pagina: page.slug });
      return { ok: true, note: 'Bloco da jornada colocado no rascunho da página. Publique a página para ir ao ar.' };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/journeys/:id', perm: 'site.edit', handler: ({ repo, params, audit, db, tenant }) => {
      const { j, variants } = load(repo, params.id);
      for (const v of variants) repo.remove('journey_variants', v.id);
      db.prepare('DELETE FROM journey_events WHERE tenant_id = ? AND journey_id = ?').run(tenant.id, j.id);
      repo.remove('journeys', j.id);
      audit('jornada.apagar', j.id, { name: j.name });
      return { ok: true };
    },
  },
];

// ---------------------------------------------------------------- rotas públicas (dentro do site da operação)

const eventLimit = rateLimiter(240, 10 * 60_000);
const VISITOR = /^[a-z0-9]{8,40}$/i;

export const publicRoutes = [
  {
    path: '/j/:id/config', handler: ({ res, repo, tenant, site, params, req }) => {
      const j = repo.get('journeys', params.id);
      const preview = new URL(req.url, 'http://x').searchParams.get('previa') === '1';
      if (!j || (j.site_id && j.site_id !== site.id) || (j.status !== 'rodando' && !preview)) return send(res, 404, { error: 'jornada indisponível' });
      const vars = templateVars(tenant, parse(tenant.settings, {}));
      const variants = repo.all('journey_variants', { journey_id: j.id }, { order: 'key ASC' }).filter((v) => v.weight > 0 || preview)
        .map((v) => ({ key: v.key, weight: v.weight, steps: fillPlaceholders(parse(v.steps, []), vars) }));
      return send(res, 200, { id: j.id, name: j.name, variants, formAction: `/f/${site.id}` }, { 'Cache-Control': 'no-store' });
    },
  },
  {
    path: '/j/:id/evento', handler: async ({ req, res, repo, params }) => {
      if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
      if (!eventLimit(clientIp(req))) return send(res, 429, { error: 'muitos eventos' });
      const body = decodeBody(await readBody(req, 4000), 'application/json');
      const j = repo.get('journeys', params.id);
      if (!j || j.status !== 'rodando') return send(res, 202, { ok: false });
      const step = Number(body.step);
      if (!VISITOR.test(String(body.visitor || '')) || !/^[a-h]$/.test(String(body.variant || '')) || !Number.isInteger(step) || step < 0 || step > 11
        || !['ver', 'concluir', 'clicar'].includes(body.kind)) return send(res, 400, { error: 'evento inválido' });
      try {
        repo.insert('journey_events', { journey_id: j.id, variant: body.variant, visitor: body.visitor, step, kind: body.kind });
      } catch (e) { if (!/UNIQUE/.test(e.message)) throw e; } // repetido: já contado
      return send(res, 202, { ok: true });
    },
  },
];
