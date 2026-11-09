// Ofertas do dia (<domínio>/ofertas) nos blogs de produto físico: preço e data visíveis, link patrocinado, estado vazio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../lib/db.mjs';
import { linkOferta } from '../tools/afiliacao-visual.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONT = path.join(RAIZ, 'conteudo', 'afiliacao');
const links = JSON.parse(fs.readFileSync(path.join(CONT, 'links.json'), 'utf8'));
const catalogo = JSON.parse(fs.readFileSync(path.join(CONT, 'produtos.json'), 'utf8'));
const ativo = Object.keys(links).find((k) => links[k].status === 'ativo' && catalogo[k]);
const inativo = Object.keys(links).find((k) => links[k].status !== 'ativo');

test('linkOferta: só produto ativo ou https de loja conhecida; o resto some', () => {
  const dados = { catalogo, links };
  assert.ok(linkOferta(`{{LINK:${ativo}}}`, dados), 'produto ativo vira link');
  if (inativo) assert.equal(linkOferta(`{{LINK:${inativo}}}`, dados), null, 'produto sem afiliação ativa não entra');
  assert.equal(linkOferta('https://s.shopee.com.br/abc123', dados), 'https://s.shopee.com.br/abc123');
  assert.equal(linkOferta('https://www.amazon.com.br/dp/B0X?tag=x', dados), 'https://www.amazon.com.br/dp/B0X?tag=x');
  assert.equal(linkOferta('http://s.shopee.com.br/abc', dados), null, 'sem https não entra');
  assert.equal(linkOferta('https://golpe.example.com/shopee.com.br', dados), null, 'outra loja não entra');
  assert.equal(linkOferta('https://shopee.com.br/x" onclick="y', dados), null, 'aspas não entram');
});

test('instalador: /ofertas com preço e data visíveis, rel sponsored, estado vazio e sitemap só com item válido', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'afiliacao-ofertas-'));
  try {
    const conteudo = path.join(raiz, 'conteudo');
    fs.cpSync(CONT, conteudo, { recursive: true });
    for (const b of fs.readdirSync(conteudo)) fs.rmSync(path.join(conteudo, b, 'ofertas.json'), { force: true });
    fs.writeFileSync(path.join(conteudo, 'achadinhos', 'ofertas.json'), JSON.stringify({ atualizado: '2026-11-09T06:30:00-03:00', itens: [
      { nome: 'Mini aspirador portátil', preco: 89.9, preco_conferido_em: '2026-11-09T06:20:00-03:00', loja: 'Shopee', link: 'https://s.shopee.com.br/teste1', imagem: 'https://cf.shopee.com.br/file/x.jpg', nota: 'Frete varia por CEP.' },
      { nome: 'Item sem afiliação', preco: 10, preco_conferido_em: '2026-11-09T06:20:00-03:00', loja: 'X', link: `{{LINK:${inativo || 'nao-existe'}}}` },
      { nome: 'Item sem preço', preco_conferido_em: '2026-11-09T06:20:00-03:00', loja: 'Shopee', link: 'https://s.shopee.com.br/teste2' },
    ] }));
    const dados = path.join(raiz, 'dados'); fs.mkdirSync(dados);
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'tools', 'afiliacao-instalar.mjs'), '--dados', dados, '--conteudo', conteudo], { encoding: 'utf8' });
    assert.equal(JSON.parse(r.stdout.trim().split('\n').pop()).ok, true, r.stderr);
    const db = openDb(path.join(dados, 'portal.db'));
    const pag = (dominioLike) => db.prepare("SELECT p.html, p.indexar FROM paginas_proprias p JOIN sites s ON s.id = p.site_id WHERE p.caminho = 'ofertas' AND s.slug = ?").get(dominioLike);
    const a = pag('af-achadinhos'); const s = pag('af-sublimacao'); const c = pag('af-criativos');
    db.close();
    assert.ok(a, 'achadinhos tem /ofertas');
    assert.equal((a.html.match(/<article class="card">/g) || []).length, 1, 'só o item válido aparece');
    assert.match(a.html, /R\$\s?89,90/);
    assert.match(a.html, /preço conferido em 09 de novembro de 2026/);
    assert.match(a.html, /href="https:\/\/s\.shopee\.com\.br\/teste1" rel="sponsored nofollow noopener" target="_blank"/);
    assert.ok(!a.html.includes('Item sem afiliação') && !a.html.includes('Item sem preço'));
    assert.equal(Number(a.indexar), 1, 'com item válido entra no sitemap');
    assert.ok(s, 'sublimacao tem /ofertas mesmo sem ofertas.json');
    assert.match(s.html, /Em breve/);
    assert.equal(Number(s.indexar), 0, 'vazia fica fora do sitemap');
    assert.equal(c, undefined, 'blog que não é de produto físico e não tem ofertas.json não ganha /ofertas');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});
