// Renderiza tools/imagens/motion/cena.html quadro a quadro: o Chrome sem janela fotografa cada quadro (seek(n) põe a
// cena no instante n/fps, sem relógio nem sorteio) e o ffmpeg junta as fotos num MP4 sem som. As falas entram depois,
// no short_post.py. Sem dependências: usa o Chrome (ou o Edge) instalado e o WebSocket do próprio Node.
//
// Uso: node tools/imagens/motion/render.mjs <timeline.json> <saida.mp4>
// O timeline.json sai do short_post.py (fps, w, h, frames, fonte, tipo, rodape e as cenas com ini/dur em segundos).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [timelinePath, outPath] = process.argv.slice(2);
if (!timelinePath || !outPath) {
  console.error('uso: node render.mjs <timeline.json> <saida.mp4>');
  process.exit(2);
}
const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const { fps, w, h, frames } = timeline;
const HTML = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'cena.html')).href;
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function cdp(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`));
    else p.res(m.result);
  };
  const ready = new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('não conectou no Chrome'));
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej, method });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { ready, send, close: () => ws.close() };
}

// O endereço do DevTools aparece no stderr do Chrome ("DevTools listening on ws://...").
function launch(exe, profile) {
  const proc = spawn(exe, [
    '--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
    '--force-device-scale-factor=1', `--window-size=${w},${h}`, '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = new Promise((res, rej) => {
    let buf = '';
    const timer = setTimeout(() => rej(new Error('o Chrome não abriu em 30 s')), 30_000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); rej(new Error(`o Chrome fechou (código ${code})`)); });
  });
  return { proc, url };
}

function encoder() {
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-movflags', '+faststart', outPath,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg saiu com ${c}`)))));
  const write = (buf) => (ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r)));
  return { write, end: () => { ff.stdin.end(); return done; } };
}

async function main() {
  const exe = BROWSERS.find((p) => p && existsSync(p));
  if (!exe) throw new Error('Chrome/Edge não encontrado (defina CHROME_PATH)');
  const profile = mkdtempSync(join(tmpdir(), 'motion-chrome-'));
  const { proc, url } = launch(exe, profile);
  let browser;
  try {
    browser = cdp(await url);
    await browser.ready;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => browser.send(m, p, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: HTML });
    for (let i = 0; (await evaluate('document.readyState')) !== 'complete'; i++) {
      if (i > 300) throw new Error('cena.html não carregou');
      await new Promise((r) => setTimeout(r, 100));
    }
    await evaluate(`init(${JSON.stringify(timeline)})`);
    const enc = encoder();
    const t0 = Date.now();
    let next = 0.1;
    for (let n = 0; n < frames; n++) {
      await evaluate(`seek(${n})`);
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true });
      await enc.write(Buffer.from(data, 'base64'));
      if ((n + 1) / frames >= next) {
        console.log(`quadros ${n + 1}/${frames} (${((Date.now() - t0) / (n + 1)).toFixed(0)} ms cada)`);
        next += 0.1;
      }
    }
    await enc.end();
    console.log(`ok ${frames} quadros em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } finally {
    try { await browser?.send('Browser.close'); } catch { /* já fechou */ }
    browser?.close();
    proc.kill();
    await new Promise((r) => setTimeout(r, 500));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch((err) => {
  console.error(`render falhou: ${err.message}`);
  process.exit(1);
});
