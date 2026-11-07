// PA-154: galeria de modelos. Cada modelo abre uma demo navegável montada na hora (nada vai para o banco), fora do Google,
// só para quem está logado; na operação, com os dados dela e a grade ao vivo da liga.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, client } from './helpers.mjs';
import { buscarGrade, limparCacheTorneios } from '../lib/modules/torneios.mjs';
import { loadTemplates } from '../lib/templates.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = '/api/t/clube-43001';
let eventos = [];
const fetchFalso = async (url) => (String(url).startsWith('https://api.pokerbyte.com.br/')
  ? { ok: true, status: 200, json: async () => eventos } : { ok: true, status: 202, json: async () => ({}) });

let P; let sup; let anon;
before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: fetchFalso });
  P.app.esperaGradeMs = 300;
  sup = client(P.url);
  anon = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Galeria <b>', number: '43001', niche: 'poker', settings: { app: 'Suprema Poker', agentId: '7777' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const g = await buscarGrade('1', { fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  const em = (min) => new Date(Math.min(Date.now() + min * 60_000, g.ate.getTime() - (200 - min) * 1000)).toISOString();
  eventos = [{ id: 1, name: 'Main da Galeria', date: em(20), late: em(80), type: 'NLH', buyin: 50, guaranteed: 20000, stack: 40000, tournament: 'Main Event' }];
});
after(() => P.close());

const get = (c, p) => c.req('GET', p, undefined, { raw: true });
const contar = (tabela) => P.db.prepare(`SELECT COUNT(*) n FROM ${tabela}`).get().n;

test('demo de exemplo: todas as páginas de todos os modelos abrem, noindex e sem gravar nada', async () => {
  const antes = [contar('sites'), contar('pages')];
  for (const t of loadTemplates().values()) {
    for (const p of t.pages) {
      const r = await get(sup, `/api/modelos/${t.id}/demo/${p.slug}`);
      assert.equal(r.status, 200, `${t.id}/${p.slug}`);
      assert.match(r.data, /<meta name="robots" content="noindex, nofollow">/, `${t.id}/${p.slug}: fora do Google`);
      assert.ok(!r.data.includes('{{'), `${t.id}/${p.slug}: sem {{chave}} sobrando`);
    }
  }
  const home = await get(sup, '/api/modelos/sx-rack-torneios/demo/');
  assert.match(home.data, /Demonstração do modelo .*: dados de exemplo/);
  assert.equal(home.headers?.['x-robots-tag'] ?? 'noindex, nofollow', 'noindex, nofollow');
  assert.ok(home.data.includes('href="/api/modelos/sx-rack-torneios/demo/'), 'os links internos navegam dentro da demo');
  assert.deepEqual([contar('sites'), contar('pages')], antes, 'a demo não cria site nem página');
});

test('demo: precisa de login, página inexistente dá 404 e modelo inexistente dá 404', async () => {
  assert.equal((await get(anon, '/api/modelos/sx-rack-torneios/demo/')).status, 401);
  assert.equal((await get(sup, '/api/modelos/sx-rack-torneios/demo/nao-existe')).status, 404);
  assert.equal((await get(sup, '/api/modelos/nao-existe/demo/')).status, 404);
  assert.equal((await get(sup, '/api/modelos/..%2F..%2Fpackage/demo/')).status, 404);
});

test('demo da operação: com o nome dela escapado e, com torneios ligados, a grade ao vivo', async () => {
  limparCacheTorneios();
  const sem = await get(sup, `${T}/modelos/sx-relogio-torneios/demo/`);
  assert.equal(sem.status, 200);
  assert.ok(sem.data.includes('Clube Galeria &lt;b&gt;'), 'nome da operação, escapado');
  assert.ok(!sem.data.includes('Main da Galeria'), 'torneios desligados: grade do modelo');
  assert.equal((await sup.req('PUT', `${T}/torneios/config`, { ativo: true, liga: '106', nome: 'Liga Suprema' })).status, 200);
  const com = await get(sup, `${T}/modelos/sx-relogio-torneios/demo/`);
  assert.ok(com.data.includes('Main da Galeria'), 'torneios ligados: a grade da liga');
  assert.ok(com.data.includes('data-cd-ini') && com.data.includes('/assets/contagem.js'));
  assert.equal((await get(sup, `${T}/modelos/tcg-colecionaveis/demo/`)).status, 404, 'modelo de outro nicho não abre na operação de pôquer');
});

test('painel: a galeria troca a lista de nomes e as miniaturas existem para os modelos', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/admin/admin.js'), 'utf8');
  assert.ok(js.includes('function galeriaModelos('));
  assert.ok(!js.includes('<label class="field">Modelo<select name="template">'), 'o select do Novo site saiu');
  const pasta = path.join(ROOT, 'public/admin/modelos');
  const faltam = [...loadTemplates().keys()].filter((id) => !fs.existsSync(path.join(pasta, `${id}.jpg`)));
  assert.deepEqual(faltam, [], 'rode: node portal/tools/fotos-homes.mjs --miniaturas');
  for (const f of fs.readdirSync(pasta)) assert.ok(fs.statSync(path.join(pasta, f)).size < 80_000, `${f}: miniatura leve`);
});
