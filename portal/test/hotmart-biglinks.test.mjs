// Webhook da Hotmart → conversão no BigLinks: hottok, tradução do aviso, sem dado do comprador, falha do BigLinks.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startPortal } from './helpers.mjs';
import { eventoBigLinks } from '../lib/modules/hotmart-biglinks.mjs';

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'hotmart-bl-'));
fs.writeFileSync(path.join(pasta, 'hottok.txt'), 'hottok-de-teste-123\n');
fs.writeFileSync(path.join(pasta, 'chave.txt'), 'bl_sk_chavedeteste123\n');
process.env.HOTMART_HOTTOK_ARQUIVO = path.join(pasta, 'hottok.txt');
process.env.BIGLINKS_CHAVE_ARQUIVO = path.join(pasta, 'chave.txt');
process.env.BIGLINKS_API = 'https://biglinks.teste/api/v1';
process.env.HOTMART_ENSAIO_ARQUIVO = path.join(pasta, 'sem-ensaio.txt'); // o arquivo real do servidor não vale nos testes

const enviados = [];
let respostaBigLinks = 201;
const fetchFalso = async (url, init) => {
  enviados.push({ url, auth: init.headers.Authorization, corpo: JSON.parse(init.body) });
  return new Response(JSON.stringify(respostaBigLinks < 400 ? { dados: { atribuicao: 'atribuido' } } : { erro: { codigo: 'FALHOU' } }), { status: respostaBigLinks });
};
let P;
before(async () => { P = await startPortal({ fetchImpl: fetchFalso }); });
after(async () => { await P.close(); fs.rmSync(pasta, { recursive: true, force: true }); });

const CID = 'blp4uy7tisl1eZ6i42kE9l3p';
const aviso = (event, extra = {}) => ({
  id: 'evt-1', creation_date: 1762630000000, event, version: '2.0.0',
  data: {
    product: { id: 4321, name: 'MM Creative Pro' },
    buyer: { name: 'Fulana de Tal', email: 'fulana@exemplo.com', document: '12345678900' },
    purchase: { transaction: 'HP1234567890', status: 'APPROVED', approved_date: 1762630000000, price: { value: 97, currency_value: 'BRL' }, origin: { src: 'criativos_posts_virais_vale_a_pena', sck: CID } },
    commissions: [{ value: 48.5, source: 'AFFILIATE', currency_value: 'BRL' }, { value: 30, source: 'PRODUCER', currency_value: 'BRL' }],
    ...extra,
  },
});
const enviar = (corpo, hottok = 'hottok-de-teste-123') => fetch(`${P.origin}/api/hooks/hotmart/venda`, {
  method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json', ...(hottok ? { 'X-HOTMART-HOTTOK': hottok } : {}) },
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

test('tradução: compra vira purchase com a comissão do afiliado e o sck como click_id', () => {
  const ev = eventoBigLinks(aviso('PURCHASE_APPROVED'));
  assert.equal(ev.event_name, 'purchase');
  assert.equal(ev.event_id, 'hotmart:HP1234567890:purchase');
  assert.equal(ev.transaction_id, 'hotmart:HP1234567890');
  assert.equal(ev.value, '48.50');
  assert.equal(ev.currency, 'BRL');
  assert.equal(ev.click_id, CID);
  assert.equal(ev.properties.src, 'criativos_posts_virais_vale_a_pena');
  assert.equal(ev.occurred_at, new Date(1762630000000).toISOString());
  const reemb = eventoBigLinks(aviso('PURCHASE_REFUNDED'));
  assert.equal(reemb.event_name, 'refund');
  assert.ok(reemb.refund_id);
  assert.equal(eventoBigLinks(aviso('PURCHASE_BILLET_PRINTED')), null, 'boleto gerado não é venda');
  const semSck = aviso('PURCHASE_APPROVED'); semSck.data.purchase.origin.sck = 'facebook';
  assert.equal(eventoBigLinks(semSck).click_id, null, 'sck que não é do BigLinks não vira click_id');
});

test('receptor: hottok errado ou ausente é recusado e nada vai ao BigLinks', async () => {
  enviados.length = 0;
  assert.equal((await enviar(aviso('PURCHASE_APPROVED'), 'errado')).status, 401);
  assert.equal((await enviar(aviso('PURCHASE_APPROVED'), null)).status, 401);
  assert.equal(enviados.length, 0);
});

test('receptor: compra chega ao BigLinks sem nenhum dado do comprador', async () => {
  enviados.length = 0; respostaBigLinks = 201;
  const r = await enviar(aviso('PURCHASE_APPROVED'));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.atribuicao, 'atribuido');
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].url, 'https://biglinks.teste/api/v1/conversoes');
  assert.equal(enviados[0].auth, 'Bearer bl_sk_chavedeteste123');
  const tudo = JSON.stringify(enviados[0].corpo) + JSON.stringify(P.db.prepare("SELECT data FROM audit WHERE action LIKE 'hotmart.%'").all());
  for (const pessoal of ['Fulana', 'fulana@exemplo.com', '12345678900']) assert.ok(!tudo.includes(pessoal), `não repassa ${pessoal}`);
  assert.ok(!tudo.includes('bl_sk_'), 'a chave não vai para a auditoria');
});

test('receptor: modo ensaio confere e registra, sem mandar nada ao BigLinks', async () => {
  const flag = path.join(pasta, 'ensaio.txt');
  process.env.HOTMART_ENSAIO_ARQUIVO = flag;
  fs.writeFileSync(flag, 'sim');
  try {
    enviados.length = 0;
    const r = await enviar(aviso('PURCHASE_APPROVED'));
    assert.equal(r.status, 200);
    assert.equal(r.data.ensaio, true);
    assert.equal(enviados.length, 0);
    assert.equal((await enviar(aviso('PURCHASE_APPROVED'), 'errado')).status, 401, 'o ensaio também exige o hottok');
  } finally { fs.rmSync(flag, { force: true }); process.env.HOTMART_ENSAIO_ARQUIVO = path.join(pasta, 'sem-ensaio.txt'); }
});

test('receptor: evento sem interesse é ignorado; falha do BigLinks devolve 502 para a Hotmart tentar de novo', async () => {
  enviados.length = 0;
  const ign = await enviar(aviso('PURCHASE_BILLET_PRINTED'));
  assert.equal(ign.status, 200);
  assert.equal(enviados.length, 0);
  respostaBigLinks = 500;
  assert.equal((await enviar(aviso('PURCHASE_APPROVED'))).status, 502);
  respostaBigLinks = 201;
});
