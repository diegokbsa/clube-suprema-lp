// Histórico diário do Search Console: usa a conexão de qualquer operação, grava série/consultas/indexação e exporta os JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startPortal } from './helpers.mjs';
import { createTenant } from '../lib/tenants.mjs';
import { coletar, propriedadeDo, dominios } from '../lib/modules/sc-historico.mjs';

const resposta = (obj, status = 200) => ({ ok: status < 300, status, json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });

test('propriedade: domínio, depois prefixo com e sem www', () => {
  assert.equal(propriedadeDo('milhas.blog', [{ siteUrl: 'https://milhas.blog/' }, { siteUrl: 'sc-domain:milhas.blog' }]), 'sc-domain:milhas.blog');
  assert.equal(propriedadeDo('milhas.blog', [{ siteUrl: 'https://www.milhas.blog/' }]), 'https://www.milhas.blog/');
  assert.equal(propriedadeDo('milhas.blog', [{ siteUrl: 'sc-domain:outro.blog' }]), null);
});

test('coleta: série, 50 consultas, inspeção do sitemap, pendência do domínio sem propriedade e arquivos exportados', async (t) => {
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    chamadas.push(u);
    if (u.endsWith('/webmasters/v3/sites')) return resposta({ siteEntry: [{ siteUrl: 'sc-domain:milhas.blog', permissionLevel: 'siteOwner' }, { siteUrl: 'sc-domain:fantasma.blog', permissionLevel: 'siteUnverifiedUser' }] });
    if (u.includes('/searchAnalytics/query')) {
      const b = JSON.parse(init.body);
      if (b.dimensions[0] === 'date') return resposta({ rows: [{ keys: ['2026-11-09'], impressions: 40, clicks: 2, ctr: 0.05, position: 18.2 }, { keys: ['2026-11-10'], impressions: 60, clicks: 3, ctr: 0.05, position: 12.4 }] });
      return resposta({ rows: Array.from({ length: 60 }, (_, i) => ({ keys: [`consulta ${i}`], impressions: 100 - i, clicks: 0, ctr: 0, position: 9 })) });
    }
    if (u.includes('/sitemaps')) return resposta({ sitemap: [{ contents: [{ type: 'web', submitted: '3', indexed: '1' }] }] });
    if (u === 'https://milhas.blog/sitemap.xml') return resposta('<urlset><url><loc>https://milhas.blog/</loc></url><url><loc>https://milhas.blog/a</loc></url><url><loc>https://milhas.blog/b</loc></url></urlset>');
    if (u.includes('urlInspection')) { const b = JSON.parse(init.body); return resposta({ inspectionResult: { indexStatusResult: { verdict: b.inspectionUrl.endsWith('/b') ? 'NEUTRAL' : 'PASS', coverageState: 'x' } } }); }
    if (u.includes('oauth2.googleapis.com/token')) return resposta({ access_token: 'novo', expires_in: 3600 });
    return resposta({}, 404);
  };
  const p = await startPortal({ fetchImpl });
  t.after(() => p.close());
  const { tenant } = createTenant(p.db, { name: 'Hot', niche: 'poker', slug: 'hot-teste' }, { userId: p.superUser.id });
  p.db.prepare("INSERT INTO sites (id, tenant_id, slug, name, domain, status, created_at) VALUES ('s1', ?, 'milhas', 'Milhas', 'milhas.blog', 'publicado', 'x')").run(tenant.id);
  p.db.prepare("INSERT INTO sites (id, tenant_id, slug, name, domain, status, created_at) VALUES ('s2', ?, 'caminho', 'C', 'kbsa.app/x', 'publicado', 'x')").run(tenant.id);
  const segredo = p.app.vault.seal(JSON.stringify({ clientId: 'cliente-teste-123', clientSecret: 'segredo-teste-12345', accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3_600_000 }));
  p.db.prepare("UPDATE integrations SET status = 'conectado', secret = ? WHERE tenant_id = ? AND kind = 'google_search_console'").run(segredo, tenant.id);

  assert.deepEqual(dominios(p.db), ['milhas.blog', 'suprema.blog'], 'domínio com caminho fica fora; suprema.blog entra como extra');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-hist-'));
  const r = await coletar(p.app, { dir });
  assert.equal(r.ok, 1);
  const serie = p.db.prepare("SELECT dia, impressoes, cliques, posicao FROM sc_diario WHERE dominio = 'milhas.blog' AND fonte = 'google' ORDER BY dia").all();
  assert.deepEqual(serie.map((x) => [x.dia, x.impressoes, x.cliques]), [['2026-11-09', 40, 2], ['2026-11-10', 60, 3]]);
  const cons = JSON.parse(p.db.prepare("SELECT consultas FROM sc_consultas WHERE dominio = 'milhas.blog' AND dia = '2026-11-10'").get().consultas);
  assert.equal(cons.length, 50, 'só as 50 com mais impressões');
  assert.equal(cons[0].consulta, 'consulta 0');
  const idx = p.db.prepare("SELECT * FROM sc_indexacao WHERE dominio = 'milhas.blog'").get();
  assert.deepEqual([idx.sitemap_urls, idx.inspecionadas, idx.indexadas, idx.enviadas, idx.indexadas_sitemap], [3, 3, 2, 3, 1]);
  const pend = r.estado.pendencias.find((x) => x.dominio === 'suprema.blog');
  assert.equal(pend.tipo, 'propriedade_ausente');
  assert.ok(r.estado.pendencias.some((x) => x.tipo === 'bing_sem_chave'));

  const resumo = JSON.parse(fs.readFileSync(path.join(dir, 'search-console', 'resumo.json'), 'utf8'));
  const m = resumo.dominios.find((x) => x.dominio === 'milhas.blog');
  assert.equal(m.ultimos7.impressoes, 100);
  assert.equal(m.indexacao.indexadas, 2);
  assert.equal(resumo.medianasBlogs.n, 1);
  const arq = JSON.parse(fs.readFileSync(path.join(dir, 'search-console', 'milhas.blog.json'), 'utf8'));
  assert.equal(arq.google.length, 2);
  assert.equal(arq.google[1].consultas.length, 50);
  assert.ok(!JSON.stringify(resumo).includes('tok'), 'token não vai para o arquivo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Fábrica: rede-fabrica.json entra na lista só com dominio preenchido e fica fora da mediana dos 10', async () => {
  const { dominiosFabrica, resumoGeral } = await import('../lib/modules/sc-historico.mjs');
  const { openDb } = await import('../lib/db.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-fab-'));
  fs.mkdirSync(path.join(dir, 'search-console'));
  fs.writeFileSync(path.join(dir, 'search-console', 'rede-fabrica.json'), JSON.stringify({ blogs: {
    a: { id: 'a', dominio: '' }, b: { id: 'b', dominio: 'https://www.disparocerto.blog/' }, c: { id: 'c', dominio: 'ruim' } } }));
  assert.deepEqual(dominiosFabrica(dir), ['disparocerto.blog']);
  const db = openDb(':memory:');
  db.exec((await import('../lib/modules/sc-historico.mjs')).SCHEMA_SQL);
  const r = resumoGeral(db, { dominios: [{ dominio: 'disparocerto.blog', estado: 'ok' }, { dominio: 'milhas.blog', estado: 'ok' }], pendencias: [], log: [], fabrica: ['disparocerto.blog'] });
  assert.equal(r.medianasBlogs.n, 1);
  assert.equal(r.medianasFabrica.n, 1);
  assert.equal(r.dominios.find((x) => x.dominio === 'disparocerto.blog').origem, 'fabrica');
  fs.rmSync(dir, { recursive: true, force: true });
});
