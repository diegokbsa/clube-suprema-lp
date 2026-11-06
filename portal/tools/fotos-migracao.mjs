// Fotos da trilha "Migrar para o pôquer" (PA-140): /migrar, a fila do superadmin, a aprovação com o seletor de modelos,
// o painel do agente, a página de perguntas (prévia) e o primeiro acesso, no computador e no celular (390 px).
// Banco temporário do zero (não toca no banco de desenvolvimento), portas livres sorteadas, Edge/Chrome sem tela.
// Dados fictícios de exemplo; a sessão do superadmin é criada direto no banco temporário (nenhuma senha é digitada).
//   node portal/tools/fotos-migracao.mjs <pasta-de-saida>   -> imprime JSON { fotos: [{ nome, arquivo, largura }] }
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { createUser, createSession } from '../lib/auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = process.argv[2] || path.join(ROOT, 'relatorios', 'fotos-PA-140');
const PROIBIDAS = new Set([3400, 3401, 3490, 3491]);
const livre = async () => { for (;;) { const p = await new Promise((r, j) => { const s = net.createServer(); s.unref(); s.on('error', j); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); }); if (!PROIBIDAS.has(p)) return p; } };
const [PG, PS, CDP] = [await livre(), await livre(), await livre()];
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return; } catch { /* subindo */ } await sleep(250); }
  throw new Error(`não respondeu: ${url}`);
}

class Pagina {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.events = [];
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } else if (d.method) this.events.push(d.method); }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.wait.set(id, r)); }
  async load(url) { await this.send('Page.navigate', { url: 'about:blank' }); await sleep(150); this.events = []; await this.send('Page.navigate', { url }); /* about:blank antes: mesmo endereço com # recarrega de verdade */ for (let i = 0; i < 60 && !this.events.includes('Page.loadEventFired'); i++) await sleep(200); await sleep(1600); }
  async js(expression) { return (await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value; }
  async tela(width, mobile) { await this.send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 844 : 860, deviceScaleFactor: 1, mobile }); await sleep(400); }
  async foto(file, { width = 1366, mobile = false, max = 6000 } = {}) {
    const height = mobile ? 844 : 860;
    const m = await this.send('Page.getLayoutMetrics');
    const alto = Math.min(max, Math.max(height, Math.ceil(m.result?.cssContentSize?.height || height)));
    // janela da altura da página: o trilho lateral do painel (sticky, 100vh) sai inteiro na foto longa
    await this.send('Emulation.setDeviceMetricsOverride', { width, height: alto, deviceScaleFactor: 1, mobile });
    await sleep(500);
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: alto, scale: 1 } });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
}

const filhos = [];
const fim = () => { for (const c of filhos) { try { c.kill(); } catch { /* já saiu */ } } };
process.on('exit', fim);
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-migracao-'));

try {
  fs.mkdirSync(OUT, { recursive: true });
  // 1. banco temporário: só o superadmin (o seed padrão não roda porque já existe usuário)
  const db = openDb(path.join(dados, 'portal.db'));
  const sup = createUser(db, { email: 'super@fotos.local', name: 'Superadministrador', password: `${randomBytes(12).toString('base64url')}9a`, isSuper: true });
  const sess = createSession(db, sup.id);
  db.close();
  // 2. portal temporário
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...process.env, PORTAL_PORT: `${PG}:geral,${PS}:sx`, PORTAL_DATA_DIR: dados, PORTAL_EDITION: 'geral', PORTAL_HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
  filhos.push(srv);
  await waitHttp(`http://127.0.0.1:${PS}/healthz`);
  const SX = `http://127.0.0.1:${PS}`;
  const api = async (method, p, body) => {
    const r = await fetch(SX + p, { method, headers: { Cookie: `pa_sess=${sess.token}`, 'X-CSRF': sess.csrf, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${JSON.stringify(j)}`);
    return j;
  };
  // 3. candidaturas fictícias pelo próprio formulário
  const exemplos = [
    ['Marina Albuquerque', 'marina.exemplo@email.com', 'instagram', '50k-200k', 'criador', 'humor e futebol'],
    ['Diego Prates', '11 98888-0001', 'telegram', '10k-50k', 'afiliado-bet', 'dicas de futebol'],
    ['Grupo Resenha FC', '21 97777-0002', 'whatsapp', '1k-10k', 'dono-grupo', 'resenha de futebol'],
    ['Paulo Tips', 'paulo.exemplo@email.com', 'tiktok', '10k-50k', 'tipster', 'apostas esportivas'],
    ['Bia Streams', 'bia.exemplo@email.com', 'youtube', '1k-10k', 'criador', 'games e lives'],
    ['Canal Mesa Cheia', '31 96666-0003', 'telegram', 'ate-1k', 'afiliado-bet', 'cassino'],
  ];
  for (const [i, [nome, contato, canal, audiencia, origem, nicho]] of exemplos.entries()) {
    await fetch(`${SX}/migrar`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': `10.9.0.${i + 1}` },
      body: new URLSearchParams({ nome, contato, canal, audiencia, origem, nicho, maior18: '1', consentimento: '1' }).toString() });
  }
  const fila = await api('GET', '/api/admin/migracao?status=nova');
  const marina = fila.candidaturas.find((c) => c.nome.startsWith('Marina'));
  const canalMesa = fila.candidaturas.find((c) => c.nome.startsWith('Canal Mesa'));
  const ap = await api('POST', `/api/admin/migracao/${marina.id}/aprovar`, { nome: 'Clube Marina', numero: '20001', codigoAgente: 'ag-marina', email: 'marina.exemplo@email.com', modelo: 'sx-rack-clube' });
  await api('POST', `/api/admin/migracao/${canalMesa.id}/recusar`, { motivo: 'Canal só de cassino; pedir conteúdo educativo antes.' });
  const t = await api('GET', '/api/t/clube-20001/migracao');
  // 4. navegador sem tela
  const exe = BROWSERS.find((b) => fs.existsSync(b));
  if (!exe) throw new Error('nem Edge nem Chrome instalados');
  const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(dados, 'perfil')}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  filhos.push(br);
  await waitHttp(`http://127.0.0.1:${CDP}/json/version`);
  const alvo = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const pg = new Pagina(ws);
  await pg.send('Page.enable');
  await pg.send('Network.enable');
  await pg.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  const fotos = [];
  const tirar = async (nome, url, { antes } = {}) => {
    for (const [sufixo, width, mobile] of [['computador', 1366, false], ['celular', 390, true]]) {
      await pg.tela(width, mobile);
      if (url) await pg.load(url);
      if (antes) { await pg.js(antes); await sleep(1500); }
      const largura = await pg.js('document.documentElement.scrollWidth');
      fotos.push({ nome: `${nome} (${sufixo})`, arquivo: await pg.foto(path.join(OUT, `${nome}-${sufixo}.jpg`), { width, mobile }), largura });
    }
  };
  // página pública: sem sessão
  await tirar('migrar', `${SX}/migrar`);
  await tirar('migrar-erros', `${SX}/migrar`, { antes: "document.querySelector('form.ficha').submit()" });
  await tirar('migrar-enviado', `${SX}/migrar?enviado=1`);
  await tirar('primeiro-acesso', `${SX}${new URL(ap.link).pathname}`);
  // painel: sessão do superadmin do banco temporário
  await pg.send('Network.setCookie', { name: 'pa_sess', value: sess.token, url: `${SX}/`, httpOnly: true });
  await tirar('fila', `${SX}/admin/#/migracao`);
  await tirar('fila-aprovar', `${SX}/admin/#/migracao`, { antes: "document.querySelector('[data-analisar]').click(); document.querySelector('.mg-painel input[name=modelo]').click(); document.querySelector('.mg-cand.aberta').scrollIntoView()" });
  await tirar('fila-aprovadas', `${SX}/admin/#/migracao?status=aprovada`);
  await tirar('agente', `${SX}/admin/#/t/clube-20001/m/migracao`);
  await tirar('perguntas-previa', `${SX}/api/t/clube-20001/pages/${t.perguntas.pageId}/preview`);
  ws.close();
  console.log(JSON.stringify({ fotos }));
  fim();
  setTimeout(() => { try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* em uso */ } process.exit(0); }, 1000);
} catch (e) {
  console.log(JSON.stringify({ erro: e.message }));
  fim();
  setTimeout(() => { try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* em uso */ } process.exit(1); }, 800);
}
