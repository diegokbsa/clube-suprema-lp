// Estúdio de UGC (PA-141): elenco, pauta, produção pelos três caminhos, preflight na aprovação, link por influenciador, teto
// de gerações e as duas edições num servidor só (porta da Geral e porta da SX, mesmo banco). Nenhuma chamada sai para a internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../lib/db.mjs';
import { createApp } from '../server.mjs';
import { createUser } from '../lib/auth.mjs';
import { scoped } from '../lib/repo.mjs';
import { client, sign } from './helpers.mjs';

let db; let app; let G; let X; let ia; const servidores = [];
const pedidosIa = [];
let sup; let supSx;
let clube; let parceiro; let outro;

// servidor local que faz o papel da API de mensagens da Anthropic
async function iaFalsa() {
  const s = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw || '{}');
    pedidosIa.push({ headers: req.headers, body });
    const peca = { titulo: 'Blind em 40 segundos', roteiro: '[0 a 3 s] Você sabe por que o blind sobe?\n[3 a 30 s] Explicação com exemplo de mesa.', legenda: 'Hoje explico o blind de um jeito simples.',
      hashtags: '#poker #pokerbrasil', capa: 'O blind explicado', briefing: 'Grave na vertical, peito para cima.' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', model: body.model, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(peca) }], usage: { input_tokens: 900, output_tokens: 700 } }));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servidores.push(s);
  return `http://127.0.0.1:${s.address().port}/v1/messages`;
}

// fetch das chamadas externas do portal: valida chave com 200 e recusa qualquer outra coisa (sem internet nos testes)
const fetchSemInternet = async (url, init) => {
  if (String(url).startsWith('http://127.0.0.1')) return fetch(url, init);
  if (/\/v1\/models/.test(String(url))) return new Response('{"data":[]}', { status: 200 });
  throw new Error(`teste tentou sair para a internet: ${url}`);
};

async function ouvir() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  servidores.push(s);
  return s;
}

before(async () => {
  db = openDb(':memory:');
  const sg = await ouvir();
  const sx = await ouvir();
  const pg = sg.address().port; const ps = sx.address().port;
  const out = await createApp({ db, origin: `http://127.0.0.1:${pg}`, secretKey: 'teste', fetchImpl: fetchSemInternet, editionId: 'geral', portEditions: { [ps]: 'sx' } });
  app = out.app;
  sg.on('request', out.handle); sx.on('request', out.handle);
  G = `http://127.0.0.1:${pg}`; X = `http://127.0.0.1:${ps}`;
  app.ugcEndpoints = { anthropic: await iaFalsa() };
  createUser(db, { email: 'super@teste.local', name: 'Super', password: 'senha-forte-123', isSuper: true });
  sup = client(G); await sup.login('super@teste.local', 'senha-forte-123');
  supSx = client(X); await supSx.login('super@teste.local', 'senha-forte-123');
  clube = (await supSx.req('POST', '/api/tenants', { name: 'Clube UGC', number: '10141', template: 'sx-agenda-torneios' })).data.tenant;
  parceiro = (await sup.req('POST', '/api/tenants', { name: 'Parceiro UGC', number: '30141', niche: 'saas' })).data.tenant;
  outro = (await sup.req('POST', '/api/tenants', { name: 'Loja Vizinha', number: '40141', niche: 'loja' })).data.tenant;
  const u = (c, slug, email, role) => c.req('POST', `/api/t/${slug}/users`, { email, name: email.split('@')[0], role, password: 'senha-forte-123' });
  await u(supSx, clube.slug, 'dono@clube.test', 'admin');
  await u(supSx, clube.slug, 'mkt@clube.test', 'marketing');
  await u(supSx, clube.slug, 'editor@clube.test', 'editor');
  await u(supSx, clube.slug, 'afiliado@clube.test', 'affiliate');
  await u(sup, parceiro.slug, 'dona@parceiro.test', 'admin');
  await u(sup, outro.slug, 'dona@loja.test', 'admin');
});
after(() => Promise.all(servidores.map((s) => new Promise((r) => s.close(r)))));

const entrar = async (origem, email) => { const c = client(origem); await c.login(email, 'senha-forte-123'); return c; };
const ficha = (o = {}) => ({ rede: 'instagram', formato: 'ia', nome: 'Duda Mesa', papel: 'O do dia a dia', voz: { jeito: 'Animada', bordoes: ['Hoje tem!'], glossario: ['grade'] },
  assuntos: ['Torneio do dia'], nunca: ['Prometer ganho'], visual: { paleta: ['#171717', '#39bcff'], enquadramento: 'Cartões com texto grande' }, ...o });

test('o módulo entra no menu e a tela é servida; afiliado não vê', async () => {
  const meta = await supSx.req('GET', '/api/meta');
  assert.ok(meta.data.modules.some((m) => m.id === 'ugc' && m.perm === 'ugc.read'));
  const tela = await supSx.req('GET', '/admin/modules/ugc.js', undefined, { raw: true });
  assert.equal(tela.status, 200);
  const af = await entrar(X, 'afiliado@clube.test');
  assert.equal((await af.req('GET', `/api/t/${clube.slug}/ugc`)).status, 403, 'afiliado não vê o estúdio');
  const me = (await af.req('GET', '/api/me')).data.tenants[0];
  assert.ok(!me.perms.some((p) => p.startsWith('ugc.')));
});

test('estúdio vazio explica o próximo passo e traz as fichas prontas do nicho', async () => {
  const r = await supSx.req('GET', `/api/t/${clube.slug}/ugc`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.elenco.length, 0);
  assert.equal(r.data.operacao.edicao, 'sx');
  assert.equal(r.data.operacao.exigeJogo, true);
  assert.deepEqual(r.data.sugestoes.fichas.map((f) => [f.rede, f.formato]), [['youtube', 'marca'], ['instagram', 'ia'], ['tiktok', 'ia']], 'padrão: 2 personas de IA e 1 rosto da marca');
  assert.equal(r.data.ia.api.estado, 'sem_chave');
  assert.equal(r.data.ia.api.mensagem, 'Conecte sua IA em Conectar sua IA');
  const g = await sup.req('GET', `/api/t/${parceiro.slug}/ugc`);
  assert.equal(g.data.operacao.exigeJogo, false);
  assert.equal(g.data.sugestoes.nicho, 'saas');
  assert.ok(g.data.sugestoes.outros.includes('loja'), 'na Geral dá para ver as fichas de outros nichos');
});

test('elenco: persona de IA leva rótulo, nada de senha, uma rede por influenciador e rosto real só com autorização', async () => {
  const ed = await entrar(X, 'editor@clube.test');
  const senha = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ senha_instagram: 'x' }));
  assert.equal(senha.status, 400);
  assert.match(senha.data.error, /não guarda senha/);

  const r = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ rotulo_ia: false, regras: [] }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const p = r.data.persona;
  assert.equal(p.rotulo_ia, true, 'persona de IA sempre com rótulo, mesmo pedindo false');
  assert.ok(p.regras.some((x) => /nunca se apresenta como pessoa real/i.test(x)));
  assert.ok(p.nunca.some((x) => /pessoa real/i.test(x)));
  assert.match(p.codigo, /^ugc-[0-9a-f]{6}$/);
  assert.match(p.link, new RegExp(`/r/${clube.slug}/${p.codigo}\\?utm_source=instagram&utm_medium=ugc`));
  const aff = scoped(db, clube.id).get('affiliates', { code: p.codigo });
  assert.equal(aff.status, 'ativo', 'o influenciador ganha um código na tabela de afiliados');

  const dup = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ nome: 'Outra' }));
  assert.equal(dup.status, 409, 'uma rede, um influenciador');

  const semAut = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ rede: 'youtube', formato: 'marca', nome: 'Agente do clube', pessoa: 'Léo', status: 'ativo' }));
  assert.equal(semAut.status, 400);
  assert.match(semAut.data.error, /autorização por escrito/);
  const comAut = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ rede: 'youtube', formato: 'marca', nome: 'Agente do clube', pessoa: 'Léo', status: 'ativo', autorizacao: true }));
  assert.equal(comAut.status, 201, JSON.stringify(comAut.data));
  assert.equal(comAut.data.persona.autorizacao.por, 'editor', 'grava quem marcou');
  assert.ok(Date.parse(comAut.data.persona.autorizacao.em), 'e quando');
  assert.equal(comAut.data.persona.rotulo_ia, false);

  const tt = await ed.req('POST', `/api/t/${clube.slug}/ugc/personas`, ficha({ rede: 'tiktok', nome: 'Rafa River' }));
  assert.equal(tt.status, 201);
});

test('isolamento: id de outra operação responde 404 e outra edição também', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  const pid = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data.elenco[0].id;
  const loja = await entrar(G, 'dona@loja.test');
  assert.equal((await loja.req('PATCH', `/api/t/${outro.slug}/ugc/personas/${pid}`, { nome: 'Invasor' })).status, 404);
  assert.equal((await loja.req('DELETE', `/api/t/${outro.slug}/ugc/personas/${pid}`)).status, 404);
  assert.equal((await loja.req('POST', `/api/t/${outro.slug}/ugc/pecas`, { persona_id: pid, legenda: 'x' })).status, 404);
  assert.equal((await loja.req('GET', `/api/t/${clube.slug}/ugc`)).status, 404, 'sem acesso à operação');
  assert.equal((await sup.req('GET', `/api/t/${clube.slug}/ugc`)).status, 404, 'clube da SX não aparece pela porta da Geral');
  assert.equal((await loja.req('GET', `/api/t/${outro.slug}/ugc`)).data.elenco.length, 0);
});

test('pauta da semana: proposta a partir da agenda e dos modelos, sem duplicar ao repetir; dono edita, reordena e apaga', async () => {
  const mkt = await entrar(X, 'mkt@clube.test');
  const r = await mkt.req('POST', `/api/t/${clube.slug}/ugc/pauta/propor`, {});
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.criadas, 21, '3 influenciadores × 7 dias');
  assert.ok(r.data.fontes.agenda > 0, 'a agenda de torneios do site entra na pauta');
  const r2 = await mkt.req('POST', `/api/t/${clube.slug}/ugc/pauta/propor`, {});
  assert.equal(r2.data.criadas, 0);
  assert.equal(r2.data.mantidas, 21);
  const estado = (await mkt.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  assert.equal(estado.pautas.length, 21);
  assert.ok(estado.pautas.some((p) => p.origem === 'agenda'));
  assert.ok(estado.pautas.every((p) => p.semana === estado.semana.inicio));
  const [a, b, c] = estado.pautas;
  assert.equal((await mkt.req('PATCH', `/api/t/${clube.slug}/ugc/pautas/${a.id}`, { tema: 'Tema editado pelo dono', status: 'aprovada' })).data.pauta.tema, 'Tema editado pelo dono');
  assert.equal((await mkt.req('POST', `/api/t/${clube.slug}/ugc/pautas/ordem`, { ids: [b.id, a.id] })).status, 200);
  assert.equal((await mkt.req('DELETE', `/api/t/${clube.slug}/ugc/pautas/${c.id}`)).status, 200);
  const loja = await entrar(G, 'dona@loja.test');
  assert.equal((await loja.req('POST', `/api/t/${outro.slug}/ugc/pautas/ordem`, { ids: [a.id] })).status, 404, 'reordenar pauta de outra operação: 404');
});

async function pecaPeloModelo(c, slug, pautaId) {
  const r = await c.req('POST', `/api/t/${slug}/ugc/pautas/${pautaId}/modelo`);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.peca;
}

test('produção sem IA (modelo) e preflight bloqueando a aprovação; editor cria, só dono e admin aprovam', async () => {
  const ed = await entrar(X, 'editor@clube.test');
  const dono = await entrar(X, 'dono@clube.test');
  const estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const insta = estado.elenco.find((p) => p.rede === 'instagram');
  const pauta = estado.pautas.find((p) => p.persona_id === insta.id);
  const peca = await pecaPeloModelo(ed, clube.slug, pauta.id);
  assert.equal(peca.status, 'rascunho');
  assert.equal(peca.caminho, 'modelo');
  assert.equal(peca.pendente, true, 'o modelo traz trechos para preencher');
  assert.match(peca.legenda, /\+18 · Jogue com responsabilidade\./);
  assert.match(peca.legenda, /Conteúdo feito com IA\./, 'persona de IA: rótulo na legenda');
  assert.match(peca.briefing, /rótulo de conteúdo feito com IA/);

  assert.equal((await ed.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`)).status, 403, 'editor não aprova');
  const mkt = await entrar(X, 'mkt@clube.test');
  assert.equal((await mkt.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`)).status, 403, 'marketing não aprova');

  let r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`);
  assert.equal(r.status, 422);
  assert.ok(r.data.motivos.some((m) => /preencher/.test(m)));

  // texto com bônus e sem o rodapé obrigatório: o preflight segura
  r = await ed.req('PATCH', `/api/t/${clube.slug}/ugc/pecas/${peca.id}`, { roteiro: 'Hoje tem torneio.', legenda: 'Ganhe fichas grátis no cadastro!', briefing: 'Grave na vertical.', capa: 'Torneio hoje' });
  assert.equal(r.status, 200);
  assert.equal(r.data.peca.preflight.ok, false);
  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`);
  assert.equal(r.status, 422);
  assert.ok(r.data.motivos.some((m) => /bônus/.test(m)), JSON.stringify(r.data.motivos));
  assert.ok(r.data.motivos.some((m) => /\+18/.test(m)));
  assert.ok(r.data.motivos.some((m) => /rótulo/.test(m)));

  r = await ed.req('PATCH', `/api/t/${clube.slug}/ugc/pecas/${peca.id}`, { legenda: 'Torneio hoje às 20h. Já viu a grade?\n\n+18 · Jogue com responsabilidade. Conteúdo feito com IA.' });
  assert.equal(r.data.peca.preflight.ok, true, JSON.stringify(r.data.peca.preflight));
  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`, { calendario: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.peca.status, 'aprovado');
  assert.equal(r.data.calendario.ok, false, 'sem conta conectada no Calendário: não vira rascunho lá');
  assert.match(r.data.calendario.erro, /Publique à mão/);

  // conta do Instagram conectada no Calendário: a peça aprovada vira rascunho lá (nada é publicado)
  const repo = scoped(db, clube.id);
  repo.update('integrations', repo.get('integrations', { kind: 'instagram' }).id, { status: 'ativo' });
  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/calendario`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const cal = repo.get('calendar', r.data.calendario);
  assert.equal(cal.status, 'rascunho');
  assert.match(cal.caption, /Jogue com responsabilidade/);
  assert.equal((await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/calendario`)).data.calendario, cal.id, 'repetir não duplica');

  // editar depois de aprovado volta para rascunho
  r = await ed.req('PATCH', `/api/t/${clube.slug}/ugc/pecas/${peca.id}`, { capa: 'Capa nova' });
  assert.equal(r.data.peca.status, 'rascunho');
  assert.equal((await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/aprovar`)).status, 200);
});

test('aprovar a semana aprova só as que passam e lista as que não passam com o motivo', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  const estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const yt = estado.elenco.find((p) => p.rede === 'youtube');
  const tt = estado.elenco.find((p) => p.rede === 'tiktok');
  const pYt = estado.pautas.find((p) => p.persona_id === yt.id && !p.peca_id);
  const pTt = estado.pautas.find((p) => p.persona_id === tt.id && !p.peca_id);
  const boa = await pecaPeloModelo(dono, clube.slug, pYt.id);
  await dono.req('PATCH', `/api/t/${clube.slug}/ugc/pecas/${boa.id}`, { roteiro: 'Explico o blind.', legenda: 'O blind sobe a cada nível. Entenda. +18 · Jogue com responsabilidade.', briefing: 'Vertical.', capa: 'Blind' });
  const ruim = await pecaPeloModelo(dono, clube.slug, pTt.id);
  await dono.req('PATCH', `/api/t/${clube.slug}/ugc/pecas/${ruim.id}`, { roteiro: 'Dinheiro fácil no poker!', legenda: 'Renda extra jogando. +18 · Jogue com responsabilidade. #IA', briefing: 'x', capa: 'x' });
  const r = await dono.req('POST', `/api/t/${clube.slug}/ugc/aprovar-semana`, { semana: estado.semana.inicio });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.aprovadas.map((x) => x.id), [boa.id]);
  assert.equal(r.data.recusadas.length, 1);
  assert.equal(r.data.recusadas[0].id, ruim.id);
  assert.ok(r.data.recusadas[0].motivos.some((m) => /ganho, renda ou lucro/.test(m)));
});

test('link do influenciador conta clique, lead e conversão; peça publicada mostra os números do próprio link', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  let estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const insta = estado.elenco.find((p) => p.rede === 'instagram');
  const peca = estado.pecas.find((x) => x.persona_id === insta.id && x.status === 'aprovado');
  assert.ok(peca.link.includes(`utm_content=${insta.codigo}-`), 'a peça tem link com utm_content próprio');

  // marcar como publicada exige o link da rede certa
  let r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/publicada`, { post_url: 'https://www.tiktok.com/@x/video/1' });
  assert.equal(r.status, 400);
  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/publicada`, { post_url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.peca.status, 'publicado');

  // visitante clica no link da peça e deixa o contato no site
  const visitante = client(X);
  const clique = await visitante.req('GET', new URL(peca.link).pathname + new URL(peca.link).search);
  assert.equal(clique.status, 302);
  const site = (await dono.req('GET', `/api/t/${clube.slug}/sites`)).data.sites[0];
  const lead = await visitante.req('POST', `/f/${site.id}`, new URLSearchParams({ email: 'jogador@exemplo.com', consent: '1', page: '' }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(lead.status, 201, JSON.stringify(lead.data));
  const t = db.prepare('SELECT webhook_secret FROM tenants WHERE id = ?').get(clube.id);
  const corpo = JSON.stringify({ source: 'app', external_id: 'cad-1', kind: 'cadastro', email: 'jogador@exemplo.com' });
  const conv = await fetch(`${X}/api/hooks/${clube.slug}/conversion`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Portal-Signature': sign(t.webhook_secret, corpo) }, body: corpo });
  assert.equal(conv.status, 201);

  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/medir`, { views: 1520 });
  assert.equal(r.data.peca.status, 'medido');
  assert.deepEqual(r.data.peca.numeros, { cliques: 1, leads: 1, conversoes: 1 });
  estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const placar = estado.placar.find((p) => p.persona_id === insta.id);
  assert.deepEqual({ v: placar.d7.views, c: placar.d7.cliques, l: placar.d7.leads, k: placar.d7.conversoes }, { v: 1520, c: 1, l: 1, k: 1 });
  assert.equal(placar.d30.cliques, 1);
  const yt = estado.placar.find((p) => p.persona_id !== insta.id);
  assert.equal(yt.d7.cliques, 0, 'o clique fica só com quem trouxe');
  assert.equal((await dono.req('DELETE', `/api/t/${clube.slug}/ugc/pecas/${peca.id}`)).status, 409, 'publicada fica no histórico');
  const baixar = await dono.req('GET', `/api/t/${clube.slug}/ugc/pecas/${peca.id}/baixar`, undefined, { raw: true });
  assert.equal(baixar.status, 200);
  assert.match(baixar.headers.get('content-disposition'), /attachment/);
  assert.match(baixar.data, /O portal não posta/);
});

test('geração com a chave própria: mostra modelo e custo antes, exige confirmação, respeita o teto e nunca finge', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  const estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const pauta = estado.pautas.find((p) => !p.peca_id);
  // sem chave: não gera e diz onde conectar
  let r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pautas/${pauta.id}/gerar`, { confirmar: true });
  assert.equal(r.status, 400);
  assert.equal(r.data.error, 'Conecte sua IA em Conectar sua IA');
  assert.equal(pedidosIa.length, 0);

  assert.equal((await dono.req('PUT', `/api/t/${clube.slug}/ai/keys/anthropic`, { key: 'sk-ant-teste-0000000000000000000000' })).data.status, 'valida');
  r = await dono.req('GET', `/api/t/${clube.slug}/ugc/pautas/${pauta.id}/estimativa`);
  assert.equal(r.data.modelo, 'claude-opus-5-5');
  assert.ok(r.data.estimativa.usd > 0 && r.data.estimativa.usd < 1, JSON.stringify(r.data.estimativa));
  assert.match(r.data.estimativa.texto, /US\$/);
  assert.equal(r.data.teto, 300, 'teto padrão de 300 gerações por mês');

  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pautas/${pauta.id}/gerar`, {});
  assert.equal(r.status, 400, 'sem confirmar o custo não gera');
  assert.equal((await dono.req('PUT', `/api/t/${clube.slug}/ugc/config`, { teto_mensal: 1 })).status, 200);
  const mkt = await entrar(X, 'mkt@clube.test');
  assert.equal((await mkt.req('PUT', `/api/t/${clube.slug}/ugc/config`, { teto_mensal: 999 })).status, 403, 'só quem aprova muda o teto');

  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pautas/${pauta.id}/gerar`, { confirmar: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(pedidosIa.length, 1);
  assert.equal(pedidosIa[0].headers['x-api-key'], 'sk-ant-teste-0000000000000000000000', 'a chave sai do cofre só para o provedor');
  assert.equal(pedidosIa[0].body.model, 'claude-opus-5-5');
  assert.equal(r.data.peca.caminho, 'api');
  assert.equal(r.data.peca.status, 'rascunho', 'gerado entra como rascunho');
  assert.match(r.data.peca.legenda, /Jogue com responsabilidade/, 'o rodapé obrigatório entra na legenda');
  assert.equal(r.data.geracao.usadas, 1);
  const trilha = db.prepare("SELECT data FROM audit WHERE action = 'ugc.peca_gerar'").all().map((x) => x.data).join('');
  assert.ok(!trilha.includes('sk-ant'), 'a chave nunca vai para a auditoria');

  const outra = estado.pautas.find((p) => !p.peca_id && p.id !== pauta.id);
  r = await dono.req('POST', `/api/t/${clube.slug}/ugc/pautas/${outra.id}/gerar`, { confirmar: true });
  assert.equal(r.status, 429, 'teto mensal atingido');
  assert.match(r.data.error, /Teto mensal/);
  assert.equal(pedidosIa.length, 1, 'com o teto atingido o provedor nem é chamado');
});

test('IA conectada por MCP lista a pauta, lê a ficha e salva a peça como rascunho com preflight', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  const tok = (await dono.req('POST', `/api/t/${clube.slug}/ai/tokens`, { name: 'Claude do dono' })).data.token;
  const mcp = async (name, args) => {
    const r = await fetch(`${X}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
    return (await r.json()).result;
  };
  const lista = (await fetch(`${X}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then((r) => r.json())).result.tools.map((t) => t.name);
  for (const n of ['ugc_listar_pautas', 'ugc_ver_persona', 'ugc_salvar_peca', 'ugc_checar_texto']) assert.ok(lista.includes(n), n);
  const pautas = (await mcp('ugc_listar_pautas', {})).structuredContent.pautas;
  const livre = pautas.find((p) => !p.peca);
  const ficha = (await mcp('ugc_ver_persona', { persona_id: livre.persona_id })).structuredContent;
  assert.ok(ficha.regras_do_texto.some((x) => /Jogue com responsabilidade/.test(x)));
  const salvo = (await mcp('ugc_salvar_peca', { pauta_id: livre.pauta_id, roteiro: 'Cena 1', legenda: 'Lucro garantido hoje!' })).structuredContent;
  assert.equal(salvo.situacao, 'rascunho');
  assert.equal(salvo.preflight.ok, false);
  assert.match(salvo.aviso, /não passou/);
  const estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  assert.equal(estado.ia.mcp.conectado, true);
  assert.equal(estado.pecas.find((x) => x.id === salvo.peca_id).caminho, 'mcp');
});

test('edição Geral: SaaS sem rodapé de jogo, mesmas regras de promessa e de rótulo de IA', async () => {
  const dona = await entrar(G, 'dona@parceiro.test');
  const p = (await dona.req('POST', `/api/t/${parceiro.slug}/ugc/personas`, ficha({ rede: 'tiktok', nome: 'Téo Planilha' }))).data.persona;
  assert.equal(p.rotulo_ia, true);
  assert.equal((await dona.req('POST', `/api/t/${parceiro.slug}/ugc/pauta/propor`, {})).data.criadas, 7);
  const estado = (await dona.req('GET', `/api/t/${parceiro.slug}/ugc`)).data;
  const peca = await pecaPeloModelo(dona, parceiro.slug, estado.pautas[0].id);
  assert.doesNotMatch(peca.legenda, /Jogue com responsabilidade/, 'fora do poker não entra o rodapé de jogo');
  await dona.req('PATCH', `/api/t/${parceiro.slug}/ugc/pecas/${peca.id}`, { roteiro: 'POV: segunda sem planilha.', legenda: 'Organize a semana em 5 minutos. Conteúdo feito com IA.', briefing: 'x', capa: 'POV' });
  assert.equal((await dona.req('POST', `/api/t/${parceiro.slug}/ugc/pecas/${peca.id}/aprovar`)).status, 200);
  const outra = await pecaPeloModelo(dona, parceiro.slug, estado.pautas[1].id);
  await dona.req('PATCH', `/api/t/${parceiro.slug}/ugc/pecas/${outra.id}`, { roteiro: 'x', legenda: 'Ganhe dinheiro com o nosso CRM. Conteúdo feito com IA.', briefing: 'x', capa: 'x' });
  const r = await dona.req('POST', `/api/t/${parceiro.slug}/ugc/pecas/${outra.id}/aprovar`);
  assert.equal(r.status, 422);
  assert.ok(r.data.motivos.some((m) => /ganho, renda ou lucro/.test(m)));
});

test('apagar influenciador com peça publicada é recusado; sem publicação apaga e pausa o link', async () => {
  const dono = await entrar(X, 'dono@clube.test');
  const estado = (await dono.req('GET', `/api/t/${clube.slug}/ugc`)).data;
  const insta = estado.elenco.find((p) => p.rede === 'instagram');
  assert.equal((await dono.req('DELETE', `/api/t/${clube.slug}/ugc/personas/${insta.id}`)).status, 409);
  const tt = estado.elenco.find((p) => p.rede === 'tiktok');
  assert.equal((await dono.req('DELETE', `/api/t/${clube.slug}/ugc/personas/${tt.id}`)).status, 200);
  assert.equal(scoped(db, clube.id).get('affiliates', { code: tt.codigo }).status, 'pausado');
});

test('kit de 7 dias da trilha de migração entra na primeira pauta do influenciador, uma vez só', async () => {
  const mkt = await entrar(X, 'mkt@clube.test');
  const t = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(clube.slug);
  const agora = new Date().toISOString();
  const ins = db.prepare('INSERT INTO migracao_kits (id, tenant_id, canal, dia, formato, gancho, tema, chamada, link, preflight, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let d = 1; d <= 7; d++) ins.run(`kit-${d}`, t.id, 'instagram', d, 'video', `Gancho do kit ${d}`, `Tema do kit ${d}`, 'Link na bio', 'https://x.test/r/a/b', '{}', agora);
  const prox = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
  const r = await mkt.req('POST', `/api/t/${clube.slug}/ugc/pauta/propor`, { semana: prox });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const doKit = db.prepare("SELECT tema FROM ugc_pautas WHERE tenant_id = ? AND origem = 'migracao' ORDER BY ordem").all(t.id);
  assert.equal(doKit.length, 7, 'as 7 pautas do kit entram no influenciador do Instagram');
  assert.equal(doKit[0].tema, 'Tema do kit 1');
  const depois = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
  await mkt.req('POST', `/api/t/${clube.slug}/ugc/pauta/propor`, { semana: depois });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ugc_pautas WHERE tenant_id = ? AND origem = 'migracao'").get(t.id).n, 7, 'na semana seguinte o kit não se repete');
});
