// Microsoft Clarity e Google Ads por site: IDs validados, nada carregado antes do consentimento (LGPD), CSP liberada só
// para os domínios deles, conversão do lead no Ads com o rótulo, tela de mensuração e Integrações com o estado real,
// páginas próprias e blog pelo medidor, e a tela de Sites que não apaga o que não mostra.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startPortal, client } from './helpers.mjs';
import { tagMedicao } from '../lib/modules/paginas.mjs';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const CLARITY = 'z41teste9x';
const ADS = 'AW-123456789';
const ROTULO = 'AbC-lead12';
let P;
let sup;
let site;

before(async () => {
  P = await startPortal({ fetchImpl: async () => ({ status: 200, json: async () => ({}) }) });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  await sup.req('POST', '/api/tenants', { name: 'Clube Clarity', number: '10090', niche: 'poker', template: 'clube-poker-premium' });
  await sup.req('POST', '/api/tenants', { name: 'Clube Sem', number: '10091', niche: 'poker', template: 'clube-poker-premium' });
  site = (await sup.req('GET', '/api/t/clube-10090/sites')).data.sites[0];
  await sup.req('POST', `/api/t/clube-10090/pages/${site.pages[0].id}/publish`);
});
after(() => P.close());

test('IDs inválidos são recusados; rótulo sem a tag do Ads também', async () => {
  let r = await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { clarity: 'ID COM ESPAÇO' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /Clarity/);
  r = await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { ads: 'G-123' });
  assert.equal(r.status, 400);
  r = await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { adsLabel: ROTULO });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /AW-/);
});

test('com os IDs salvos, a página traz só os atributos: nenhum script externo antes do "aceitar"', async () => {
  const r = await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { clarity: CLARITY, ads: ADS, adsLabel: ROTULO });
  assert.equal(r.status, 200);
  const res = await fetch(`${P.url}/s/${site.slug}/`);
  const html = await res.text();
  assert.match(html, new RegExp(`data-clarity="${CLARITY}"`));
  assert.match(html, new RegExp(`data-ads="${ADS}"`));
  assert.match(html, new RegExp(`data-ads-label="${ROTULO}"`));
  const externos = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('/assets/'));
  assert.deepEqual(externos, [], 'Clarity e Ads não estão no HTML');
  assert.ok(!/clarity\.ms/.test(html));
  assert.match(html, /id="consent"/, 'a faixa de consentimento aparece mesmo só com Clarity/Ads');
  assert.match(html, /Microsoft Clarity/, 'o aviso diz quem mede');
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /script-src[^;]*https:\/\/www\.clarity\.ms/);
  assert.match(csp, /connect-src[^;]*https:\/\/\*\.clarity\.ms/);
  assert.match(csp, /connect-src[^;]*https:\/\/www\.google\.com/);
  assert.match(csp, /script-src[^;]*https:\/\/www\.googleadservices\.com/);
});

test('o script do site só carrega Clarity e Ads dentro do load() do consentimento e manda a conversão do lead', () => {
  const js = fs.readFileSync(path.join(ASSETS, 'site.js'), 'utf8');
  const load = js.slice(js.indexOf('function load()'), js.indexOf('function add('));
  assert.match(load, /clarity\.ms\/tag/, 'Clarity entra no load()');
  assert.match(load, /window\.gtag\('config', ids\.ads\)/, 'tag do Ads entra no load()');
  assert.equal(js.split('clarity.ms/tag').length, 2, 'e em nenhum outro lugar');
  assert.match(js, /send_to: `\$\{ids\.ads\}\/\$\{ids\.adsLabel\}`/);
  assert.match(js, /name === 'generate_lead'/);
  const med = fs.readFileSync(path.join(ASSETS, 'medicao.js'), 'utf8');
  const carregar = med.slice(med.indexOf('function carregar()'), med.indexOf('// cliques que importam'));
  assert.match(carregar, /clarity\.ms\/tag/);
  assert.match(carregar, /send_to: A \+ '\/' \+ AL/);
  assert.ok(!/clarity\.ms/.test(med.slice(0, med.indexOf('function carregar()'))), 'nada do Clarity antes do consentimento');
});

test('páginas próprias e blog ganham Clarity e Ads pelo medidor', () => {
  const tag = tagMedicao({ tracking: JSON.stringify({ clarity: CLARITY, ads: ADS, adsLabel: ROTULO }) });
  assert.match(tag, /\/assets\/medicao\.js/);
  assert.match(tag, new RegExp(`data-clarity="${CLARITY}"`));
  assert.match(tag, new RegExp(`data-ads="${ADS}" data-ads-label="${ROTULO}"`));
  assert.equal(tagMedicao({ tracking: JSON.stringify({ clarity: '<script>' }) }), '', 'ID inválido não entra');
  assert.equal(tagMedicao({ tracking: JSON.stringify({ adsLabel: ROTULO }) }), '', 'rótulo sozinho não carrega nada');
});

test('mensuração e Integrações mostram Clarity e Google Ads como instalados', async () => {
  const d = (await sup.req('GET', '/api/t/clube-10090/tracking')).data;
  const cl = d.integracoes.find((i) => i.kind === 'clarity');
  const ad = d.integracoes.find((i) => i.kind === 'google_ads');
  assert.equal(cl.estado, 'instalado');
  assert.equal(ad.estado, 'instalado');
  assert.equal(ad.conectada, false, 'ID instalado não é conta conectada');
  assert.equal(d.sites[0].instalados, 2);
  assert.equal(d.sites[0].ids.adsLabel, ROTULO);
  const ints = (await sup.req('GET', '/api/t/clube-10090/integrations')).data.integrations;
  assert.equal(ints.find((i) => i.kind === 'clarity').status, 'instalado');
  assert.equal(ints.find((i) => i.kind === 'google_ads').status, 'instalado');
  assert.equal(ints.find((i) => i.kind === 'google_ads').config.rotulo, true);
});

test('sem rótulo, a tela avisa que o lead não vira conversão no Ads', async () => {
  await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { adsLabel: '' });
  const d = (await sup.req('GET', '/api/t/clube-10090/tracking')).data;
  assert.ok(d.pendencias.some((p) => /rótulo de conversão/.test(p)));
  assert.equal(d.sites[0].ids.clarity, CLARITY, 'campo que não veio no corpo fica como estava');
  await sup.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { adsLabel: ROTULO });
});

test('salvar na tela de Sites (só GA4, GTM e Pixel) não apaga Clarity e Ads', async () => {
  const r = await sup.req('PATCH', `/api/t/clube-10090/sites/${site.id}`, { tracking: { ga4: 'G-TESTE1234', gtm: '', pixel: '' } });
  assert.equal(r.status, 200);
  const t = JSON.parse(P.db.prepare('SELECT tracking FROM sites WHERE id = ?').get(site.id).tracking);
  assert.equal(t.ga4, 'G-TESTE1234');
  assert.equal(t.clarity, CLARITY);
  assert.equal(t.ads, ADS);
  assert.equal(t.adsLabel, ROTULO);
});

test('isolamento e permissão: outra operação não tem nada; afiliado não muda IDs', async () => {
  const outro = (await sup.req('GET', '/api/t/clube-10091/tracking')).data;
  assert.equal(outro.integracoes.find((i) => i.kind === 'clarity').estado, 'ausente');
  const html = await (await fetch(`${P.url}/s/clube-10091/`)).text();
  assert.ok(!html.includes(CLARITY));
  await sup.req('POST', '/api/t/clube-10090/users', { email: 'af-cl@teste.com', role: 'affiliate', password: 'afiliado-senha-55' });
  const af = client(P.url);
  await af.login('af-cl@teste.com', 'afiliado-senha-55');
  assert.equal((await af.req('PUT', `/api/t/clube-10090/tracking/sites/${site.id}`, { clarity: 'outroid123' })).status, 403);
});
