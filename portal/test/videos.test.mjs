// Fila de vídeos curtos por operação e API do executor (token de serviço): validação, reserva do próximo devido
// (sem dois executores no mesmo envio), legenda do Instagram, publicado com link e idempotente, erro com nova tentativa,
// reserva vencida volta à fila, envio do arquivo pelo painel e download pelo executor, permissões e isolamento.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, client } from './helpers.mjs';

const TOKEN = 'pa_svc_teste_videos_123456';
let P;
let sup;
let pasta;
const passado = new Date(Date.now() - 3600_000).toISOString();
const futuro = new Date(Date.now() + 86400_000).toISOString();

const svc = (method, p, corpo, token = TOKEN) => fetch(`${P.url}${p}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: corpo === undefined ? undefined : JSON.stringify(corpo) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const reservar = (canal, extra = {}) => svc('POST', '/api/service/videos/reservar', { canal, operacao: 'clube-10095', executor: 'pc-gpt', ...extra });

before(async () => {
  P = await startPortal();
  P.app.serviceToken = TOKEN;
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-videos-'));
  P.app.videosDir = pasta;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Vídeos', number: '10095', niche: 'poker', template: 'clube-poker-premium' });
  await sup.req('POST', '/api/tenants', { name: 'Clube B', number: '10096', niche: 'poker', template: 'clube-poker-premium' });
});
after(async () => { await P.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

let v1;
test('a fila valida título, canais e arquivo, e não repete o mesmo roteiro', async () => {
  let r = await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'Oi', canais: ['youtube'] });
  assert.equal(r.status, 400);
  r = await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'All-in e side pot #shorts', canais: [] });
  assert.equal(r.status, 400);
  r = await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'All-in e side pot #shorts', canais: ['youtube'], arquivoUrl: '../segredo.mp4' });
  assert.equal(r.status, 400);
  r = await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'All-in e side pot #shorts', ref: 'all-in-e-side-pot', legenda: 'Como funciona o pote paralelo.',
    legendaInstagram: 'Legenda do Reels · link na bio', canais: ['youtube', 'instagram'], arquivoUrl: 'data/shorts/all-in-e-side-pot.mp4', agendadoPara: passado });
  assert.equal(r.status, 201);
  v1 = r.data.video;
  assert.deepEqual(v1.envios.map((e) => [e.canal, e.status]), [['instagram', 'pendente'], ['youtube', 'pendente']]);
  assert.equal(v1.situacao, 'na_fila');
  r = await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'Outro com o mesmo roteiro', ref: 'all-in-e-side-pot', canais: ['youtube'], arquivoUrl: 'data/shorts/x.mp4' });
  assert.equal(r.status, 409);
});

test('sem o token de serviço a API do executor responde 401', async () => {
  assert.equal((await svc('POST', '/api/service/videos/reservar', { canal: 'youtube' }, 'errado')).status, 401);
  assert.equal((await fetch(`${P.url}/api/service/videos/reservar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"canal":"youtube"}' })).status, 401);
});

test('o executor reserva o próximo devido; outro executor não pega o mesmo envio', async () => {
  await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'Grade de amanhã #shorts', ref: 'grade-amanha', canais: ['youtube'], arquivoUrl: 'https://cdn.exemplo.com/grade.mp4', agendadoPara: futuro });
  const r = await reservar('youtube');
  assert.equal(r.status, 200);
  const e = r.data.envio;
  assert.equal(e.canal, 'youtube');
  assert.equal(e.video.ref, 'all-in-e-side-pot');
  assert.equal(e.video.legenda, 'Como funciona o pote paralelo.');
  assert.deepEqual(e.arquivo, { tipo: 'caminho', url: 'data/shorts/all-in-e-side-pot.mp4' });
  assert.equal(e.operacao.slug, 'clube-10095');
  assert.match(e.marcar.publicado, /\/api\/service\/videos\/[0-9a-f-]+\/publicado$/);
  const de = await reservar('youtube');
  assert.equal(de.data.envio, null, 'o vídeo de amanhã ainda não está devido');
  assert.equal(de.data.proximo, new Date(futuro).toISOString());
  const ig = (await reservar('instagram')).data.envio;
  assert.equal(ig.video.legenda, 'Legenda do Reels · link na bio', 'o Instagram recebe a legenda própria');
  assert.equal((await reservar('tiktok')).data.envio, null);
  assert.equal((await reservar('facebook')).status, 400);
  const tela = (await sup.req('GET', '/api/t/clube-10095/videos')).data;
  assert.equal(tela.contagem.reservados, 2);
  assert.equal(tela.videos.find((v) => v.id === v1.id).situacao, 'publicando');
  assert.equal((await sup.req('PATCH', `/api/t/clube-10095/videos/${v1.id}`, { titulo: 'Mudando no meio' })).status, 409, 'não edita enquanto publica');
});

test('publicado guarda o link e é idempotente; erro volta para a fila ou fica para o painel', async () => {
  const tela = (await sup.req('GET', '/api/t/clube-10095/videos')).data;
  const v = tela.videos.find((x) => x.id === v1.id);
  const yt = v.envios.find((e) => e.canal === 'youtube');
  const ig = v.envios.find((e) => e.canal === 'instagram');
  let r = await svc('POST', `/api/service/videos/${yt.id}/publicado`, { url: 'javascript:alert(1)' });
  assert.equal(r.status, 400);
  r = await svc('POST', `/api/service/videos/${yt.id}/publicado`, { url: 'https://youtube.com/shorts/abc123', executor: 'pc-gpt' });
  assert.equal(r.status, 200);
  assert.equal(r.data.envio.status, 'publicado');
  r = await svc('POST', `/api/service/videos/${yt.id}/publicado`, { url: 'https://youtube.com/shorts/outro' });
  assert.equal(r.data.duplicado, true);
  assert.equal(P.db.prepare('SELECT post_url FROM video_envios WHERE id = ?').get(yt.id).post_url, 'https://youtube.com/shorts/abc123');
  assert.equal((await svc('POST', `/api/service/videos/${yt.id}/erro`, { erro: 'x' })).status, 409, 'publicado não vira erro');

  r = await svc('POST', `/api/service/videos/${ig.id}/erro`, { erro: 'o celular está bloqueado com senha', tentarDeNovo: true });
  assert.equal(r.data.envio.status, 'pendente', 'nova tentativa automática');
  const de = (await reservar('instagram')).data.envio;
  assert.equal(de.envioId, ig.id);
  assert.equal(de.tentativa, 2);
  r = await svc('POST', `/api/service/videos/${ig.id}/erro`, { erro: 'não achei o campo da legenda' });
  assert.equal(r.data.envio.status, 'erro');
  const depois = (await sup.req('GET', '/api/t/clube-10095/videos')).data.videos.find((x) => x.id === v1.id);
  assert.equal(depois.situacao, 'erro');
  assert.equal(depois.envios.find((e) => e.canal === 'youtube').postUrl, 'https://youtube.com/shorts/abc123');
  assert.equal(depois.envios.find((e) => e.canal === 'instagram').erro, 'não achei o campo da legenda');
  r = await sup.req('POST', `/api/t/clube-10095/videos/${v1.id}/canais/instagram/repetir`);
  assert.equal(r.status, 200);
  assert.equal(r.data.video.envios.find((e) => e.canal === 'instagram').status, 'pendente');
  assert.equal((await sup.req('DELETE', `/api/t/clube-10095/videos/${v1.id}`)).status, 409, 'vídeo já publicado não é apagado');
});

test('reserva vencida (executor sumiu) volta para a fila', async () => {
  const e = (await reservar('instagram')).data.envio;
  assert.ok(e);
  assert.equal((await reservar('instagram')).data.envio, null);
  P.db.prepare('UPDATE video_envios SET reservado_em = ? WHERE id = ?').run(new Date(Date.now() - 31 * 60_000).toISOString(), e.envioId);
  const de = (await reservar('instagram', { executor: 'outro-pc' })).data.envio;
  assert.equal(de.envioId, e.envioId);
  await svc('POST', `/api/service/videos/${e.envioId}/publicado`, {});
});

test('o painel envia o arquivo e o executor baixa o mesmo vídeo', async () => {
  const v = (await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'Flop, turn e river #shorts', ref: 'flop-turn-river', canais: ['youtube'], agendadoPara: passado })).data.video;
  assert.equal(v.situacao, 'na_fila');
  assert.equal((await reservar('youtube')).data.envio, null, 'sem arquivo o vídeo não sai');
  const bytes = Buffer.from('conteudo-falso-de-video-mp4');
  const csrf = (await sup.req('GET', '/api/me')).data.csrf;
  const up = (headers) => fetch(`${P.url}/envio-video/clube-10095/${v.id}`, { method: 'PUT', headers: { Cookie: sup.cookie, 'X-CSRF': csrf, 'Content-Type': 'video/mp4', ...headers }, body: bytes });
  assert.equal((await up({ 'X-CSRF': 'errado' })).status, 403);
  assert.equal((await up({ 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(`${P.url}/envio-video/clube-10095/${v.id}`, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes })).status, 401);
  const r = await up({});
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.video.arquivo.enviado, true);
  assert.equal(j.video.arquivo.bytes, bytes.length);
  const e = (await reservar('youtube')).data.envio;
  assert.equal(e.arquivo.tipo, 'portal');
  const baixa = await fetch(e.arquivo.url.replace(/^https?:\/\/[^/]+/, P.url), { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(baixa.status, 200);
  assert.deepEqual(Buffer.from(await baixa.arrayBuffer()), bytes);
  assert.equal((await fetch(e.arquivo.url.replace(/^https?:\/\/[^/]+/, P.url))).status, 401, 'download também exige o token');
});

test('cancelado não sai; registrar pelo gerador é idempotente pelo roteiro', async () => {
  const v = (await sup.req('POST', '/api/t/clube-10095/videos', { titulo: 'Cancelado #shorts', ref: 'cancelado', canais: ['tiktok'], arquivoUrl: 'data/shorts/c.mp4', agendadoPara: passado })).data.video;
  await sup.req('PATCH', `/api/t/clube-10095/videos/${v.id}`, { cancelado: true });
  assert.equal((await reservar('tiktok')).data.envio, null);
  const corpo = { operacao: 'clube-10095', ref: 'showdown', titulo: 'Showdown: quem mostra primeiro #shorts', canais: ['youtube', 'instagram'], arquivoUrl: 'data/shorts/showdown.mp4', agendadoPara: futuro };
  let r = await svc('POST', '/api/service/videos', corpo);
  assert.equal(r.status, 201);
  r = await svc('POST', '/api/service/videos', corpo);
  assert.equal(r.status, 200);
  assert.equal(r.data.duplicado, true);
  assert.equal(P.db.prepare("SELECT COUNT(*) n FROM videos WHERE ref = 'showdown'").get().n, 1);
});

test('isolamento e permissões: outra operação não vê nem mexe; afiliado não lê; editor edita', async () => {
  const b = (await sup.req('GET', '/api/t/clube-10096/videos')).data;
  assert.equal(b.videos.length, 0);
  assert.equal((await sup.req('PATCH', `/api/t/clube-10096/videos/${v1.id}`, { titulo: 'Invasão #shorts' })).status, 404);
  assert.equal((await reservar('youtube', { operacao: 'clube-10096' })).data.envio, null, 'filtro por operação');
  await sup.req('POST', '/api/t/clube-10095/users', { email: 'af-vid@teste.com', role: 'affiliate', password: 'afiliado-senha-88' });
  const af = client(P.url);
  await af.login('af-vid@teste.com', 'afiliado-senha-88');
  assert.equal((await af.req('GET', '/api/t/clube-10095/videos')).status, 403);
  await sup.req('POST', '/api/t/clube-10095/users', { email: 'ed-vid@teste.com', role: 'editor', password: 'editor-senha-88' });
  const ed = client(P.url);
  await ed.login('ed-vid@teste.com', 'editor-senha-88');
  const r = await ed.req('POST', '/api/t/clube-10095/videos', { titulo: 'Do editor #shorts', canais: ['youtube'], arquivoUrl: 'data/shorts/ed.mp4' });
  assert.equal(r.status, 201);
});

test('o guia do executor existe e explica a API sem segredo', () => {
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'executor-videos.md'), 'utf8');
  for (const t of ['/api/service/videos/reservar', '/publicado', '/erro', 'postar_short.py', 'postar_reel.py', 'Authorization: Bearer']) assert.ok(doc.includes(t), `o guia fala de ${t}`);
  assert.ok(!/pa_svc_[A-Za-z0-9_-]{20,}/.test(doc), 'nenhum token de verdade no guia');
});
