// Imagens dos blogs de afiliado, no padrão do suprema.blog: capa 1200x630 de cada post (campo de cor do blog, título na fonte
// do blog, nome do blog e a foto real do produto do guia) e a foto de cada produto ativo em webp de 600 px, servida pelo Portal.
// Uso: node tools/afiliacao-capas.mjs [--blog <slug>] [--refazer] [--sem-json]
//   - produtos: portal/public/assets/afiliacao/produtos/<chave>.webp (baixa a foto do marketplace uma vez)
//   - capas:    portal/public/assets/afiliacao/<blog>/<slug>-capa.webp (cerca de 25 KB; o png do Chrome fica só no temporário)
//   - posts sem "cover" ganham cover/coverAlt apontando para a capa (a não ser com --sem-json)
//   - Web Stories: pôster vertical 720x960 de cada post (<slug>-story.webp) e o logo do blog 192x192 (logo.webp)
// Precisa do Chrome (sem tela) e do ffmpeg no PATH. Não usa imagem gerada por IA: só o título e a foto que a vitrine já usa.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PESO_UNICO } from './afiliacao-visual.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEUDO = path.join(ROOT, 'conteudo', 'afiliacao');
const PUBLICO = path.join(ROOT, 'public', 'assets', 'afiliacao');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const REFAZER = ARGS.includes('--refazer');
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((c) => fs.existsSync(c));
if (!CHROME) throw new Error('Chrome não encontrado (defina CHROME_PATH).');

const lerJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catalogo = lerJson(path.join(CONTEUDO, 'produtos.json'));
const links = lerJson(path.join(CONTEUDO, 'links.json'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-capas-'));

/** Foto do produto em webp de 600 px de largura. Devolve o caminho local ou null. */
async function fotoProduto(chave) {
  const c = catalogo[chave];
  if (!c?.img || links[chave]?.status !== 'ativo') return null;
  const destino = path.join(PUBLICO, 'produtos', `${chave}.webp`);
  if (fs.existsSync(destino) && !REFAZER) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const r = await fetch(c.img, { headers: { 'User-Agent': 'Mozilla/5.0 (Portal de Afiliacao)' } });
  if (!r.ok) { console.log(`aviso: foto de ${chave} respondeu ${r.status}`); return null; }
  const bruto = path.join(TMP, `${chave}.orig`);
  fs.writeFileSync(bruto, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', bruto, '-vf', "scale='min(600,iw)':-2", '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', destino]);
  return destino;
}

function capaHtml({ titulo, blog, cor, fonte, foto }) {
  const familia = encodeURIComponent(fonte).replace(/%20/g, '+');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=${familia}${PESO_UNICO.has(fonte) ? '' : ':wght@700'}&family=Atkinson+Hyperlegible+Next:wght@700&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:1200px;height:630px;overflow:hidden}
body{background:${cor};color:#fff;display:grid;grid-template-columns:${foto ? '690px 1fr' : '1fr'};font-family:'Atkinson Hyperlegible Next',sans-serif}
.t{padding:60px 44px 52px 64px;display:flex;flex-direction:column;justify-content:space-between}
h1{font:700 ${titulo.length > 72 ? 48 : titulo.length > 52 ? 54 : 62}px/1.06 '${fonte}',sans-serif;letter-spacing:-.015em;text-wrap:balance}
.m{display:flex;align-items:center;gap:14px;font-size:26px}.m i{width:12px;height:30px;background:#fff;border-radius:2px}
.f{background:#fff;margin:48px 48px 48px 0;border-radius:14px;display:grid;place-items:center;padding:28px}
.f img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}</style></head>
<body><div class="t"><h1>${esc(titulo)}</h1><div class="m"><i></i>${esc(blog)}</div></div>${foto ? `<div class="f"><img src="${pathToFileURL(foto).href}" alt=""></div>` : ''}</body></html>`;
}

/** Pôster vertical da Web Story (720x960, proporção 3:4 que o Google pede): foto do produto em cima, título e blog embaixo. */
function storyHtml({ titulo, blog, cor, fonte, foto }) {
  const familia = encodeURIComponent(fonte).replace(/%20/g, '+');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=${familia}${PESO_UNICO.has(fonte) ? '' : ':wght@700'}&family=Atkinson+Hyperlegible+Next:wght@700&display=block" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:720px;height:960px;overflow:hidden}
body{background:${cor};color:#fff;display:flex;flex-direction:column;font-family:'Atkinson Hyperlegible Next',sans-serif;padding:48px}
.f{background:#fff;border-radius:16px;height:420px;display:grid;place-items:center;padding:28px;margin-bottom:44px}
.f img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px}
h1{font:700 ${titulo.length > 72 ? 46 : titulo.length > 52 ? 52 : 60}px/1.06 '${fonte}',sans-serif;letter-spacing:-.015em;text-wrap:balance;flex:1}
.m{display:flex;align-items:center;gap:14px;font-size:28px}.m i{width:12px;height:32px;background:#fff;border-radius:2px}</style></head>
<body>${foto ? `<div class="f"><img src="${pathToFileURL(foto).href}" alt=""></div>` : ''}<h1>${esc(titulo)}</h1><div class="m"><i></i>${esc(blog)}</div></body></html>`;
}
/** Logo do blog para o publisher da Web Story: quadrado na cor do blog com a barra da marca e as iniciais. */
function logoHtml({ blog, cor, fonte }) {
  const familia = encodeURIComponent(fonte).replace(/%20/g, '+');
  const ini = String(blog).split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=${familia}${PESO_UNICO.has(fonte) ? '' : ':wght@700'}&display=block" rel="stylesheet">
<style>*{margin:0}html,body{width:192px;height:192px;overflow:hidden}body{background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;font:700 78px/1 '${fonte}',sans-serif}
i{width:12px;height:84px;background:#fff;border-radius:2px}</style></head><body><i></i>${esc(ini)}</body></html>`;
}

function fotografar(html, png, [w, h] = [1200, 630]) {
  const arq = path.join(TMP, `capa-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(arq, html);
  execFileSync(CHROME, ['--headless=new', `--user-data-dir=${path.join(TMP, `perfil-${Math.random().toString(36).slice(2)}`)}`, '--disable-gpu',
    '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`, '--virtual-time-budget=12000', `--screenshot=${png}`, pathToFileURL(arq).href], { stdio: 'ignore', timeout: 90_000 });
  if (!fs.existsSync(png)) throw new Error(`o Chrome não gravou ${png}`);
}

const blogs = fs.readdirSync(CONTEUDO).filter((d) => fs.existsSync(path.join(CONTEUDO, d, 'site.json')) && (!opt('--blog') || d === opt('--blog')));
let feitas = 0; let json = 0; let stories = 0;
for (const blog of blogs) {
  const info = lerJson(path.join(CONTEUDO, blog, 'site.json'));
  const v = lerJson(path.join(CONTEUDO, blog, 'vitrine.json'));
  const dirPosts = path.join(CONTEUDO, blog, 'posts');
  const logo = path.join(PUBLICO, blog, 'logo.webp');
  if (REFAZER || !fs.existsSync(logo)) {
    const png = path.join(TMP, `${blog}-logo.png`);
    fs.mkdirSync(path.dirname(logo), { recursive: true });
    fotografar(logoHtml({ blog: info.nome, cor: v.cor, fonte: v.fonte || 'Archivo' }), png, [192, 192]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '90', logo]);
  }
  for (const f of fs.readdirSync(dirPosts).filter((x) => x.endsWith('.json')).sort()) {
    const arqPost = path.join(dirPosts, f);
    const post = lerJson(arqPost);
    if (!post?.slug || !post?.title) continue;
    const webp = path.join(PUBLICO, blog, `${post.slug}-capa.webp`);
    const png = path.join(TMP, `${blog}-${post.slug}-capa.png`);
    const story = path.join(PUBLICO, blog, `${post.slug}-story.webp`);
    const precisaCapa = REFAZER || !fs.existsSync(webp);
    const precisaStory = REFAZER || !fs.existsSync(story);
    let foto = null;
    if (precisaCapa || precisaStory) {
      const chaves = [...String(post.content).matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]).concat(v.destaques || []);
      for (const k of chaves) { foto = await fotoProduto(k); if (foto) break; }
    }
    if (precisaStory) {
      const png2 = path.join(TMP, `${blog}-${post.slug}-story.png`);
      fotografar(storyHtml({ titulo: post.title, blog: info.nome, cor: v.cor, fonte: v.fonte || 'Archivo', foto }), png2, [720, 960]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png2, '-c:v', 'libwebp', '-quality', '80', story]);
      stories++;
    }
    if (precisaCapa) {
      fs.mkdirSync(path.dirname(webp), { recursive: true });
      fotografar(capaHtml({ titulo: post.title, blog: info.nome, cor: v.cor, fonte: v.fonte || 'Archivo', foto }), png);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '82', webp]);
      feitas++;
    }
    if (!ARGS.includes('--sem-json') && !post.cover) {
      const novo = { ...post, cover: `/assets/afiliacao/${blog}/${post.slug}-capa.webp`, coverAlt: `Capa do guia: ${post.title}` };
      const bruto = fs.readFileSync(arqPost, 'utf8');
      fs.writeFileSync(arqPost, JSON.stringify(novo, null, 2) + (bruto.endsWith('\n') ? '\n' : ''));
      json++;
    }
  }
  console.log(`${blog}: ok`);
}
// fotos de todos os produtos ativos (as da vitrine e da tabela também, não só as que entram em capa)
let fotos = 0;
for (const chave of Object.keys(catalogo)) if (await fotoProduto(chave)) fotos++;
console.log(`fotos de produto em webp: ${fotos}`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`capas geradas: ${feitas} · pôsteres de story: ${stories} · posts que ganharam "cover": ${json}`);
