// Placar diário (12/11/2026): cliques do BigLinks por src (site_post) × visitas do contador, por site, post e canal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, lerSrc, placarDoDia, prefixosDosSites } from '../lib/modules/visitas.mjs';

function banco() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA_SQL);
  db.exec('CREATE TABLE sites (slug TEXT, domain TEXT)');
  for (const [s, d] of [['af-achadinhos', 'achadinhosnapratica.blog'], ['af-gamer', 'modolive.blog'], ['hot-poker', 'hotpoker.club']]) db.prepare('INSERT INTO sites VALUES (?, ?)').run(s, d);
  const v = db.prepare("INSERT INTO visitas (criado_em, dia, site, tipo, caminho, interno) VALUES ('2026-11-12T12:00:00Z', ?, ?, 'v', ?, ?)");
  for (let i = 0; i < 8; i++) v.run('2026-11-12', 'achadinhosnapratica.blog', '/blog/cinco-achadinhos-organizacao-cozinha-shopee-ate-35', 0);
  v.run('2026-11-12', 'achadinhosnapratica.blog', '/', 0);
  v.run('2026-11-12', 'achadinhosnapratica.blog', '/', 1); // rede interna fica fora
  v.run('2026-11-12', 'suprema.blog', '/blog/como-entrar-no-clube-suprema', 0);
  v.run('2026-11-11', 'modolive.blog', '/', 0); // outro dia
  return db;
}

test('prefixos: blogs af-<x> viram <x>; hotpoker e suprema', () => {
  const p = prefixosDosSites(banco());
  assert.equal(p.achadinhos, 'achadinhosnapratica.blog');
  assert.equal(p.gamer, 'modolive.blog');
  assert.equal(p.hotpoker, 'hotpoker.club');
  assert.equal(p.suprema, 'suprema.blog');
});

test('lerSrc: site, story, canal externo e desconhecido', () => {
  const p = prefixosDosSites(banco());
  assert.deepEqual(lerSrc('achadinhos_cinco_achadinhos_organizacao_cozinha_sh', p), { site: 'achadinhosnapratica.blog', post: 'cinco_achadinhos_organizacao_cozinha_sh', canal: 'site' });
  assert.deepEqual(lerSrc('achadinhos_home', p), { site: 'achadinhosnapratica.blog', post: 'home', canal: 'site' });
  assert.deepEqual(lerSrc('achadinhos_story_cesto_de_roupa', p), { site: 'achadinhosnapratica.blog', post: 'cesto_de_roupa', canal: 'story' });
  assert.deepEqual(lerSrc('telegram_achadinhos', p), { site: 'achadinhosnapratica.blog', post: null, canal: 'telegram' });
  assert.deepEqual(lerSrc('teste_shopee', p), { site: null, post: null, canal: 'outro' });
  assert.deepEqual(lerSrc(null, p), { site: null, post: null, canal: 'sem src' });
});

test('placar do dia: taxa = cliques de gente ÷ visitas; robô conta clique mas não entra na taxa', () => {
  const db = banco();
  const linhas = [
    { dia: '2026-11-12', src: 'achadinhos_cinco_achadinhos_organizacao_cozinha_sh', link: 'sp-ach-cesto-dobravel', cliques: 4, humanos: 4 },
    { dia: '2026-11-12', src: 'achadinhos_home', link: 'pack-achadinhos', cliques: 30, humanos: 0 }, // robôs da home
    { dia: '2026-11-12', src: 'suprema_como_entrar_no_clube_suprema', link: 'sx-wa-ajuda', cliques: 1, humanos: 1 },
    { dia: '2026-11-12', src: 'telegram_achadinhos', link: 'sp-ach-garrafa-termica', cliques: 2, humanos: 1 },
    { dia: '2026-11-11', src: 'gamer_home', link: 'transmissao-pro', cliques: 9, humanos: 0 },
  ];
  const p = placarDoDia(db, linhas, '2026-11-12');
  assert.deepEqual(p.total, { visitas: 10, cliques: 37, humanos: 6, taxa: 60 });
  const ach = p.porSite.find((x) => x.site === 'achadinhosnapratica.blog');
  assert.deepEqual(ach, { site: 'achadinhosnapratica.blog', visitas: 9, cliques: 36, humanos: 5, taxa: 55.6 });
  const post = p.porPost[0];
  assert.equal(post.caminho, '/blog/cinco-achadinhos-organizacao-cozinha-shopee-ate-35'); // src cortado casa com o caminho inteiro
  assert.deepEqual([post.visitas, post.cliques, post.humanos, post.taxa], [8, 4, 4, 50]);
  assert.deepEqual(p.porSite.find((x) => x.site === 'suprema.blog'), { site: 'suprema.blog', visitas: 1, cliques: 1, humanos: 1, taxa: 100 });
  assert.deepEqual(p.porCanal.map((c) => [c.canal, c.cliques, c.humanos]), [['site', 35, 5], ['telegram', 2, 1]]);
  assert.ok(!p.porSite.some((x) => x.site === 'modolive.blog')); // outro dia não entra
});
