// Captura, em Chrome e com as fontes locais do Portal, o rodapé renderizado dos dez blogs.
// Uso: node portal/tools/capturar-rodapes.mjs <pasta-de-entrega>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderLista } from './afiliacao-visual.mjs';
import { RODAPES_AFILIADOS } from './afiliacao-rodapes.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLICO = path.join(RAIZ, 'public');
const CONTEUDO = path.join(RAIZ, 'conteudo', 'afiliacao');
const DESTINO = process.argv[2];
const CHROME = process.env.PORTAL_CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!DESTINO) throw new Error('Informe a pasta de entrega das capturas.');
if (!fs.existsSync(CHROME)) throw new Error(`Chrome não encontrado em ${CHROME}. Defina PORTAL_CHROME_EXE.`);
if (fs.existsSync(DESTINO) && fs.readdirSync(DESTINO).length) throw new Error(`A pasta de entrega não está vazia: ${DESTINO}`);

const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const blogs = fs.readdirSync(CONTEUDO).filter((slug) => fs.existsSync(path.join(CONTEUDO, slug, 'vitrine.json'))).sort();
if (blogs.length !== 10 || blogs.some((slug) => !RODAPES_AFILIADOS[slug])) throw new Error(`Esperados 10 blogs com rodapé; encontrei: ${blogs.join(', ')}`);
fs.mkdirSync(DESTINO, { recursive: true });
const fontBase = pathToFileURL(path.join(PUBLICO, 'assets', 'fontes') + path.sep).href;
const raizTemp = path.resolve(os.tmpdir());
const perfis = fs.mkdtempSync(path.join(raizTemp, 'portal-rodapes-chrome-'));
const registros = [];

function captura(arquivo, largura, altura, perfil) {
  const resultado = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${largura},${altura}`, '--virtual-time-budget=5000',
    `--user-data-dir=${path.join(perfis, perfil)}`, `--screenshot=${arquivo}`, pathToFileURL(arquivo.replace(/\.png$/i, '.html')).href,
  ], { encoding: 'utf8', timeout: 45000, windowsHide: true });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0 || !fs.existsSync(arquivo)) {
    throw new Error(`Chrome falhou em ${path.basename(arquivo)}: ${(resultado.stderr || resultado.stdout || `código ${resultado.status}`).trim()}`);
  }
}

function htmlMosaico(modo, largura, itens) {
  const coluna = largura === 390 ? 3 : 3;
  const cards = itens.map(({ nome, imagem }) => `<article><h2>${nome}</h2><a href="${pathToFileURL(imagem).href}"><img src="${pathToFileURL(imagem).href}" alt="Rodapé ${nome}"></a></article>`).join('\n');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mosaico ${modo} · ${largura}px</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#f1f0ec;color:#1b1f23;font:16px/1.4 system-ui,sans-serif}h1{font-size:24px;margin:0 0 16px}main{display:grid;grid-template-columns:repeat(${coluna},minmax(0,1fr));gap:16px}article{min-width:0;background:#fff;padding:10px;border:1px solid #d6dbd3}h2{font-size:14px;margin:0 0 8px}img{display:block;width:100%;height:auto}</style><h1>Rodapés ${modo} · ${largura}px — dez blogs do Portal</h1><main>${cards}</main></html>`;
}

try {
  for (const modo of ['claro', 'escuro']) {
    const itens = [];
    for (const slug of blogs) {
      const pasta = path.join(CONTEUDO, slug);
      const info = lerJson(path.join(pasta, 'site.json'));
      const v = lerJson(path.join(pasta, 'vitrine.json'));
      const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
        .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
      const origem = renderLista({ info, v, posts, prefixo: `https://kbsa.app/${slug}` });
      const cssOriginal = origem.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
      const footer = origem.match(/<footer class="rodE[^>]*>[\s\S]*?<\/footer>/i)?.[0];
      if (!cssOriginal || !footer) throw new Error(`${slug}: a página não contém CSS ou o rodapé esperado.`);
      const cssLocal = cssOriginal.replace(/url\((["']?)\/assets\/fontes\/([^)'" ]+)\1\)/g, (_m, _aspas, arquivo) => `url(${fontBase}${arquivo})`);
      const nome = info.nome || slug;
      for (const largura of [390, 1440]) {
        const altura = largura === 390 ? 900 : 720;
        const arquivoHtml = path.join(DESTINO, `${modo}-${slug}-${largura}.html`);
        const arquivoPng = arquivoHtml.replace(/\.html$/i, '.png');
        const documento = `<!doctype html><html lang="pt-BR" data-tema="${modo}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nome} · ${modo} · ${largura}px</title><style>${cssLocal}</style><style>html,body{margin:0;min-width:0}body{padding:0;background:var(--a)}footer{display:block!important}</style></head><body>${footer}</body></html>`;
        fs.writeFileSync(arquivoHtml, documento, 'utf8');
        captura(arquivoPng, largura, altura, `${modo}-${slug}-${largura}`);
        itens.push({ nome, imagem: arquivoPng });
        registros.push({ blog: slug, nome, modo, largura, html: arquivoHtml, png: arquivoPng });
      }
    }
    for (const largura of [390, 1440]) {
      const html = path.join(DESTINO, `mosaico-${modo}-${largura}.html`);
      const png = html.replace(/\.html$/i, '.png');
      fs.writeFileSync(html, htmlMosaico(modo, largura, itens.filter((x) => path.basename(x.imagem).endsWith(`-${largura}.png`))), 'utf8');
      captura(png, largura === 390 ? 1200 : 1500, largura === 390 ? 4100 : 1900, `mosaico-${modo}-${largura}`);
      registros.push({ mosaico: modo, largura, html, png });
    }
  }
  fs.writeFileSync(path.join(DESTINO, 'capturas.json'), `${JSON.stringify(registros, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ blogs: blogs.length, capturas: registros.filter((x) => x.png && !x.mosaico).length, mosaicos: registros.filter((x) => x.mosaico).map((x) => x.png) }, null, 2)}\n`);
} finally {
  const pastaPerfis = path.resolve(perfis);
  if (!pastaPerfis.startsWith(`${raizTemp}${path.sep}`)) throw new Error(`Pasta temporária fora do diretório esperado: ${pastaPerfis}`);
  fs.rmSync(pastaPerfis, { recursive: true, force: true });
}
