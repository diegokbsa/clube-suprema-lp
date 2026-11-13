// Ferramentas editoriais da esteira de afiliados, cada uma feita para a voz do seu blog.
import fs from 'node:fs';
import { CSP_PROPRIA } from './paginas.mjs';

const OFICINA = 'oficinanapratica.blog';
const FORNECEDORES = 'fornecedores.blog';
const CAMINHO_MISTURA = '/calculadora-mistura-2-tempos';
const CAMINHO_MARKUP = '/calculadora-markup-margem';
const CONFERIDO_EM = '13/11/2026';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonSeguro = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const htmlBase = ({ title, description, canonical, siteRoot, feed, nome, faq, body, css, script }) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
<link rel="icon" href="${esc(siteRoot)}/favicon.ico">
<link rel="alternate" type="application/rss+xml" title="${esc(nome)}" href="${esc(feed)}" data-rss-feed="blogs-afiliado">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:site_name" content="${esc(nome)}">
<script type="application/ld+json">${jsonSeguro({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(({ pergunta, resposta }) => ({ '@type': 'Question', name: pergunta, acceptedAnswer: { '@type': 'Answer', text: resposta } })) })}</script>
<style>${css}</style></head><body>${body}<script>${script}</script></body></html>`;

const perguntasMistura = [
  { pergunta: 'Qual proporção devo usar na minha máquina?', resposta: 'Consulte o manual do equipamento e a embalagem do óleo. A proporção varia conforme o motor e o lubrificante; esta página só converte volumes.' },
  { pergunta: 'Como calcular o óleo para mais de um litro?', resposta: 'Informe a quantidade de gasolina em litros. A calculadora multiplica o volume por litro de cada proporção: 20 mL no 50:1, 25 mL no 40:1 e 40 mL no 25:1.' },
  { pergunta: 'Posso medir o óleo a olho?', resposta: 'Use um recipiente graduado adequado e siga as instruções do fabricante. Uma medida imprecisa altera a proporção da mistura.' },
];

const perguntasMarkup = [
  { pergunta: 'Qual é a diferença entre markup e margem bruta?', resposta: 'Markup compara o acréscimo com o custo. Margem bruta compara a diferença entre venda e custo com o preço de venda.' },
  { pergunta: 'A margem bruta é o lucro líquido?', resposta: 'Não. Ela não desconta itens que não foram informados, como impostos, comissão, frete, taxas, perdas e despesas fixas.' },
  { pergunta: 'O que significa o multiplicador de preço?', resposta: 'É o preço de venda dividido pelo custo. Um multiplicador de 1,50 corresponde a um acréscimo de 50% sobre o custo.' },
];

const cssMistura = `:root{color-scheme:light;--papel:#edf0e9;--tinta:#1d2a21;--verde:#294d38;--amarelo:#f2b632;--linha:#bdc9bd;--suave:#536156;--branco:#fff}*{box-sizing:border-box}body{margin:0;background:var(--papel);color:var(--tinta);font:17px/1.55 'Arial Narrow',Arial,sans-serif}.topo{background:var(--verde);color:#fff;border-bottom:8px solid var(--amarelo)}.barra{width:min(1100px,calc(100% - 36px));margin:auto;padding:18px 0;display:flex;justify-content:space-between;gap:18px;align-items:center}.marca{font-weight:800;font-size:1rem;letter-spacing:.02em;color:#fff;text-decoration:none}.feed{color:#fff;text-underline-offset:4px}.wrap{width:min(1100px,calc(100% - 36px));margin:0 auto;padding:44px 0 70px}.abertura{max-width:780px;margin-bottom:26px}.abertura h1{max-width:760px;margin:0 0 14px;font:700 clamp(2.4rem,7vw,5.1rem)/.98 'Arial Narrow',Impact,sans-serif;letter-spacing:-.035em}.abertura p{max-width:690px;color:#435248;font-size:1.16rem;margin:0}.quadro{display:grid;grid-template-columns:minmax(250px,.75fr) minmax(340px,1.25fr);border:1px solid var(--linha);background:var(--branco)}.entrada{padding:28px 30px;border-right:1px solid var(--linha);background:linear-gradient(135deg,#fff 0 82%,#f5f7f1 82%)}.sobretitulo{margin:0 0 14px;color:var(--verde);font-size:.88rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.entrada label{display:block;font-weight:700;margin:8px 0}.entrada input{width:100%;padding:13px 14px;border:2px solid #88998a;border-radius:3px;background:#fff;color:var(--tinta);font:700 1.25rem 'Arial Narrow',Arial,sans-serif}.entrada input:focus-visible{outline:3px solid var(--amarelo);outline-offset:2px}.ajuda{color:var(--suave);font-size:.92rem;margin:8px 0 0}.resultados{padding:24px 30px;background:var(--verde);color:#fff}.resultados h2{margin:0 0 12px;font:700 1.6rem 'Arial Narrow',Impact,sans-serif}.linha{display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;padding:13px 0;border-top:1px dashed #b7cab8}.linha strong{font:700 clamp(1.5rem,3vw,2.2rem)/1 'Arial Narrow',Impact,sans-serif;color:#ffe09a;white-space:nowrap}.linha span{font-size:1.02rem}.erro{min-height:1.5em;color:#ffe09a;margin:8px 0 0}.aviso{margin:22px 0 0;padding:16px 18px;border-left:7px solid var(--amarelo);background:#fff;font-weight:650}.aviso strong{color:var(--verde)}.contexto{max-width:800px;margin:36px 0;color:#39483e}.contexto h2,.fontes h2,.perguntas h2{font:700 1.7rem/1.15 'Arial Narrow',Impact,sans-serif;margin:0 0 10px}.fontes,.perguntas{max-width:800px;border-top:1px solid var(--linha);padding-top:20px;margin-top:24px}.fontes p,.perguntas p{margin:8px 0}.fontes a,.perguntas a{color:#234f37;text-underline-offset:3px}.pergunta{margin:16px 0}.pergunta h3{font-size:1.08rem;margin:0 0 5px}.pergunta p{margin:0;color:#48564b}.rodape{margin-top:34px;padding-top:18px;border-top:1px solid var(--linha);font-size:.95rem}.rodape a{color:#234f37}@media(max-width:720px){.wrap{padding-top:34px}.quadro{grid-template-columns:1fr}.entrada{border-right:0;border-bottom:1px solid var(--linha)}.resultados{padding:22px}.linha{gap:10px}.linha span{max-width:22ch}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

const cssMarkup = `:root{color-scheme:light;--papel:#f1f0ec;--folha:#fffefa;--tinta:#29251f;--marrom:#76502d;--azul:#2457a6;--linha:#d8d1c5;--suave:#635e54;--carimbo:#e7eef9}*{box-sizing:border-box}body{margin:0;background:repeating-linear-gradient(0deg,transparent 0 31px,#e6e2da 31px 32px),var(--papel);color:var(--tinta);font:16px/1.6 'Trebuchet MS',Arial,sans-serif}.topo{background:#e4ddcf;border-bottom:1px solid #c9bdab}.barra{width:min(1080px,calc(100% - 36px));margin:auto;padding:17px 0;display:flex;justify-content:space-between;align-items:center;gap:18px}.marca{color:var(--tinta);font-weight:800;text-decoration:none}.feed{color:var(--azul);text-underline-offset:4px}.wrap{width:min(1080px,calc(100% - 36px));margin:0 auto;padding:42px 0 70px}.abertura{max-width:800px;margin-bottom:24px}.abertura h1{margin:0 0 12px;font:700 clamp(2.2rem,5.7vw,4.4rem)/1.02 Georgia,serif;letter-spacing:-.035em}.abertura p{max-width:720px;margin:0;color:var(--suave);font-size:1.1rem}.folha{display:grid;grid-template-columns:minmax(250px,.78fr) minmax(420px,1.22fr);border:1px solid #cfc6b8;background:var(--folha);box-shadow:7px 7px 0 #ded7ca}.campos{padding:26px 28px;border-right:1px solid var(--linha)}.rotulo{font-size:.87rem;color:var(--marrom);font-weight:800;letter-spacing:.04em;margin:0 0 17px}.campo{margin:0 0 18px}.campo label{display:flex;justify-content:space-between;gap:12px;font-weight:700;margin-bottom:6px}.campo small{font-weight:400;color:var(--suave)}.campo input{display:block;width:100%;padding:12px 13px;border:1px solid #968b7b;border-radius:0;background:#fff;color:var(--tinta);font:600 1.2rem Georgia,serif}.campo input:focus-visible{outline:3px solid #8eafd9;outline-offset:2px}.nota-ref{border-top:1px solid var(--linha);margin-top:20px;padding-top:14px;color:var(--suave);font-size:.94rem}.nota-ref strong{color:var(--tinta)}.resumo{padding:26px 30px}.carimbo{display:inline-block;border:2px solid var(--azul);padding:5px 12px;color:var(--azul);background:var(--carimbo);font-size:.86rem;font-weight:800;letter-spacing:.04em;transform:rotate(-1deg)}.resumo h2{margin:20px 0 4px;font:700 1.65rem Georgia,serif}.subtitulo{margin:0 0 16px;color:var(--suave)}.grade{border-top:2px solid var(--tinta)}.resultado{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:16px;padding:12px 4px;border-bottom:1px solid var(--linha)}.resultado strong{font:700 clamp(1.2rem,2.8vw,1.75rem) Georgia,serif;white-space:nowrap}.resultado small{display:block;color:var(--suave);font-size:.82rem}.erro{min-height:1.5em;color:#963d30;margin:7px 0}.contexto{max-width:820px;margin:34px 0;color:#484238}.contexto h2,.fontes h2,.perguntas h2{font:700 1.65rem Georgia,serif;margin:0 0 8px}.fontes,.perguntas{max-width:820px;margin-top:24px;padding-top:20px;border-top:1px solid #cfc6b8}.fontes p,.perguntas p{margin:8px 0}.fontes a,.perguntas a{color:#194c91;text-underline-offset:3px}.pergunta{margin:16px 0}.pergunta h3{font-size:1.06rem;margin:0 0 4px}.pergunta p{margin:0;color:var(--suave)}.rodape{border-top:1px solid #cfc6b8;margin-top:34px;padding-top:16px}.rodape a{color:#194c91}@media(max-width:760px){.wrap{padding-top:30px}.folha{grid-template-columns:1fr;box-shadow:4px 4px 0 #ded7ca}.campos{border-right:0;border-bottom:1px solid var(--linha)}.resumo{padding:24px 22px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;

function renderMistura(origin, base = '') {
  const raiz = `${origin}${base}`.replace(/\/$/, '');
  const canonical = `${raiz}${CAMINHO_MISTURA}`;
  const faq = perguntasMistura;
  const body = `<header class="topo"><div class="barra"><a class="marca" href="${esc(raiz)}/">Oficina na Prática</a><a class="feed" href="${esc(raiz)}/feed.xml">Assinar o RSS</a></div></header>
<main class="wrap"><header class="abertura"><h1>Quanto óleo vai por litro?</h1><p>Converta a quantidade de gasolina para três proporções comuns de mistura 2 tempos. A máquina e o óleo é que definem qual usar.</p></header>
<section class="quadro" aria-label="Calculadora de mistura de óleo"><div class="entrada"><p class="sobretitulo">Recado da bancada</p><label for="litros">Gasolina, em litros</label><input id="litros" type="number" inputmode="decimal" min="0.1" max="1000" step="0.1" value="1" aria-describedby="litros-ajuda erro-mistura"><p class="ajuda" id="litros-ajuda">Informe o volume que vai preparar. A medida mostra mililitros de óleo.</p></div>
<div class="resultados" aria-live="polite"><h2>Óleo para esta quantidade</h2><div class="linha"><span>Mistura 50:1</span><strong id="mistura-50">20 mL</strong></div><div class="linha"><span>Mistura 40:1</span><strong id="mistura-40">25 mL</strong></div><div class="linha"><span>Mistura 25:1</span><strong id="mistura-25">40 mL</strong></div><p class="erro" id="erro-mistura" role="status"></p></div></section>
<p class="aviso"><strong>Importante:</strong> esta é uma conversão de volume, não uma recomendação para qualquer motor. Confira a proporção no manual do equipamento e nas instruções do óleo.</p>
<section class="contexto"><h2>Antes de preparar a mistura</h2><p>Roçadeiras, motosserras e outros motores 2 tempos podem exigir proporções diferentes. O Zé recomenda conferir primeiro o modelo e a especificação do lubrificante; se houver dúvida, pare e consulte a assistência técnica.</p></section>
<section class="fontes"><h2>Referências conferidas em ${CONFERIDO_EM}</h2><p>A STIHL informa exemplos de 50:1 (20 mL por litro) e 25:1 (40 mL por litro) conforme o óleo e o equipamento. A tabela da MTD também lista 40:1 (25 mL por litro); ambos os fabricantes orientam seguir o manual específico.</p><p><a href="https://www.stihl.com.br/pt/informacoes/perguntas-frequentes/stihl-faq/orientacao-as-ferramentas-stihl" target="_blank" rel="noopener">Perguntas frequentes da STIHL</a> · <a href="https://support.mtdproducts.com/articles/en_US/FAQ/347-1" target="_blank" rel="noopener">Tabela oficial de mistura da MTD</a></p></section>
<section class="perguntas"><h2>Dúvidas frequentes</h2>${faq.map((item) => `<article class="pergunta"><h3>${esc(item.pergunta)}</h3><p>${esc(item.resposta)}</p></article>`).join('')}</section>
<footer class="rodape"><a href="${esc(raiz)}/blog">Voltar aos guias da Oficina na Prática</a></footer></main>`;
  const script = `(()=>{const campo=document.getElementById('litros');const erro=document.getElementById('erro-mistura');const formato=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});const atualizar=()=>{const litros=Number(campo.value);if(!Number.isFinite(litros)||litros<0.1||litros>1000){erro.textContent='Informe um volume entre 0,1 e 1.000 litros.';[50,40,25].forEach((r)=>document.getElementById('mistura-'+r).textContent='—');return}erro.textContent='';[50,40,25].forEach((r)=>{const ml=litros*1000/r;document.getElementById('mistura-'+r).textContent=formato.format(ml)+' mL'})};campo.addEventListener('input',atualizar);atualizar()})();`;
  return htmlBase({ title: 'Mistura 2 tempos: calculadora de óleo por litro', description: 'Calcule os mililitros de óleo para 50:1, 40:1 e 25:1 pela quantidade de gasolina. Confira sempre o manual do equipamento.', canonical, siteRoot: raiz, feed: `${raiz}/feed.xml`, nome: 'Oficina na Prática', faq, body, css: cssMistura, script });
}

function renderMarkup(origin, base = '') {
  const raiz = `${origin}${base}`.replace(/\/$/, '');
  const canonical = `${raiz}${CAMINHO_MARKUP}`;
  const faq = perguntasMarkup;
  const body = `<header class="topo"><div class="barra"><a class="marca" href="${esc(raiz)}/">Fornecedores.blog</a><a class="feed" href="${esc(raiz)}/feed.xml">Assinar o RSS</a></div></header>
<main class="wrap"><header class="abertura"><h1>Preço de venda em conferência</h1><p>Compare o custo de compra com o preço pensado para a revenda. Veja o acréscimo sobre o custo e a margem bruta sobre a venda.</p></header>
<section class="folha" aria-label="Calculadora de markup e margem"><div class="campos"><p class="rotulo">Checklist do dia · valores da operação</p><div class="campo"><label for="custo">Custo unitário <small>R$</small></label><input id="custo" type="number" inputmode="decimal" min="0.01" max="100000000" step="0.01" value="80" aria-describedby="erro-markup"></div><div class="campo"><label for="preco">Preço de venda <small>R$</small></label><input id="preco" type="number" inputmode="decimal" min="0.01" max="100000000" step="0.01" value="120" aria-describedby="erro-markup"></div><p class="nota-ref"><strong>Referência de conferência:</strong> custo de R$ 80 e venda de R$ 120, exemplo publicado pelo BDMG.</p></div>
<div class="resumo" aria-live="polite"><span class="carimbo">Conferência de preço</span><h2>O que a conta mostra</h2><p class="subtitulo">Resultado antes dos outros custos não informados.</p><div class="grade"><div class="resultado"><div>Diferença entre venda e custo<small>Valor bruto para cobrir outros custos</small></div><strong id="diferenca">R$ 40,00</strong></div><div class="resultado"><div>Markup sobre o custo<small>(venda − custo) ÷ custo</small></div><strong id="markup-percentual">50%</strong></div><div class="resultado"><div>Multiplicador do preço<small>Venda ÷ custo</small></div><strong id="multiplicador">1,50×</strong></div><div class="resultado"><div>Margem bruta sobre a venda<small>(venda − custo) ÷ venda</small></div><strong id="margem-percentual">33,33%</strong></div></div><p class="erro" id="erro-markup" role="status"></p></div></section>
<section class="contexto"><h2>Confira o que entrou na conta</h2><p>O Márcio separa as duas bases antes de comparar um fornecedor: markup mede o acréscimo em relação ao custo; margem bruta mede quanto a diferença representa no preço de venda. A conta não prevê resultado do negócio nem substitui a planilha completa da operação.</p><p>Impostos, comissão, frete, taxas de pagamento, devoluções e despesas fixas não são descontados se você não os incluir no custo. Valide cada item antes de definir o preço.</p></section>
<section class="fontes"><h2>Referência conferida em ${CONFERIDO_EM}</h2><p>O BDMG explica a diferença entre markup e margem e usa um exemplo de custo de R$ 80 com venda de R$ 120: multiplicador 1,50, acréscimo de 50% sobre o custo e margem bruta de 33,33% sobre a venda.</p><p><a href="https://bdmgorienta.bdmg.mg.gov.br/margem-de-lucro" target="_blank" rel="noopener">BDMG Orienta · Margem de lucro: como calcular e avaliar descontos</a></p></section>
<section class="perguntas"><h2>Dúvidas frequentes</h2>${faq.map((item) => `<article class="pergunta"><h3>${esc(item.pergunta)}</h3><p>${esc(item.resposta)}</p></article>`).join('')}</section>
<footer class="rodape"><a href="${esc(raiz)}/blog">Voltar aos guias do Fornecedores.blog</a></footer></main>`;
  const script = `(()=>{const custo=document.getElementById('custo');const preco=document.getElementById('preco');const erro=document.getElementById('erro-markup');const moeda=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});const pct=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});const dec=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});const atualizar=()=>{const c=Number(custo.value);const v=Number(preco.value);const ids=['diferenca','markup-percentual','multiplicador','margem-percentual'];if(!Number.isFinite(c)||!Number.isFinite(v)||c<=0||v<=0||c>100000000||v>100000000){erro.textContent='Informe custo e preço maiores que zero, até R$ 100.000.000.';ids.forEach((id)=>document.getElementById(id).textContent='—');return}erro.textContent='';const delta=v-c;document.getElementById('diferenca').textContent=moeda.format(delta);document.getElementById('markup-percentual').textContent=pct.format(delta/c*100)+'%';document.getElementById('multiplicador').textContent=dec.format(v/c)+'×';document.getElementById('margem-percentual').textContent=pct.format(delta/v*100)+'%' };custo.addEventListener('input',atualizar);preco.addEventListener('input',atualizar);atualizar()})();`;
  return htmlBase({ title: 'Markup e margem: calculadora de preço de venda', description: 'Compare custo e preço de venda para calcular markup, multiplicador e margem bruta, com exemplo de referência e custos que ficam de fora.', canonical, siteRoot: raiz, feed: `${raiz}/feed.xml`, nome: 'Fornecedores.blog', faq, body, css: cssMarkup, script });
}

const paginas = new Map([
  [CAMINHO_MISTURA, { dominio: OFICINA, render: renderMistura }],
  [CAMINHO_MARKUP, { dominio: FORNECEDORES, render: renderMarkup }],
]);

const host = (site) => String(site?.domain || '').split('/')[0].split(':')[0].toLowerCase();

function servir(caminho) {
  return ({ req, res, site, origin, base = '', send }) => {
    const pagina = paginas.get(caminho);
    if (!pagina || host(site) !== pagina.dominio) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const body = pagina.render(String(origin || `https://${pagina.dominio}`).replace(/\/$/, ''), base);
    return send(res, 200, req.method === 'HEAD' ? '' : body, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP_PROPRIA,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'public, max-age=300',
    });
  };
}

export const publicRoutes = [...paginas.keys()].map((caminho) => ({ path: caminho, handler: servir(caminho) }));

/** Ferramentas próprias entram no sitemap apenas no blog ao qual pertencem. */
export function sitemapEntries({ site }) {
  const dominio = host(site);
  const pagina = [...paginas.entries()].find(([, item]) => item.dominio === dominio);
  if (!pagina) return [];
  const lastmod = new Date(fs.statSync(new URL(import.meta.url)).mtimeMs).toISOString().slice(0, 10);
  return [{ path: pagina[0], lastmod }];
}
