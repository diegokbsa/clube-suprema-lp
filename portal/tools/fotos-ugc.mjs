// Fotos do Estúdio de UGC (PA-141): computador e celular, nas duas edições, com operação vazia e com elenco montado.
// Sobe um portal temporário com banco temporário semeado (nada do banco de desenvolvimento), em portas livres
// (nunca 3400, 3401, 3490 ou 3491), e fotografa com o Edge/Chrome sem tela pelo protocolo DevTools.
//   node portal/tools/fotos-ugc.mjs <pasta-de-saida>   -> imprime JSON com as fotos e as checagens de celular
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { createUser, createSession, vault } from '../lib/auth.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
registerTable('ai_keys'); // (o servidor registra ao carregar lib/mcp.mjs; aqui o processo é outro)

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'relatorios', 'fotos-ugc'));
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const PROIBIDAS = new Set([3400, 3401, 3490, 3491]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SENHA = 'fotos-senha-123';

async function portaLivre() {
  for (;;) {
    const p = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
    if (!PROIBIDAS.has(p)) return p;
  }
}
async function esperar(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return; } catch { /* subindo */ } await sleep(250); }
  throw new Error(`não respondeu: ${url}`);
}

// cliente HTTP mínimo com cookie e CSRF (mesma ideia de test/helpers.mjs)
function cliente(origem) {
  let cookie = ''; let csrf = '';
  const req = async (method, p, body, headers = {}) => {
    const h = { Accept: 'application/json', ...headers };
    if (cookie) h.Cookie = cookie;
    if (csrf && method !== 'GET') h['X-CSRF'] = csrf;
    let payload;
    if (body !== undefined) { if (typeof body === 'string') payload = body; else { payload = JSON.stringify(body); h['Content-Type'] ??= 'application/json'; } }
    const r = await fetch(origem + p, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const [pair] = c.split(';'); const [k] = pair.split('='); cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(`${k}=`)), pair].join('; '); }
    const t = await r.text();
    let data = t; try { data = JSON.parse(t); } catch { /* texto */ }
    if (r.status >= 400) throw new Error(`${method} ${p}: ${r.status} ${t.slice(0, 200)}`);
    return data;
  };
  return { req, async login(email) { const r = await req('POST', '/api/login', { email, password: SENHA }); csrf = r.csrf; } };
}

class Pagina {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.events = [];
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } else if (d.method) this.events.push(d.method); }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.wait.set(id, r)); }
  async js(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; }
  async tela({ width, height, mobile }) { await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile }); await this.send('Emulation.setTouchEmulationEnabled', { enabled: mobile }); }
  async load(url) {
    await this.send('Page.navigate', { url: 'about:blank' }); await sleep(250); // documento novo a cada cena (o hash sozinho não recarrega)
    this.events = []; await this.send('Page.navigate', { url }); for (let i = 0; i < 60 && !this.events.includes('Page.loadEventFired'); i++) await sleep(200); await this.esperarTela(); }
  async esperarTela() { for (let i = 0; i < 40; i++) { if (await this.js("!!document.querySelector('.ugc .tabs, .ugc .hero')")) break; await sleep(150); } await sleep(500); }
  async foto(file, { width, mobile, cheia = true, alturaMax = 3200 }) {
    let altura = mobile ? 844 : 900;
    if (cheia) altura = Math.min(alturaMax, Math.max(altura, await this.js('Math.ceil(document.documentElement.scrollHeight)')));
    await this.tela({ width, height: altura, mobile });
    await sleep(300);
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    await this.tela({ width, height: mobile ? 844 : 900, mobile });
    return file;
  }
  // celular: rolagem lateral e toques menores que 44 px dentro do estúdio
  checarCelular() {
    return this.js(`(() => {
      const lat = document.documentElement.scrollWidth > window.innerWidth + 1;
      const raiz = document.querySelector('dialog[open]') || document.querySelector('.ugc');
      const pequenos = [...raiz.querySelectorAll('button, a.btn, input:not([type=checkbox]), select, [role=button]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && r.height < 43.5; })
        .map((b) => (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 30));
      return { rolagemLateral: lat, larguraDoc: document.documentElement.scrollWidth, toquesPequenos: [...new Set(pequenos)].slice(0, 12) };
    })()`);
  }
}

const filhos = [];
const fim = () => { for (const c of filhos) { try { c.kill(); } catch { /* já saiu */ } } };
process.on('exit', fim);

async function semear(G, X, db) {
  const sg = cliente(G); await sg.login('super@fotos.local');
  const sx = cliente(X); await sx.login('super@fotos.local');
  const vazioSx = (await sx.req('POST', '/api/tenants', { name: 'Clube Aurora', number: '10210', template: 'sx-agenda-torneios' })).tenant;
  const clube = (await sx.req('POST', '/api/tenants', { name: 'Clube Suprema Sul', number: '10141', template: 'sx-agenda-torneios' })).tenant;
  const vazioG = (await sg.req('POST', '/api/tenants', { name: 'Loja Ateliê', number: '40210', niche: 'loja' })).tenant;
  const parceiro = (await sg.req('POST', '/api/tenants', { name: 'Agenda Fácil', number: '30141', niche: 'saas', template: 'saas-trial-demo' })).tenant;

  async function elenco(c, t) {
    const s = (await c.req('GET', `/api/t/${t.slug}/ugc`)).sugestoes.fichas;
    for (const f of s) {
      const real = f.formato !== 'ia';
      await c.req('POST', `/api/t/${t.slug}/ugc/personas`, { ...f, status: 'ativo', ...(real ? { pessoa: t.niche === 'poker' ? 'Marcos (agente)' : 'Renata (fundadora)', autorizacao: true } : {}) });
    }
    await c.req('POST', `/api/t/${t.slug}/ugc/pauta/propor`, {});
    const e = await c.req('GET', `/api/t/${t.slug}/ugc`);
    return e;
  }
  for (const [c, t] of [[sx, clube], [sg, parceiro]]) {
    const e = await elenco(c, t);
    const poker = t.niche === 'poker';
    const rod = poker ? '\n\n+18 · Jogue com responsabilidade.' : '';
    const porRede = (r) => e.elenco.find((p) => p.rede === r);
    const pautasDe = (r) => e.pautas.filter((p) => p.persona_id === porRede(r).id);
    // 1) peça publicada e medida (Instagram)
    let x = (await c.req('POST', `/api/t/${t.slug}/ugc/pautas/${pautasDe('instagram')[0].id}/modelo`)).peca;
    await c.req('PATCH', `/api/t/${t.slug}/ugc/pecas/${x.id}`, { roteiro: '[0 a 3 s] Abre com a mesa pronta.\n[3 a 20 s] Mostra o horário e o formato.\n[fechamento] Link na bio.',
      legenda: (poker ? 'Hoje tem torneio às 20h. Já separou o horário?' : 'Três atalhos que poupam a sua segunda-feira.') + rod + '\n\nConteúdo feito com IA.', briefing: 'Cartões com texto grande.', capa: poker ? 'Torneio de hoje' : 'Três atalhos' });
    await c.req('POST', `/api/t/${t.slug}/ugc/pecas/${x.id}/aprovar`);
    await c.req('POST', `/api/t/${t.slug}/ugc/pecas/${x.id}/publicada`, { post_url: 'https://www.instagram.com/reel/exemplo123/' });
    await c.req('POST', `/api/t/${t.slug}/ugc/pecas/${x.id}/medir`, { views: poker ? 2840 : 1310 });
    // cliques e leads de verdade pelo link do influenciador
    const link = new URL((await c.req('GET', `/api/t/${t.slug}/ugc`)).pecas.find((y) => y.id === x.id).link);
    const site = (await c.req('GET', `/api/t/${t.slug}/sites`)).sites[0];
    for (let i = 0; i < (poker ? 9 : 5); i++) {
      const v = cliente(poker ? X : G);
      await v.req('GET', link.pathname + link.search);
      if (site && i < (poker ? 3 : 2)) await v.req('POST', `/f/${site.id}`, `email=visitante${i}%40exemplo.com&consent=1&page=`, { 'Content-Type': 'application/x-www-form-urlencoded' });
    }
    const yt = porRede('youtube');
    const linkYt = new URL(yt.link);
    for (let i = 0; i < (poker ? 4 : 2); i++) await cliente(poker ? X : G).req('GET', linkYt.pathname + linkYt.search);
    // 2) peça aprovada (YouTube) e 3) rascunhos: um ok, um bloqueado pelo preflight
    x = (await c.req('POST', `/api/t/${t.slug}/ugc/pautas/${pautasDe('youtube')[1].id}/modelo`)).peca;
    await c.req('PATCH', `/api/t/${t.slug}/ugc/pecas/${x.id}`, { roteiro: '[0 a 3 s] Pergunta direta.\n[3 a 40 s] Explicação com um exemplo.\n[fechamento] Link na bio.',
      legenda: (poker ? 'Buy-in, rebuy e add-on: a diferença em 40 segundos.' : 'O erro mais comum de quem começa a usar agenda online.') + rod, briefing: 'Vertical, peito para cima.', capa: poker ? 'Buy-in explicado' : 'Erro comum' });
    await c.req('POST', `/api/t/${t.slug}/ugc/pecas/${x.id}/aprovar`);
    x = (await c.req('POST', `/api/t/${t.slug}/ugc/pautas/${pautasDe('tiktok')[2].id}/modelo`)).peca;
    await c.req('PATCH', `/api/t/${t.slug}/ugc/pecas/${x.id}`, { roteiro: '[0 a 3 s] POV na tela.\n[3 a 30 s] Reação.', legenda: poker ? 'Ganhe fichas grátis no cadastro! Renda extra garantida.' : 'Ganhe dinheiro com o nosso app, resultado garantido.',
      briefing: 'Avatar de IA reagindo.', capa: poker ? 'Fold ou call?' : 'POV' });
    await c.req('POST', `/api/t/${t.slug}/ugc/pautas/${pautasDe('tiktok')[3].id}/modelo`);
  }
  // sessão do superadmin para o navegador (banco temporário)
  const admin = db.prepare('SELECT id FROM users WHERE is_super = 1').get();
  // chave de API falsa e já "válida" só no clube com elenco, para fotografar o custo antes de gerar (nenhuma chamada é feita)
  scoped(db, clube.id).insert('ai_keys', { user_id: admin.id, provider: 'anthropic', secret: vault('fotos-ugc').seal('sk-ant-fotos-falsa-0000000000000000'), model: null, status: 'valida' });
  return { vazioSx, clube, vazioG, parceiro, sessao: createSession(db, admin.id) };
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-ugc-db-'));
  const db = openDb(path.join(dados, 'portal.db'));
  createUser(db, { email: 'super@fotos.local', name: 'Superadministrador', password: SENHA, isSuper: true });
  const [PG, PS, CDP] = [await portaLivre(), await portaLivre(), await portaLivre()];
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...process.env, PORTAL_PORT: `${PG}:geral,${PS}:sx`, PORTAL_DATA_DIR: dados, PORTAL_EDITION: 'geral',
    PORTAL_HOST: '127.0.0.1', PORTAL_SECRET_KEY: 'fotos-ugc', PORTAL_ORIGIN: `http://127.0.0.1:${PG}` }, stdio: 'ignore', windowsHide: true });
  filhos.push(srv);
  const G = `http://127.0.0.1:${PG}`; const X = `http://127.0.0.1:${PS}`;
  await esperar(`${G}/healthz`);
  const s = await semear(G, X, db);
  db.close();

  const exe = BROWSERS.find((b) => fs.existsSync(b));
  if (!exe) throw new Error('nem Edge nem Chrome instalados');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-ugc-nav-'));
  const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-prefers-reduced-motion', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  filhos.push(br);
  await esperar(`http://127.0.0.1:${CDP}/json/version`);
  const alvo = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const pg = new Pagina(ws);
  await pg.send('Page.enable'); await pg.send('Network.enable'); await pg.send('Runtime.enable');
  await pg.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: process.env.FOTOS_TEMA || 'light' }] });
  for (const port of [PG, PS]) await pg.send('Network.setCookie', { name: 'pa_sess', value: s.sessao.token, url: `http://127.0.0.1:${port}/`, httpOnly: true });

  const fotos = [];
  const checagens = {};
  const clicar = async (sel) => { await pg.js(`document.querySelector(${JSON.stringify(sel)})?.click()`); await sleep(700); };
  const cena = async (nome, url, passos = [], { cheia = true } = {}) => {
    for (const [disp, width, mobile] of [['computador', 1440, false], ['celular', 390, true]]) {
      await pg.tela({ width, height: mobile ? 844 : 900, mobile });
      await pg.load(url);
      for (const p of passos) await clicar(p);
      const file = path.join(OUT, `${nome}-${disp}.png`);
      await pg.foto(file, { width, mobile, cheia });
      fotos.push(file);
      if (mobile) checagens[nome] = await pg.checarCelular();
    }
  };
  const ugc = (orig, t) => `${orig}/admin/#/t/${t.slug}/m/ugc`;
  await cena('sx-vazio', ugc(X, s.vazioSx));
  await cena('sx-assistente', ugc(X, s.vazioSx), ['[data-act=wizard]'], { cheia: false });
  await cena('sx-assistente-ficha', ugc(X, s.vazioSx), ['[data-act=wizard]', '[data-w=seguir]'], { cheia: false });
  await cena('sx-pauta', ugc(X, s.clube), ['[data-act=aba][data-v=pauta]']);
  await cena('sx-fila', ugc(X, s.clube), ['[data-act=aba][data-v=fila]', '.peca:nth-of-type(1) .peca-head']);
  await cena('sx-placar', ugc(X, s.clube), ['[data-act=aba][data-v=placar]']);
  await cena('sx-produzir', ugc(X, s.clube), ['[data-act=aba][data-v=pauta]', '[data-act=produzir]'], { cheia: false });
  await cena('geral-vazio', ugc(G, s.vazioG));
  await cena('geral-pauta', ugc(G, s.parceiro), ['[data-act=aba][data-v=pauta]']);
  await cena('geral-fila', ugc(G, s.parceiro), ['[data-act=aba][data-v=fila]', '.peca:nth-of-type(2) .peca-head']);
  await cena('geral-placar', ugc(G, s.parceiro), ['[data-act=aba][data-v=placar]']);
  ws.close();
  console.log(JSON.stringify({ pasta: OUT, fotos: fotos.map((f) => path.basename(f)), checagens }, null, 1));
  fim();
  setTimeout(() => { for (const d of [perfil, dados]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* em uso */ } } process.exit(0); }, 800);
} catch (e) {
  console.log(JSON.stringify({ erro: e.message, pilha: e.stack?.split('\n').slice(0, 4) }));
  fim();
  process.exit(1);
}
