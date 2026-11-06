// Fotos do portal para o resumo de hora em hora: 1 do sistema (site público) e 1 do backoffice (painel).
// Sobe um portal temporário em portas próprias sobre o banco de desenvolvimento deste PC (versão mais nova do código),
// entra no painel com uma sessão criada direto no banco (ambiente local de teste, sem digitar senha) e fotografa
// com o Edge/Chrome sem tela pelo protocolo DevTools. Cada hora mostra uma tela diferente do painel.
//   node portal/tools/fotos.mjs <pasta-de-saida>   -> imprime JSON { sistema, backoffice, telas }
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { createSession } from '../lib/auth.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = process.argv[2] || path.join(ROOT, 'relatorios', 'fotos');
const DATA = process.env.PORTAL_DATA_DIR || path.join(ROOT, 'data');
const PG = 3490; const PS = 3491; const CDP = 9338;
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// telas do backoffice em rodízio (uma por hora)
const TELAS = [
  { nome: 'Visão geral', porta: PS, hash: '#/' },
  { nome: 'Construtor de páginas', porta: PS, hash: (t) => `#/t/${t}/site` },
  { nome: 'Jornadas e teste A/B', porta: PS, hash: (t) => `#/t/${t}/m/jornadas` },
  { nome: 'Clientes (CRM)', porta: PS, hash: (t) => `#/t/${t}/m/clientes` },
  { nome: 'Funil e histórico', porta: PS, hash: (t) => `#/t/${t}/m/crm` },
  { nome: 'Blog', porta: PS, hash: (t) => `#/t/${t}/m/blog` },
  { nome: 'SEO', porta: PS, hash: (t) => `#/t/${t}/seo` },
  { nome: 'Conectar sua IA', porta: PS, hash: (t) => `#/t/${t}/ia` },
  { nome: 'Insights de IA', porta: PS, hash: '#/insights' },
  { nome: 'Base de clientes', porta: PS, hash: '#/clientes' },
  { nome: 'Visão geral (edição Geral)', porta: PG, hash: '#/' },
];

async function waitHttp(url, tries = 40) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return; } catch { /* subindo */ } await sleep(250); }
  throw new Error(`não respondeu: ${url}`);
}

class Pagina {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.events = [];
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } else if (d.method) this.events.push(d.method); }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.wait.set(id, r)); }
  async load(url) { this.events = []; await this.send('Page.navigate', { url }); for (let i = 0; i < 60 && !this.events.includes('Page.loadEventFired'); i++) await sleep(200); await sleep(1800); }
  async foto(file, { width = 1440, height = 900 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
}

const filhos = [];
const fim = () => { for (const c of filhos) { try { c.kill(); } catch { /* já saiu */ } } };
process.on('exit', fim);

try {
  fs.mkdirSync(OUT, { recursive: true });
  // 1. portal temporário (mesmo código e banco de desenvolvimento)
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...process.env, PORTAL_PORT: `${PG}:geral,${PS}:sx`, PORTAL_DATA_DIR: DATA, PORTAL_EDITION: 'geral', PORTAL_HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
  filhos.push(srv);
  await waitHttp(`http://127.0.0.1:${PG}/healthz`);
  // 2. sessão do superadmin local (só neste banco de desenvolvimento)
  const db = openDb(path.join(DATA, 'portal.db'));
  const admin = db.prepare('SELECT id FROM users WHERE is_super = 1 ORDER BY created_at LIMIT 1').get();
  if (!admin) throw new Error('sem superadmin no banco de desenvolvimento');
  const s = createSession(db, admin.id);
  const tenant = db.prepare("SELECT slug FROM tenants WHERE edition = 'sx' AND id IN (SELECT tenant_id FROM sites WHERE external_url IS NULL) ORDER BY created_at DESC LIMIT 1").get()
    || db.prepare('SELECT slug FROM tenants ORDER BY created_at DESC LIMIT 1').get();
  const site = db.prepare("SELECT s.slug FROM sites s JOIN pages p ON p.site_id = s.id WHERE p.published IS NOT NULL AND s.external_url IS NULL ORDER BY p.published_at DESC LIMIT 1").get();
  db.close();
  // 3. navegador sem tela
  const exe = BROWSERS.find((b) => fs.existsSync(b));
  if (!exe) throw new Error('nem Edge nem Chrome instalados');
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-portal-'));
  const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  filhos.push(br);
  await waitHttp(`http://127.0.0.1:${CDP}/json/version`);
  const alvo = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const pg = new Pagina(ws);
  await pg.send('Page.enable');
  await pg.send('Network.enable');
  for (const port of [PG, PS]) await pg.send('Network.setCookie', { name: 'pa_sess', value: s.token, url: `http://127.0.0.1:${port}/`, httpOnly: true });
  const hora = new Date();
  const stamp = `${hora.toISOString().slice(0, 13).replace(/[-T]/g, '')}h`;
  // sistema: site público mais recente
  await pg.load(site ? `http://127.0.0.1:${PS}/s/${site.slug}/` : `http://127.0.0.1:${PS}/admin/`);
  const sistema = await pg.foto(path.join(OUT, `sistema-${stamp}.jpg`), { width: 1366, height: 860 });
  // backoffice: tela da vez
  const tela = TELAS[hora.getHours() % TELAS.length];
  const hash = typeof tela.hash === 'function' ? tela.hash(tenant?.slug || '') : tela.hash;
  await pg.load(`http://127.0.0.1:${tela.porta}/admin/${hash}`);
  const backoffice = await pg.foto(path.join(OUT, `backoffice-${stamp}.jpg`));
  ws.close();
  // limpa fotos com mais de 3 dias
  for (const f of fs.readdirSync(OUT)) { const p = path.join(OUT, f); if (Date.now() - fs.statSync(p).mtimeMs > 3 * 864e5) fs.unlinkSync(p); }
  console.log(JSON.stringify({ sistema, backoffice, tela: tela.nome, site: site?.slug || null }));
  fim();
  setTimeout(() => { try { fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* em uso */ } process.exit(0); }, 800);
} catch (e) {
  console.log(JSON.stringify({ erro: e.message }));
  fim();
  process.exit(1);
}
