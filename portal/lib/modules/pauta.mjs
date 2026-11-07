// Pauta e posts automáticos por operação (PA-151). O painel NÃO chama modelo de IA: guarda a fila de temas e os horários,
// e um redator externo (tarefa agendada, com o token de serviço) pega o próximo tema e entrega o post pronto.
//
// Redator (Authorization: Bearer <token de serviço>), passo a passo em portal/docs/redator-automatico.md:
//   GET  /api/service/pauta                         operações com a automação ligada, próximo horário e se já é a vez
//   POST /api/service/pauta/:op/proximo             reserva o próximo tema (3 h) para o próximo horário livre; repetir devolve o mesmo
//   POST /api/service/pauta/:op/entregar            { temaId, title, content, excerpt, ... } -> post agendado no horário (ou revisão)
//   POST /api/service/pauta/:op/pular               { temaId, motivo, encerrarHorario? } -> tema pulado
//
// Idempotência: um tema vira no máximo um post (entregar de novo devolve o mesmo post); um horário recebe no máximo um tema.
// Segurança: o texto passa pelo preflight; com bloqueio (promessa de ganho, bônus, menor de idade) o post entra em revisão.
import { HttpError } from '../http.mjs';
import { now, parse, tx } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { audit as gravarAuditoria } from '../tenants.mjs';
import { checarTexto, exigeJogoResponsavel, RODAPE_JOGO } from '../preflight.mjs';
import { lerConfig, gravarConfig, servicoOk, fusoDe } from '../automacao.mjs';
import { cleanArticle } from './blog.mjs';
import { diaLocal, horaLocal, somarDias, instanteLocal, lerHorarios } from './calendar.mjs';
import { dadosDaOperacao, urlDoSite } from './email.mjs';

export const tables = ['pauta_temas', 'automacao_config'];
export const nav = { id: 'pauta', label: 'Pauta automática', perm: 'blog.read' };

const RESERVA_MS = 3 * 3600_000;       // o redator tem 3 h para entregar o tema reservado
const ATRASO_MS = 3 * 3600_000;        // horário que passou há até 3 h ainda pode receber o post (sai na hora da entrega)
const VEZ_ANTES_MS = 60 * 60_000;      // "é a vez" desde 1 h antes do horário
const MAX_TEMA = 200;
const PADRAO = { ativo: false, modo: 'agendar', siteId: null, autor: '', categoria: 'Geral', minimoTemas: 10 };

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const texto = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- configuração

export const configDaPauta = (repo, tenant) => normalizarConfig(lerConfig(repo, 'pauta', PADRAO), tenant);

function normalizarConfig(c, tenant) {
  const s = parse(tenant.settings, {}) || {};
  let horarios = [];
  try { horarios = lerHorarios(c.horarios ?? s.postTimes ?? '12:00,15:00,18:00'); } catch { horarios = []; }
  return {
    ativo: Boolean(c.ativo), horarios, modo: c.modo === 'revisao' ? 'revisao' : 'agendar', siteId: c.siteId || null,
    autor: texto(c.autor, 100), categoria: texto(c.categoria, 80) || 'Geral',
    minimoTemas: Math.max(1, Math.min(200, Math.round(Number(c.minimoTemas) || 10))),
    ligadaEm: c.ligadaEm || null,  // horários de antes de ligar não contam para o vigia
  };
}

/** Site que recebe os posts: o escolhido, ou o primeiro site do construtor (site externo não mostra o blog do portal). */
export function siteDoBlog(repo, cfg) {
  if (cfg.siteId) { const s = repo.get('sites', String(cfg.siteId)); if (s) return s; }
  const sites = repo.all('sites', {}, { order: 'created_at ASC', limit: 50 });
  return sites.find((s) => !s.external_url) || sites[0] || null;
}

const urlBlog = (app, tenant, site) => `${urlDoSite(app, tenant, site).replace(/\/$/, '')}/blog`;

// ---------------------------------------------------------------- horários e fila

const ocupados = (repo, agora) => new Set(repo.all('pauta_temas', {}, { limit: 5000, order: 'created_at DESC',
  extra: "horario_alvo IS NOT NULL AND (status IN ('entregue', 'pulado') OR (status = 'reservado' AND reservado_ate > ?))", extraParams: [agora.toISOString()] })
  .map((t) => t.horario_alvo));

/** Instantes (ISO) dos horários de um dia local. */
export function horariosDoDia(cfg, tz, dia) {
  return cfg.horarios.map((hora) => ({ dia, hora, quando: instanteLocal(tz, dia, hora).toISOString() }));
}

/** Próximo horário que ainda não tem tema (até 3 dias à frente). */
export function proximoHorario(repo, tenant, cfg, agora = new Date()) {
  const tz = fusoDe(tenant);
  const hoje = diaLocal(tz, agora);
  const tomados = ocupados(repo, agora);
  for (let i = 0; i < 4; i++) {
    for (const s of horariosDoDia(cfg, tz, somarDias(hoje, i))) {
      if (Date.parse(s.quando) < agora.getTime() - ATRASO_MS || tomados.has(s.quando)) continue;
      return s;
    }
  }
  return null;
}

function liberarVencidas(repo, agora) {
  for (const t of repo.all('pauta_temas', { status: 'reservado' }, { extra: 'reservado_ate <= ?', extraParams: [agora.toISOString()], limit: 200 })) {
    repo.update('pauta_temas', t.id, { status: 'fila', reservado_ate: null, horario_alvo: null });
  }
}

const fila = (repo) => repo.all('pauta_temas', {}, { order: 'posicao ASC', limit: 1000, extra: "status IN ('fila', 'reservado')" });

/** Reserva o próximo tema para o próximo horário livre. Repetir com reserva viva devolve a mesma. */
export function reservarProximo(db, repo, tenant, cfg, agora = new Date()) {
  return tx(db, () => {
    const viva = repo.all('pauta_temas', { status: 'reservado' }, { order: 'posicao ASC', limit: 1, extra: 'reservado_ate > ?', extraParams: [agora.toISOString()] })[0];
    if (viva) return { tema: viva, repetido: true };
    liberarVencidas(repo, agora);
    const slot = proximoHorario(repo, tenant, cfg, agora);
    if (!slot) return { tema: null, motivo: 'Sem horário de publicação configurado.' };
    const t = repo.all('pauta_temas', { status: 'fila' }, { order: 'posicao ASC', limit: 1 })[0];
    if (!t) return { tema: null, motivo: 'A pauta está vazia: acrescente temas no painel (Pauta automática).' };
    const tema = repo.update('pauta_temas', t.id, { status: 'reservado', reservado_ate: new Date(agora.getTime() + RESERVA_MS).toISOString(), horario_alvo: slot.quando });
    return { tema, repetido: false };
  });
}

function temaOut(t, tz) {
  return { id: t.id, tema: t.tema, notas: t.notas, situacao: t.status, posicao: t.posicao,
    horario: t.horario_alvo, horarioLocal: t.horario_alvo ? `${diaLocal(tz, new Date(t.horario_alvo)).split('-').reverse().join('/')} ${horaLocal(tz, new Date(t.horario_alvo))}` : null,
    reservadoAte: t.reservado_ate, postId: t.post_id, motivo: t.motivo, entregueEm: t.entregue_em, criadoEm: t.created_at };
}

// ---------------------------------------------------------------- redator: contexto do tema

function slugOcupado(repo, siteId, slug) {
  return Boolean(repo.get('posts', { site_id: siteId, slug }) || repo.get('posts', { site_id: siteId, published_slug: slug }));
}

function contextoDoTema(app, tenant, repo, cfg, tema) {
  const tz = fusoDe(tenant);
  const site = siteDoBlog(repo, cfg);
  const d = dadosDaOperacao(app, tenant, site);
  const blog = site ? urlBlog(app, tenant, site) : '';
  const publicados = site ? repo.all('posts', { site_id: site.id }, { order: 'published_at DESC', limit: 100, extra: 'published_data IS NOT NULL' })
    .map((p) => ({ titulo: p.title, slug: p.published_slug, url: `${blog}/${encodeURIComponent(p.published_slug)}`, categoria: p.category, tags: parse(p.tags, []) })) : [];
  const outros = site ? repo.all('posts', { site_id: site.id }, { order: 'updated_at DESC', limit: 100, extra: 'published_data IS NULL' })
    .map((p) => ({ titulo: p.title, slug: p.slug, situacao: p.status })) : [];
  const jogo = exigeJogoResponsavel({ nicho: tenant.niche_id, edicao: tenant.edition });
  return {
    tema: temaOut(tema, tz),
    horario: tema.horario_alvo, horarioLocal: temaOut(tema, tz).horarioLocal, fuso: tz,
    entrega: cfg.modo === 'revisao' ? 'O post entra em revisão: o dono publica no painel.' : 'O post entra agendado e sai sozinho no horário (se o horário já passou, sai na hora da entrega).',
    operacao: { slug: tenant.slug, nome: tenant.name, numero: tenant.number || '', nicho: tenant.niche_id, edicao: tenant.edition,
      app: d.appNome || '', agente: d.agente || '', convite: d.convite || '', whatsapp: d.whatsapp || '', fichas: d.fichas || '', site: d.siteUrl || '', aviso: d.aviso || '' },
    blog: { url: blog, autor: cfg.autor || `Equipe ${tenant.name}`, categoria: cfg.categoria, publicados, outros },
    formato: {
      campos: { title: 'até 120 caracteres (ideal até 70, com a busca alvo)', seoTitle: 'até 60 caracteres', seoDescription: '120 a 155 caracteres', excerpt: 'resumo de até 300 caracteres',
        content: 'corpo em markdown curto, até 80.000 caracteres', tags: '2 a 4 tags', category: 'opcional', slug: 'opcional (sai do título)', coverUrl: 'opcional: https:// ou /assets/...' },
      markdown: ['"## " e "### " para seções', '"- " e "1. " para listas', '**negrito**', '[texto](https://... ou /caminho)', 'parágrafos separados por linha em branco', 'sem tabelas, imagens, HTML nem front matter'],
    },
    regras: [
      'Nada de promessa de ganho, renda, lucro ou resultado garantido.',
      'Nada de bônus, ficha grátis, rakeback ou cashback.',
      'Nada que fale com menor de idade.',
      'Nada inventado sobre a operação: use só os dados de "operacao" e os posts publicados.',
      'Não repita tema que já está em "blog.publicados" ou "blog.outros".',
      ...(jogo ? [`Termine com "${RODAPE_JOGO}"`] : []),
      'O texto passa pelo preflight do portal; com bloqueio, o post entra em revisão e não é publicado.',
    ],
  };
}

// ---------------------------------------------------------------- rotas do redator (token de serviço)

function operacaoDoServico(ctx) {
  if (!servicoOk(ctx.app, ctx.req.headers.authorization)) throw new HttpError(401, 'Token de serviço inválido.');
  const tenant = ctx.db.prepare("SELECT * FROM tenants WHERE (id = ? OR slug = ?) AND status = 'ativa'").get(ctx.params.op, ctx.params.op);
  need(tenant, 404, 'Operação não encontrada.');
  const repo = scoped(ctx.db, tenant.id);
  return { tenant, repo, cfg: configDaPauta(repo, tenant) };
}

const auditar = (db, tenant, action, target, data) => gravarAuditoria(db, { tenantId: tenant.id, action, target, data: { ...data, por: 'redator' } });

const rotasDoRedator = [
  {
    method: 'GET', path: '/api/service/pauta', auth: false, handler: ({ app, req, db }) => {
      if (!servicoOk(app, req.headers.authorization)) throw new HttpError(401, 'Token de serviço inválido.');
      const agora = new Date();
      const operacoes = [];
      for (const tenant of db.prepare("SELECT * FROM tenants WHERE status = 'ativa' ORDER BY created_at ASC").all()) {
        const repo = scoped(db, tenant.id);
        const cfg = configDaPauta(repo, tenant);
        if (!cfg.ativo) continue;
        const reservado = repo.all('pauta_temas', { status: 'reservado' }, { limit: 1, extra: 'reservado_ate > ?', extraParams: [agora.toISOString()] })[0];
        const slot = reservado ? { quando: reservado.horario_alvo } : proximoHorario(repo, tenant, cfg, agora);
        const naFila = repo.count('pauta_temas', { status: 'fila' });
        operacoes.push({ operacao: tenant.slug, nome: tenant.name, edicao: tenant.edition, nicho: tenant.niche_id, modo: cfg.modo,
          proximoHorario: slot?.quando || null, ehAVez: Boolean(slot && Date.parse(slot.quando) - agora.getTime() <= VEZ_ANTES_MS && (reservado || naFila > 0)),
          temaReservado: reservado ? reservado.id : null, temasNaFila: naFila });
      }
      return { agora: agora.toISOString(), operacoes };
    },
  },
  {
    method: 'POST', path: '/api/service/pauta/:op/proximo', auth: false, handler: (ctx) => {
      const { tenant, repo, cfg } = operacaoDoServico(ctx);
      need(cfg.ativo, 409, 'A pauta automática está desligada nesta operação.');
      need(siteDoBlog(repo, cfg), 409, 'A operação ainda não tem site para o blog.');
      const r = reservarProximo(ctx.db, repo, tenant, cfg);
      if (!r.tema) return { tema: null, motivo: r.motivo };
      if (!r.repetido) auditar(ctx.db, tenant, 'pauta.reservar', r.tema.id, { horario: r.tema.horario_alvo });
      return { ...contextoDoTema(ctx.app, tenant, repo, cfg, r.tema), repetido: r.repetido };
    },
  },
  {
    method: 'POST', path: '/api/service/pauta/:op/entregar', auth: false, handler: (ctx) => {
      const { tenant, repo, cfg } = operacaoDoServico(ctx);
      const body = ctx.body || {};
      const tema = repo.get('pauta_temas', String(body.temaId || ''));
      need(tema, 404, 'Tema não encontrado nesta operação. Use o temaId que veio em /proximo.');
      if (tema.status === 'entregue') {
        const post = tema.post_id ? repo.get('posts', tema.post_id) : null;
        return { ok: true, repetido: true, post: post ? { id: post.id, slug: post.slug, situacao: post.status, publicaEm: post.scheduled_at } : null };
      }
      need(tema.status !== 'pulado', 409, 'Este tema foi pulado. Peça outro em /proximo.');
      need(cfg.ativo, 409, 'A pauta automática está desligada nesta operação.');
      const site = siteDoBlog(repo, cfg);
      need(site, 409, 'A operação ainda não tem site para o blog.');
      const artigo = cleanArticle({ ...body, author: body.author || cfg.autor || `Equipe ${tenant.name}`, category: body.category || cfg.categoria });
      need(!slugOcupado(repo, site.id, artigo.slug), 409, `Já existe um post com o endereço "${artigo.slug}" neste site. Mude o slug ou pule o tema se ele repete um post.`);
      const agora = new Date();
      const vivo = tema.status === 'reservado' && tema.horario_alvo;
      const horario = vivo ? tema.horario_alvo : proximoHorario(repo, tenant, cfg, agora)?.quando || agora.toISOString();
      const pf = checarTexto([artigo.title, artigo.excerpt, artigo.content].join('\n\n'), { nicho: tenant.niche_id, edicao: tenant.edition, parte: 'roteiro' });
      const bloqueado = pf.bloqueios.length > 0;
      const situacao = cfg.modo === 'revisao' || bloqueado ? 'revisao' : 'agendado';
      const publicaEm = situacao === 'agendado' ? new Date(Math.max(Date.parse(horario) || 0, agora.getTime())).toISOString() : null;
      const post = tx(ctx.db, () => {
        const p = repo.insert('posts', { site_id: site.id, ...artigo, status: situacao, scheduled_at: publicaEm, published_at: null, published_slug: null, published_data: null });
        repo.update('pauta_temas', tema.id, { status: 'entregue', post_id: p.id, entregue_em: now(), reservado_ate: null, horario_alvo: horario,
          motivo: bloqueado ? `Preflight: ${pf.bloqueios.map((b) => b.motivo).join('; ').slice(0, 300)}` : null });
        return p;
      });
      auditar(ctx.db, tenant, 'pauta.entregar', post.id, { tema: tema.id, situacao, slug: post.slug });
      const url = `${urlBlog(ctx.app, tenant, site)}/${encodeURIComponent(post.slug)}`;
      return { status: 201, body: { ok: true, repetido: false, post: { id: post.id, slug: post.slug, situacao, publicaEm, url },
        aviso: bloqueado ? 'O preflight bloqueou o texto: o post ficou em revisão e não será publicado sozinho.' : situacao === 'revisao' ? 'Post em revisão: o dono publica no painel.' : 'Post agendado: sai sozinho no horário.',
        preflight: { bloqueios: pf.bloqueios, avisos: pf.avisos } } };
    },
  },
  {
    method: 'POST', path: '/api/service/pauta/:op/pular', auth: false, handler: (ctx) => {
      const { tenant, repo } = operacaoDoServico(ctx);
      const body = ctx.body || {};
      const tema = repo.get('pauta_temas', String(body.temaId || ''));
      need(tema, 404, 'Tema não encontrado nesta operação.');
      need(['fila', 'reservado'].includes(tema.status), 409, 'Só dá para pular tema que está na fila ou reservado.');
      const motivo = texto(body.motivo, 300);
      need(motivo, 400, 'Diga o motivo de pular (ex.: repete o post X, falta fato confiável).');
      const encerra = Boolean(body.encerrarHorario) && tema.status === 'reservado' && tema.horario_alvo;
      repo.update('pauta_temas', tema.id, { status: 'pulado', motivo, reservado_ate: null, horario_alvo: encerra ? tema.horario_alvo : null, entregue_em: now() });
      auditar(ctx.db, tenant, 'pauta.pular', tema.id, { encerrarHorario: Boolean(encerra) });
      return { ok: true, encerrouHorario: Boolean(encerra) };
    },
  },
];

// ---------------------------------------------------------------- rotas do painel

function requireTema(repo, id) {
  const t = repo.get('pauta_temas', String(id || ''));
  need(t, 404, 'Tema não encontrado.');
  return t;
}

function telaDaPauta(app, tenant, repo, origin) {
  const cfg = configDaPauta(repo, tenant);
  const tz = fusoDe(tenant);
  const agora = new Date();
  const site = siteDoBlog(repo, cfg);
  const temas = fila(repo).map((t) => temaOut(t, tz));
  const historico = repo.all('pauta_temas', {}, { order: 'entregue_em DESC', limit: 60, extra: "status IN ('entregue', 'pulado')" }).map((t) => {
    const p = t.post_id ? repo.get('posts', t.post_id) : null;
    return { ...temaOut(t, tz), post: p ? { id: p.id, titulo: p.title, slug: p.slug, situacao: p.status, publicaEm: p.scheduled_at, publicadoEm: p.published_at } : null };
  });
  const slot = proximoHorario(repo, tenant, cfg, agora);
  const naFila = temas.filter((t) => t.situacao === 'fila').length;
  const avisos = [];
  if (!cfg.ativo) avisos.push('Automação desligada: o redator não pega temas desta operação.');
  if (!site) avisos.push('A operação não tem site: crie um em Sites e páginas antes de ligar.');
  else if (site.external_url) avisos.push('O site escolhido é externo: os posts do portal não aparecem nele. Escolha um site do construtor.');
  if (!cfg.horarios.length) avisos.push('Sem horários de publicação.');
  if (naFila < cfg.minimoTemas) avisos.push(`Só ${naFila} tema(s) na fila; o mínimo combinado é ${cfg.minimoTemas}.`);
  return {
    config: { ...cfg, horarios: cfg.horarios.join(', ') }, fuso: tz,
    sites: repo.all('sites', {}, { order: 'created_at ASC', limit: 50 }).map((s) => ({ id: s.id, nome: s.name, slug: s.slug, externo: Boolean(s.external_url) })),
    site: site ? { id: site.id, nome: site.name, blog: urlBlog(app, tenant, site) } : null,
    temas, historico, avisos,
    proximo: slot ? { quando: slot.quando, local: `${slot.dia.split('-').reverse().join('/')} ${slot.hora}` } : null,
    contagem: { fila: naFila, reservados: temas.length - naFila, entregues: repo.count('pauta_temas', { status: 'entregue' }), pulados: repo.count('pauta_temas', { status: 'pulado' }) },
    redator: { lista: `${origin}/api/service/pauta`, proximo: `${origin}/api/service/pauta/${tenant.slug}/proximo`, entregar: `${origin}/api/service/pauta/${tenant.slug}/entregar`,
      pular: `${origin}/api/service/pauta/${tenant.slug}/pular`, instrucao: 'portal/docs/redator-automatico.md' },
  };
}

const rotasDoPainel = [
  {
    method: 'GET', path: '/api/t/:tenant/pauta', perm: 'blog.read',
    handler: ({ app, tenant, repo, origin }) => telaDaPauta(app, tenant, repo, origin),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/pauta/config', perm: 'blog.publish',
    handler: ({ app, tenant, repo, body, audit, origin }) => {
      const atual = lerConfig(repo, 'pauta', PADRAO);
      const novo = { ...atual };
      if (body.ativo !== undefined) { if (Boolean(body.ativo) && !atual.ativo) novo.ligadaEm = new Date().toISOString(); novo.ativo = Boolean(body.ativo); }
      if (body.horarios !== undefined) novo.horarios = lerHorarios(Array.isArray(body.horarios) ? body.horarios.join(',') : body.horarios).join(',');
      if (body.modo !== undefined) { need(['agendar', 'revisao'].includes(body.modo), 400, 'Modo inválido: use "agendar" ou "revisao".'); novo.modo = body.modo; }
      if (body.siteId !== undefined) { need(!body.siteId || repo.get('sites', String(body.siteId)), 404, 'Site não encontrado nesta operação.'); novo.siteId = body.siteId || null; }
      if (body.autor !== undefined) novo.autor = texto(body.autor, 100);
      if (body.categoria !== undefined) novo.categoria = texto(body.categoria, 80);
      if (body.minimoTemas !== undefined) { const n = Math.round(Number(body.minimoTemas)); need(n >= 1 && n <= 200, 400, 'Mínimo de temas: de 1 a 200.'); novo.minimoTemas = n; }
      if (novo.ativo) {
        const cfg = normalizarConfig({ ...PADRAO, ...novo }, tenant);
        need(cfg.horarios.length, 400, 'Informe pelo menos um horário antes de ligar.');
        need(siteDoBlog(repo, cfg), 400, 'Crie um site antes de ligar a pauta automática.');
      }
      gravarConfig(repo, 'pauta', novo);
      audit('pauta.config', 'pauta', { ativo: Boolean(novo.ativo), modo: novo.modo, horarios: novo.horarios || null });
      return telaDaPauta(app, tenant, repo, origin);
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pauta/temas', perm: 'blog.edit',
    handler: ({ repo, body, audit }) => {
      const lista = (Array.isArray(body.temas) ? body.temas : String(body.texto ?? body.tema ?? '').split(/\r?\n/))
        .map((t) => texto(String(t).replace(/^\s*(?:[-*]\s*(?:\[[ x-]\]\s*)?|\d+[.)]\s*)/i, ''), MAX_TEMA)).filter((t) => t.length >= 3).slice(0, 200);
      need(lista.length, 400, 'Escreva pelo menos um tema (um por linha).');
      const existentes = new Set(fila(repo).map((t) => t.tema.toLowerCase()));
      let pos = (repo.all('pauta_temas', {}, { order: 'posicao DESC', limit: 1 })[0]?.posicao ?? 0);
      const notas = texto(body.notas, 1000);
      let criados = 0;
      let repetidos = 0;
      for (const tema of lista) {
        if (existentes.has(tema.toLowerCase())) { repetidos++; continue; }
        existentes.add(tema.toLowerCase());
        repo.insert('pauta_temas', { tema, notas: lista.length === 1 ? notas : '', posicao: ++pos, status: 'fila' });
        criados++;
      }
      audit('pauta.temas.incluir', 'pauta', { criados, repetidos });
      return { status: 201, body: { criados, repetidos } };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/pauta/temas/:id', perm: 'blog.edit',
    handler: ({ repo, params, body, audit, tenant }) => {
      const t = requireTema(repo, params.id);
      const patch = {};
      if (body.tema !== undefined) { const v = texto(body.tema, MAX_TEMA); need(v.length >= 3, 400, 'O tema precisa de pelo menos 3 letras.'); patch.tema = v; }
      if (body.notas !== undefined) patch.notas = texto(body.notas, 1000);
      if (body.devolver) {
        need(['pulado', 'reservado'].includes(t.status), 409, 'Só tema pulado ou reservado volta para a fila.');
        Object.assign(patch, { status: 'fila', reservado_ate: null, horario_alvo: null, motivo: null, entregue_em: null });
      }
      need(t.status !== 'entregue' || (!patch.tema && !patch.status), 409, 'Tema já entregue: edite o post no Blog.');
      const novo = repo.update('pauta_temas', t.id, patch);
      audit('pauta.tema.editar', t.id, { devolver: Boolean(body.devolver) });
      return { tema: temaOut(novo, fusoDe(tenant)) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/pauta/temas/:id/mover', perm: 'blog.edit',
    handler: ({ db, repo, params, body }) => {
      const t = requireTema(repo, params.id);
      need(['fila', 'reservado'].includes(t.status), 409, 'Só tema da fila muda de lugar.');
      const lista = fila(repo);
      const i = lista.findIndex((x) => x.id === t.id);
      const para = body.para;
      need(['cima', 'baixo', 'topo'].includes(para), 400, 'Use "cima", "baixo" ou "topo".');
      tx(db, () => {
        if (para === 'topo') { repo.update('pauta_temas', t.id, { posicao: (lista[0]?.posicao ?? 0) - 1 }); return; }
        const j = para === 'cima' ? i - 1 : i + 1;
        if (j < 0 || j >= lista.length) return;
        const outro = lista[j];
        const [a, b] = t.posicao === outro.posicao ? [outro.posicao + (para === 'cima' ? -1 : 1), t.posicao] : [outro.posicao, t.posicao];
        repo.update('pauta_temas', t.id, { posicao: a });
        repo.update('pauta_temas', outro.id, { posicao: b });
      });
      return { ok: true };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/pauta/temas/:id', perm: 'blog.edit',
    handler: ({ repo, params, audit }) => {
      const t = requireTema(repo, params.id);
      need(['fila', 'pulado'].includes(t.status), 409, 'Tema reservado ou entregue não pode ser apagado.');
      repo.remove('pauta_temas', t.id);
      audit('pauta.tema.remover', t.id, {});
      return { ok: true };
    },
  },
];

export const routes = [...rotasDoRedator, ...rotasDoPainel];
