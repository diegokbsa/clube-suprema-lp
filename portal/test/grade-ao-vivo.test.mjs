// PA-154: grade ao vivo nos blocos de grade dos modelos prontos + contagem regressiva (vermelha nos últimos 5 min)
// e a página /torneios com a mesma contagem. PokerByte simulada; nenhum teste chama rede de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { buscarGrade, limparCacheTorneios } from '../lib/modules/torneios.mjs';
import { aplicarGradeAoVivo, estadoContagem, duracao, pedeGradeAoVivo, BLOCOS_GRADE } from '../lib/grade-ao-vivo.mjs';
import { renderBlocks, cleanBlocks } from '../lib/blocks.mjs';
import { loadTemplates } from '../lib/templates.mjs';

const MIN = 60_000;

// ---------------------------------------------------------------- contagem (puro)

test('contagem: começa em, late fecha em, encerrada; vermelha com 5 min ou menos', () => {
  const agora = new Date('2026-11-06T22:00:00Z');
  const em = (m) => new Date(+agora + m * MIN).toISOString();
  assert.deepEqual(estadoContagem(em(30), em(90), agora), { fase: 'antes', texto: 'começa em 30 min', urgente: false });
  assert.equal(estadoContagem(em(5), em(90), agora).urgente, true, '5 min para começar: vermelho');
  assert.equal(estadoContagem(em(6), em(90), agora).urgente, false);
  assert.deepEqual(estadoContagem(em(-10), em(4), agora), { fase: 'late', texto: 'late fecha em 4 min', urgente: true });
  assert.deepEqual(estadoContagem(em(-10), em(75), agora), { fase: 'late', texto: 'late fecha em 1h15', urgente: false });
  assert.deepEqual(estadoContagem(em(-10), em(-1), agora), { fase: 'fim', texto: 'inscrição encerrada', urgente: false });
  assert.equal(estadoContagem(em(-1), '', agora).fase, 'fim', 'sem late: fecha no início');
  assert.equal(duracao(30_000), 'menos de 1 min');
  assert.equal(duracao(125 * MIN), '2h05');
});

// ---------------------------------------------------------------- troca dos itens (puro)

const agora = new Date('2026-11-06T22:00:00Z'); // 19h em Brasília
const ev = (id, minIni, minLate, extra = {}) => ({ id, nome: `Torneio ${id}`, inicio: new Date(+agora + minIni * MIN), late: minLate == null ? null : new Date(+agora + minLate * MIN),
  tipo: 'NLH', buyin: 50, garantido: 10000, stack: 40000, blinds: 10, mainEvent: false, satelite: false, ko: false, ...extra });
const grade = { eventos: [ev(1, -120, -30), ev(2, -20, 3, { nome: 'Late <b>quase</b> fechando', mainEvent: true }), ev(3, 40, 120, { tipo: 'PLO5', ko: true }), ev(4, 90, null)] };

test('aplicarGradeAoVivo: só blocos com aoVivo, só torneios abertos, no formato de cada bloco', () => {
  const blocos = [...BLOCOS_GRADE].map((type) => ({ id: type, type, props: { aoVivo: true, items: [{ name: 'Exemplo' }], example: true, sample: true, exemplo: true } }));
  blocos.push({ id: 'manual', type: 'rack_grade', props: { aoVivo: false, items: [{ name: 'Digitado' }] } });
  const out = aplicarGradeAoVivo(blocos, grade, { agora, nome: 'Liga Teste' });
  const por = Object.fromEntries(out.map((b) => [b.id, b.props]));
  for (const type of BLOCOS_GRADE) {
    assert.equal(por[type].items.length, 3, `${type}: o torneio que já fechou sai`);
    assert.equal(por[type]._aoVivo, true);
    assert.ok(por[type].items.every((i) => i._cd?.ini), `${type}: cada item leva a contagem`);
  }
  assert.deepEqual(por.manual.items, [{ name: 'Digitado' }], 'sem aoVivo, fica como estava');
  assert.equal(por.rack_grade.example, false, 'some o carimbo EXEMPLO');
  assert.equal(por.transmissao_grade.sample, false);
  assert.equal(por.ingresso_fita.exemplo, false);
  assert.equal(por.comprovante_agenda.tag, 'AO VIVO');
  assert.equal(por.relogio_grade.live, false, 'o Relógio usa a contagem nova, não a dele');
  assert.match(por.transmissao_grade.source, /^Ao vivo da Liga Teste · atualizada às 19:00$/);
  const [late, prox] = por.rack_grade.items;
  assert.equal(late.time, '18:40');
  assert.equal(late.prize, 'R$ 10.000');
  assert.match(late.detail, /Main Event/);
  assert.deepEqual([late._cd.fase, late._cd.urgente, late._cd.texto], ['late', true, 'late fecha em 3 min']);
  assert.deepEqual([prox._cd.fase, prox._cd.urgente], ['antes', false]);
  assert.equal(por.relogio_grade.items[1].mode, 'PLO 5 KO');
  assert.equal(por.relogio_grade.items[1].late, '21:00');
  assert.equal(por.transmissao_grade.items[0].lead, true, 'Main Event em destaque na Transmissão');
  assert.equal(por.ingresso_fita.items[0].nota, 'Late até 19:03');
  // limite e grade vazia
  const um = aplicarGradeAoVivo([{ id: 'x', type: 'schedule', props: { aoVivo: true, aoVivoMax: '1', items: [] } }], grade, { agora });
  assert.equal(um[0].props.items.length, 1);
  const semNada = [{ id: 'x', type: 'schedule', props: { aoVivo: true, items: [{ name: 'Fica' }] } }];
  assert.equal(aplicarGradeAoVivo(semNada, { eventos: [ev(9, -90, -60)] }, { agora }), semNada, 'tudo fechado: fica o que foi digitado');
  assert.equal(aplicarGradeAoVivo(semNada, null, { agora }), semNada, 'sem grade: fica o que foi digitado');
  assert.equal(pedeGradeAoVivo(semNada), true);
  assert.equal(pedeGradeAoVivo([{ type: 'hero', props: { aoVivo: true } }]), false, 'bloco que não é de grade não conta');
});

test('os 6 blocos de grade desenham a contagem escapada; letreiro e itens digitados não', () => {
  const blocos = cleanBlocks([...BLOCOS_GRADE].map((type) => ({ type, props: { aoVivo: true, items: [] } })));
  assert.ok(blocos.every((b) => b.props.aoVivo === true), 'aoVivo sobrevive à limpeza (campo do editor)');
  const html = renderBlocks(aplicarGradeAoVivo(blocos, grade, { agora, nome: 'Liga' }), { site: { name: 'S' }, page: { slug: '' }, base: '', pages: [] });
  const selos = html.match(/<span class="cd cd-[a-z]+( cd-urgente)?" data-cd-ini="[^"]+" data-cd-fim="[^"]+">/g) || [];
  assert.equal(selos.length, 3 * 6, '3 torneios × 6 blocos (o letreiro rola, sem contagem)');
  assert.ok(html.includes('class="cd cd-late cd-urgente"'), 'o que fecha em 3 min sai vermelho');
  assert.ok(html.includes('Late &lt;b&gt;quase&lt;/b&gt; fechando'), 'nome escapado');
  assert.ok(!html.includes('<b>quase</b>'));
  const manual = renderBlocks(cleanBlocks([{ type: 'rack_grade', props: { items: [{ time: '20:00', name: 'Digitado' }] } }]), { site: { name: 'S' }, page: { slug: '' }, base: '', pages: [] });
  assert.ok(!manual.includes('data-cd-ini'), 'item digitado não ganha contagem');
});

test('modelos de pôquer com grade já nascem com a grade ao vivo marcada', () => {
  const comGrade = [...loadTemplates().values()].filter((t) => t.niches.includes('poker'))
    .flatMap((t) => t.pages.flatMap((p) => p.blocks.filter((b) => BLOCOS_GRADE.has(b.type)).map((b) => `${t.id}:${b.type}:${Boolean(b.props?.aoVivo)}`)));
  assert.ok(comGrade.length >= 20);
  assert.deepEqual(comGrade.filter((x) => x.endsWith(':false')), []);
  const outros = [...loadTemplates().values()].filter((t) => !t.niches.includes('poker'))
    .flatMap((t) => t.pages.flatMap((p) => p.blocks.filter((b) => b.props?.aoVivo)));
  assert.deepEqual(outros, [], 'cursos, eventos e afins continuam com a agenda digitada');
});

// ---------------------------------------------------------------- no portal

const T = '/api/t/clube-42001';
const S = '/s/clube-42001';
let eventos = [];
let apiFora = false;
let lenta = false;
const fetchFalso = async (url) => {
  if (String(url).startsWith('https://api.pokerbyte.com.br/')) {
    if (lenta) await new Promise((r) => setTimeout(r, 400));
    if (apiFora) throw new Error('sem rede');
    return { ok: true, status: 200, json: async () => eventos };
  }
  return { ok: true, status: 202, json: async () => ({}) };
};

let P; let sup; let site;
before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: fetchFalso });
  P.app.esperaGradeMs = 150;
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Ao Vivo', number: '42001', niche: 'poker', template: 'agenda-torneios', settings: { app: 'Suprema Poker' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  site = (await sup.req('GET', `${T}/sites`)).data.sites[0];
  for (const p of site.pages) assert.equal((await sup.req('POST', `${T}/pages/${p.id}/publish`, {})).status, 200);
  const g = await buscarGrade('1', { fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  const em = (min) => new Date(Math.min(Date.now() + min * MIN, g.ate.getTime() - (200 - min) * 1000)).toISOString();
  eventos = [
    { id: 1, name: 'Fecha já', date: em(-30), late: em(3), type: 'NLH', buyin: 30, guaranteed: 9000, stack: 30000, tournament: 'Main Event' },
    { id: 2, name: 'Mais tarde', date: em(50), late: em(110), type: 'PLO5', buyin: 20, guaranteed: 5000, stack: 10000, isKO: true },
  ];
});
after(() => P.close());

const get = (path) => sup.req('GET', path, undefined, { raw: true });
const comGrade = () => site.pages.find((p) => p.slug === '') ? '/' : `/${site.pages[0].slug}`;

test('site publicado: com torneios ligados, a grade do modelo vira a da liga com contagem e o script', async () => {
  limparCacheTorneios();
  const desligado = await get(`${S}${comGrade()}`);
  assert.equal(desligado.status, 200);
  assert.ok(!desligado.data.includes('data-cd-ini'), 'torneios desligados: itens do modelo, sem contagem');
  assert.ok(!desligado.data.includes('/assets/contagem.js'));
  assert.equal((await sup.req('PUT', `${T}/torneios/config`, { ativo: true, liga: '106', nome: 'Liga Suprema' })).status, 200);
  const r = await get(`${S}${comGrade()}`);
  assert.ok(r.data.includes('Fecha já') && r.data.includes('Mais tarde'), 'os torneios da liga aparecem');
  assert.match(r.data, /class="cd cd-late cd-urgente"[^>]*>late fecha em \d min</, 'fechando em 3 min: vermelho');
  assert.ok(r.data.includes('<script src="/assets/contagem.js" defer></script>'));
  const js = await get('/assets/contagem.js');
  assert.equal(js.status, 200);
  assert.ok(js.data.length < 3000, 'script da contagem pequeno');
  const torneios = await get(`${S}/torneios`);
  assert.ok(torneios.data.includes('data-cd-ini') && torneios.data.includes('/assets/contagem.js'), '/torneios também conta');
});

test('liga lenta ou fora: a página não espera e mostra o que estava no cache ou os itens do modelo', async () => {
  limparCacheTorneios();
  lenta = true;
  const t0 = Date.now();
  const r = await get(`${S}${comGrade()}`);
  assert.equal(r.status, 200);
  assert.ok(Date.now() - t0 < 380, 'não esperou a liga lenta');
  assert.ok(!r.data.includes('Fecha já'), 'primeira visita sem cache: itens do modelo');
  await new Promise((res) => setTimeout(res, 500)); // a busca terminou por trás
  lenta = false;
  assert.ok((await get(`${S}${comGrade()}`)).data.includes('Fecha já'), 'visita seguinte já com a grade');
  apiFora = true;
  limparCacheTorneios();
  const fora = await get(`${S}${comGrade()}`);
  assert.equal(fora.status, 200);
  assert.ok(!fora.data.includes('data-cd-ini'));
  apiFora = false;
});

test('prévia do rascunho também mostra a grade ao vivo', async () => {
  limparCacheTorneios();
  const pg = site.pages[0];
  const r = await sup.req('GET', `${T}/pages/${pg.id}/preview`, undefined, { raw: true });
  assert.equal(r.status, 200);
  assert.ok(r.data.includes('data-cd-ini'));
});
