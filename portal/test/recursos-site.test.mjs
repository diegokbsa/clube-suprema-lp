// PA-150: recursos do suprema.blog em todas as operações: /torneios (PokerByte simulada), blog com caixas e FAQ,
// /sobre por site, /llms.txt e /llms-full.txt e /baixar por aparelho. Nenhum teste chama rede de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPortal, client } from './helpers.mjs';
import { buscarGrade, gradeDoDia, limparCacheTorneios, configTorneios } from '../lib/modules/torneios.mjs';
import { htmlText, faqDoTexto } from '../lib/modules/blog.mjs';
import { aparelho, destino, linkSeguro } from '../lib/modules/baixar.mjs';

const T = '/api/t/clube-41001';
const S = '/s/clube-41001';
const pokerbyte = [];
let apiFora = false;
let eventos = [];
const fetchFalso = async (url) => {
  if (String(url).startsWith('https://api.pokerbyte.com.br/')) {
    pokerbyte.push(String(url));
    if (apiFora) throw new Error('sem rede');
    return { ok: true, status: 200, json: async () => eventos };
  }
  return { ok: true, status: 202, json: async () => ({}) }; // IndexNow e afins
};

let P; let sup; let site;
before(async () => {
  P = await startPortal({ origin: 'https://portal.exemplo.com', fetchImpl: fetchFalso });
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Recursos', number: '41001', niche: 'poker', template: 'clube-poker-premium',
    settings: { app: 'Suprema Poker', agentId: '5555' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  site = (await sup.req('GET', `${T}/sites`)).data.sites[0];
  // janela do "dia de poker" de agora (7h às 7h) para montar torneios que sempre caem dentro dela
  const g = await buscarGrade('1', { fetchImpl: async () => ({ ok: true, json: async () => [] }) });
  const em = (min) => new Date(Math.min(Date.now() + min * 60_000, g.ate.getTime() - (200 - min) * 1000)).toISOString();
  eventos = [
    { id: 1, name: 'Main <script>alert(1)</script>', date: em(60), late: em(120), type: 'NLH', buyin: 100, guaranteed: 50000, stack: 30000, temponivelmMeta: 10, tournament: 'Main Event' },
    { id: 2, name: 'Turbo PLO', date: em(30), type: 'PLO5', buyin: 20, guaranteed: 5000, stack: 10000, temponivelmMeta: 5, isKO: true },
    { id: 3, name: 'Satélite', date: em(90), type: 'NLH', buyin: 5, guaranteed: 0, stack: 0, tournament: 'Satelite' },
  ];
});
after(() => P.close());

const get = (path, headers = {}) => sup.req('GET', path, undefined, { raw: true, headers });
const tenantRow = () => P.db.prepare("SELECT * FROM tenants WHERE slug = 'clube-41001'").get();
const ldDe = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const tipos = (ld) => ld.flatMap((x) => x['@graph'] || [x]).map((x) => x['@type']);

// ---------------------------------------------------------------- torneios

test('torneios: desligado cai na página do construtor; a configuração valida a liga', async () => {
  assert.equal((await get(`${S}/torneios`)).status, 404, 'desligado e sem página publicada: 404');
  const pagina = site.pages.find((p) => p.slug === 'torneios');
  assert.ok(pagina, 'o modelo tem a página torneios');
  assert.equal((await sup.req('POST', `${T}/pages/${pagina.id}/publish`)).status, 200);
  const doConstrutor = await get(`${S}/torneios`);
  assert.equal(doConstrutor.status, 200);
  assert.doesNotMatch(doConstrutor.data, /mtt-list/, 'é a página do construtor, não a grade ao vivo');

  assert.equal((await sup.req('PUT', `${T}/torneios/config`, { ativo: true, liga: '' })).status, 400);
  assert.equal((await sup.req('PUT', `${T}/torneios/config`, { ativo: true, liga: '10a' })).status, 400);
  const ok = await sup.req('PUT', `${T}/torneios/config`, { ativo: true, liga: '106', nome: 'Liga Suprema' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.torneios, { ativo: true, ligado: true, liga: '106', nome: 'Liga Suprema' });
  const me = (await sup.req('GET', T)).data.tenant.settings;
  assert.equal(me.torneiosLiga, '106', 'fica nas settings da operação (aparece nas Configurações)');
});

test('torneios: ligado serve a grade server-side com JSON-LD, texto e cache de 10 min', async () => {
  limparCacheTorneios();
  pokerbyte.length = 0;
  const r = await get(`${S}/torneios`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.data, /<h1>Torneios de hoje<\/h1>/);
  assert.match(r.data, /Main &lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'nome do torneio escapado');
  assert.doesNotMatch(r.data, /<script>alert/);
  assert.match(r.data, /Turbo PLO/);
  assert.match(r.data, /href="\/s\/clube-41001\/baixar"/, 'chamada leva para o /baixar do site');
  assert.match(r.data, /<link rel="canonical" href="https:\/\/portal\.exemplo\.com\/s\/clube-41001\/torneios">/);
  const ld = ldDe(r.data);
  const t = tipos(ld);
  for (const tipo of ['WebPage', 'BreadcrumbList', 'ItemList', 'FAQPage']) assert.ok(t.includes(tipo), `JSON-LD com ${tipo}`);
  const lista = ld[0]['@graph'].find((x) => x['@type'] === 'ItemList');
  assert.equal(lista.itemListElement.length, 2, 'satélite fica fora dos destaques');
  assert.equal(lista.itemListElement[0].item['@type'], 'Event');
  assert.ok(pokerbyte.every((u) => /^https:\/\/api\.pokerbyte\.com\.br\/mtt\/list\/106\/all\/\d{4}-\d{2}-\d{2}\/guaranteed\/desc$/.test(u)), pokerbyte.join());
  const chamadas = pokerbyte.length;

  const txt = await get(`${S}/torneios.txt`);
  assert.equal(txt.status, 200);
  assert.match(txt.headers.get('content-type'), /text\/plain/);
  assert.match(txt.data, /# Torneios de hoje na Liga Suprema/);
  assert.match(txt.data, /Turbo PLO \| PLO 5 \| buy-in R\$ 20/);
  assert.equal(pokerbyte.length, chamadas, 'segunda leitura sai do cache');

  const sitemap = (await get(`${S}/sitemap.xml`)).data;
  assert.equal((sitemap.match(/\/torneios<\/loc>/g) || []).length, 1, 'sem /torneios repetido no sitemap');
});

test('torneios: API fora do ar mostra aviso, e gradeDoDia devolve texto curto ou null', async () => {
  limparCacheTorneios();
  apiFora = true;
  try {
    const r = await get(`${S}/torneios`);
    assert.equal(r.status, 200);
    assert.match(r.data, /Grade indisponível agora/);
    assert.equal(await gradeDoDia(tenantRow()), null, 'API fora: nada para postar');
  } finally { apiFora = false; }
  limparCacheTorneios();
  const texto = await gradeDoDia(tenantRow());
  assert.match(texto, /^Torneios de hoje na Liga Suprema · /);
  assert.match(texto, /Turbo PLO · buy-in R\$ 20 · R\$ 5\.000 garantidos/);
  assert.doesNotMatch(texto, /Satélite ·/, 'satélite fica fora');
  assert.ok(texto.indexOf('Turbo PLO') < texto.indexOf('Main <script>'), 'em ordem de horário');
  assert.match(texto, /Grade completa: https:\/\/portal\.exemplo\.com\/s\/clube-41001\/torneios/);
  assert.ok(texto.length < 1000);
  const desligado = { ...tenantRow(), settings: JSON.stringify({ torneiosAtivo: false, torneiosLiga: '106' }) };
  assert.equal(await gradeDoDia(desligado, { fetchImpl: fetchFalso }), null);
  assert.equal(configTorneios({ settings: JSON.stringify({ torneiosAtivo: true, torneiosLiga: 'x' }) }).ativo, false);
});

test('integração PA-150 + PA-151: o robô dos grupos e o Bluesky recebem a grade estruturada dos torneios', async () => {
  const { obterGrade, gradeDisponivel } = await import('../lib/automacao.mjs');
  limparCacheTorneios();
  assert.equal(typeof P.app.gradeDoDia, 'function', 'o módulo de torneios pendura a grade no app');
  assert.equal(await gradeDisponivel(P.app), true);
  const g = await obterGrade(P.app, tenantRow());
  assert.ok(g && g.eventos.length >= 2, JSON.stringify(g));
  assert.ok(g.eventos.some((e) => e.nome === 'Turbo PLO' && e.garantido === 5000 && e.buyin === 20));
  const desligado = { ...tenantRow(), settings: JSON.stringify({ torneiosAtivo: false, torneiosLiga: '106' }) };
  assert.equal(await obterGrade(P.app, desligado), null, 'torneios desligados: nada sai no robô nem no Bluesky');
});

test('gradeDoDia com hora fixa: dia de poker das 7h às 7h e só torneios ainda abertos', async () => {
  limparCacheTorneios();
  const agora = new Date('2026-11-06T12:00:00Z'); // 9h em Brasília
  const lista = [
    { id: 'a', name: 'Já fechou', date: '2026-11-06T10:30:00Z', type: 'NLH', buyin: 10, guaranteed: 99999, stack: 1000 }, // 7h30, sem late
    { id: 'b', name: 'Meio-dia', date: '2026-11-06T15:00:00Z', type: 'NLH', buyin: 50, guaranteed: 20000, stack: 1000 },
    { id: 'c', name: 'Madrugada', date: '2026-11-07T08:00:00Z', type: 'NLH', buyin: 30, guaranteed: 10000, stack: 1000 }, // 5h do dia seguinte
    { id: 'd', name: 'Amanhã', date: '2026-11-07T11:00:00Z', type: 'NLH', buyin: 30, guaranteed: 10000, stack: 1000 }, // 8h do dia seguinte: fora
  ];
  const urls = [];
  const f = async (u) => { urls.push(u); return { ok: true, json: async () => ({ data: lista }) }; };
  const tenant = { ...tenantRow(), settings: JSON.stringify({ torneiosAtivo: true, torneiosLiga: '777', torneiosNome: 'Liga Teste' }) };
  const texto = await gradeDoDia(tenant, { agora, fetchImpl: f, siteUrl: 'https://clube.exemplo.com/' });
  assert.deepEqual(urls.map((u) => u.split('/all/')[1]), ['2026-11-06/guaranteed/desc', '2026-11-07/guaranteed/desc']);
  assert.match(texto, /^Torneios de hoje na Liga Teste · Sexta-feira, 6 de novembro \(horário de Brasília\)/);
  assert.match(texto, /12:00 · Meio-dia/);
  assert.match(texto, /05:00 · Madrugada/);
  assert.doesNotMatch(texto, /Já fechou|Amanhã/);
  assert.match(texto, /3 torneios no dia\. Grade completa: https:\/\/clube\.exemplo\.com\/torneios/);
});

// ---------------------------------------------------------------- blog

test('blog: caixas :::cta, :::nota e :::dica saem seguras e o FAQ do post vira FAQPage', async () => {
  const h = htmlText(':::cta Quer **jogar**?\nEntre pelo [link](/baixar).\n\n- um\n:::\n\n:::nota\n<img src=x onerror=alert(1)>\n:::\n\n:::dica\nUse o late.\n:::\n\n:::nota sem fechar');
  assert.match(h, /^<aside class="blog-box blog-box-cta"><strong class="blog-box-title">Quer <strong>jogar<\/strong>\?<\/strong><p>Entre pelo <a href="\/baixar">link<\/a>\.<\/p><ul><li>um<\/li><\/ul><\/aside>/);
  assert.match(h, /<aside class="blog-box blog-box-nota"><strong class="blog-box-title">Nota<\/strong><p>&lt;img src=x onerror=alert\(1\)&gt;<\/p><\/aside>/);
  assert.match(h, /<aside class="blog-box blog-box-dica"><strong class="blog-box-title">Dica<\/strong><p>Use o late\.<\/p><\/aside>/);
  assert.match(h, /<p>:::nota sem fechar<\/p>/, 'caixa sem ":::" de fechamento sai como texto');
  assert.doesNotMatch(h, /<img/);
  assert.deepEqual(faqDoTexto('Intro\n\n## Perguntas frequentes\n\n### Precisa de CPF?\nSim, **no seu nome**.\n\n### Tem [app](/baixar)?\n- Tem para Android\n\n## Outra seção\n\n### Fora\nnão entra'),
    [{ q: 'Precisa de CPF?', a: 'Sim, no seu nome.' }, { q: 'Tem app?', a: 'Tem para Android' }]);
  assert.deepEqual(faqDoTexto('## Como entrar\n\n### Passo 1\nAbra o app'), [], 'sem seção de FAQ não há FAQPage');

  const criado = await sup.req('POST', `${T}/posts`, { siteId: site.id, title: 'Como entrar no clube pelo celular', slug: 'como-entrar',
    content: 'Texto do artigo.\n\n:::dica Atalho\nUse o /baixar.\n:::\n\n## Perguntas frequentes\n\n### Funciona no iPhone?\nFunciona, pelo link oficial.', excerpt: 'Passo a passo.', author: 'Equipe do clube' });
  assert.equal(criado.status, 201, JSON.stringify(criado.data));
  assert.equal((await sup.req('POST', `${T}/posts/${criado.data.post.id}/publish`)).status, 200);
  const pagina = await get(`${S}/blog/como-entrar`);
  assert.match(pagina.data, /<aside class="blog-box blog-box-dica"><strong class="blog-box-title">Atalho<\/strong>/);
  const ld = ldDe(pagina.data)[0]['@graph'];
  const faq = ld.find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage no JSON-LD do artigo');
  assert.deepEqual(faq.mainEntity, [{ '@type': 'Question', name: 'Funciona no iPhone?', acceptedAnswer: { '@type': 'Answer', text: 'Funciona, pelo link oficial.' } }]);
});

// ---------------------------------------------------------------- /sobre

test('/sobre: editável por site, valida, publica com Organization e Person e sai do ar ao desativar', async () => {
  const vazio = await sup.req('GET', `${T}/sites/${site.id}/sobre`);
  assert.equal(vazio.status, 200);
  assert.equal(vazio.data.sobre.ativo, false);
  assert.equal((await get(`${S}/sobre`)).status, 404);
  assert.equal((await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ativo: true, conteudo: 'curto' })).status, 400);
  assert.equal((await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ativo: false, links: 'http://instagram.com/x' })).status, 400);
  assert.equal((await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ativo: false, autorFoto: 'javascript:alert(1)' })).status, 400);
  assert.equal((await sup.req('PUT', '/api/t/clube-41001/sites/nao-existe/sobre', { ativo: false })).status, 404);

  const conteudo = '## Quem somos\n\nSomos o Clube Recursos, no app desde 2021, com **suporte humano**.\n\n<script>alert(1)</script>\n\n:::nota Como escrevemos\nTodo artigo é revisado.\n:::';
  const ok = await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ativo: true, titulo: 'Sobre o Clube Recursos', resumo: 'Clube de poker online com suporte 24h.',
    conteudo, tipo: 'Organization', autorNome: 'Ana Souza', autorCargo: 'Editora', autorBio: 'Joga desde 2015.', autorFoto: 'https://img.exemplo.com/ana.jpg',
    links: ['https://instagram.com/clube', 'https://instagram.com/clube'] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.sobre.links, ['https://instagram.com/clube']);
  const r = await get(`${S}/sobre`);
  assert.equal(r.status, 200);
  assert.match(r.data, /<h1>Sobre o Clube Recursos<\/h1>/);
  assert.match(r.data, /<h2>Quem somos<\/h2>/);
  assert.match(r.data, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(r.data, /blog-box-nota/);
  assert.match(r.data, /Ana Souza/);
  const g = ldDe(r.data)[0]['@graph'];
  assert.deepEqual(g.map((x) => x['@type']), ['AboutPage', 'Organization', 'Person', 'BreadcrumbList']);
  assert.deepEqual(g[1].sameAs, ['https://instagram.com/clube']);
  assert.equal(g[2].jobTitle, 'Editora');
  assert.match((await get(`${S}/sitemap.xml`)).data, /\/s\/clube-41001\/sobre<\/loc>/);

  assert.equal((await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ...ok.data.sobre, ativo: false })).status, 200);
  assert.equal((await get(`${S}/sobre`)).status, 404, 'desativado: segue para o construtor (aqui sem página sobre)');
  assert.doesNotMatch((await get(`${S}/sitemap.xml`)).data, /\/sobre<\/loc>/);
  assert.equal((await sup.req('PUT', `${T}/sites/${site.id}/sobre`, { ...ok.data.sobre, ativo: true })).status, 200);
});

// ---------------------------------------------------------------- llms.txt

test('/llms.txt e /llms-full.txt saem dos posts publicados e das páginas indexáveis', async () => {
  const rascunho = await sup.req('POST', `${T}/posts`, { siteId: site.id, title: 'Rascunho secreto', slug: 'rascunho-secreto', content: 'Não publicado ainda.', author: 'Equipe' });
  assert.equal(rascunho.status, 201);
  const r = await get(`${S}/llms.txt`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/plain/);
  assert.match(r.data, /^# Clube Recursos\n\n> /);
  assert.match(r.data, /- ID do clube: 41001/);
  assert.match(r.data, /- ID do agente: 5555/);
  assert.match(r.data, /\[Como entrar no clube pelo celular\]\(https:\/\/portal\.exemplo\.com\/s\/clube-41001\/blog\/como-entrar\): Passo a passo\./);
  assert.match(r.data, /\[Sobre o Clube Recursos\]\(https:\/\/portal\.exemplo\.com\/s\/clube-41001\/sobre\)/);
  assert.match(r.data, /\(https:\/\/portal\.exemplo\.com\/s\/clube-41001\/torneios\)/, 'torneios ligados entram nas páginas');
  assert.match(r.data, /\(https:\/\/portal\.exemplo\.com\/s\/clube-41001\/llms-full\.txt\)/);
  assert.doesNotMatch(r.data, /Rascunho secreto/);
  assert.equal((r.data.match(/s\/clube-41001\/torneios\)/g) || []).length, 1, 'página do construtor e grade ao vivo no mesmo caminho saem uma vez só');

  const full = (await get(`${S}/llms-full.txt`)).data;
  assert.ok(full.startsWith(r.data));
  assert.match(full, /# Como entrar no clube pelo celular\n\nURL: https:\/\/portal\.exemplo\.com\/s\/clube-41001\/blog\/como-entrar/);
  assert.match(full, /\*\*Atalho\*\*\nUse o \/baixar\./, 'caixas viram texto simples');
  assert.match(full, /# Sobre o Clube Recursos/);
  assert.match(full, /Todo artigo é revisado\./);
  assert.doesNotMatch(full, /Não publicado ainda/);
});

// ---------------------------------------------------------------- /baixar

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  huawei: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-NX9; HMSCore 6.11) AppleWebKit/537.36 HuaweiBrowser/14.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15',
};

test('/baixar: aparelho, destino e links só https', () => {
  assert.equal(aparelho(UA.iphone), 'ios');
  assert.equal(aparelho(UA.android), 'android');
  assert.equal(aparelho(UA.android, { apk: true }), 'android_sem_loja');
  assert.equal(aparelho(UA.huawei), 'android_sem_loja');
  assert.equal(aparelho(UA.windows), 'windows');
  assert.equal(aparelho(UA.mac), 'outro');
  assert.equal(linkSeguro('javascript:alert(1)'), '');
  assert.equal(linkSeguro('http://x.com'), '');
  const so = { convite: 'https://c/', ios: '', android: '', windows: '', apk: '' };
  assert.equal(destino(so, 'windows'), 'https://c/');
  assert.equal(destino(so, 'android_sem_loja'), 'https://c/');
  assert.equal(destino({ ...so, convite: '' }, 'ios'), '');
});

test('/baixar: 302 por aparelho, cai no convite ou na home e registra o clique do lead', async () => {
  const loc = async (ua, q = '') => { const r = await get(`${S}/baixar${q}`, { 'User-Agent': ua }); assert.equal(r.status, 302); return r.headers.get('location'); };
  assert.equal(await loc(UA.iphone), `${S}/`, 'sem link nenhum: volta para a home do site');

  assert.equal((await sup.req('PATCH', T, { settings: { inviteLink: 'https://convite.exemplo.com/c/41001' } })).status, 200);
  for (const ua of [UA.iphone, UA.android, UA.windows, UA.mac]) assert.equal(await loc(ua), 'https://convite.exemplo.com/c/41001');

  assert.equal((await sup.req('PUT', `${T}/baixar/config`, { windows: 'http://inseguro.exemplo.com' })).status, 400);
  const cfg = await sup.req('PUT', `${T}/baixar/config`, { windows: 'https://dl.exemplo.com/setup.exe', apk: 'https://dl.exemplo.com/app.apk', ios: '', android: '' });
  assert.equal(cfg.status, 200, JSON.stringify(cfg.data));
  assert.equal(cfg.data.baixar.windows, 'https://dl.exemplo.com/setup.exe');
  assert.equal(await loc(UA.windows), 'https://dl.exemplo.com/setup.exe');
  assert.equal(await loc(UA.huawei), 'https://dl.exemplo.com/app.apk');
  assert.equal(await loc(UA.android, '?apk=1'), 'https://dl.exemplo.com/app.apk');
  assert.equal(await loc(UA.android), 'https://convite.exemplo.com/c/41001', 'Android com loja segue no convite');
  assert.equal(await loc(UA.iphone), 'https://convite.exemplo.com/c/41001');
  const r = await get(`${S}/baixar`, { 'User-Agent': UA.windows });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('vary'), 'User-Agent');

  // as settings do painel continuam com as chaves (PATCH das Configurações não apaga)
  assert.equal((await sup.req('PATCH', T, { settings: { tagline: 'Novo slogan' } })).status, 200);
  const s = (await sup.req('GET', T)).data.tenant.settings;
  assert.equal(s.baixarWindows, 'https://dl.exemplo.com/setup.exe');
  assert.equal(s.torneiosAtivo, true);

  const lead = await sup.req('POST', `/f/${site.id}`, { email: 'jogador@exemplo.com', consent: '1', page: '' });
  assert.equal(lead.status, 201, JSON.stringify(lead.data));
  const leadId = P.db.prepare("SELECT id FROM leads WHERE email = 'jogador@exemplo.com'").get().id;
  await loc(UA.android, `?l=${leadId}`);
  const ev = P.db.prepare("SELECT * FROM lead_events WHERE lead_id = ? AND kind = 'baixar'").get(leadId);
  assert.deepEqual(JSON.parse(ev.data), { aparelho: 'android' });
});
