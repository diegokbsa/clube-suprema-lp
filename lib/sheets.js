// Cópia de cada cadastro numa planilha do Google (Apps Script publicado como app da Web).
// O banco do site (data/db.json) continua sendo a fonte do painel; a planilha é o registro permanente,
// porque no plano grátis do Render o db.json zera a cada deploy ou reinício.
// O código do Apps Script fica em tools/planilha/Code.gs.
import { config } from '../config.js';

const TIMEOUT_MS = 10_000;
const RETRIES = 2;

function leadRow(lead) {
  const u = lead.utm || {};
  return {
    tipo: 'cadastro',
    id: lead.id,
    createdAt: lead.createdAt,
    email: lead.email,
    utm_source: u.utm_source || '',
    utm_medium: u.utm_medium || '',
    utm_campaign: u.utm_campaign || '',
    utm_term: u.utm_term || '',
    utm_content: u.utm_content || '',
    gclid: u.gclid || '',
    fbclid: u.fbclid || '',
    ref: u.ref || '',
    landing: u.landing || '/',
  };
}

async function post(url, payload) {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.ok && /"ok"\s*:\s*true/.test(text)) return true;
      console.warn(`[planilha] resposta inesperada (${res.status}): ${text.slice(0, 160)}`);
    } catch (err) {
      console.warn(`[planilha] tentativa ${attempt + 1} falhou: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return false;
}

// Envia em segundo plano: o cadastro do jogador nunca espera nem falha por causa da planilha.
export function sendLeadToSheet(lead) {
  const url = config.sheets.webhookUrl;
  if (!url) return;
  post(url, leadRow(lead)).then((ok) => {
    if (ok) console.log(`[planilha] cadastro ${lead.id} salvo`);
    else console.error(`[planilha] NÃO salvou o cadastro ${lead.id} (${lead.createdAt})`);
  });
}
