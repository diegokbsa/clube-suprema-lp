// Capa e imagens nos posts dos blogs de afiliado: "cover"/"coverAlt" no JSON e "![alt](/assets/...)" no texto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { htmlText, dimensoesImagem } from '../lib/modules/blog.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(RAIZ, 'tools', 'afiliacao-instalar.mjs');

test('texto: imagem sozinha na linha vira <figure> com alt, tamanho e lazy; imagem de fora ou com ".." não entra', () => {
  const h = htmlText('Antes\n\n![Diagrama do fluxo](/assets/afiliacao/ia/fluxo-1.png)\n\nUm ![no meio](/assets/x.png) da frase\n\n![fora](https://exemplo.com/a.png)\n\n![sobe](/assets/../server.mjs)');
  assert.match(h, /<figure class="blog-fig"><img src="\/assets\/afiliacao\/ia\/fluxo-1\.png" alt="Diagrama do fluxo" loading="lazy" decoding="async" width="1200" height="675"><\/figure>/);
  assert.match(h, /<p>Um no meio da frase<\/p>/, 'imagem no meio da frase vira só o texto alternativo');
  assert.ok(!h.includes('exemplo.com'), 'imagem de outro site não entra');
  assert.ok(!h.includes('server.mjs'), 'caminho com ".." não entra');
  assert.ok(!/!<a/.test(h));
});

test('tamanho real do PNG vem do cabeçalho do arquivo em portal/public', () => {
  const src = '/assets/marcas/hot-poker-chama.png';
  const b = fs.readFileSync(path.join(RAIZ, 'public', src));
  assert.deepEqual(dimensoesImagem(src), [b.readUInt32BE(16), b.readUInt32BE(20)]);
  assert.deepEqual(dimensoesImagem('/assets/nao/existe.png', [1200, 630]), [1200, 630]);
});

test('instalador: "cover" vai para posts.cover_url, aparece no topo sem lazy, no og:image/Article.image e nas cards', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-capa-'));
  try {
    const conteudo = path.join(raiz, 'conteudo');
    fs.cpSync(path.join(RAIZ, 'conteudo', 'afiliacao'), conteudo, { recursive: true });
    const dir = path.join(conteudo, 'criativos', 'posts');
    const arq = fs.readdirSync(dir).find((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).slug === 'posts-virais-vale-a-pena');
    const post = JSON.parse(fs.readFileSync(path.join(dir, arq), 'utf8'));
    const capa = '/assets/afiliacao/criativos/posts-virais-vale-a-pena-capa.png';
    Object.assign(post, { cover: capa, coverAlt: 'Ilustração de um feed com três posts em grade' });
    post.content = post.content.replace(/\n\n/, '\n\n![Esquema de carrossel em 5 telas](/assets/afiliacao/criativos/posts-virais-vale-a-pena-1.png)\n\n');
    fs.writeFileSync(path.join(dir, arq), JSON.stringify(post));
    // um post sem "cover" (todos os do repositório já têm capa gerada por tools/afiliacao-capas.mjs)
    const outro = fs.readdirSync(dir).find((f) => f !== arq);
    const semCover = JSON.parse(fs.readFileSync(path.join(dir, outro), 'utf8')); delete semCover.cover; delete semCover.coverAlt;
    fs.writeFileSync(path.join(dir, outro), JSON.stringify(semCover));
    const dados = path.join(raiz, 'dados'); fs.mkdirSync(dados);
    const r = spawnSync(process.execPath, [TOOL, '--dados', dados, '--conteudo', conteudo], { encoding: 'utf8' });
    const saida = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.equal(saida.ok, true, r.stderr);
    assert.ok(JSON.stringify(saida.relato).includes('não está em portal/public'), 'avisa que a imagem ainda não foi copiada');
    const db = openDb(path.join(dados, 'portal.db'));
    const row = db.prepare("SELECT cover_url FROM posts WHERE slug = 'posts-virais-vale-a-pena'").get();
    const pagina = db.prepare("SELECT html FROM paginas_proprias WHERE caminho = 'blog/posts-virais-vale-a-pena'").get().html;
    const lista = db.prepare("SELECT html FROM paginas_proprias WHERE caminho = 'blog' AND html LIKE '%posts-virais-vale-a-pena%'").get().html;
    const home = db.prepare("SELECT html FROM paginas_proprias WHERE caminho = '' AND html LIKE '%posts-virais-vale-a-pena%'").all().map((x) => x.html).join('');
    const semCapa = db.prepare("SELECT cover_url FROM posts WHERE cover_url IS NULL").all().length;
    db.close();
    assert.equal(row.cover_url, capa);
    assert.ok(semCapa > 0, 'post sem "cover" continua com cover_url nulo');
    const topoImg = /<figure class="capa"><img ([^>]+)><\/figure>/.exec(pagina)?.[1] || '';
    assert.match(topoImg, /src="\/assets\/afiliacao\/criativos\/posts-virais-vale-a-pena-capa\.png"/);
    assert.match(topoImg, /alt="Ilustração de um feed com três posts em grade"/);
    assert.match(topoImg, /width="1200" height="630"/);
    assert.ok(!/loading=/.test(topoImg), 'a capa não é lazy');
    assert.match(pagina, /<meta property="og:image" content="https:\/\/criativos\.blog\/assets\/afiliacao\/criativos\/posts-virais-vale-a-pena-capa\.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">/);
    assert.match(pagina, /<meta name="twitter:card" content="summary_large_image">/);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(pagina)[1].replace(/\\u003c/g, '<'));
    assert.equal(ld['@graph'][0].image, 'https://criativos.blog/assets/afiliacao/criativos/posts-virais-vale-a-pena-capa.png');
    assert.match(pagina, /<figure class="blog-fig"><img src="\/assets\/afiliacao\/criativos\/posts-virais-vale-a-pena-1\.png" alt="Esquema de carrossel em 5 telas" loading="lazy"/);
    assert.match(lista, /<img class="gc" src="\/assets\/afiliacao\/criativos\/posts-virais-vale-a-pena-capa\.png" alt="Ilustração de um feed/);
    assert.match(home, /class="gc" src="\/assets\/afiliacao\/criativos\/posts-virais-vale-a-pena-capa\.png"/);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});
