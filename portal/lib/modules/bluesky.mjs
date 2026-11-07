// Bluesky por operação (PA-151), como o lib/novos-posts.js do suprema.blog: posta cada post novo do blog (cartão de link com
// capa, título e resumo) e a grade de torneios do dia, pelo XRPC do Bluesky (https://bsky.social/xrpc) com fetch injetável.
// - Integração 'bluesky': config pública { handle, servidor, did, postarBlog, postarGrade, gradeHora, ativadoEm } e a SENHA DE APP
//   selada no cofre (nunca volta para a tela, log, auditoria ou mensagem de erro). Senha da conta não é aceita (formato xxxx-xxxx-xxxx-xxxx).
// - Situação real: 'pendente' sem credencial, 'ativo' depois que o "Testar" abre a sessão, 'erro' quando o Bluesky recusa.
// - Envios: tabela bluesky_envios com chave única por operação ('post:<id>' e 'grade:<dia>'): reexecutar não posta repetido.
//   Só entram posts publicados depois de ligar a integração (ativadoEm), para não despejar o arquivo inteiro no perfil.
// Laço a cada 60 s com unref; desligado com PORTAL_SEM_ROTINAS=1 e nos testes.
import { now, parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { scoped } from '../repo.mjs';
import { audit as gravarAuditoria } from '../tenants.mjs';
import { rotinasLigadas, fusoDe, horaOk, passouDa, obterGrade, gradeDisponivel, destaques, linhasDaGrade, cortar, tamanho } from '../automacao.mjs';
import { diaLocal } from './calendar.mjs';
import { dadosDaOperacao, urlDoSite } from './email.mjs';

export const tables = ['bluesky_envios'];

const KIND = 'bluesky';
const SERVIDOR = 'https://bsky.social';
const LIMITE = 300;                  // caracteres visíveis (grafemas) de um post
const LIMITE_CAPA = 1_000_000;       // a imagem do cartão precisa ter até ~1 MB
const MAX_TENTATIVAS = 5;
const JANELA_POSTS_MS = 2 * 86400_000;
const HANDLE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/i;
const DID = /^did:(plc|web):[a-z0-9._:%-]{3,200}$/i;
const SENHA_DE_APP = /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;
const ESTADOS = { pendente: 'Pendente de configuração', conectado: 'Conectado', erro: 'Erro na última chamada' };
const PADRAO = { handle: '', servidor: SERVIDOR, did: '', postarBlog: true, postarGrade: true, gradeHora: '09:30', ativadoEm: null };

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

// ---------------------------------------------------------------- chamada ao Bluesky

class BskyErro extends Error {
  constructor(mensagem, status = 0, codigo = '') { super(mensagem); this.status = status; this.codigo = codigo; }
}

const esconder = (texto, segredo) => (segredo ? String(texto ?? '').split(segredo).join('***') : String(texto ?? '')).slice(0, 300);

/** Chama um método XRPC. Erros saem sem a senha nem o token de acesso. */
export async function xrpc(app, servidor, metodo, { token, query, json, bytes, tipo, segredo } = {}) {
  const fetchImpl = app.fetchImpl || globalThis.fetch;
  const url = `${servidor.replace(/\/$/, '')}/xrpc/${metodo}${query ? `?${new URLSearchParams(query)}` : ''}`;
  let r;
  try {
    r = await fetchImpl(url, {
      method: json || bytes ? 'POST' : 'GET',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...(bytes ? { 'Content-Type': tipo || 'image/jpeg' } : {}) },
      body: json ? JSON.stringify(json) : bytes, signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new BskyErro(`Não deu para falar com o Bluesky: ${esconder(esconder(e?.message || e, segredo), token)}`);
  }
  let data = {};
  try { data = typeof r.json === 'function' ? await r.json() : {}; } catch { data = {}; }
  if (!r.ok) {
    const motivo = `${data?.error || ''} ${data?.message || ''}`.trim() || `HTTP ${r.status}`;
    throw new BskyErro(`O Bluesky recusou (${metodo}): ${esconder(esconder(motivo, segredo), token).slice(0, 200)}`, Number(r.status) || 0, String(data?.error || ''));
  }
  return data || {};
}

// ---------------------------------------------------------------- integração

function integracao(repo) {
  return repo.get('integrations', { kind: KIND }) || repo.insert('integrations', { kind: KIND, status: 'pendente', public_config: '{}' });
}

const configDe = (row) => {
  const c = { ...PADRAO, ...((row && parse(row.public_config, {})) || {}) };
  return { handle: String(c.handle || ''), servidor: /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(String(c.servidor || '')) ? String(c.servidor) : SERVIDOR,
    did: String(c.did || ''), postarBlog: c.postarBlog !== false, postarGrade: c.postarGrade !== false, gradeHora: horaOk(c.gradeHora) || '09:30', ativadoEm: c.ativadoEm || null };
};

function abrirSenha(app, row) {
  try { return row?.secret ? app.vault.open(row.secret) : null; } catch { return null; }
}

const estadoDe = (row) => (row.status === 'ativo' ? 'conectado' : row.status === 'erro' ? 'erro' : 'pendente');

const envioOut = (e) => ({ id: e.id, tipo: e.tipo, ref: e.ref, situacao: e.status, tentativas: e.tentativas, uri: e.uri, erro: e.last_error, enviadoEm: e.enviado_em, criadoEm: e.created_at,
  titulo: (parse(e.payload, {}) || {}).external?.title || '' });

async function saida(app, repo, row) {
  const cfg = configDe(row);
  const estado = estadoDe(row);
  const perfil = cfg.handle ? `https://bsky.app/profile/${cfg.handle}` : '';
  return {
    config: { handle: cfg.handle, servidor: cfg.servidor, postarBlog: cfg.postarBlog, postarGrade: cfg.postarGrade, gradeHora: cfg.gradeHora },
    perfil, senhaGravada: Boolean(row.secret), estado, estadoLabel: ESTADOS[estado], conectado: estado === 'conectado', ativadoEm: cfg.ativadoEm,
    lastCheck: row.last_check || null, lastError: row.last_error || null, gradeDisponivel: await gradeDisponivel(app),
    envios: repo.all('bluesky_envios', {}, { order: 'created_at DESC', limit: 20 }).map(envioOut),
    ajuda: 'No Bluesky: Configurações → Privacidade e segurança → Senhas de app → Adicionar. Cole aqui a senha de app (xxxx-xxxx-xxxx-xxxx), nunca a senha da conta, e use "Testar".',
  };
}

// ---------------------------------------------------------------- conteúdo dos posts

const comUtm = (url) => `${url}${url.includes('?') ? '&' : '?'}utm_source=bluesky&utm_medium=social`;
const etiqueta = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

/** Texto do post: título, resumo cortado e o aviso da operação, dentro de 300 caracteres visíveis. */
export function textoDoPost(titulo, resumo, aviso = '') {
  const cauda = aviso ? `\n\n${aviso}` : '';
  const cabeca = cortar(titulo, 200);
  const sobra = LIMITE - tamanho(cabeca) - tamanho(cauda) - 2;
  const corpo = sobra > 20 && resumo ? `\n\n${cortar(resumo, sobra)}` : '';
  return cortar(`${cabeca}${corpo}${cauda}`, LIMITE);
}

function urlDoPost(app, tenant, site, slug) {
  return `${urlDoSite(app, tenant, site).replace(/\/$/, '')}/blog/${encodeURIComponent(slug)}`;
}

function capaAbsoluta(app, tenant, site, capa) {
  if (!capa) return '';
  if (/^https:\/\//i.test(capa)) return capa;
  const base = site?.domain ? `https://${site.domain}` : app.originOf(tenant.edition);
  return `${base.replace(/\/$/, '')}${capa.startsWith('/') ? capa : `/${capa}`}`;
}

function payloadDoPost(app, tenant, repo, post) {
  const site = repo.get('sites', post.site_id);
  const d = dadosDaOperacao(app, tenant, site);
  const dados = parse(post.published_data, {}) || {};
  const titulo = dados.title || post.title;
  const resumo = dados.seoDescription || dados.excerpt || post.seo_description || post.excerpt || '';
  const tags = [...new Set([...(tenant.niche_id === 'poker' ? ['poker'] : []), ...(dados.tags || []).map(etiqueta)].filter(Boolean))].slice(0, 4);
  return {
    texto: textoDoPost(titulo, resumo, d.aviso ? cortar(d.aviso, 80) : ''), tags,
    external: { uri: comUtm(urlDoPost(app, tenant, site, post.published_slug || post.slug)), title: cortar(titulo, 300), description: cortar(resumo, 300) },
    capa: capaAbsoluta(app, tenant, site, dados.coverUrl || post.cover_url || ''),
  };
}

function payloadDaGrade(app, tenant, grade, top, tz, agora) {
  const d = dadosDaOperacao(app, tenant);
  const cauda = `\n\n${grade.url ? 'Grade completa no link. ' : ''}${d.poker ? '18+' : ''}`.trimEnd();
  let texto = `Torneios de hoje no ${d.clube} (horário ${tz === 'America/Sao_Paulo' ? 'de Brasília' : tz}):`;
  for (const l of linhasDaGrade(top, tz)) {
    const linha = `\n${l.hora} ${l.nome}${l.garantido ? ` · ${l.garantido} GTD` : ''}`;
    if (tamanho(texto + linha + cauda) > LIMITE) break;
    texto += linha;
  }
  const destino = grade.url || d.siteUrl;
  return {
    texto: cortar(texto + cauda, LIMITE), tags: d.poker ? ['poker', 'torneiodepoker'] : [],
    external: /^https:\/\//i.test(destino) ? { uri: comUtm(destino), title: cortar(`Torneios de hoje (${diaLocal(tz, agora).split('-').reverse().join('/')}) · ${d.clube}`, 300),
      description: cortar(`${grade.total} torneios hoje, com horário, garantido e buy-in.`, 300) } : null,
    capa: '',
  };
}

// ---------------------------------------------------------------- fila de envios

function enfileirar(repo, chave, tipo, ref, payload) {
  if (repo.get('bluesky_envios', { chave })) return false;
  try { repo.insert('bluesky_envios', { chave, tipo, ref, payload: JSON.stringify(payload), status: 'pendente', tentativas: 0 }); return true; }
  catch (e) { if (/UNIQUE/.test(e.message)) return false; throw e; }
}

/** Põe na fila os posts publicados recentes e a grade do dia (se já passou do horário). Devolve quantos entraram. */
export async function enfileirarNovos(app, tenant, repo, row, agora = new Date()) {
  const cfg = configDe(row);
  let novos = 0;
  if (cfg.postarBlog) {
    const desde = new Date(Math.max(Date.parse(cfg.ativadoEm || '') || 0, agora.getTime() - JANELA_POSTS_MS)).toISOString();
    const posts = repo.all('posts', {}, { order: 'published_at ASC', limit: 50, extra: 'published_data IS NOT NULL AND published_at >= ? AND published_at <= ?', extraParams: [desde, agora.toISOString()] });
    for (const p of posts) if (enfileirar(repo, `post:${p.id}`, 'post', p.id, payloadDoPost(app, tenant, repo, p))) novos++;
  }
  const tz = fusoDe(tenant);
  const dia = diaLocal(tz, agora);
  if (cfg.postarGrade && passouDa(tz, agora, cfg.gradeHora) && !repo.get('bluesky_envios', { chave: `grade:${dia}` })) {
    const grade = await obterGrade(app, tenant, { agora });
    const top = destaques(grade, agora, 6);
    if (grade && top.length && enfileirar(repo, `grade:${dia}`, 'grade', dia, payloadDaGrade(app, tenant, grade, top, tz, agora))) novos++;
  }
  return novos;
}

async function capaDoCartao(app, servidor, token, url) {
  if (!/^https:\/\//i.test(url)) return undefined;
  try {
    const r = await (app.fetchImpl || globalThis.fetch)(url, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return undefined;
    const tipo = (r.headers?.get?.('content-type') || 'image/jpeg').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(tipo)) return undefined;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (!bytes.length || bytes.length > LIMITE_CAPA) return undefined;
    return (await xrpc(app, servidor, 'com.atproto.repo.uploadBlob', { token, bytes, tipo })).blob;
  } catch { return undefined; }
}

async function abrirSessao(app, cfg, senha) {
  const s = await xrpc(app, cfg.servidor, 'com.atproto.server.createSession', { json: { identifier: cfg.handle, password: senha }, segredo: senha });
  if (!s?.accessJwt || !s?.did) throw new BskyErro('O Bluesky não devolveu a sessão.');
  return s;
}

const emAndamento = new WeakMap();
const andamento = (app) => { if (!emAndamento.has(app)) emAndamento.set(app, new Set()); return emAndamento.get(app); };

/** Uma rodada: para cada operação com Bluesky ativo, enfileira o que é novo e posta os pendentes. Devolve { enviados, erros }. */
export async function rodadaBluesky(app, { agora = new Date(), tenantId = null } = {}) {
  const linhas = app.db.prepare(`SELECT i.* FROM integrations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.kind = 'bluesky' AND i.status = 'ativo' AND i.secret IS NOT NULL AND t.status = 'ativa' ${tenantId ? 'AND t.id = ?' : ''}`).all(...(tenantId ? [tenantId] : []));
  const resumo = { enviados: 0, erros: 0, enfileirados: 0 };
  const ocupados = andamento(app);
  for (const row of linhas) {
    if (ocupados.has(row.tenant_id)) continue;
    ocupados.add(row.tenant_id);
    const senha = abrirSenha(app, row);
    let token = null;
    try {
      if (!senha) continue;
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(row.tenant_id);
      const repo = scoped(app.db, tenant.id);
      resumo.enfileirados += await enfileirarNovos(app, tenant, repo, row, agora);
      const pendentes = repo.all('bluesky_envios', { status: 'pendente' }, { order: 'created_at ASC', limit: 10 });
      if (!pendentes.length) continue;
      const cfg = configDe(row);
      let sessao;
      try { sessao = await abrirSessao(app, cfg, senha); } catch (e) {
        const recusou = e.status === 401 || /AuthenticationRequired|AuthFactorTokenRequired|AccountTakedown/i.test(e.codigo || '');
        repo.update('integrations', row.id, { last_check: now(), last_error: esconder(e.message, senha), ...(recusou ? { status: 'erro', last_error: 'O Bluesky recusou o login. Gere uma nova senha de app e use "Testar".' } : {}) });
        resumo.erros++;
        continue;
      }
      token = sessao.accessJwt;
      for (const env of pendentes) {
        const p = parse(env.payload, {}) || {};
        const tentativas = env.tentativas + 1;
        try {
          const external = p.external ? { ...p.external, ...(p.capa ? { thumb: await capaDoCartao(app, cfg.servidor, token, p.capa) } : {}) } : null;
          if (external && !external.thumb) delete external.thumb;
          const res = await xrpc(app, cfg.servidor, 'com.atproto.repo.createRecord', { token, segredo: senha, json: {
            repo: sessao.did, collection: 'app.bsky.feed.post',
            record: { $type: 'app.bsky.feed.post', text: p.texto, createdAt: new Date().toISOString(), langs: ['pt'], ...(p.tags?.length ? { tags: p.tags } : {}),
              ...(external ? { embed: { $type: 'app.bsky.embed.external', external } } : {}) },
          } });
          repo.update('bluesky_envios', env.id, { status: 'enviado', tentativas, uri: String(res?.uri || '').slice(0, 300) || null, last_error: null, enviado_em: now() });
          gravarAuditoria(app.db, { tenantId: tenant.id, action: 'bluesky.postar', target: env.id, data: { tipo: env.tipo, ref: env.ref } });
          resumo.enviados++;
        } catch (e) {
          const erro = esconder(esconder(e?.message || e, senha), token);
          repo.update('bluesky_envios', env.id, { status: tentativas >= MAX_TENTATIVAS ? 'erro' : 'pendente', tentativas, last_error: erro });
          resumo.erros++;
        }
      }
      repo.update('integrations', row.id, { last_check: now(), last_error: null, public_config: JSON.stringify({ ...(parse(repo.get('integrations', row.id).public_config, {}) || {}), did: sessao.did }) });
    } catch (e) {
      console.error(`[bluesky] rodada: ${esconder(esconder(e?.message || e, senha), token)}`);
    } finally {
      ocupados.delete(row.tenant_id);
    }
  }
  return resumo;
}

export async function init(app) {
  if (!rotinasLigadas(app)) return null;
  const t = setInterval(() => { rodadaBluesky(app).catch((e) => console.error(`[bluesky] ${String(e?.message || e).slice(0, 200)}`)); }, 60_000);
  t.unref?.();
  return t;
}

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/bluesky', perm: 'integrations.read',
    handler: ({ app, repo }) => saida(app, repo, integracao(repo)),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/bluesky', perm: 'integrations.manage',
    handler: async ({ app, repo, body, audit }) => {
      const row = integracao(repo);
      const antes = configDe(row);
      const deLink = (v) => { const s = String(v ?? '').trim().replace(/^@/, ''); const m = /^(?:https?:\/\/)?bsky\.app\/profile\/([^/?#]+)\/?$/i.exec(s); return (m ? m[1] : s).toLowerCase(); };
      const handle = body.handle !== undefined ? deLink(body.handle) : antes.handle;
      need(!handle || HANDLE.test(handle) || DID.test(handle), 400, 'Usuário inválido: use o handle do perfil (ex.: meuclube.bsky.social).');
      const senha = String(body.senha ?? '').trim();
      need(!senha || SENHA_DE_APP.test(senha), 400, 'Use uma senha de app do Bluesky (formato xxxx-xxxx-xxxx-xxxx), não a senha da conta.');
      let servidor = antes.servidor;
      if (body.servidor !== undefined) {
        servidor = String(body.servidor || SERVIDOR).trim().replace(/\/$/, '');
        need(/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(servidor), 400, 'Servidor inválido: use https://bsky.social ou o endereço https do seu servidor.');
      }
      let gradeHora = antes.gradeHora;
      if (body.gradeHora !== undefined) { gradeHora = horaOk(body.gradeHora); need(gradeHora, 400, 'Horário da grade inválido: use HH:MM.'); }
      const mudouAcesso = Boolean(senha) || handle !== antes.handle || servidor !== antes.servidor;
      const cfg = { ...antes, handle, servidor, gradeHora,
        postarBlog: body.postarBlog !== undefined ? Boolean(body.postarBlog) : antes.postarBlog,
        postarGrade: body.postarGrade !== undefined ? Boolean(body.postarGrade) : antes.postarGrade,
        did: mudouAcesso ? '' : antes.did };
      const patch = { public_config: JSON.stringify(cfg) };
      if (senha) patch.secret = app.vault.seal(senha);            // só no cofre: nunca volta para a tela nem para o log
      if (mudouAcesso) Object.assign(patch, { status: 'pendente', last_error: null, last_check: now() });
      const atualizado = repo.update('integrations', row.id, patch);
      audit('bluesky.salvar', KIND, { handle: Boolean(handle), senha: Boolean(atualizado.secret), postarBlog: cfg.postarBlog, postarGrade: cfg.postarGrade });
      return { ok: true, ...(await saida(app, repo, atualizado)),
        nota: atualizado.secret && handle ? (mudouAcesso ? 'Configuração salva. Use "Testar" para conectar.' : 'Configuração salva.') : 'Falta o usuário ou a senha de app para o Bluesky funcionar.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/bluesky/teste', perm: 'integrations.manage',
    handler: async ({ app, repo, audit }) => {
      const row = integracao(repo);
      const cfg = configDe(row);
      const senha = abrirSenha(app, row);
      need(senha && cfg.handle, 400, 'Bluesky pendente de configuração: salve o usuário e a senha de app antes de testar.');
      let ok = false;
      let detalhe;
      let did = '';
      try {
        const s = await abrirSessao(app, cfg, senha);
        did = s.did;
        ok = true;
        detalhe = `Conectado ao perfil @${s.handle || cfg.handle}.`;
      } catch (e) {
        detalhe = esconder(e?.message || e, senha);
      }
      const fresco = repo.get('integrations', row.id);
      const pub = parse(fresco.public_config, {}) || {};
      repo.update('integrations', row.id, { status: ok ? 'ativo' : 'erro', last_check: now(), last_error: ok ? null : detalhe,
        public_config: JSON.stringify({ ...pub, ...(ok ? { did, ativadoEm: pub.ativadoEm || now() } : {}) }) });
      audit('bluesky.teste', KIND, { resultado: ok ? 'conectado' : 'erro' });
      return { ok, estado: ok ? 'conectado' : 'erro', estadoLabel: ok ? ESTADOS.conectado : ESTADOS.erro, detalhe };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/bluesky/enviar', perm: 'integrations.manage',
    handler: async ({ app, tenant, repo, audit }) => {
      need(integracao(repo).status === 'ativo', 409, 'Conecte o Bluesky (Testar) antes de enviar.');
      const r = await rodadaBluesky(app, { tenantId: tenant.id });
      audit('bluesky.enviar_agora', KIND, r);
      return { ok: true, ...r };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/bluesky/envios/:id/repetir', perm: 'integrations.manage',
    handler: ({ repo, params, audit }) => {
      const e = repo.get('bluesky_envios', String(params.id || ''));
      need(e, 404, 'Envio não encontrado.');
      need(e.status === 'erro', 409, 'Só envio com erro volta para a fila.');
      repo.update('bluesky_envios', e.id, { status: 'pendente', tentativas: 0, last_error: null });
      audit('bluesky.repetir', e.id, {});
      return { ok: true };
    },
  },
];
