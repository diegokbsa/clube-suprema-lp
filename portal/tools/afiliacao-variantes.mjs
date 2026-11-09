// Versões menores das imagens dos blogs de afiliado, para o PageSpeed no celular (srcset e miniaturas):
//   - foto de produto (produtos/<chave>.webp, 600 px) → r/produtos/<chave>-160.webp e -400.webp;
//   - capa do post (<blog>/<slug>-capa.webp, 1200x630) → r/<blog>/<slug>-capa-600.webp.
// A original fica intacta; o visual (afiliacao-visual.mjs) só usa a variante que existe no disco.
// Refaz a variante quando a original é mais nova. Precisa do ffmpeg no PATH.
// Uso: node tools/afiliacao-variantes.mjs [--forcar]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'afiliacao');
export const LARGURAS_PRODUTO = [160, 400];
export const LARGURA_CAPA = 600;

/** Caminho (relativo a assets/afiliacao) da variante de uma imagem: "produtos/x.webp" + 400 → "r/produtos/x-400.webp". */
export const nomeVariante = (rel, w) => `r/${rel.replace(/\.webp$/i, '')}-${w}.webp`;

function gerar(origem, destino, w, forcar) {
  if (!forcar && fs.existsSync(destino) && fs.statSync(destino).mtimeMs >= fs.statSync(origem).mtimeMs) return false;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', origem, '-vf', `scale='min(${w},iw)':-2:flags=lanczos`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '74', destino]);
  return true;
}

export function gerarVariantes({ forcar = false, raiz = RAIZ } = {}) {
  let feitas = 0, vistas = 0;
  const prod = path.join(raiz, 'produtos');
  if (fs.existsSync(prod)) for (const f of fs.readdirSync(prod).filter((x) => x.endsWith('.webp'))) {
    for (const w of LARGURAS_PRODUTO) { vistas++; if (gerar(path.join(prod, f), path.join(raiz, nomeVariante(`produtos/${f}`, w)), w, forcar)) feitas++; }
  }
  for (const blog of fs.readdirSync(raiz).filter((d) => d !== 'r' && d !== 'produtos' && fs.statSync(path.join(raiz, d)).isDirectory())) {
    for (const f of fs.readdirSync(path.join(raiz, blog)).filter((x) => x.endsWith('-capa.webp'))) {
      vistas++; if (gerar(path.join(raiz, blog, f), path.join(raiz, nomeVariante(`${blog}/${f}`, LARGURA_CAPA)), LARGURA_CAPA, forcar)) feitas++;
    }
  }
  return { feitas, vistas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = gerarVariantes({ forcar: process.argv.includes('--forcar') });
  console.log(`variantes: ${r.feitas} geradas de ${r.vistas}`);
}
