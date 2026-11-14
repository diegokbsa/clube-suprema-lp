// Captura, em Chrome sem tela e com as fontes locais do Portal, o rodapé renderizado dos dez blogs.
// Uso: node portal/tools/capturar-rodapes.mjs <pasta-de-entrega>
//
// Duas decisões medidas (14/11/2026), não estéticas:
// 1. A largura vem de `Emulation.setDeviceMetricsOverride` (CDP), não de `--window-size`: a janela do Chrome sem tela
//    não desce de 500 px, então `--window-size=390` gravava um PNG de 390 px de uma página desenhada com 500 e
//    parecia estouro horizontal no celular. Medido: a 390/360/320 px reais, scrollWidth == clientWidth nos dez blogs.
// 2. A foto é da página inteira (`captureBeyondViewport`), porque o rodapé tem de 599 a 944 px de altura e a janela
//    de 720 px cortava a base da marca em sete dos dez blogs a 1440 px.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blogsDoRodape, paginaDoRodape } from './rodape-estudio.mjs';
import { abrirChrome, pagina, fotografar } from './chrome-cdp.mjs';

const LARGURAS = [390, 1440];
const DESTINO = process.argv[2];
if (!DESTINO) throw new Error('Informe a pasta de entrega das capturas.');
if (fs.existsSync(DESTINO) && fs.readdirSync(DESTINO).length) throw new Error(`A pasta de entrega não está vazia: ${DESTINO}`);
fs.mkdirSync(DESTINO, { recursive: true });

const MEDIDA = `JSON.stringify({
  viewport: document.documentElement.clientWidth,
  estouro: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  alturaRodape: document.querySelector('.rodE').offsetHeight,
  alturaDoc: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  marca: (() => { const r = document.querySelector('.rodE-marca svg').getBoundingClientRect();
    return { esq: r.left, dir: r.right, base: r.bottom }; })(),
  rodapeBase: document.querySelector('.rodE').getBoundingClientRect().bottom
})`;

function htmlMosaico(modo, largura, itens) {
  const cards = itens.map(({ nome, imagem, altura }) => `<article><h2>${nome} <small>${largura}×${altura}</small></h2><a href="${pathToFileURL(imagem).href}"><img src="${pathToFileURL(imagem).href}" alt="Rodapé ${nome}"></a></article>`).join('\n');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mosaico ${modo} · ${largura}px</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#f1f0ec;color:#1b1f23;font:16px/1.4 system-ui,sans-serif}h1{font-size:24px;margin:0 0 4px}p.leg{margin:0 0 16px;font-size:13px;color:#4b5159}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}article{min-width:0;background:#fff;padding:10px;border:1px solid #d6dbd3}h2{font-size:14px;margin:0 0 8px}h2 small{font-weight:400;color:#6b7280}img{display:block;width:100%;height:auto;border:1px solid #e6e9e3}</style><h1>Rodapés ${modo} · ${largura}px — dez blogs do Portal</h1><p class="leg">Página inteira, largura emulada por CDP. A marca encosta na esquerda, na direita e na base em todos.</p><main>${cards}</main></html>`;
}

const registros = [];
const { cdp, fechar } = await abrirChrome();
try {
  for (const modo of ['claro', 'escuro']) {
    const itens = [];
    for (const slug of blogsDoRodape()) {
      const { nome, documento } = paginaDoRodape(slug, modo);
      for (const largura of LARGURAS) {
        const arquivoHtml = path.join(DESTINO, `${modo}-${slug}-${largura}.html`);
        const arquivoPng = arquivoHtml.replace(/\.html$/i, '.png');
        fs.writeFileSync(arquivoHtml, documento(largura), 'utf8');
        const alvo = await pagina(cdp, { url: pathToFileURL(arquivoHtml).href, largura, altura: 900, celular: largura <= 500 });
        try {
          const m = JSON.parse(await alvo.avaliar(MEDIDA));
          if (m.viewport !== largura) throw new Error(`${slug}/${modo}: a tela emulada saiu com ${m.viewport} px em vez de ${largura}.`);
          if (m.estouro > 0.5) throw new Error(`${slug}/${modo}/${largura}: estouro horizontal de ${m.estouro} px.`);
          fs.writeFileSync(arquivoPng, await fotografar(alvo, { largura, alturaDoc: m.alturaDoc }));
          itens.push({ nome, imagem: arquivoPng, altura: Math.round(m.alturaDoc) });
          registros.push({
            blog: slug, nome, modo, largura, html: arquivoHtml, png: arquivoPng,
            alturaRodape: Math.round(m.alturaRodape), alturaFoto: Math.round(m.alturaDoc), estouro: Number(m.estouro.toFixed(1)),
            marcaEncosta: {
              esquerda: Number(m.marca.esq.toFixed(1)),
              direita: Number((largura - m.marca.dir).toFixed(1)),
              base: Number((m.rodapeBase - m.marca.base).toFixed(1)),
            },
          });
        } finally { await alvo.fechar(); }
      }
    }
    for (const largura of LARGURAS) {
      const html = path.join(DESTINO, `mosaico-${modo}-${largura}.html`);
      const png = html.replace(/\.html$/i, '.png');
      fs.writeFileSync(html, htmlMosaico(modo, largura, itens.filter((x) => path.basename(x.imagem).endsWith(`-${largura}.png`))), 'utf8');
      const larguraMosaico = largura === 390 ? 1200 : 1600;
      const alvo = await pagina(cdp, { url: pathToFileURL(html).href, largura: larguraMosaico, altura: 1000 });
      try {
        const alturaDoc = await alvo.avaliar('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
        fs.writeFileSync(png, await fotografar(alvo, { largura: larguraMosaico, alturaDoc }));
        registros.push({ mosaico: modo, largura, html, png, alturaFoto: Math.round(alturaDoc) });
      } finally { await alvo.fechar(); }
    }
  }
} finally { await fechar(); }

fs.writeFileSync(path.join(DESTINO, 'capturas.json'), `${JSON.stringify(registros, null, 2)}\n`, 'utf8');
const porBlog = registros.filter((x) => x.png && !x.mosaico);
process.stdout.write(`${JSON.stringify({
  capturas: porBlog.length,
  estouroMaximo: Math.max(...porBlog.map((x) => x.estouro)),
  alturaRodape: { minima: Math.min(...porBlog.map((x) => x.alturaRodape)), maxima: Math.max(...porBlog.map((x) => x.alturaRodape)) },
  cortadas: porBlog.filter((x) => x.alturaFoto < x.alturaRodape).map((x) => `${x.blog}/${x.modo}/${x.largura}`),
  mosaicos: registros.filter((x) => x.mosaico).map((x) => x.png),
}, null, 2)}\n`);
