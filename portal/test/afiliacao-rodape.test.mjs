import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderLista, renderHome, renderPost, renderInstitucional, renderOfertas } from '../tools/afiliacao-visual.mjs';
import { RODAPES_AFILIADOS } from '../tools/afiliacao-rodapes.mjs';
import { TEMAS } from '../tools/afiliacao-temas.mjs';
import { PAGINAS } from '../tools/afiliacao-institucional.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTEUDO = path.join(RAIZ, 'conteudo', 'afiliacao');
const lerJson = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const rgb = (cor) => cor.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
const luminancia = (cor) => {
  const [r, g, b] = rgb(cor).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const la = luminancia(a); const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
const mistura = (frente, fundo, opacidade) => {
  const f = frente.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
  const b = fundo.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16));
  return `#${f.map((x, i) => Math.round(x * opacidade + b[i] * (1 - opacidade)).toString(16).padStart(2, '0')).join('')}`;
};
const blogs = fs.readdirSync(CONTEUDO).filter((slug) => fs.existsSync(path.join(CONTEUDO, slug, 'site.json')));

test('rodapé editorial: dez blogs, destino válido, marca medida e textos legais preservados', () => {
  assert.equal(blogs.length, 10, 'o Portal tem dez blogs de afiliação');
  assert.deepEqual([...Object.keys(RODAPES_AFILIADOS)].sort(), [...blogs].sort(), 'cada blog tem sua chamada e marca');
  const css = fs.readFileSync(path.join(RAIZ, 'tools', 'rodape-estudio.css'), 'utf8');

  for (const slug of blogs) {
    const pasta = path.join(CONTEUDO, slug);
    const info = lerJson(path.join(pasta, 'site.json'));
    const v = lerJson(path.join(pasta, 'vitrine.json'));
    const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
      .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
    const prefixo = `https://kbsa.app/${slug}`;
    const html = renderLista({ info, v, posts, prefixo });
    const rodape = html.match(/<footer class="rodE[^>]*>[\s\S]*?<\/footer>/)?.[0];
    const chamada = RODAPES_AFILIADOS[slug];
    assert.ok(rodape, `${slug}: rodapé renderizado`);
    assert.ok(rodape.includes(chamada.chamada) && rodape.includes(chamada.botao), `${slug}: chamada na voz do blog`);
    const destino = rodape.match(/<a class="rodE-btn" href="([^"]+)"/i)?.[1];
    assert.ok(destino?.startsWith(`${prefixo}/blog/`), `${slug}: CTA aponta para um guia do próprio blog`);
    assert.ok(posts.some((p) => destino.endsWith(`/${p.slug}`)), `${slug}: o guia do CTA existe`);
    assert.ok(rodape.includes(`href="${prefixo}/feed.xml"`), `${slug}: RSS preservado`);
    assert.ok(rodape.includes(`href="${prefixo}/aviso-de-afiliados"`), `${slug}: aviso de afiliados preservado`);
    for (const pagina of PAGINAS) assert.ok(rodape.includes(`href="${prefixo}/${pagina}"`), `${slug}: link ${pagina} preservado`);
    assert.match(rodape, /mailto:[^\"]+/, `${slug}: contato preservado`);
    assert.ok(rodape.includes('recebemos uma comissão') && rodape.includes('Conteúdo informativo'), `${slug}: transparência e aviso editorial preservados`);
    assert.match(rodape, new RegExp(`viewBox="${chamada.viewBox.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${slug}: viewBox medido`);
    assert.ok(!rodape.includes('viewBox="0 0 0 0"') && rodape.includes(`textLength="${chamada.larguraTexto}"`), `${slug}: escala da marca válida`);
    assert.ok(!rodape.includes('<script'), `${slug}: nenhum JavaScript novo no rodapé`);
  }
  assert.match(css, /\.rodE-legal a\{color:inherit/);
  // Padrão 10 da tabela da casa: movimento atado à rolagem ou ao cursor é "não" para blogs.
  // O estado inicial da animação que existia aqui era opacity:0, que derrubava o contraste medido
  // da marca exatamente enquanto o rodapé entra na tela — e nenhuma captura pega esse instante.
  for (const proibido of [/animation/i, /@keyframes/i, /transition/i, /scroll\(/i, /view\(/i, /:hover\s*\{[^}]*transform/i]) {
    assert.doesNotMatch(css, proibido, `o rodapé não pode ter movimento: ${proibido}`);
  }
});

test('contraste WCAG AA e de superfície passa nos dez temas claro e escuro', () => {
  for (const slug of blogs) {
    const tema = TEMAS[slug];
    const chamada = RODAPES_AFILIADOS[slug];
    const claro = tema.claro;
    const aClaro = chamada.acentoClaro || claro.acento;
    const mClaro = chamada.marcaClara || claro.marca;
    assert.ok(contraste(claro.sobreAcento, aClaro) >= 4.5, `${slug}: --sa/--a claro`);
    assert.ok(contraste(mistura(claro.sobreAcento, aClaro, 0.9), aClaro) >= 4.5, `${slug}: texto legal claro`);
    assert.ok(contraste(mistura(claro.sobreAcento, aClaro, 0.92), aClaro) >= 4.5, `${slug}: navegação clara`);
    assert.ok(contraste(mistura(claro.sobreAcento, aClaro, 0.96), aClaro) >= 4.5, `${slug}: marca clara`);
    assert.ok(contraste(claro.sobreMarca, mClaro) >= 4.5, `${slug}: --sm/--m claro`);
    assert.ok(contraste(mClaro, aClaro) >= 3, `${slug}: --m/--a claro`);

    const escuro = tema.escuro;
    const inverte = !chamada.mantemAcentoEscuro;
    const fundoEscuro = inverte ? escuro.sobreAcento : escuro.acento;
    const textoEscuro = inverte ? escuro.acento : escuro.sobreAcento;
    assert.ok(contraste(textoEscuro, fundoEscuro) >= 4.5, `${slug}: texto de superfície escura`);
    assert.ok(contraste(mistura(textoEscuro, fundoEscuro, 0.9), fundoEscuro) >= 4.5, `${slug}: texto legal escuro`);
    assert.ok(contraste(mistura(textoEscuro, fundoEscuro, 0.92), fundoEscuro) >= 4.5, `${slug}: navegação escura`);
    assert.ok(contraste(mistura(textoEscuro, fundoEscuro, 0.96), fundoEscuro) >= 4.5, `${slug}: marca escura`);
    assert.ok(contraste(escuro.sobreMarca, escuro.marca) >= 4.5, `${slug}: --sm/--m escuro`);
    assert.ok(contraste(escuro.marca, fundoEscuro) >= 3, `${slug}: --m/superfície escura`);
  }
});

test('a marca gigante é uma palavra do nome do blog, com os acentos que ela tem', () => {
  // Pega o erro que o olho pegou em 14/11/2026: a marca do IA na Prática estava "PRATICA", sem acento,
  // porque a altura do viewBox era a da maiúscula e o acento não caberia. Comparar sem acento não serve.
  for (const slug of blogs) {
    const info = lerJson(path.join(CONTEUDO, slug, 'site.json'));
    const marca = RODAPES_AFILIADOS[slug].marca;
    const palavras = info.nome.split(/\s+/).filter(Boolean);
    const juncoes = palavras.flatMap((_, i) => palavras.slice(i).map((_p, j) => palavras.slice(i, i + j + 1).join('')));
    assert.ok(
      juncoes.some((j) => j.toLocaleUpperCase('pt-BR') === marca),
      `${slug}: a marca "${marca}" não é nenhuma palavra de "${info.nome}" em maiúsculas (acento incluído)`,
    );
  }
});

test('o viewBox de cada marca é o que a fonte real mede, não um par coerente inventado', () => {
  // Portão da proporção. O teste de aritmética abaixo só vê coerência interna: um viewBox com a largura
  // pela metade e o textLength junto passa nele, e a marca sai com o DOBRO da altura no ar (medido:
  // 156,3 px -> 312,7 px no achadinhos a 1440). A referência tem de vir de FORA do arquivo que o render
  // usa — daí rodape-marcas-medidas.json, gerado por `node portal/tools/medir-rodape-marca.mjs --gravar`
  // a partir dos WOFF2 reais. Mexeu no viewBox à mão sem remedir, este teste reprova.
  const medidas = lerJson(path.join(RAIZ, 'tools', 'rodape-marcas-medidas.json'));
  assert.deepEqual(
    Object.keys(medidas.marcas).sort(), [...blogs].sort(),
    'a medição das marcas cobre exatamente os dez blogs — remeça com medir-rodape-marca.mjs --gravar',
  );
  for (const slug of blogs) {
    const usado = RODAPES_AFILIADOS[slug];
    const medido = medidas.marcas[slug];
    assert.equal(usado.marca, medido.texto, `${slug}: a palavra medida é outra — remeça a marca`);
    assert.equal(usado.viewBox, medido.viewBox, `${slug}: viewBox "${usado.viewBox}" ≠ medido "${medido.viewBox}"`);
    assert.ok(
      Math.abs(usado.larguraTexto - medido.larguraTexto) <= 0.11,
      `${slug}: larguraTexto ${usado.larguraTexto} ≠ medido ${medido.larguraTexto}`,
    );
    assert.ok(Math.abs(usado.altura - medido.altura) <= 0.11, `${slug}: altura ${usado.altura} ≠ medida ${medido.altura}`);
  }
});

test('o viewBox da marca fecha com a largura medida: respiro + largura visível = textLength', () => {
  // Aritmética do par. Pega o número editado sozinho; a proporção quem prende é o teste acima e,
  // no pixel, tools/auditar-rodape-pixel.py (que reprova a altura da maiúscula fora do previsto).
  for (const slug of blogs) {
    const { viewBox, larguraTexto, altura } = RODAPES_AFILIADOS[slug];
    const [minX, minY, largura, alturaCaixa] = viewBox.split(/\s+/).map(Number);
    assert.equal(minY, 0, `${slug}: o viewBox começa na base da maiúscula`);
    assert.ok(Math.abs(minX + largura - larguraTexto) <= 0.11, `${slug}: ${minX} + ${largura} ≠ ${larguraTexto}`);
    assert.equal(alturaCaixa, altura, `${slug}: a altura do viewBox é a usada no y do <text>`);
    assert.ok(altura >= 50 && altura <= 130, `${slug}: altura medida fora do razoável (${altura})`);
  }
});

test('o botão do rodapé aponta para um guia de verdade em TODA página do blog, não só na lista', () => {
  // A página de ofertas era chamada sem `posts` e o botão caía em /blog, com o texto prometendo um guia.
  for (const slug of blogs) {
    const pasta = path.join(CONTEUDO, slug);
    const info = lerJson(path.join(pasta, 'site.json'));
    const v = lerJson(path.join(pasta, 'vitrine.json'));
    const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
      .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
    const prefixo = `https://kbsa.app/${slug}`;
    const dados = { catalogo: lerJson(path.join(CONTEUDO, 'produtos.json')), links: lerJson(path.join(CONTEUDO, 'links.json')) };
    const paginas = {
      home: renderHome({ info, v, posts, prefixo, dados }),
      lista: renderLista({ info, v, posts, prefixo }),
      post: renderPost({ info, v, post: posts[0], posts, prefixo, dados, aplicarLinks: (t) => String(t) }),
      institucional: renderInstitucional({ pag: 'sobre', info, v, prefixo, posts, medicao: {} }),
      ofertas: renderOfertas({ info, v, ofertas: { itens: [] }, prefixo, posts, dados }),
    };
    for (const [nome, html] of Object.entries(paginas)) {
      const destino = html.match(/<a class="rodE-btn" href="([^"]+)"/i)?.[1];
      assert.ok(destino?.startsWith(`${prefixo}/blog/`), `${slug}/${nome}: o botão do rodapé vai para ${destino}`);
      assert.ok(posts.some((p) => destino.endsWith(`/${p.slug}`)), `${slug}/${nome}: o guia do botão existe`);
    }
  }
});

test('a navegação do rodapé só tem rótulo curto: título de post não entra em versalete espaçado', () => {
  // A nav do rodapé é `text-transform:uppercase` + `letter-spacing:.06em`. O item de Black Friday
  // entrava com o TÍTULO DO POST ("BLACK FRIDAY DOS ACHADINHOS: O KIT TEM PREÇO REAL, O PACK NEM
  // SEMPRE", 68 caracteres), que a 320 px toma a linha inteira — "monte de texto" da Regra −2 e
  // divergência da peça aprovada, onde o rótulo é "BLACK FRIDAY". Rótulo é rótulo; título fica no corpo.
  const LIMITE = 22;
  for (const slug of blogs) {
    const pasta = path.join(CONTEUDO, slug);
    const info = lerJson(path.join(pasta, 'site.json'));
    const v = lerJson(path.join(pasta, 'vitrine.json'));
    const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
      .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
    const html = renderLista({ info, v, posts, prefixo: `https://kbsa.app/${slug}` });
    const nav = html.match(/<nav class="rodE-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav, `${slug}: navegação do rodapé renderizada`);
    for (const [, rotulo] of nav.matchAll(/<a [^>]*>([^<]*)<\/a>/g)) {
      assert.ok(
        rotulo.length <= LIMITE,
        `${slug}: rótulo de ${rotulo.length} caracteres na nav do rodapé ("${rotulo}") — o limite é ${LIMITE}`,
      );
    }
  }
});

test('as classes do rodapé se somam: acento claro e fundo escuro não se excluem', () => {
  // Eram um ternário: quem pedisse acentoClaro perdia rodE-fundo-a-noite e o tema escuro invertia
  // em silêncio. Nenhum dos dez pede as duas hoje — este teste é o que impede o décimo primeiro
  // de entrar quebrado sem ninguém ver.
  for (const slug of blogs) {
    const pasta = path.join(CONTEUDO, slug);
    const info = lerJson(path.join(pasta, 'site.json'));
    const v = lerJson(path.join(pasta, 'vitrine.json'));
    const posts = fs.readdirSync(path.join(pasta, 'posts')).sort()
      .map((f) => lerJson(path.join(pasta, 'posts', f))).filter((p) => !p.redirect);
    const html = renderLista({ info, v, posts, prefixo: `https://kbsa.app/${slug}` });
    const classe = html.match(/<footer class="(rodE[^"]*)"/)?.[1];
    const cta = RODAPES_AFILIADOS[slug];
    assert.ok(classe, `${slug}: rodapé com classe`);
    assert.equal(
      classe.split(' ').includes('rodE-fundo-a-noite'), Boolean(cta.mantemAcentoEscuro),
      `${slug}: mantemAcentoEscuro=${Boolean(cta.mantemAcentoEscuro)} mas a classe é "${classe}"`,
    );
    assert.equal(
      classe.split(' ').includes('rodE-ajuste'), Boolean(cta.acentoClaro || cta.marcaClara),
      `${slug}: acento/marca claros pedem rodE-ajuste, mas a classe é "${classe}"`,
    );
  }
});
