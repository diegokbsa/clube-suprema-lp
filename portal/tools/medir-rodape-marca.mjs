// Mede viewBox e textLength dos rodapés usando as fontes WOFF2 locais em Chrome.
// Rode: node portal/tools/medir-rodape-marca.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { FONTES, TEMAS } from './afiliacao-temas.mjs';
import { RODAPES_AFILIADOS } from './afiliacao-rodapes.mjs';

const raizes = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.PORTAL_CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!fs.existsSync(chrome)) throw new Error(`Chrome não encontrado em ${chrome}. Defina PORTAL_CHROME_EXE.`);

const fontes = Object.entries(RODAPES_AFILIADOS).map(([blog, item]) => {
  const tema = TEMAS[blog];
  if (!tema) throw new Error(`Tema ausente para ${blog}.`);
  const fonte = FONTES[tema.fonte];
  if (!fonte) throw new Error(`Fonte ausente para ${blog}.`);
  const arquivo = path.join(raizes, 'public', 'assets', 'fontes', `${tema.fonte}.woff2`);
  if (!fs.existsSync(arquivo)) throw new Error(`Arquivo da fonte ausente: ${arquivo}`);
  return { blog, texto: item.marca, familia: fonte.familia, peso: fonte.titulo, arquivo };
});

const faces = [...new Map(fontes.map((f) => [f.familia, f])).values()]
  .map((f) => `@font-face{font-family:${JSON.stringify(f.familia)};src:url(${JSON.stringify(pathToFileURL(f.arquivo).href)});font-weight:${FONTES[TEMAS[f.blog].fonte].pesos}}`)
  .join('\n');
const textos = fontes.map((f, i) => `<svg><text id="marca-${i}" style="font-family:'${f.familia}';font-weight:${f.peso};font-size:100px;letter-spacing:-4.5px" x="0" y="100">${f.texto}</text></svg>`).join('\n');
const html = `<!doctype html><meta charset="utf-8"><style>${faces}body{margin:0}svg{position:absolute;left:-10000px}text{white-space:pre}</style>${textos}<canvas id="medida"></canvas><pre id="saida"></pre><script>
(async()=>{const fontes=${JSON.stringify(fontes.map(({ blog, texto, familia, peso }) => ({ blog, texto, familia, peso })))};await Promise.all(fontes.map(f=>document.fonts.load(f.peso+' 100px '+JSON.stringify(f.familia),f.texto)));await document.fonts.ready;const ctx=document.querySelector('#medida').getContext('2d');const n=x=>Number(x.toFixed(1));const saida=fontes.map((f,i)=>{const el=document.querySelector('#marca-'+i);if(!document.fonts.check(f.peso+' 100px '+JSON.stringify(f.familia),f.texto))throw new Error('Fonte não carregada: '+f.blog);const comprimento=el.getComputedTextLength();const c=document.createElement('canvas');c.width=400;c.height=240;const g=c.getContext('2d');g.scale(2,2);g.font=f.peso+' 100px '+JSON.stringify(f.familia);g.fillText(f.texto[0],0,120);const pixels=g.getImageData(0,0,c.width,c.height).data;let minX=c.width;for(let y=0;y<c.height;y++)for(let x=0;x<minX;x++)if(pixels[(y*c.width+x)*4+3]>0){minX=x;break}const respiro=minX===c.width?0:minX/2;ctx.font=f.peso+' 100px '+JSON.stringify(f.familia);const altura=ctx.measureText('H').actualBoundingBoxAscent;return{blog:f.blog,texto:f.texto,viewBox:n(respiro)+' 0 '+n(comprimento-respiro)+' '+n(altura),larguraTexto:n(comprimento),altura:n(altura),respiro:n(respiro)}});document.querySelector('#saida').textContent=JSON.stringify(saida);document.documentElement.dataset.pronto='sim'})().catch(e=>{document.querySelector('#saida').textContent=JSON.stringify({erro:String(e)});document.documentElement.dataset.pronto='erro'});
</script>`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-rodape-medida-'));
try {
  const arquivoHtml = path.join(dir, 'medir.html');
  fs.writeFileSync(arquivoHtml, html, 'utf8');
  const resultado = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--virtual-time-budget=5000', '--window-size=1200,800', '--dump-dom',
    `--user-data-dir=${path.join(dir, 'perfil')}`, pathToFileURL(arquivoHtml).href,
  ], { encoding: 'utf8', timeout: 45000, windowsHide: true });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error((resultado.stderr || resultado.stdout || `Chrome saiu com código ${resultado.status}`).trim());
  const htmlSaida = resultado.stdout.match(/<pre id="saida">([^<]*)<\/pre>/)?.[1];
  if (!htmlSaida) throw new Error('Chrome não devolveu as medidas SVG.');
  const dados = JSON.parse(htmlSaida.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  if (!Array.isArray(dados)) throw new Error(dados.erro || 'Falha ao medir as marcas.');
  process.stdout.write(`${JSON.stringify(dados, null, 2)}\n`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
