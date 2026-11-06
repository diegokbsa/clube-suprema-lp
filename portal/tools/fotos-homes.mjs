// Fotos da home de cada modelo de site (para mandar no WhatsApp do Kbsa junto com o resumo).
// Monta um banco temporário do zero (não toca no banco de desenvolvimento), cria uma operação de exemplo por modelo,
// publica as páginas, sobe um portal temporário em portas próprias e fotografa a home com o Edge/Chrome sem tela.
//   node portal/tools/fotos-homes.mjs <pasta-de-saida> [--modelos id1,id2] [--celular] [--paginas]
//     --modelos  só esses modelos · --celular  também foto em 390 px (arquivo ...-celular.jpg) · --paginas  também as páginas internas (com --celular, as internas também em 390 px: ...-<pagina>-celular.jpg)
//   imprime JSON { homes: [{ modelo, nome, edicao, arquivo, celular?, paginas? }] }. Portas livres sorteadas: pode rodar vários ao mesmo tempo.
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { createTenant } from '../lib/tenants.mjs';
import { loadTemplates } from '../lib/templates.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ARGS = process.argv.slice(2);
const OUT = ARGS[0] && !ARGS[0].startsWith('--') ? ARGS[0] : path.join(ROOT, 'relatorios', 'fotos');
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? (ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : true) : null; };
const SO = typeof opt('--modelos') === 'string' ? new Set(opt('--modelos').split(',').map((x) => x.trim())) : null;
const CELULAR = Boolean(opt('--celular'));
const PAGINAS = Boolean(opt('--paginas'));
const livre = () => new Promise((r, j) => { const s = net.createServer(); s.unref(); s.on('error', j); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
const [PG, PS, CDP] = [await livre(), await livre(), await livre()];
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// dados de exemplo por nicho (fictícios, só para a foto)
const EXEMPLO = {
  poker: { name: 'Clube 123123', number: '123123', settings: { app: 'Suprema Poker', agentId: '000000', tagline: 'Mesas 24h, fichas na hora e suporte de verdade.' } },
  loja: { name: 'Loja Exemplo', number: '', settings: { coupon: 'BEMVINDO10', tagline: 'Ofertas conferidas todo dia.' } },
  criador: { name: 'Canal Exemplo', number: '', settings: { tagline: 'Conteúdo, comunidade e eventos.' } },
  saas: { name: 'App Exemplo', number: '', settings: { product: 'CRM para clínicas', tagline: 'Teste grátis por 14 dias.' } },
};

async function waitHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return; } catch { /* subindo */ } await sleep(250); }
  throw new Error(`não respondeu: ${url}`);
}

class Pagina {
  constructor(ws) { this.ws = ws; this.id = 0; this.wait = new Map(); this.events = [];
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && this.wait.has(d.id)) { this.wait.get(d.id)(d); this.wait.delete(d.id); } else if (d.method) this.events.push(d.method); }); }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => this.wait.set(id, r)); }
  async load(url) { this.events = []; await this.send('Page.navigate', { url }); for (let i = 0; i < 60 && !this.events.includes('Page.loadEventFired'); i++) await sleep(200); await sleep(1500); }
  async fotoLonga(file, { width = 1366, height = 860, max = 2200, mobile = false } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(300);
    const m = await this.send('Page.getLayoutMetrics');
    const alto = Math.min(max, Math.max(height, Math.ceil(m.result?.cssContentSize?.height || height)));
    const r = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: alto, scale: 1 } });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
}

const filhos = [];
const fim = () => { for (const c of filhos) { try { c.kill(); } catch { /* já saiu */ } } };
process.on('exit', fim);

const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'homes-portal-'));
try {
  fs.mkdirSync(OUT, { recursive: true });
  // 1. banco temporário com uma operação de exemplo por modelo, páginas publicadas
  const db = openDb(path.join(dados, 'portal.db'));
  const modelos = [...loadTemplates().values()].filter((t) => !SO || SO.has(t.id)).sort((a, b) => (a.id.startsWith('sx-') - b.id.startsWith('sx-')) || (a.order - b.order));
  const lista = [];
  for (const t of modelos) {
    const nicho = t.niches.includes('*') ? 'loja' : t.niches[0];
    const ex = EXEMPLO[nicho] || EXEMPLO.loja;
    const edicao = t.id.startsWith('sx-') ? 'sx' : 'geral';
    const { site } = createTenant(db, { ...ex, niche: nicho, slug: `ex-${t.id}`, template: t.id, demo: true, edition: edicao });
    lista.push({ modelo: t.id, nome: t.name, edicao, slug: site.slug, ordem: t.order, paginas: t.pages.map((pg) => pg.slug).filter(Boolean) });
  }
  const agora = new Date().toISOString();
  db.prepare('UPDATE pages SET published = draft, published_at = ?').run(agora);
  db.close();
  // 2. portal temporário sobre esse banco
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { env: { ...process.env, PORTAL_PORT: `${PG}:geral,${PS}:sx`, PORTAL_DATA_DIR: dados, PORTAL_EDITION: 'geral', PORTAL_HOST: '127.0.0.1', PORTAL_ADMIN_EMAIL: '' }, stdio: 'ignore', windowsHide: true });
  filhos.push(srv);
  await waitHttp(`http://127.0.0.1:${PG}/healthz`);
  // 3. navegador sem tela
  const exe = BROWSERS.find((b) => fs.existsSync(b));
  if (!exe) throw new Error('nem Edge nem Chrome instalados');
  const perfil = path.join(dados, 'perfil');
  const br = spawn(exe, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  filhos.push(br);
  await waitHttp(`http://127.0.0.1:${CDP}/json/version`);
  const alvo = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const pg = new Pagina(ws);
  await pg.send('Page.enable');
  const stamp = `${agora.slice(0, 13).replace(/[-T]/g, '')}h`;
  const homes = [];
  for (const h of lista) {
    await pg.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
    await pg.load(`http://127.0.0.1:${h.edicao === 'sx' ? PS : PG}/s/${h.slug}/`);
    const porta = h.edicao === 'sx' ? PS : PG;
    const arquivo = await pg.fotoLonga(path.join(OUT, `home-${h.modelo}-${stamp}.jpg`), { max: SO ? 6000 : 2200 });
    const item = { modelo: h.modelo, nome: h.nome, edicao: h.edicao, arquivo };
    if (PAGINAS) {
      item.paginas = [];
      for (const sl of h.paginas) {
        await pg.load(`http://127.0.0.1:${porta}/s/${h.slug}/${sl}`);
        item.paginas.push(await pg.fotoLonga(path.join(OUT, `home-${h.modelo}-${stamp}-${sl}.jpg`), { max: 5000 }));
      }
    }
    if (CELULAR) {
      const largura = async () => (await pg.send('Runtime.evaluate', { expression: 'document.documentElement.scrollWidth', returnByValue: true })).result?.result?.value;
      await pg.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await pg.load(`http://127.0.0.1:${porta}/s/${h.slug}/`);
      item.celular = await pg.fotoLonga(path.join(OUT, `home-${h.modelo}-${stamp}-celular.jpg`), { width: 390, height: 844, max: 7000, mobile: true });
      item.larguraCelular = await largura();
      // com --paginas, as internas também no celular; larguraCelular passa a ser a maior largura entre todas (390 = sem rolagem lateral)
      if (PAGINAS) {
        item.paginasCelular = [];
        for (const sl of h.paginas) {
          await pg.load(`http://127.0.0.1:${porta}/s/${h.slug}/${sl}`);
          item.paginasCelular.push(await pg.fotoLonga(path.join(OUT, `home-${h.modelo}-${stamp}-${sl}-celular.jpg`), { width: 390, height: 844, max: 7000, mobile: true }));
          item.larguraCelular = Math.max(item.larguraCelular || 0, await largura() || 0);
        }
      }
    }
    homes.push(item);
  }
  ws.close();
  console.log(JSON.stringify({ homes }));
  fim();
  setTimeout(() => { try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* em uso */ } process.exit(0); }, 1000);
} catch (e) {
  console.log(JSON.stringify({ erro: e.message }));
  fim();
  setTimeout(() => { try { fs.rmSync(dados, { recursive: true, force: true }); } catch { /* em uso */ } process.exit(1); }, 800);
}
