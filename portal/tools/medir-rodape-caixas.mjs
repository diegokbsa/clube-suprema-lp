// Mede, no Chrome sem tela e com as fontes reais, a geometria e as cores do rodapé editorial dos dez blogs.
// Responde sem chute: há estouro horizontal? o botão cabe? a marca encosta nas bordas? qual o contraste AA renderizado?
// A largura vem de emulação CDP (ver chrome-cdp.mjs): `--window-size=390` desenha com 500 px e inventa estouro.
// Uso: node portal/tools/medir-rodape-caixas.mjs [--json saida.json] [--larguras 320,390,1440]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blogsDoRodape, paginaDoRodape } from './rodape-estudio.mjs';
import { abrirChrome, pagina } from './chrome-cdp.mjs';

const arg = (nome) => (process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : null);
const destinoJson = arg('--json');
const LARGURAS = (arg('--larguras') || '320,390,768,1440').split(',').map(Number);

const MEDIDA = `(() => {
  const n = (x) => Number(Number(x).toFixed(1));
  const caixa = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { esq: n(r.left), dir: n(r.right), topo: n(r.top), base: n(r.bottom), larg: n(r.width), alt: n(r.height), rolagem: n(el.scrollWidth), visivel: n(el.clientWidth) }; };
  const cs = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
  const rod = document.querySelector('.rodE');
  const svg = document.querySelector('.rodE-marca svg');
  const texto = document.querySelector('.rodE-marca text');
  const btn = document.querySelector('.rodE-btn');
  const itensNav = [...document.querySelectorAll('.rodE-nav a')].map((a) => {
    const r = a.getBoundingClientRect(); return { texto: a.textContent.trim(), dir: n(r.right), larg: n(r.width) }; });
  return JSON.stringify({
    viewport: { larg: n(document.documentElement.clientWidth), alt: n(window.innerHeight) },
    estouro: { htmlRolagem: n(document.documentElement.scrollWidth), htmlVisivel: n(document.documentElement.clientWidth), corpoRolagem: n(document.body.scrollWidth) },
    rodape: { ...caixa(rod), alturaTotal: n(rod.offsetHeight) },
    chamada: caixa(document.querySelector('.rodE-chamada')),
    botao: { ...caixa(btn), fonte: cs(btn, 'font-family').split(',')[0].replace(/["']/g, ''), alvoOk: btn.getBoundingClientRect().height >= 44 },
    nav: caixa(document.querySelector('.rodE-nav')),
    navMaisLargo: itensNav.reduce((a, b) => (a.larg > b.larg ? a : b), { larg: 0, texto: '' }),
    navDirMax: n(Math.max(...itensNav.map((a) => a.dir))),
    legal: caixa(document.querySelector('.rodE-legal')),
    marca: { ...caixa(svg), viewBox: svg.getAttribute('viewBox'), fonte: cs(texto, 'font-family').split(',')[0].replace(/["']/g, ''), peso: cs(texto, 'font-weight') },
    cores: { fundo: cs(rod, 'background-color'), texto: cs(rod, 'color'), botaoFundo: cs(btn, 'background-color'), botaoTexto: cs(btn, 'color'), marcaTinta: cs(texto, 'fill'), navCor: cs(document.querySelector('.rodE-nav a'), 'color'), navOpacidade: cs(document.querySelector('.rodE-nav a'), 'opacity'), legalCor: cs(document.querySelector('.rodE-legal'), 'color'), legalOpacidade: cs(document.querySelector('.rodE-legal'), 'opacity') },
  });
})()`;

/** `rgb(…)` vem em 0–255 e `color(srgb …)` em 0–1 — o Chrome usa o segundo para o color-mix da marca. */
const rgbDe = (cor) => {
  const n = cor.replace(/^color\(\s*srgb/i, 'color(').match(/[\d.]+/g).map(Number);
  const escala = /^color\(/i.test(cor.trim()) ? 255 : 1;
  return { r: n[0] * escala, g: n[1] * escala, b: n[2] * escala, a: n[3] === undefined ? 1 : n[3] };
};
const lum = (c) => { const f = [c.r, c.g, c.b].map((x) => { const v = x / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
const sobre = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
/** Contraste WCAG com a opacidade já achatada contra o fundo (é o que o olho vê). */
const contraste = (frente, fundo, opacidade = 1) => {
  const f = rgbDe(frente); const b = rgbDe(fundo);
  const fl = lum(sobre({ ...f, a: f.a * Number(opacidade) }, b)); const bl = lum(b);
  return Number(((Math.max(fl, bl) + 0.05) / (Math.min(fl, bl) + 0.05)).toFixed(2));
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-rodape-caixas-'));
const saida = [];
const { cdp, fechar } = await abrirChrome();
try {
  for (const slug of blogsDoRodape()) {
    for (const modo of ['claro', 'escuro']) {
      const { documento, nome } = paginaDoRodape(slug, modo);
      for (const largura of LARGURAS) {
        const arquivo = path.join(dir, `${modo}-${slug}-${largura}.html`);
        fs.writeFileSync(arquivo, documento(largura), 'utf8');
        const alvo = await pagina(cdp, { url: pathToFileURL(arquivo).href, largura, altura: 900, celular: largura <= 500 });
        let m;
        try { m = JSON.parse(await alvo.avaliar(MEDIDA)); } finally { await alvo.fechar(); }
        saida.push({
          blog: slug, nome, modo, largura,
          viewportReal: m.viewport.larg,
          estouroPx: Number((m.estouro.htmlRolagem - m.estouro.htmlVisivel).toFixed(1)),
          botaoCabe: m.botao.dir <= m.rodape.dir + 0.5, botaoSobra: Number((m.rodape.dir - m.botao.dir).toFixed(1)), botaoAlturaOk: m.botao.alvoOk,
          navCabe: m.navDirMax <= m.rodape.dir + 0.5, navItemMaisLargo: m.navMaisLargo,
          alturaRodape: m.rodape.alturaTotal,
          marcaEncosta: {
            esquerda: Number(m.marca.esq.toFixed(1)),
            direita: Number((m.rodape.dir - m.marca.dir).toFixed(1)),
            base: Number((m.rodape.base - m.marca.base).toFixed(1)),
          },
          fonteTitulo: m.marca.fonte, fonteBotao: m.botao.fonte, pesoMarca: m.marca.peso,
          contraste: {
            textoSobreFundo: contraste(m.cores.texto, m.cores.fundo),
            navSobreFundo: contraste(m.cores.navCor, m.cores.fundo, m.cores.navOpacidade),
            legalSobreFundo: contraste(m.cores.legalCor, m.cores.fundo, m.cores.legalOpacidade),
            marcaSobreFundo: contraste(m.cores.marcaTinta, m.cores.fundo),
            botaoTextoSobreBotao: contraste(m.cores.botaoTexto, m.cores.botaoFundo),
            botaoSobreFundo: contraste(m.cores.botaoFundo, m.cores.fundo),
          },
          cores: m.cores, caixas: m,
        });
      }
    }
  }
} finally { await fechar(); fs.rmSync(dir, { recursive: true, force: true }); }

const enxuto = saida.map(({ caixas, ...resto }) => resto);
if (destinoJson) fs.writeFileSync(destinoJson, `${JSON.stringify(saida, null, 2)}\n`, 'utf8');
const reprova = (x) => [
  x.viewportReal !== x.largura && `tela emulada ${x.viewportReal} em vez de ${x.largura}`,
  x.estouroPx > 0.5 && `estouro ${x.estouroPx}px`,
  !x.botaoCabe && 'botão fora da largura',
  !x.botaoAlturaOk && 'alvo do botão < 44px',
  !x.navCabe && 'navegação fora da largura',
  x.marcaEncosta.esquerda > 2 && `marca a ${x.marcaEncosta.esquerda}px da esquerda`,
  x.marcaEncosta.direita > 2 && `marca a ${x.marcaEncosta.direita}px da direita`,
  Math.abs(x.marcaEncosta.base) > 2 && `marca a ${x.marcaEncosta.base}px da base`,
  /arial|helvetica|sans-serif/i.test(x.fonteTitulo) && `fonte do título caiu para ${x.fonteTitulo}`,
  x.contraste.textoSobreFundo < 4.5 && `texto ${x.contraste.textoSobreFundo}:1`,
  x.contraste.navSobreFundo < 4.5 && `navegação ${x.contraste.navSobreFundo}:1`,
  x.contraste.legalSobreFundo < 4.5 && `legal ${x.contraste.legalSobreFundo}:1`,
  x.contraste.marcaSobreFundo < 4.5 && `marca ${x.contraste.marcaSobreFundo}:1`,
  x.contraste.botaoTextoSobreBotao < 4.5 && `texto do botão ${x.contraste.botaoTextoSobreBotao}:1`,
  x.contraste.botaoSobreFundo < 3 && `botão sobre fundo ${x.contraste.botaoSobreFundo}:1`,
].filter(Boolean);
const problemas = enxuto.flatMap((x) => (reprova(x).length ? [`${x.blog}/${x.modo}/${x.largura}: ${reprova(x).join('; ')}`] : []));
process.stdout.write(`${JSON.stringify({ medidas: enxuto, problemas }, null, 2)}\n`);
if (problemas.length) process.exitCode = 1;
