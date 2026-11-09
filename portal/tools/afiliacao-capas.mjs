// Imagens dos blogs de afiliado (versão 2, 09/11/2026, depois de "todas as capas estão iguais" do Kbsa):
//   - cada post tem uma FOTO PRÓPRIA do assunto, gerada no PC com o Z-Image Turbo (WanGP local, D:\IA\WanGP), guardada em
//     public/assets/afiliacao/<blog>/fotos/<slug>.webp. O descritivo vem de post.capaPrompt, ou de conteudo/afiliacao/capas-prompts.json,
//     ou de um descritivo automático pelo assunto do blog e o título;
//   - produto só aparece se o post fala dele ({{LINK:chave}} ativo no texto), num quadro menor com o rótulo "Publicidade".
//     Nunca a foto de um produto que não está no post;
//   - 4 composições alternadas dentro de cada blog (foto à direita, foto de fundo com faixa, fundo claro com foto à esquerda,
//     foto em cima), nas cores do blog;
//   - capa 1200x630 (<slug>-capa.webp), pôster da Web Story 720x960 (<slug>-story.webp) e logo do blog 192x192 (logo.webp);
//   - conferência no fim: REPROVA (código de saída 1) se um post ficar sem foto própria ou se duas capas do mesmo blog usarem
//     a mesma foto (mesmo hash).
// Uso: node tools/afiliacao-capas.mjs [--blog <slug>] [--refazer] [--refazer-fotos] [--sem-gerar] [--sem-json]
//   --refazer        redesenha capas e pôsteres (as fotos ficam)
//   --refazer-fotos  gera as fotos de novo (cuidado: ~18 s por foto na GPU)
//   --sem-gerar      não chama o WanGP (só desenha com as fotos que já existem)
// Precisa do Chrome (sem tela) e do ffmpeg no PATH. A GPU fica livre das 02:50 às 04:45 (rotina de vídeo da madrugada).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PESO_UNICO } from './afiliacao-visual.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEUDO = path.join(ROOT, 'conteudo', 'afiliacao');
const PUBLICO = path.join(ROOT, 'public', 'assets', 'afiliacao');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const REFAZER = ARGS.includes('--refazer') || ARGS.includes('--refazer-fotos');
const REFAZER_FOTOS = ARGS.includes('--refazer-fotos');
const SEM_GERAR = ARGS.includes('--sem-gerar');
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((c) => fs.existsSync(c));
if (!CHROME) throw new Error('Chrome não encontrado (defina CHROME_PATH).');
const WANGP = process.env.WANGP_DIR || 'D:/IA/WanGP';

const lerJson = (f, p) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : p);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catalogo = lerJson(path.join(CONTEUDO, 'produtos.json'), {});
const links = lerJson(path.join(CONTEUDO, 'links.json'), {});
const PROMPTS = lerJson(path.join(CONTEUDO, 'capas-prompts.json'), {});
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-capas-'));
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const semente = (s) => parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0, 7), 16);
// Trava: duas execuções juntas disputam a GPU (8 GB) e geram as mesmas fotos. Trava com mais de 3 h é considerada abandonada.
const TRAVA = path.join(os.tmpdir(), 'afiliacao-capas.trava');
if (fs.existsSync(TRAVA) && Date.now() - fs.statSync(TRAVA).mtimeMs < 3 * 3600_000) {
  console.log(`REPROVADO: outra execução do afiliacao-capas.mjs está rodando (${fs.readFileSync(TRAVA, 'utf8')}); espere ela terminar.`);
  process.exit(1);
}
fs.writeFileSync(TRAVA, `pid ${process.pid} desde ${new Date().toISOString()}`);
process.on('exit', () => { try { if (fs.readFileSync(TRAVA, 'utf8').startsWith(`pid ${process.pid} `)) fs.rmSync(TRAVA); } catch { /* já saiu */ } });

/** Cena padrão por blog, para post novo sem descritivo (o título entra junto; a semente muda por post). */
const CENA = {
  achadinhos: 'small useful gadgets and home accessories arranged on a light table, cardboard parcels', afiliado: 'laptop on a tidy desk with notebook and coffee, soft home office',
  automacao: 'smartphone with blurred chat screen on a shop counter, small business setting', criativos: 'design desk with color swatches, tablet with blurred layout, paper mockups',
  fornecedores: 'wholesale fabric rolls, garment racks and price tags in a stockroom', gamer: 'streaming setup with microphone, RGB keyboard and blurred monitor glow',
  ia: 'modern laptop with abstract blurred interface, notebook and desk plant', manutencao: 'workshop bench with mechanical tools and engine parts',
  milhas: 'boarding pass, passport and airplane window view, travel planning', sublimacao: 'heat press, blank mugs and printed transfer paper on a craft table',
};
const promptDe = (blog, post) => post.capaPrompt || PROMPTS[`${blog}/${post.slug}`]
  || `editorial photography, ${CENA[blog] || 'clean desk still life'}, theme: ${String(post.title).normalize('NFD').replace(/[\u0300-\u036f]/g, '')}, natural light, shallow depth of field, no text, no people`;

/** Foto do produto em webp de 600 px (baixa uma vez). Só produto ativo. */
async function fotoProduto(chave) {
  const c = catalogo[chave];
  if (!c?.img || links[chave]?.status !== 'ativo') return null;
  const destino = path.join(PUBLICO, 'produtos', `${chave}.webp`);
  if (fs.existsSync(destino)) return destino;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const r = await fetch(c.img, { headers: { 'User-Agent': 'Mozilla/5.0 (Portal de Afiliacao)' } }).catch(() => null);
  if (!r?.ok) { console.log(`aviso: foto de ${chave} respondeu ${r?.status}`); return null; }
  const bruto = path.join(TMP, `${chave}.orig`);
  fs.writeFileSync(bruto, Buffer.from(await r.arrayBuffer()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', bruto, '-vf', "scale='min(600,iw)':-2", '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', destino]);
  return destino;
}

/** Gera as fotos que faltam numa chamada só do WanGP (o modelo carrega uma vez). */
function gerarFotos(pedidos) {
  if (!pedidos.length) return;
  const h = new Date().getHours() * 60 + new Date().getMinutes();
  if (h >= 170 && h < 285) throw new Error('02:50-04:45 é da rotina de vídeo da madrugada; rode depois.');
  if (!fs.existsSync(path.join(WANGP, 'app', 'wgp.py'))) throw new Error(`WanGP não encontrado em ${WANGP} (use --sem-gerar para só desenhar).`);
  const dir = path.join(TMP, 'wangp'); fs.mkdirSync(dir, { recursive: true });
  const fila = pedidos.map((p) => ({ model_type: 'z_image', prompt: p.prompt, negative_prompt: 'text, letters, numbers, watermark, logo, brand, people, person, face, hands, money',
    resolution: '1280x720', num_inference_steps: 8, guidance_scale: 0, seed: p.seed }));
  fs.writeFileSync(path.join(dir, 'fila.json'), JSON.stringify(fila, null, 1));
  console.log(`gerando ${fila.length} fotos no WanGP (~${Math.ceil(fila.length * 18 / 60) + 1} min)...`);
  const r = spawnSync(path.join(WANGP, 'venv', 'Scripts', 'python.exe'), ['wgp.py', '--process', path.join(dir, 'fila.json'), '--output-dir', dir, '--attention', 'sage2', '--profile', '4', '--offline'],
    { cwd: path.join(WANGP, 'app'), env: { ...process.env, HF_HOME: path.join(WANGP, '_hfcache'), PYTHONIOENCODING: 'utf-8' }, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, timeout: 6 * 3600_000 });
  if (r.status !== 0) console.log(`aviso: WanGP saiu com ${r.status}: ${String(r.stderr || r.stdout).slice(-400)}`);
  const saidas = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  for (const p of pedidos) {
    const f = saidas.find((x) => x.includes(`_seed${p.seed}_`));
    if (!f) { console.log(`aviso: sem foto gerada para ${p.id}`); continue; }
    fs.mkdirSync(path.dirname(p.destino), { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, f), '-vf', 'scale=960:-2', '-c:v', 'libwebp', '-quality', '74', p.destino]);
  }
}

const fonteCss = (fonte) => `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(fonte).replace(/%20/g, '+')}${PESO_UNICO.has(fonte) ? '' : ':wght@700'}&family=Atkinson+Hyperlegible+Next:wght@700&display=block" rel="stylesheet">`;
const tam = (t, a, b, c) => (t.length > 72 ? a : t.length > 52 ? b : c);
const url = (f) => pathToFileURL(f).href;
/** Quadro do produto citado no post, com o rótulo de publicidade. */
const quadro = (prod, pos) => (prod ? `<div class="pd" style="${pos}"><img src="${url(prod)}" alt=""><span>Publicidade</span></div>` : '');
const BASE = `*{margin:0;box-sizing:border-box}html,body{overflow:hidden}body{font-family:'Atkinson Hyperlegible Next',sans-serif;position:relative}
.ft{background-size:cover;background-position:center}.m{display:flex;align-items:center;gap:14px;font-size:26px;font-weight:700}.m i{width:12px;height:30px;border-radius:2px}
.pd{position:absolute;width:210px;height:210px;background:#fff;border-radius:14px;padding:16px 16px 34px;box-shadow:0 10px 30px rgba(0,0,0,.25);display:grid;place-items:center}
.pd img{max-width:178px;max-height:150px;object-fit:contain;border-radius:6px}.pd span{position:absolute;bottom:9px;left:0;right:0;text-align:center;font-size:15px;font-weight:700;color:#5b6270;letter-spacing:.02em}`;

/** Capa 1200x630 em uma de 4 composições. */
function capaHtml({ layout, titulo, blog, v, foto, prod }) {
  const f = v.fonte || 'Archivo'; const cor = v.cor; const suave = v.suave || '#f3f4f6';
  const h1 = (px, cl) => `<h1 style="font:700 ${px}px/1.06 '${f}',sans-serif;letter-spacing:-.015em;text-wrap:balance;color:${cl}">${esc(titulo)}</h1>`;
  const marca = (cl, barra) => `<div class="m" style="color:${cl}"><i style="background:${barra}"></i>${esc(blog)}</div>`;
  const css = `<style>${BASE}html,body{width:1200px;height:630px}</style>`;
  const bg = `background-image:url('${url(foto)}')`;
  if (layout === 0) return `${css}<body style="display:grid;grid-template-columns:600px 600px;background:${cor}">
<div style="padding:58px 44px 50px 60px;display:flex;flex-direction:column;justify-content:space-between">${h1(tam(titulo, 46, 52, 60), '#fff')}${marca('#fff', '#fff')}</div>
<div class="ft" style="${bg}"></div>${quadro(prod, 'right:34px;bottom:34px')}</body>`;
  if (layout === 1) return `${css}<body class="ft" style="${bg}">
<div style="position:absolute;left:0;right:0;bottom:0;background:${cor};padding:30px 60px 30px;display:flex;flex-direction:column;gap:16px;max-width:${prod ? 900 : 1200}px">${h1(tam(titulo, 40, 44, 50), '#fff')}${marca('#fff', '#fff')}</div>${quadro(prod, 'right:40px;top:40px')}</body>`;
  if (layout === 2) return `${css}<body style="background:${suave};display:grid;grid-template-columns:560px 1fr;gap:48px;padding:44px 60px 44px 44px">
<div class="ft" style="${bg};border-radius:16px"></div><div style="display:flex;flex-direction:column;justify-content:space-between;padding:14px 0">${h1(tam(titulo, 42, 48, 54), '#15171c')}${marca('#15171c', cor)}</div>${quadro(prod, 'left:340px;bottom:30px')}</body>`;
  return `${css}<body style="background:#fff;display:grid;grid-template-rows:350px 1fr">
<div class="ft" style="${bg}"></div><div style="padding:26px 60px 30px;display:flex;flex-direction:column;justify-content:space-between;border-top:10px solid ${cor}">${h1(tam(titulo, 38, 42, 46), '#15171c')}${marca('#5b6270', cor)}</div>${quadro(prod, 'right:44px;top:110px')}</body>`;
}
/** Pôster vertical da Web Story (720x960): foto em cima, título embaixo, margem lateral segura para o recorte 9:16. */
function storyHtml({ titulo, blog, v, foto, prod }) {
  const f = v.fonte || 'Archivo';
  return `<style>${BASE}html,body{width:720px;height:960px}</style><body style="background:${v.cor};color:#fff">
<div class="ft" style="background-image:url('${url(foto)}');height:470px"></div>
<div style="padding:40px 108px 52px;height:490px;display:flex;flex-direction:column;justify-content:space-between">
<h1 style="font:700 ${tam(titulo, 36, 40, 46)}px/1.08 '${f}',sans-serif;text-wrap:balance">${esc(titulo)}</h1><div class="m"><i style="background:#fff"></i>${esc(blog)}</div></div>
${quadro(prod, 'right:108px;top:330px')}</body>`;
}
function logoHtml({ blog, v }) {
  const f = v.fonte || 'Archivo';
  const ini = String(blog).split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return `<style>*{margin:0}html,body{width:192px;height:192px;overflow:hidden}body{background:${v.cor};color:#fff;display:flex;align-items:center;justify-content:center;gap:12px;font:700 78px/1 '${f}',sans-serif}
i{width:12px;height:84px;background:#fff;border-radius:2px}</style><body><i></i>${esc(ini)}</body>`;
}

function fotografar(html, fonte, destino, [w, h], q = 82) {
  const arq = path.join(TMP, `p-${Math.random().toString(36).slice(2)}.html`);
  const png = arq.replace(/\.html$/, '.png');
  fs.writeFileSync(arq, `<!doctype html><html><head><meta charset="utf-8">${fonteCss(fonte)}</head>${html}</html>`);
  execFileSync(CHROME, ['--headless=new', `--user-data-dir=${path.join(TMP, `perfil-${Math.random().toString(36).slice(2)}`)}`, '--disable-gpu',
    '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`, '--virtual-time-budget=12000', `--screenshot=${png}`, url(arq)], { stdio: 'ignore', timeout: 90_000 });
  if (!fs.existsSync(png)) throw new Error(`o Chrome não gravou ${png}`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-quality', String(q), destino]);
}

const blogs = fs.readdirSync(CONTEUDO).filter((d) => fs.existsSync(path.join(CONTEUDO, d, 'site.json')) && (!opt('--blog') || d === opt('--blog'))).sort();
// 1) fotos que faltam, de todos os blogs pedidos, numa leva só
const lista = [];
for (const blog of blogs) {
  const dirPosts = path.join(CONTEUDO, blog, 'posts');
  fs.readdirSync(dirPosts).filter((x) => x.endsWith('.json')).sort().forEach((f, i) => {
    const post = lerJson(path.join(dirPosts, f), null);
    if (post?.slug && post?.title) lista.push({ blog, post, arq: path.join(dirPosts, f), i, foto: path.join(PUBLICO, blog, 'fotos', `${post.slug}.webp`) });
  });
}
const faltam = lista.filter((x) => REFAZER_FOTOS || !fs.existsSync(x.foto))
  .map((x) => ({ id: `${x.blog}/${x.post.slug}`, prompt: promptDe(x.blog, x.post), seed: semente(`${x.blog}/${x.post.slug}`), destino: x.foto }));
if (faltam.length && !SEM_GERAR) gerarFotos(faltam);

// 2) capas, pôsteres e logos
let capas = 0; let json = 0; const erros = [];
for (const blog of blogs) {
  const info = lerJson(path.join(CONTEUDO, blog, 'site.json'), {});
  const v = lerJson(path.join(CONTEUDO, blog, 'vitrine.json'), {});
  const logo = path.join(PUBLICO, blog, 'logo.webp');
  if (REFAZER || !fs.existsSync(logo)) fotografar(logoHtml({ blog: info.nome, v }), v.fonte || 'Archivo', logo, [192, 192], 90);
  const doBlog = lista.filter((x) => x.blog === blog);
  const vistos = new Map();
  for (const x of doBlog) {
    const { post } = x;
    if (!fs.existsSync(x.foto)) { erros.push(`${blog}/${post.slug}: sem foto própria (rode sem --sem-gerar)`); continue; }
    const h = hash(x.foto);
    if (vistos.has(h)) erros.push(`${blog}/${post.slug}: mesma foto de ${vistos.get(h)}`); else vistos.set(h, post.slug);
    const capa = path.join(PUBLICO, blog, `${post.slug}-capa.webp`);
    const story = path.join(PUBLICO, blog, `${post.slug}-story.webp`);
    if (REFAZER || !fs.existsSync(capa) || !fs.existsSync(story)) {
      const chave = [...String(post.content).matchAll(/\{\{LINK:([a-z0-9-]+)\}\}/g)].map((m) => m[1]).find((k) => links[k]?.status === 'ativo');
      const prod = chave ? await fotoProduto(chave) : null;
      const dados = { layout: x.i % 4, titulo: post.title, blog: info.nome, v, foto: x.foto, prod };
      fotografar(capaHtml(dados), v.fonte || 'Archivo', capa, [1200, 630]);
      fotografar(storyHtml(dados), v.fonte || 'Archivo', story, [720, 960], 80);
      capas++;
    }
    if (!ARGS.includes('--sem-json') && !post.cover) {
      const bruto = fs.readFileSync(x.arq, 'utf8');
      fs.writeFileSync(x.arq, JSON.stringify({ ...post, cover: `/assets/afiliacao/${blog}/${post.slug}-capa.webp`, coverAlt: `Capa do guia: ${post.title}` }, null, 2) + (bruto.endsWith('\n') ? '\n' : ''));
      json++;
    }
  }
  console.log(`${blog}: ok (${doBlog.length} posts)`);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`capas e pôsteres desenhados: ${capas} · posts que ganharam "cover": ${json}`);
if (erros.length) { console.log(`REPROVADO (${erros.length}):\n${erros.join('\n')}`); process.exitCode = 1; }
