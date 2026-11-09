// Miniaturas de páginas (rascunho, só para quem vê o site) e página nova a partir de uma página de modelo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PORTAL_MINIATURAS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-teste-'));
const { startPortal, client } = await import('./helpers.mjs');
const { gerarPendentes, pendentes, arquivoDe } = await import('../lib/modules/miniaturas.mjs');

test('miniaturas: página nova entra na fila, a captura sai só para quem pode ver, e página nasce de modelo', async () => {
  const p = await startPortal();
  try {
    const su = client(p.url); await su.login('super@teste.local', 'senha-forte-123');
    assert.equal((await su.req('POST', '/api/tenants', { name: 'Clube Mini', number: '10077', niche: 'poker', template: 'clube-poker-premium' })).status, 201);
    assert.equal((await su.req('POST', '/api/tenants', { name: 'Outro Clube', number: '10078', niche: 'poker', template: 'clube-poker-premium' })).status, 201);
    const site = (await su.req('GET', '/api/t/clube-10077/sites')).data.sites[0];
    const home = site.pages[0];
    assert.ok(pendentes(p.db, 100).some((x) => x.tipo === 'pagina' && x.id === home.id), 'página sem miniatura entra na fila');

    // página nova a partir da página "torneios" de outro modelo do nicho
    const nova = await su.req('POST', `/api/t/clube-10077/sites/${site.id}/pages/de-modelo`, { template: 'clube-poker-premium', pagina: 'torneios', title: 'Agenda nova' });
    assert.equal(nova.status, 201, JSON.stringify(nova.data));
    const lida = (await su.req('GET', `/api/t/clube-10077/pages/${nova.data.page.id}`)).data;
    assert.match(JSON.stringify(lida), /Clube Mini/, 'placeholders preenchidos');
    assert.doesNotMatch(JSON.stringify(lida), /\{\{/);
    assert.equal((await su.req('POST', `/api/t/clube-10077/sites/${site.id}/pages/de-modelo`, { template: 'nao-existe' })).status, 400);

    // captura: com Chrome na máquina gera de verdade; sem Chrome, simula o arquivo
    const feitas = await gerarPendentes(p.app, { limite: 1 });
    if (!feitas) { fs.mkdirSync(path.dirname(arquivoDe('pagina', home.id)), { recursive: true }); fs.writeFileSync(arquivoDe('pagina', home.id), Buffer.alloc(3000, 1)); }
    const mapa = (await su.req('GET', '/api/t/clube-10077/miniaturas')).data;
    const alvo = Object.keys(mapa.paginas)[0];
    assert.ok(alvo, 'alguma página já tem miniatura');
    const img = await su.req('GET', mapa.paginas[alvo].split('?')[0], undefined, { raw: true });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    if (feitas) assert.ok(fs.statSync(arquivoDe('pagina', alvo)).size > 2000, 'captura real gravada');
    assert.equal((await su.req('GET', `/api/t/clube-10078/miniaturas/pagina-${alvo}.jpg`, undefined, { raw: true })).status, 404, 'outra operação não vê');
    assert.equal((await client(p.url).req('GET', `/api/t/clube-10077/miniaturas/pagina-${alvo}.jpg`, undefined, { raw: true })).status, 401, 'sem login não vê');
    assert.ok(!pendentes(p.db, 100).some((x) => x.id === alvo), 'página com miniatura em dia sai da fila');
  } finally { await p.close(); }
});
