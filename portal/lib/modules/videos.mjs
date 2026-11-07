// Vídeos curtos por operação: uma fila (vídeo, legenda, canais, horário) e uma API com o token de serviço para um
// executor externo pegar o próximo envio devido e devolver "publicado" (com o link do post) ou "erro".
// O painel NÃO posta vídeo nem fala com celular: quem posta é o executor (ex.: tools/youtube/postar_short.py e
// tools/instagram/postar_reel.py adaptados, no PC que tem o POCO F5). Guia: portal/docs/executor-videos.md.
//
// Regras: o mesmo vídeo não sai duas vezes no mesmo canal (UNIQUE video_id + canal); um envio reservado fica com o
// executor por 30 minutos (depois volta para a fila, se ele sumir); "publicado" só quando o executor diz que publicou.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { now, parse } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { HttpError, parseCookies, send } from '../http.mjs';
import { readSession, membership, can } from '../auth.mjs';
import { audit as writeAudit } from '../tenants.mjs';
import { serviceOk } from '../insights.mjs';

export const tables = ['videos', 'video_envios'];
export const nav = { id: 'videos', label: 'Vídeos curtos', perm: 'calendar.read' };

export const CANAIS = { youtube: 'YouTube Shorts', instagram: 'Instagram Reels', tiktok: 'TikTok' };
export const RESERVA_MIN = 30;
export const MAX_BYTES = 300 * 1024 * 1024;
const TIPOS = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const umaLinha = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const texto = (v, n) => String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

/** Pasta dos vídeos enviados ao portal: PORTAL_VIDEOS_DIR, ou <PORTAL_DATA_DIR>/videos. */
export const pastaVideos = (app) => app.videosDir || process.env.PORTAL_VIDEOS_DIR || path.join(process.env.PORTAL_DATA_DIR || path.join(HERE, '..', '..', 'data'), 'videos');
const arquivoDe = (app, v) => (v.arquivo_nome ? path.join(pastaVideos(app), v.tenant_id, path.basename(v.arquivo_nome)) : null);

// ---------------------------------------------------------------- validação

const ARQUIVO_RX = /^(https:\/\/[^\s]{8,500}|[A-Za-z0-9_./\\:-]{3,300}\.(mp4|mov|webm))$/i;

export function limparVideo(body, atual = null) {
  const pega = (k, padrao) => (body?.[k] === undefined ? padrao : body[k]);
  const titulo = umaLinha(pega('titulo', atual?.titulo), 100);
  need(titulo.length >= 3, 400, 'Dê um título ao vídeo (até 100 caracteres).');
  const ref = umaLinha(pega('ref', atual?.ref ?? ''), 80).toLowerCase();
  need(!ref || /^[a-z0-9][a-z0-9-]{1,79}$/.test(ref), 400, 'Identificador inválido: use letras minúsculas, números e hífen (ex.: all-in-e-side-pot).');
  const quando = pega('agendadoPara', atual?.agendado_para) || now();
  const t = Date.parse(quando);
  need(Number.isFinite(t), 400, 'Horário inválido.');
  const arquivoUrl = umaLinha(pega('arquivoUrl', atual?.arquivo_url ?? ''), 500);
  need(!arquivoUrl || (ARQUIVO_RX.test(arquivoUrl) && !arquivoUrl.includes('..')), 400, 'Vídeo: use um endereço https ou o caminho do arquivo no executor (ex.: data/shorts/x.mp4).');
  let canais = null; // null = edição sem mexer nos canais
  if (body?.canais !== undefined || !atual) {
    canais = [...new Set(Array.isArray(body?.canais) ? body.canais.map(String) : [])];
    need(canais.length && canais.every((c) => CANAIS[c]), 400, `Escolha pelo menos um canal: ${Object.keys(CANAIS).join(', ')}.`);
  }
  return {
    linha: { titulo, ref: ref || null, legenda: texto(pega('legenda', atual?.legenda ?? ''), 4900), legenda_instagram: texto(pega('legendaInstagram', atual?.legenda_instagram ?? ''), 2200) || null,
      arquivo_url: arquivoUrl || null, agendado_para: new Date(t).toISOString() },
    canais,
  };
}

// ---------------------------------------------------------------- saída

function situacao(v, envios) {
  if (v.cancelado) return 'cancelado';
  if (envios.length && envios.every((e) => e.status === 'publicado')) return 'publicado';
  if (envios.some((e) => e.status === 'reservado')) return 'publicando';
  if (envios.some((e) => e.status === 'erro')) return 'erro';
  if (envios.some((e) => e.status === 'publicado')) return 'parcial';
  return Date.parse(v.agendado_para) <= Date.now() ? 'na_fila' : 'agendado';
}

const envioOut = (e) => ({ id: e.id, canal: e.canal, label: CANAIS[e.canal] || e.canal, status: e.status, tentativas: e.tentativas, executor: e.executor || null,
  reservadoEm: e.reservado_em || null, publicadoEm: e.publicado_em || null, postUrl: e.post_url || null, erro: e.erro || null });

export function videoOut(v, envios) {
  return { id: v.id, ref: v.ref, titulo: v.titulo, legenda: v.legenda, legendaInstagram: v.legenda_instagram || '', agendadoPara: v.agendado_para, cancelado: Boolean(v.cancelado),
    arquivo: { url: v.arquivo_url || null, enviado: Boolean(v.arquivo_nome), bytes: v.arquivo_bytes || null, tipo: v.arquivo_tipo || null },
    situacao: situacao(v, envios), envios: envios.map(envioOut), createdAt: v.created_at, updatedAt: v.updated_at };
}
const envios = (repo, v) => repo.all('video_envios', { video_id: v.id }, { order: 'canal ASC' });
const out = (repo, v) => videoOut(v, envios(repo, v));

function carregar(repo, id) {
  const v = repo.get('videos', String(id));
  need(v, 404, 'Vídeo não encontrado.');
  return v;
}

function criar(repo, body, userId) {
  const { linha, canais } = limparVideo(body);
  if (linha.ref) need(!repo.get('videos', { ref: linha.ref }), 409, 'Já existe um vídeo com esse identificador nesta operação.');
  const v = repo.insert('videos', { ...linha, cancelado: 0, created_by: userId || null });
  for (const c of canais) repo.insert('video_envios', { video_id: v.id, canal: c, status: 'pendente', tentativas: 0 });
  return v;
}

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/videos', perm: 'calendar.read', handler: ({ app, repo, tenant }) => {
      const lista = repo.all('videos', {}, { order: 'agendado_para DESC', limit: 300 }).map((v) => out(repo, v));
      const conta = (st) => repo.count('video_envios', { status: st });
      const origem = app.originOf(tenant.edition);
      return {
        videos: lista, canais: CANAIS,
        contagem: { pendentes: conta('pendente'), reservados: conta('reservado'), publicados: conta('publicado'), erros: conta('erro') },
        executor: { reservar: `${origem}/api/service/videos/reservar`, operacao: tenant.slug, guia: 'portal/docs/executor-videos.md',
          ultimo: repo.all('video_envios', {}, { order: 'updated_at DESC', limit: 1, extra: 'executor IS NOT NULL' })[0]?.updated_at || null },
        reservaMin: RESERVA_MIN, maxMb: Math.round(MAX_BYTES / 1024 / 1024),
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/videos', perm: 'calendar.edit', handler: ({ repo, body, user, audit }) => {
      const v = criar(repo, body, user.id);
      audit('video.criar', v.id, { ref: v.ref, canais: body.canais });
      return { status: 201, body: { video: out(repo, v) } };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/videos/:id', perm: 'calendar.edit', handler: ({ repo, params, body, audit }) => {
      const v = carregar(repo, params.id);
      const atuais = envios(repo, v);
      need(!atuais.some((e) => e.status === 'reservado'), 409, 'O executor está publicando este vídeo agora. Espere ele terminar.');
      const { linha, canais } = limparVideo(body, v);
      if (linha.ref && linha.ref !== v.ref) need(!repo.get('videos', { ref: linha.ref }), 409, 'Já existe um vídeo com esse identificador nesta operação.');
      const patch = { ...linha };
      if (body.cancelado !== undefined) patch.cancelado = body.cancelado ? 1 : 0;
      repo.update('videos', v.id, patch);
      if (canais) {
        for (const e of atuais.filter((x) => !canais.includes(x.canal))) {
          need(e.status !== 'publicado', 409, `Já saiu em ${CANAIS[e.canal]}: não dá para tirar esse canal.`);
          repo.remove('video_envios', e.id);
        }
        for (const c of canais.filter((x) => !atuais.some((e) => e.canal === x))) repo.insert('video_envios', { video_id: v.id, canal: c, status: 'pendente', tentativas: 0 });
      }
      audit('video.editar', v.id, { campos: Object.keys(body || {}) });
      return { video: out(repo, repo.get('videos', v.id)) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/videos/:id/canais/:canal/repetir', perm: 'calendar.edit', handler: ({ repo, params, audit }) => {
      const v = carregar(repo, params.id);
      const e = repo.get('video_envios', { video_id: v.id, canal: String(params.canal) });
      need(e, 404, 'Este vídeo não tem esse canal.');
      need(e.status === 'erro', 409, 'Só dá para repetir um envio que deu erro.');
      repo.update('video_envios', e.id, { status: 'pendente', erro: null, reservado_em: null, tentativas: 0 });
      audit('video.repetir', v.id, { canal: e.canal });
      return { video: out(repo, v) };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/videos/:id', perm: 'calendar.edit', handler: ({ app, repo, params, audit }) => {
      const v = carregar(repo, params.id);
      const atuais = envios(repo, v);
      need(!atuais.some((e) => e.status === 'publicado' || e.status === 'reservado'), 409, 'Este vídeo já saiu (ou está saindo) em algum canal: cancele em vez de apagar, para guardar o registro.');
      for (const e of atuais) repo.remove('video_envios', e.id);
      const f = arquivoDe(app, v);
      if (f) fs.rmSync(f, { force: true });
      repo.remove('videos', v.id);
      audit('video.apagar', v.id, { ref: v.ref });
      return { ok: true };
    },
  },
];

// ---------------------------------------------------------------- envio do arquivo pelo painel (corpo grande: fora de /api)

export const rootRoutes = [
  {
    method: 'PUT', path: '/envio-video/:tenant/:id', handler: async ({ req, res, params, db, app, edition }) => {
      try {
        const session = readSession(db, parseCookies(req.headers.cookie).pa_sess);
        need(session, 401, 'Entre para continuar.');
        need(req.headers['x-csrf'] === session.csrf, 403, 'Sessão expirada. Recarregue a página.');
        const t = db.prepare('SELECT * FROM tenants WHERE id = ? OR slug = ?').get(params.tenant, params.tenant);
        const role = t ? membership(db, session.user, t.id) : null;
        need(t && (session.user.is_super || role) && t.edition === edition.id, 404, 'Operação não encontrada.');
        need(can(session.user, role, 'calendar.edit'), 403, 'Seu papel nesta operação não permite isso.');
        const repo = scoped(db, t.id);
        const v = carregar(repo, params.id);
        need(!envios(repo, v).some((e) => e.status === 'publicado' || e.status === 'reservado'), 409, 'Este vídeo já saiu (ou está saindo): crie outro para trocar o arquivo.');
        const tipo = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        need(TIPOS[tipo], 415, 'Envie um vídeo MP4, MOV ou WebM.');
        const tamanho = Number(req.headers['content-length']);
        need(Number.isFinite(tamanho) && tamanho > 0, 411, 'Tamanho do arquivo não informado.');
        need(tamanho <= MAX_BYTES, 413, `Vídeo grande demais (máximo ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`);
        const dir = path.join(pastaVideos(app), t.id);
        fs.mkdirSync(dir, { recursive: true });
        const nome = `${v.id}${TIPOS[tipo]}`;
        const tmp = path.join(dir, `${nome}.parte`);
        const bytes = await new Promise((resolve, reject) => {
          let n = 0;
          const w = fs.createWriteStream(tmp);
          req.on('data', (c) => { n += c.length; if (n > MAX_BYTES) { req.unpipe(w); w.destroy(); reject(new HttpError(413, 'Vídeo grande demais.')); } });
          req.on('error', reject);
          w.on('error', reject);
          w.on('finish', () => resolve(n));
          req.pipe(w);
        }).catch((e) => { fs.rmSync(tmp, { force: true }); throw e; });
        const antigo = arquivoDe(app, v);
        if (antigo && path.basename(antigo) !== nome) fs.rmSync(antigo, { force: true });
        fs.renameSync(tmp, path.join(dir, nome));
        repo.update('videos', v.id, { arquivo_nome: nome, arquivo_bytes: bytes, arquivo_tipo: tipo });
        writeAudit(db, { tenantId: t.id, userId: session.user.id, action: 'video.arquivo', target: v.id, data: { bytes } });
        return send(res, 200, { video: out(repo, repo.get('videos', v.id)) });
      } catch (e) {
        return send(res, e.status || 500, { error: e.status ? e.message : 'Erro interno. Tente de novo.' });
      }
    },
  },
];

// ---------------------------------------------------------------- API do executor (token de serviço)

function servico(app, req) {
  if (!serviceOk(app, req.headers.authorization)) throw new HttpError(401, 'token de serviço inválido');
}

function envioDoServico(db, id) {
  const e = db.prepare('SELECT * FROM video_envios WHERE id = ?').get(String(id));
  need(e, 404, 'envio não encontrado');
  const repo = scoped(db, e.tenant_id);
  const v = repo.get('videos', e.video_id);
  const t = db.prepare('SELECT id, slug, name, edition FROM tenants WHERE id = ?').get(e.tenant_id);
  return { e, v, t, repo };
}

const executorDe = (b) => umaLinha(b?.executor, 60) || null;

function trabalho(app, { e, v, t, repo }) {
  const origem = app.originOf(t.edition);
  return {
    envioId: e.id, canal: e.canal, tentativa: e.tentativas, reservadoAte: new Date(Date.parse(e.reservado_em) + RESERVA_MIN * 60_000).toISOString(),
    operacao: { slug: t.slug, nome: t.name },
    video: { id: v.id, ref: v.ref, titulo: v.titulo, legenda: e.canal === 'instagram' && v.legenda_instagram ? v.legenda_instagram : v.legenda, agendadoPara: v.agendado_para },
    arquivo: v.arquivo_nome
      ? { tipo: 'portal', url: `${origem}/api/service/videos/${e.id}/arquivo`, bytes: v.arquivo_bytes, nome: v.arquivo_nome }
      : { tipo: /^https:\/\//i.test(v.arquivo_url || '') ? 'url' : 'caminho', url: v.arquivo_url },
    marcar: { publicado: `${origem}/api/service/videos/${e.id}/publicado`, erro: `${origem}/api/service/videos/${e.id}/erro` },
    outrosCanais: envios(repo, v).filter((x) => x.id !== e.id).map(envioOut),
  };
}

export const serviceRoutes = [
  {
    // Pega o próximo envio devido (o mais antigo) e reserva por 30 min. Sem nada devido: { envio: null, proximo }.
    method: 'POST', path: '/api/service/videos/reservar', auth: false, handler: ({ app, req, db, body }) => {
      servico(app, req);
      const canal = String(body.canal || '');
      need(CANAIS[canal], 400, `canal inválido: use ${Object.keys(CANAIS).join(', ')}`);
      const agora = now();
      const vencida = new Date(Date.now() - RESERVA_MIN * 60_000).toISOString();
      const filtroOp = body.operacao ? 'AND (t.slug = ? OR t.id = ?)' : '';
      const extra = body.operacao ? [String(body.operacao), String(body.operacao)] : [];
      const base = `FROM video_envios e JOIN videos v ON v.id = e.video_id AND v.tenant_id = e.tenant_id JOIN tenants t ON t.id = e.tenant_id
        WHERE e.canal = ? AND v.cancelado = 0 AND t.status = 'ativa' AND (v.arquivo_nome IS NOT NULL OR v.arquivo_url IS NOT NULL)
          AND (e.status = 'pendente' OR (e.status = 'reservado' AND e.reservado_em < ?)) ${filtroOp}`;
      const row = db.prepare(`SELECT e.id, e.status, e.reservado_em ${base} AND v.agendado_para <= ? ORDER BY v.agendado_para ASC, e.created_at ASC LIMIT 1`).get(canal, vencida, ...extra, agora);
      if (!row) {
        const prox = db.prepare(`SELECT MIN(v.agendado_para) p ${base}`).get(canal, vencida, ...extra).p;
        return { envio: null, proximo: prox || null };
      }
      // troca de estado condicionada ao estado lido: dois executores ao mesmo tempo não pegam o mesmo envio
      const r = db.prepare(`UPDATE video_envios SET status = 'reservado', reservado_em = ?, executor = ?, tentativas = tentativas + 1, erro = NULL, updated_at = ?
        WHERE id = ? AND status = ? AND reservado_em IS ?`).run(agora, executorDe(body), agora, row.id, row.status, row.reservado_em);
      if (!r.changes) return { envio: null, proximo: agora };
      const ctx = envioDoServico(db, row.id);
      writeAudit(db, { tenantId: ctx.t.id, action: 'video.reservar', target: ctx.v.id, data: { canal, executor: executorDe(body) } });
      return { envio: trabalho(app, ctx) };
    },
  },
  {
    method: 'GET', path: '/api/service/videos/:envio/arquivo', auth: false, handler: async ({ app, req, res, db, params }) => {
      servico(app, req);
      const { v, e } = envioDoServico(db, params.envio);
      const f = arquivoDe(app, v);
      need(f && fs.existsSync(f), 404, 'este vídeo não foi enviado ao portal (use arquivo.url)');
      need(e.status !== 'publicado', 409, 'envio já publicado');
      const st = fs.statSync(f);
      res.writeHead(200, { 'Content-Type': v.arquivo_tipo || 'video/mp4', 'Content-Length': st.size, 'Content-Disposition': `attachment; filename="${(v.ref || v.id).replace(/[^A-Za-z0-9_-]/g, '')}${path.extname(f)}"`, 'Cache-Control': 'no-store' });
      await new Promise((resolve) => { const s = fs.createReadStream(f); s.on('close', resolve); s.on('error', () => { res.destroy(); resolve(); }); s.pipe(res); });
    },
  },
  {
    method: 'POST', path: '/api/service/videos/:envio/publicado', auth: false, handler: ({ app, req, db, params, body }) => {
      servico(app, req);
      const { e, v, t, repo } = envioDoServico(db, params.envio);
      if (e.status === 'publicado') return { ok: true, duplicado: true, envio: envioOut(e) };
      const url = umaLinha(body.url, 500);
      need(!url || /^https:\/\/[^\s]+$/i.test(url), 400, 'url do post inválida (use https://...)');
      const quando = body.publicadoEm && Number.isFinite(Date.parse(body.publicadoEm)) ? new Date(Date.parse(body.publicadoEm)).toISOString() : now();
      const novo = repo.update('video_envios', e.id, { status: 'publicado', publicado_em: quando, post_url: url || null, erro: null, executor: executorDe(body) || e.executor });
      writeAudit(db, { tenantId: t.id, action: 'video.publicado', target: v.id, data: { canal: e.canal, link: Boolean(url) } });
      return { ok: true, envio: envioOut(novo) };
    },
  },
  {
    method: 'POST', path: '/api/service/videos/:envio/erro', auth: false, handler: ({ app, req, db, params, body }) => {
      servico(app, req);
      const { e, v, t, repo } = envioDoServico(db, params.envio);
      need(e.status !== 'publicado', 409, 'envio já publicado: não dá para marcar erro');
      const erro = umaLinha(body.erro, 500) || 'O executor não informou o motivo.';
      const deNovo = Boolean(body.tentarDeNovo) && e.tentativas < 3; // até 3 tentativas automáticas; depois só pelo painel
      const novo = repo.update('video_envios', e.id, { status: deNovo ? 'pendente' : 'erro', erro, reservado_em: null, executor: executorDe(body) || e.executor });
      writeAudit(db, { tenantId: t.id, action: 'video.erro', target: v.id, data: { canal: e.canal, deNovo } });
      return { ok: true, envio: envioOut(novo) };
    },
  },
  {
    // Registrar vídeo direto do gerador (idempotente pelo ref): o mesmo roteiro registrado de novo devolve o que já existe.
    method: 'POST', path: '/api/service/videos', auth: false, handler: ({ app, req, db, body }) => {
      servico(app, req);
      const t = db.prepare('SELECT * FROM tenants WHERE slug = ? OR id = ?').get(String(body.operacao || ''), String(body.operacao || ''));
      need(t, 404, 'operação não encontrada');
      const repo = scoped(db, t.id);
      const ref = umaLinha(body.ref, 80).toLowerCase();
      need(ref, 400, 'ref é obrigatório (o id do roteiro) para não registrar o mesmo vídeo duas vezes');
      const existe = repo.get('videos', { ref });
      if (existe) return { status: 200, body: { duplicado: true, video: out(repo, existe) } };
      const v = criar(repo, { ...body, ref }, null);
      writeAudit(db, { tenantId: t.id, action: 'video.criar', target: v.id, data: { ref, via: 'servico' } });
      return { status: 201, body: { video: out(repo, v) } };
    },
  },
];
routes.push(...serviceRoutes);
