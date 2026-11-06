// Renderiza reel.html quadro a quadro (técnica do tools/imagens/motion/render.mjs do Poker-crypto): o Edge sem janela
// fotografa cada quadro (render(n/30) põe a cena no instante exato), o ffmpeg junta as fotos num MP4 H.264, o audio.py
// gera a batida e os efeitos a partir dos eventos da cena (cartaz colado, carta, corte) e o ffmpeg junta os dois.
//
// Uso (na pasta videos\fonte):
//   node render.mjs <id> <pasta de saída>                    -> <id>.mp4 + <id>-capa.png
//   node render.mjs <id> <pasta de saída> --quadros 1.2,5,9  -> só as fotos desses instantes (para conferir)
// ids: lancamento, tres-passos, holdem-ou-omaha
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const [id, saida, flag, lista] = process.argv.slice(2);
if (!id || !saida) { console.error('uso: node render.mjs <id> <saida> [--quadros t1,t2]'); process.exit(2); }
const CAPA = { 'lancamento': 2.2, 'tres-passos': 2.1, 'holdem-ou-omaha': 2.2 };
const FPS = 30, W = 1080, H = 1920;
const EXE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
mkdirSync(saida, { recursive: true });

function cdp(url) {
  const ws = new WebSocket(url);
  const pend = new Map();
  let n = 0;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    const p = m.id && pend.get(m.id);
    if (!p) return;
    pend.delete(m.id);
    if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`)); else p.res(m.result);
  };
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('não conectou no Edge')); });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++n; pend.set(i, { res, rej, method });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { ready, send, close: () => ws.close() };
}

function abre(perfil) {
  const proc = spawn(EXE, ['--headless=new', `--user-data-dir=${perfil}`, '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1',
    `--window-size=${W},${H}`, '--allow-file-access-from-files', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const url = new Promise((res, rej) => {
    let buf = '';
    const tm = setTimeout(() => rej(new Error('o Edge não abriu em 30 s')), 30000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(tm); res(m[1]); } });
    proc.on('exit', (c) => { clearTimeout(tm); rej(new Error(`o Edge fechou (${c})`)); });
  });
  return { proc, url };
}

function codificador(arq) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', arq],
  { stdio: ['pipe', 'ignore', 'inherit'] });
  const fim = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg saiu com ${c}`)))));
  const escreve = (b) => (ff.stdin.write(b) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r)));
  return { escreve, fecha: () => { ff.stdin.end(); return fim; } };
}

async function main() {
  const perfil = mkdtempSync(join(tmpdir(), 'hotpoker-edge-'));
  const { proc, url } = abre(perfil);
  let nav;
  try {
    nav = cdp(await url); await nav.ready;
    const { targetId } = await nav.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await nav.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => nav.send(m, p, sessionId);
    const ev = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: pathToFileURL(join(AQUI, 'reel.html')).href + '?v=' + id });
    for (let i = 0; ; i++) {
      if (await ev('!!window.pronto && document.readyState === "complete"')) break;
      if (i > 300) throw new Error('reel.html não carregou');
      await new Promise((r) => setTimeout(r, 100));
    }
    await ev('window.pronto');
    const info = await ev('window.INFO');
    const foto = async (t, fmt = 'png') => {
      await ev(`render(${t})`);
      const { data } = await send('Page.captureScreenshot', { format: fmt, optimizeForSpeed: true });
      return Buffer.from(data, 'base64');
    };
    if (flag === '--quadros') {
      for (const t of lista.split(',').map(Number)) {
        writeFileSync(join(saida, `${id}-t${t.toFixed(2)}.png`), await foto(t));
      }
      console.log('ok quadros');
      return;
    }
    const quadros = Math.round(info.dur * FPS);
    const mudo = join(saida, `${id}.sem-som.mp4`);
    const enc = codificador(mudo);
    const t0 = Date.now();
    for (let n = 0; n < quadros; n++) {
      await enc.escreve(await foto(n / FPS));
      if (n % 150 === 0) console.log(`${id}: quadro ${n}/${quadros} (${((Date.now() - t0) / (n + 1)).toFixed(0)} ms cada)`);
    }
    await enc.fecha();
    writeFileSync(join(saida, `${id}-capa.png`), await foto(CAPA[id] ?? 2));
    const evArq = join(saida, `${id}.eventos.json`);
    writeFileSync(evArq, JSON.stringify(info));
    const wav = join(saida, `${id}.wav`);
    const py = spawnSync('python', [join(AQUI, 'audio.py'), evArq, wav], { stdio: 'inherit' });
    if (py.status !== 0) throw new Error('audio.py falhou');
    const fin = join(saida, `${id}.mp4`);
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mudo, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-t', String(info.dur), '-movflags', '+faststart', fin], { stdio: 'inherit' });
    if (ff.status !== 0) throw new Error('ffmpeg (mux) falhou');
    rmSync(mudo); rmSync(wav); rmSync(evArq);
    console.log(`ok ${fin} (${quadros} quadros em ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } finally {
    try { await nav?.send('Browser.close'); } catch { /* fechou */ }
    nav?.close(); proc.kill();
    await new Promise((r) => setTimeout(r, 500));
    rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
main().catch((e) => { console.error('render falhou: ' + e.message); process.exit(1); });
