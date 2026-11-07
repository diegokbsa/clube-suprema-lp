// Vigia diário por operação (PA-151), como o tools/vigia/vigia.py do suprema.blog: confere se o que devia sair hoje saiu.
// Só verifica e mostra; NUNCA refaz nada sozinho. Roda uma vez por dia no horário da operação (padrão 21:00) e sob demanda.
// Itens: site no ar, posts do dia (pauta automática), calendário do dia, Telegram (bot lendo, grade nos grupos), Bluesky e pauta.
// Cada item sai como 'ok', 'pendente' ou 'na' (não se aplica: integração não configurada ou automação desligada).
import { parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { scoped } from '../repo.mjs';
import { lerConfig, gravarConfig, rotinasLigadas, fusoDe, horaOk, passouDa, gradeDisponivel } from '../automacao.mjs';
import { diaLocal, horaLocal, instanteLocal, somarDias } from './calendar.mjs';
import { siteDaOperacao, urlDoSite } from './email.mjs';
import { configDaPauta, horariosDoDia, siteDoBlog } from './pauta.mjs';
import { configDosGrupos, ultimaLeitura } from './telegram.mjs';

export const tables = ['vigia_execucoes', 'automacao_config'];
export const nav = { id: 'vigia', label: 'Vigia diário', perm: 'reports.read' };

const PADRAO = { ativo: true, hora: '21:00' };
const FOLGA_MS = 15 * 60_000;          // o que devia ter saído há menos de 15 min ainda não conta como atraso
const LEITURA_MAX_MS = 10 * 60_000;    // o bot do Telegram lê a cada 10 s; 10 min sem ler é problema
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

const configDoVigia = (repo) => {
  const c = lerConfig(repo, 'vigia', PADRAO);
  return { ativo: c.ativo !== false, hora: horaOk(c.hora) || '21:00' };
};

const item = (id, nome, estado, detalhe, extras = []) => ({ id, nome, estado, detalhe, extras: extras.filter(Boolean) });
const fmtHora = (tz, iso) => horaLocal(tz, new Date(iso));

// ---------------------------------------------------------------- verificações

async function noAr(app, url) {
  try {
    const r = await (app.fetchImpl || globalThis.fetch)(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'PortalVigia/1.0' } });
    try { await r.body?.cancel?.(); } catch { /* corpo já lido */ }
    return { ok: r.status >= 200 && r.status < 400, status: r.status };
  } catch (e) {
    return { ok: false, status: 0, erro: String(e?.message || e).slice(0, 120) };
  }
}

async function checarSite(app, tenant, repo) {
  const site = siteDaOperacao(app.db, tenant.id);
  if (!site) return item('site', 'Site no ar', 'pendente', 'A operação ainda não tem site.');
  const url = urlDoSite(app, tenant, site);
  const alvos = [{ rotulo: 'início', url }];
  const blogSite = siteDoBlog(repo, configDaPauta(repo, tenant));
  if (blogSite && !blogSite.external_url && repo.count('posts', { site_id: blogSite.id }, 'published_data IS NOT NULL')) {
    alvos.push({ rotulo: 'blog', url: `${urlDoSite(app, tenant, blogSite).replace(/\/$/, '')}/blog` });
  }
  const res = [];
  for (const a of alvos) res.push({ ...a, ...(await noAr(app, a.url)) });
  const falhas = res.filter((r) => !r.ok);
  const linhas = res.map((r) => `${r.rotulo} (${r.url}): ${r.ok ? `HTTP ${r.status}` : r.status ? `HTTP ${r.status}` : `fora do ar${r.erro ? ` (${r.erro})` : ''}`}`);
  return item('site', 'Site no ar', falhas.length ? 'pendente' : 'ok', falhas.length ? `${falhas.length} endereço(s) com problema.` : 'Site respondendo.', linhas);
}

function limitesDoDia(tz, agora) {
  const hoje = diaLocal(tz, agora);
  return { hoje, inicio: instanteLocal(tz, hoje, '00:00').toISOString(), fim: instanteLocal(tz, somarDias(hoje, 1), '00:00').toISOString() };
}

function checarPosts(tenant, repo, tz, agora) {
  const { hoje, inicio } = limitesDoDia(tz, agora);
  const publicados = repo.count('posts', {}, 'published_data IS NOT NULL AND published_at >= ? AND published_at <= ?', [inicio, agora.toISOString()]);
  const cfg = configDaPauta(repo, tenant);
  if (!cfg.ativo) return item('posts', 'Posts do dia', 'na', `Pauta automática desligada. Posts publicados hoje: ${publicados}.`);
  const desde = Date.parse(cfg.ligadaEm || '') || 0;
  const vencidos = horariosDoDia(cfg, tz, hoje).filter((s) => Date.parse(s.quando) <= agora.getTime() - FOLGA_MS && Date.parse(s.quando) >= desde);
  if (!vencidos.length) return item('posts', 'Posts do dia', 'ok', `Nenhum horário de publicação passou ainda hoje (${cfg.horarios.join(', ')}). Publicados hoje: ${publicados}.`);
  const extras = [];
  let feitos = 0;
  for (const s of vencidos) {
    const tema = repo.all('pauta_temas', { horario_alvo: s.quando }, { limit: 1, extra: "status IN ('entregue', 'pulado')" })[0];
    if (!tema) { extras.push(`${s.hora}: nenhum post entregue pelo redator.`); continue; }
    if (tema.status === 'pulado') { feitos++; extras.push(`${s.hora}: pulado de propósito (${tema.motivo || 'sem motivo'}).`); continue; }
    const post = tema.post_id ? repo.get('posts', tema.post_id) : null;
    if (!post) extras.push(`${s.hora}: o post entregue foi apagado.`);
    else if (post.status === 'publicado') { feitos++; extras.push(`${s.hora}: publicado "${post.title}".`); }
    else if (post.status === 'revisao') extras.push(`${s.hora}: "${post.title}" está em revisão, esperando o dono publicar${tema.motivo ? ` (${tema.motivo})` : ''}.`);
    else if (post.status === 'agendado') extras.push(`${s.hora}: "${post.title}" ainda agendado para ${fmtHora(tz, post.scheduled_at)}.`);
    else extras.push(`${s.hora}: "${post.title}" voltou para rascunho.`);
  }
  return item('posts', 'Posts do dia', feitos >= vencidos.length ? 'ok' : 'pendente', `${feitos} de ${vencidos.length} horário(s) até agora. Publicados hoje: ${publicados}.`, extras);
}

function checarCalendario(repo, tz, agora) {
  const { inicio } = limitesDoDia(tz, agora);
  const itens = repo.all('calendar', {}, { order: 'scheduled_at ASC', limit: 500, extra: 'scheduled_at >= ? AND scheduled_at <= ?', extraParams: [inicio, new Date(agora.getTime() - FOLGA_MS).toISOString()] });
  if (!itens.length) return item('calendario', 'Calendário do dia', 'na', 'Nenhum espaço do calendário venceu hoje até agora.');
  const conta = (st) => itens.filter((i) => i.status === st).length;
  const extras = itens.filter((i) => i.status !== 'publicado').map((i) => {
    const quando = `${fmtHora(tz, i.scheduled_at)} ${i.channel}`;
    if (i.status === 'erro') return `${quando}: erro (${i.last_error || 'sem detalhe'}).`;
    if (i.status === 'agendado') return `${quando}: agendado e ainda não saiu.`;
    if (i.status === 'aguardando_conexao') return `${quando}: a conta do canal não está conectada.`;
    return `${quando}: ficou em rascunho (sem texto agendado).`;
  });
  const pub = conta('publicado');
  return item('calendario', 'Calendário do dia', pub === itens.length ? 'ok' : 'pendente', `${pub} de ${itens.length} espaço(s) vencidos saíram.`, extras);
}

async function checarTelegram(app, tenant, repo, tz, agora, temGrade) {
  const row = repo.get('integrations', { kind: 'telegram' });
  if (!row || row.status === 'pendente' || !row.secret) return item('telegram', 'Telegram', 'na', 'Telegram não configurado nesta operação.');
  if (row.status === 'erro') return item('telegram', 'Telegram', 'pendente', `Conexão com erro: ${row.last_error || 'use "Testar" em Integrações'}.`);
  const extras = [];
  let pendente = false;
  const leitura = ultimaLeitura(app, tenant.id);
  if (leitura && agora.getTime() - Date.parse(leitura) <= LEITURA_MAX_MS) extras.push(`Bot lendo mensagens (última leitura às ${fmtHora(tz, leitura)}).`);
  else if (!rotinasLigadas(app) && !leitura) extras.push('Leitura do bot desligada neste servidor (rotinas automáticas desligadas).');
  else { pendente = true; extras.push(leitura ? `O bot não lê mensagens desde ${fmtHora(tz, leitura)}.` : 'O bot não leu mensagens desde que o servidor ligou.'); }
  const gcfg = configDosGrupos(repo);
  const hoje = diaLocal(tz, agora);
  const ativos = repo.all('telegram_grupos', { situacao: 'ativo' }, { limit: 1000 });
  if (!gcfg.gradeAtiva) extras.push('Grade do dia nos grupos: desligada.');
  else if (!temGrade) extras.push('Grade do dia: aguardando o módulo de torneios.');
  else if (!passouDa(tz, new Date(agora.getTime() - FOLGA_MS), gcfg.gradeHora)) extras.push(`Grade do dia: sai às ${gcfg.gradeHora}.`);
  else {
    const sem = ativos.filter((g) => g.ultima_grade !== hoje);
    if (sem.length) { pendente = true; extras.push(`Grade de hoje faltando em ${sem.length} de ${ativos.length} grupo(s): ${sem.slice(0, 5).map((g) => g.titulo || g.chat_id).join(', ')}${sem.length > 5 ? '…' : ''}.`); }
    else extras.push(`Grade de hoje em ${ativos.length} grupo(s) ativo(s).`);
    if (gcfg.gradeNoCanal) {
      const noCanal = (parse(row.public_config, {}) || {}).gradeCanalDia === hoje;
      if (!noCanal) pendente = true;
      extras.push(noCanal ? 'Grade de hoje no canal.' : 'A grade de hoje não saiu no canal.');
    }
  }
  return item('telegram', 'Telegram', pendente ? 'pendente' : 'ok', pendente ? 'Algo do Telegram não saiu hoje.' : 'Telegram em dia.', extras);
}

async function checarBluesky(app, tenant, repo, tz, agora, temGrade) {
  const row = repo.get('integrations', { kind: 'bluesky' });
  if (!row || row.status === 'pendente' || !row.secret) return item('bluesky', 'Bluesky', 'na', 'Bluesky não configurado nesta operação.');
  if (row.status === 'erro') return item('bluesky', 'Bluesky', 'pendente', `Conexão com erro: ${row.last_error || 'use "Testar" em Integrações'}.`);
  const cfg = parse(row.public_config, {}) || {};
  const { hoje, inicio } = limitesDoDia(tz, agora);
  const extras = [];
  let pendente = false;
  if (cfg.postarBlog !== false) {
    const desde = new Date(Math.max(Date.parse(inicio), Date.parse(cfg.ativadoEm || '') || 0)).toISOString();
    const posts = repo.all('posts', {}, { order: 'published_at ASC', limit: 100, extra: 'published_data IS NOT NULL AND published_at >= ? AND published_at <= ?', extraParams: [desde, new Date(agora.getTime() - FOLGA_MS).toISOString()] });
    for (const p of posts) {
      const env = repo.get('bluesky_envios', { chave: `post:${p.id}` });
      if (env?.status === 'enviado') continue;
      pendente = true;
      extras.push(`Post "${p.title}": ${env ? (env.status === 'erro' ? `erro (${env.last_error || 'sem detalhe'})` : `na fila (${env.tentativas} tentativa(s))`) : 'não entrou na fila'}.`);
    }
    if (posts.length && !pendente) extras.push(`${posts.length} post(s) de hoje no perfil.`);
    if (!posts.length) extras.push('Nenhum post do blog para mandar hoje.');
  }
  const gradeHora = horaOk(cfg.gradeHora) || '09:30';
  if (cfg.postarGrade !== false) {
    if (!temGrade) extras.push('Grade do dia: aguardando o módulo de torneios.');
    else if (!passouDa(tz, new Date(agora.getTime() - FOLGA_MS), gradeHora)) extras.push(`Grade do dia: sai às ${gradeHora}.`);
    else {
      const env = repo.get('bluesky_envios', { chave: `grade:${hoje}` });
      if (env?.status === 'enviado') extras.push('Grade de hoje no perfil.');
      else { pendente = true; extras.push(env ? `Grade de hoje: ${env.status === 'erro' ? `erro (${env.last_error || ''})` : 'na fila'}.` : 'A grade de hoje não saiu no perfil.'); }
    }
  }
  return item('bluesky', 'Bluesky', pendente ? 'pendente' : 'ok', pendente ? 'Algo do Bluesky não saiu hoje.' : 'Bluesky em dia.', extras);
}

function checarPauta(tenant, repo) {
  const cfg = configDaPauta(repo, tenant);
  const naFila = repo.count('pauta_temas', { status: 'fila' });
  if (!cfg.ativo) return item('pauta', 'Pauta com temas', 'na', `Pauta automática desligada (${naFila} tema(s) na fila).`);
  const dias = cfg.horarios.length ? Math.floor(naFila / cfg.horarios.length) : 0;
  return item('pauta', 'Pauta com temas', naFila >= cfg.minimoTemas ? 'ok' : 'pendente',
    `${naFila} tema(s) na fila (mínimo ${cfg.minimoTemas}); dá para cerca de ${dias} dia(s).`);
}

/** Roda todas as verificações e grava o resultado. origem: 'agenda' (uma por dia) ou 'manual'. */
export async function rodarVigia(app, tenant, { agora = new Date(), origem = 'manual' } = {}) {
  const repo = scoped(app.db, tenant.id);
  const tz = fusoDe(tenant);
  const dia = diaLocal(tz, agora);
  const idem = origem === 'agenda' ? `agenda|${dia}` : `manual|${agora.toISOString()}|${Math.random().toString(36).slice(2, 8)}`;
  if (origem === 'agenda') { const ja = repo.get('vigia_execucoes', { idem_key: idem }); if (ja) return execOut(ja); }
  const temGrade = await gradeDisponivel(app);
  const itens = [
    await checarSite(app, tenant, repo),
    checarPosts(tenant, repo, tz, agora),
    checarCalendario(repo, tz, agora),
    await checarTelegram(app, tenant, repo, tz, agora, temGrade),
    await checarBluesky(app, tenant, repo, tz, agora, temGrade),
    checarPauta(tenant, repo),
  ];
  const ok = itens.filter((i) => i.estado === 'ok').length;
  const pendencias = itens.filter((i) => i.estado === 'pendente').length;
  try {
    const row = repo.insert('vigia_execucoes', { dia, origem, idem_key: idem, ok, pendencias, itens: JSON.stringify(itens), created_at: agora.toISOString() });
    return execOut(row);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return execOut(repo.get('vigia_execucoes', { idem_key: idem }));
    throw e;
  }
}

function execOut(r) {
  return r && { id: r.id, dia: r.dia, origem: r.origem, ok: r.ok, pendencias: r.pendencias, quando: r.created_at, itens: parse(r.itens, []) };
}

/** Laço: uma conferência automática por dia e operação, depois do horário configurado. */
export async function vigiaDoDia(app, { agora = new Date() } = {}) {
  let rodadas = 0;
  for (const tenant of app.db.prepare("SELECT * FROM tenants WHERE status = 'ativa'").all()) {
    try {
      const repo = scoped(app.db, tenant.id);
      const cfg = configDoVigia(repo);
      const tz = fusoDe(tenant);
      if (!cfg.ativo || !passouDa(tz, agora, cfg.hora)) continue;
      if (repo.get('vigia_execucoes', { idem_key: `agenda|${diaLocal(tz, agora)}` })) continue;
      await rodarVigia(app, tenant, { agora, origem: 'agenda' });
      rodadas++;
    } catch (e) {
      console.error(`[vigia] ${tenant.slug}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  return rodadas;
}

export async function init(app) {
  if (!rotinasLigadas(app)) return null;
  let rodando = false;
  const t = setInterval(() => {
    if (rodando) return;
    rodando = true;
    vigiaDoDia(app).catch((e) => console.error(`[vigia] ${String(e?.message || e).slice(0, 200)}`)).finally(() => { rodando = false; });
  }, 5 * 60_000);
  t.unref?.();
  return t;
}

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/vigia', perm: 'reports.read',
    handler: ({ repo, tenant }) => {
      const hist = repo.all('vigia_execucoes', {}, { order: 'created_at DESC', limit: 60 });
      return { config: configDoVigia(repo), fuso: fusoDe(tenant), ultima: execOut(hist[0]) || null,
        historico: hist.map((r) => ({ id: r.id, dia: r.dia, origem: r.origem, ok: r.ok, pendencias: r.pendencias, quando: r.created_at })) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/vigia/:id', perm: 'reports.read',
    handler: ({ repo, params }) => {
      const r = repo.get('vigia_execucoes', String(params.id || ''));
      need(r, 404, 'Conferência não encontrada.');
      return { execucao: execOut(r) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/vigia/rodar', perm: 'reports.read',
    handler: async ({ app, tenant, audit }) => {
      const r = await rodarVigia(app, tenant, { origem: 'manual' });
      audit('vigia.rodar', r.id, { pendencias: r.pendencias });
      return { status: 201, body: { execucao: r } };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/vigia/config', perm: 'tenant.manage',
    handler: ({ repo, body, audit }) => {
      const novo = { ...lerConfig(repo, 'vigia', PADRAO) };
      if (body.ativo !== undefined) novo.ativo = Boolean(body.ativo);
      if (body.hora !== undefined) { const h = horaOk(body.hora); need(h, 400, 'Horário inválido: use HH:MM.'); novo.hora = h; }
      gravarConfig(repo, 'vigia', novo);
      audit('vigia.config', 'vigia', novo);
      return { config: configDoVigia(repo) };
    },
  },
];

