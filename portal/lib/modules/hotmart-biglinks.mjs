// Venda da Hotmart volta ao BigLinks como conversão (pedido do Kbsa em 08/11/2026: "Sim, configura").
// A Hotmart (Ferramentas → Webhook, versão 2.0) chama POST /api/hooks/hotmart/venda com o cabeçalho X-HOTMART-HOTTOK.
// O receptor confere o hottok e manda ao BigLinks (POST /api/v1/conversoes):
//   - compra aprovada/completa → "purchase"; reembolso/chargeback → "refund";
//   - valor = comissão do afiliado (o que entra de verdade); sem comissão no aviso, o preço da compra;
//   - click_id = sck, quando é um click_id do BigLinks (bl + 22 caracteres; o BigLinks repete o bl_cid no sck);
//   - src (<blog>_<post>) e produto vão como propriedades.
// Nenhum dado do comprador (nome, e-mail, documento) é gravado nem repassado.
// Configuração (variáveis de ambiente, com padrão para o Bigue):
//   HOTMART_HOTTOK_ARQUIVO (D:/hotmart-hottok.txt) · BIGLINKS_CHAVE_ARQUIVO (D:/biglinks-chave.txt) · BIGLINKS_API.
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { HttpError, rateLimiter, clientIp } from '../http.mjs';
import { audit as writeAudit } from '../tenants.mjs';

const limite = rateLimiter(300, 60_000);
const ler = (arquivo) => { try { return fs.readFileSync(arquivo, 'utf8').trim(); } catch { return ''; } };
const iguais = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const COMPRA = new Set(['PURCHASE_APPROVED', 'PURCHASE_COMPLETE']);
const DEVOLUCAO = new Set(['PURCHASE_REFUNDED', 'PURCHASE_CHARGEBACK']);
const CLICK_ID = /^bl[A-Za-z0-9]{22}$/;
const limpo = (s, n) => String(s ?? '').replace(/[^\w.:-]+/g, '_').slice(0, n);

/** Traduz o aviso 2.0 da Hotmart para o evento do BigLinks; null quando o evento não interessa. */
export function eventoBigLinks(aviso) {
  const evento = String(aviso?.event || '').toUpperCase();
  const tipo = COMPRA.has(evento) ? 'purchase' : DEVOLUCAO.has(evento) ? 'refund' : null;
  if (!tipo) return null;
  const compra = aviso?.data?.purchase || {};
  const transacao = limpo(compra.transaction, 100);
  if (!transacao) throw new HttpError(400, 'aviso sem data.purchase.transaction');
  const comissao = (aviso?.data?.commissions || []).find((c) => String(c?.source || '').toUpperCase() === 'AFFILIATE');
  const valor = Number(comissao?.value ?? compra?.price?.value);
  const moeda = String(comissao?.currency_value || compra?.price?.currency_value || 'BRL').toUpperCase().slice(0, 3);
  if (!Number.isFinite(valor) || valor < 0) throw new HttpError(400, 'aviso sem valor');
  const sck = String(compra?.origin?.sck || '');
  const quando = Number(compra.approved_date || aviso.creation_date);
  return {
    event_id: `hotmart:${transacao}:${tipo}`,
    event_name: tipo,
    click_id: CLICK_ID.test(sck) ? sck : null,
    transaction_id: `hotmart:${transacao}`,
    ...(tipo === 'refund' ? { refund_id: `hotmart:${transacao}:${limpo(evento, 30).toLowerCase()}` } : {}),
    value: valor.toFixed(2),
    currency: moeda,
    integration_id: 'hotmart',
    ...(Number.isFinite(quando) && quando > 0 ? { occurred_at: new Date(quando).toISOString() } : {}),
    properties: {
      plataforma: 'hotmart',
      evento: evento.toLowerCase(),
      src: String(compra?.origin?.src || '').slice(0, 100) || null,
      produto: String(aviso?.data?.product?.name || '').slice(0, 200) || null,
      produto_id: aviso?.data?.product?.id != null ? String(aviso.data.product.id).slice(0, 40) : null,
      valor_e: comissao ? 'comissao_afiliado' : 'preco',
    },
  };
}

export const routes = [
  {
    method: 'POST', path: '/api/hooks/hotmart/venda', auth: false,
    handler: async ({ req, db, app, body }) => {
      if (!limite(clientIp(req))) throw new HttpError(429, 'limite de avisos por minuto');
      const hottok = ler(process.env.HOTMART_HOTTOK_ARQUIVO || 'D:/hotmart-hottok.txt');
      if (!hottok) throw new HttpError(503, 'receptor sem hottok configurado');
      if (!iguais(req.headers['x-hotmart-hottok'] || '', hottok)) {
        writeAudit(db, { action: 'hotmart.hottok_invalido', data: { ip: clientIp(req) } });
        throw new HttpError(401, 'hottok inválido');
      }
      const ev = eventoBigLinks(body);
      if (!ev) return { status: 200, body: { ok: true, ignorado: String(body?.event || '') } };
      const chave = ler(process.env.BIGLINKS_CHAVE_ARQUIVO || 'D:/biglinks-chave.txt');
      if (!chave) throw new HttpError(503, 'receptor sem chave do BigLinks');
      const api = (process.env.BIGLINKS_API || 'https://kbsa.app/biglinks/api/v1').replace(/\/$/, '');
      const r = await (app.fetchImpl || fetch)(`${api}/conversoes`, {
        method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json' }, body: JSON.stringify(ev),
      });
      const resposta = await r.json().catch(() => ({}));
      const registro = { evento: ev.event_name, transacao: ev.transaction_id, src: ev.properties.src, com_clique: Boolean(ev.click_id), biglinks: r.status, atribuicao: resposta?.dados?.atribuicao || null };
      writeAudit(db, { action: `hotmart.${ev.event_name}`, data: registro });
      // falha do BigLinks devolve 502: a Hotmart tenta de novo, e o mesmo event_id não duplica a conversão
      if (r.status >= 400) throw new HttpError(502, `BigLinks respondeu ${r.status} ${resposta?.erro?.codigo || ''}`.trim());
      return { status: 200, body: { ok: true, ...registro } };
    },
  },
];
