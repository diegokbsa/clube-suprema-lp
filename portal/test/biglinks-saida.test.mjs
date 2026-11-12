// BigLinks na saída do site (12/11/2026): botões mapeados viram l.kbsa.app/<slug>?src=<site>_<página>, com nofollow.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { comBigLinks, paginaDe, definirTabela } from '../lib/biglinks-saida.mjs';

const WA = 'https://wa.me/5511952138293?text=Oi!%20Venho%20do%20clube';

test('a tabela real do hotpoker aponta só para slugs do BigLinks', () => {
  const t = JSON.parse(fs.readFileSync(new URL('../conteudo/biglinks-destinos.json', import.meta.url), 'utf8'));
  const hp = t['hotpoker.club'];
  assert.equal(hp._prefixo, 'hotpoker');
  for (const [destino, slug] of Object.entries(hp)) {
    if (destino.startsWith('_')) continue;
    assert.match(destino, /^https:\/\//);
    assert.match(slug, /^(hp|sx)-[a-z0-9-]+$/);
  }
});

test('página: raiz, número, post e caminho comum', () => {
  assert.equal(paginaDe(''), 'home');
  assert.equal(paginaDe('1'), 'pagina_1');
  assert.equal(paginaDe('blog/fichas-por-pix-no-hot-poker'), 'fichas_por_pix_no_hot_poker');
  assert.equal(paginaDe('blog'), 'blog');
  assert.equal(paginaDe('torneios?x=1'), 'torneios');
});

test('troca o destino mapeado (com &amp; no HTML), põe src e nofollow; o resto fica igual', () => {
  definirTabela({ 'hotpoker.club': { _prefixo: 'hotpoker', [WA]: 'hp-wa-suporte', 'https://www.instagram.com/hotpoker.agent': 'hp-ig' } });
  const html = `<p><a class="btn" href="${WA.replace(/&/g, '&amp;')}" rel="noopener" target="_blank">WhatsApp</a>
<a href="https://www.instagram.com/hotpoker.agent">IG</a> <a href="https://supremapoker.com.br/jogo-consciente" rel="noopener">Jogo consciente</a></p>`;
  const out = comBigLinks(html, 'hotpoker.club', 'blog/como-entrar-no-hot-poker');
  assert.match(out, /<a class="btn" rel="nofollow noopener" target="_blank" href="https:\/\/l\.kbsa\.app\/hp-wa-suporte\?src=hotpoker_como_entrar_no_hot_poker">WhatsApp<\/a>/);
  assert.match(out, /<a rel="nofollow noopener" href="https:\/\/l\.kbsa\.app\/hp-ig\?src=hotpoker_como_entrar_no_hot_poker">IG<\/a>/);
  assert.match(out, /href="https:\/\/supremapoker\.com\.br\/jogo-consciente" rel="noopener"/); // referência não muda
  assert.equal(comBigLinks(html, 'outro.site', ''), html); // site sem tabela não muda
});

test('mantém sponsored e não duplica nofollow', () => {
  definirTabela({ 'hotpoker.club': { [WA]: 'hp-wa-suporte' } });
  const out = comBigLinks(`<a href="${WA}" rel="sponsored nofollow">x</a>`, 'hotpoker.club', '');
  assert.equal(out, '<a rel="sponsored nofollow" href="https://l.kbsa.app/hp-wa-suporte?src=hotpoker_home">x</a>');
});
