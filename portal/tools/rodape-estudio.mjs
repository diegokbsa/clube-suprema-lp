// Peças comuns do estúdio do rodapé editorial: lista dos blogs, página isolada do rodapé e chamada do Chrome sem tela.
// Usado por capturar-rodapes.mjs (prints) e por medir-rodape-caixas.mjs (geometria e cor medidas).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderLista } from './afiliacao-visual.mjs';
import { RODAPES_AFILIADOS } from './afiliacao-rodapes.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLICO = path.join(RAIZ, 'public');
export const CONTEUDO = path.join(RAIZ, 'conteudo', 'afiliacao');
export const CHROME = process.env.PORTAL_CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));

/** Os dez blogs de afiliação, conferidos contra as chamadas de rodapé. */
export function blogsDoRodape() {
  const blogs = fs.readdirSync(CONTEUDO).filter((slug) => fs.existsSync(path.join(CONTEUDO, slug, 'vitrine.json'))).sort();
  if (blogs.length !== 10 || blogs.some((slug) => !RODAPES_AFILIADOS[slug])) {
    throw new Error(`Esperados 10 blogs com rodapé; encontrei: ${blogs.join(', ')}`);
  }
  return blogs;
}

/** Página isolada com só o rodapé do blog, o CSS real da página e as fontes locais em file://. */
export function paginaDoRodape(slug, modo, { fontBase } = {}) {
  const base = fontBase || pathToFileURL(path.join(PUBLICO, 'assets', 'fontes') + path.sep).href;
  const pasta = path.join(CONTEUDO, slug);
  const info = lerJson(path.join(pasta, 'site.json'));
  const v = lerJson(path.join(pasta, 'vitrine.json'));
  const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
    .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
  const origem = renderLista({ info, v, posts, prefixo: `https://kbsa.app/${slug}` });
  const cssOriginal = origem.match(/<style>([\s\S]*?)<\/style>/i)?.[1];
  const footer = origem.match(/<footer class="rodE[^>]*>[\s\S]*?<\/footer>/i)?.[0];
  if (!cssOriginal || !footer) throw new Error(`${slug}: a página não contém CSS ou o rodapé esperado.`);
  const cssLocal = cssOriginal.replace(/url\((["']?)\/assets\/fontes\/([^)'" ]+)\1\)/g, (_m, _aspas, arquivo) => `url(${base}${arquivo})`);
  const nome = info.nome || slug;
  const documento = (largura) => `<!doctype html><html lang="pt-BR" data-tema="${modo}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${nome} · ${modo} · ${largura}px</title><style>${cssLocal}</style><style>html,body{margin:0;min-width:0}body{padding:0;background:var(--a)}footer{display:block!important}</style></head><body>${footer}</body></html>`;
  return { nome, info, v, documento };
}

/** Chrome sem tela (headless=new) com os mesmos parâmetros em toda ferramenta do estúdio. */
export function chrome(extras, { timeout = 45000 } = {}) {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome não encontrado em ${CHROME}. Defina PORTAL_CHROME_EXE.`);
  const resultado = spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=5000',
    ...extras,
  ], { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (resultado.error) throw resultado.error;
  return resultado;
}
