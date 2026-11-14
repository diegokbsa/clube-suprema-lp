// Cliente mínimo do Chrome DevTools Protocol, sem dependência externa (WebSocket nativo do Node 22+).
// Existe por um motivo medido: `chrome --headless=new --window-size=390,900 --screenshot` grava um PNG de 390 px,
// mas desenha a página com 500 px (largura mínima da janela) e corta a direita — estouro horizontal que não existe.
// Com `Emulation.setDeviceMetricsOverride` a largura é a pedida, e `captureBeyondViewport` fotografa a página inteira.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CHROME } from './rodape-estudio.mjs';

const espera = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

/** Sobe um Chrome sem tela com porta de depuração e devolve {cdp, fechar}. */
export async function abrirChrome({ timeout = 30000 } = {}) {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome não encontrado em ${CHROME}. Defina PORTAL_CHROME_EXE.`);
  const raizTemp = path.resolve(os.tmpdir());
  const perfil = fs.mkdtempSync(path.join(raizTemp, 'portal-cdp-'));
  const processo = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${perfil}`, '--remote-debugging-port=0', 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  let erroChrome = '';
  processo.stderr.on('data', (d) => { erroChrome += d.toString(); });
  const limite = Date.now() + timeout;
  let endereco = null;
  while (!endereco && Date.now() < limite) {
    const porta = erroChrome.match(/DevTools listening on ws:\/\/([^/]+)\//)?.[1];
    if (porta) endereco = porta;
    else if (processo.exitCode !== null) break;
    else await espera(120);
  }
  if (!endereco) {
    processo.kill('SIGKILL');
    fs.rmSync(perfil, { recursive: true, force: true });
    throw new Error(`Chrome não abriu a porta de depuração em ${timeout} ms: ${erroChrome.slice(-500)}`);
  }
  const versao = await (await fetch(`http://${endereco}/json/version`)).json();
  const cdp = await conectar(versao.webSocketDebuggerUrl);
  const fechar = async () => {
    try { await cdp.fechar(); } catch { /* o navegador já pode ter saído */ }
    processo.kill('SIGKILL');
    const pasta = path.resolve(perfil);
    if (!pasta.startsWith(`${raizTemp}${path.sep}`)) throw new Error(`Perfil fora do temporário: ${pasta}`);
    // O Chrome ainda segura arquivos do perfil por um instante depois do SIGKILL: apagar na hora dá EPERM.
    // Perfil temporário que sobra não estraga entrega nenhuma, então aqui insistimos e seguimos.
    for (let tentativa = 0; tentativa < 8; tentativa += 1) {
      await espera(150 * (tentativa + 1));
      try { fs.rmSync(pasta, { recursive: true, force: true }); return; } catch { /* tenta de novo */ }
    }
    process.emitWarning(`Perfil temporário do Chrome ficou para trás: ${pasta}`);
  };
  return { cdp, fechar, endereco };
}

/** Conexão CDP: envia comandos e espera eventos, com sessões anexadas por alvo. */
export async function conectar(url) {
  const ws = new WebSocket(url);
  const pendentes = new Map();
  const ouvintes = new Set();
  let proximo = 0;
  await new Promise((ok, erro) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', () => erro(new Error(`Não consegui falar com o Chrome em ${url}`)), { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined && pendentes.has(msg.id)) {
      const { ok, erro } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      if (msg.error) erro(new Error(`${msg.error.message} (${msg.error.code})`));
      else ok(msg.result);
    } else if (msg.method) {
      for (const ouvinte of [...ouvintes]) ouvinte(msg);
    }
  });
  const enviar = (method, params = {}, sessionId) => new Promise((ok, erro) => {
    proximo += 1;
    const id = proximo;
    pendentes.set(id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const esperarEvento = (method, sessionId, timeout = 20000) => new Promise((ok, erro) => {
    const relogio = setTimeout(() => { ouvintes.delete(ouvinte); erro(new Error(`Evento ${method} não chegou em ${timeout} ms`)); }, timeout);
    const ouvinte = (msg) => {
      if (msg.method !== method || (sessionId && msg.sessionId !== sessionId)) return;
      clearTimeout(relogio); ouvintes.delete(ouvinte); ok(msg.params);
    };
    ouvintes.add(ouvinte);
  });
  return { enviar, esperarEvento, fechar: () => ws.close() };
}

/**
 * Abre a página em uma aba nova, com a tela emulada na largura pedida, e devolve
 * { png: Buffer, avaliar(expressao) } depois do carregamento e das fontes prontas.
 */
export async function pagina(cdp, { url, largura, altura = 900, escala = 1, celular = false }) {
  const { targetId } = await cdp.enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.enviar('Target.attachToTarget', { targetId, flatten: true });
  const avaliar = async (expressao) => {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true }, sessionId);
    if (r.exceptionDetails) throw new Error(`Erro na página: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const fechar = () => cdp.enviar('Target.closeTarget', { targetId });
  try {
    await cdp.enviar('Page.enable', {}, sessionId);
    await cdp.enviar('Emulation.setDeviceMetricsOverride', {
      width: largura, height: altura, deviceScaleFactor: escala, mobile: celular,
      screenWidth: largura, screenHeight: altura,
    }, sessionId);
    const carregou = cdp.esperarEvento('Page.loadEventFired', sessionId);
    await cdp.enviar('Page.navigate', { url }, sessionId);
    await carregou;
    await avaliar('document.fonts.ready.then(()=>true)');
    return { sessionId, avaliar, fechar, cdp, targetId };
  } catch (e) {
    await fechar().catch(() => {});
    throw e;
  }
}

/** Foto da página inteira (altura do documento), sem o corte da janela. */
export async function fotografar(alvo, { largura, alturaDoc }) {
  const altura = Math.max(1, Math.ceil(alturaDoc));
  await alvo.cdp.enviar('Emulation.setDeviceMetricsOverride', {
    width: largura, height: altura, deviceScaleFactor: 1, mobile: false,
    screenWidth: largura, screenHeight: altura,
  }, alvo.sessionId);
  const { data } = await alvo.cdp.enviar('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: largura, height: altura, scale: 1 },
  }, alvo.sessionId);
  return Buffer.from(data, 'base64');
}
