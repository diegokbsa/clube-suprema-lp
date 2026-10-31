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
    referrer: u.referrer || '',
    whatsapp: lead.whatsapp || '',
  };
}

// Devolve a resposta do script ({ ok: true, ... }) ou null depois das tentativas.
async function call(url, payload) {
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
      const data = res.ok ? JSON.parse(text || '{}') : null;
      if (data?.ok === true) return data;
      console.warn(`[planilha] resposta inesperada (${res.status}): ${text.slice(0, 160)}`);
    } catch (err) {
      console.warn(`[planilha] tentativa ${attempt + 1} falhou: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

const post = async (url, payload) => (await call(url, payload)) !== null;

// Envia em segundo plano: o cadastro do jogador nunca espera nem falha por causa da planilha.
// O script responde a cada cadastro novo com o e-mail de boas-vindas (ver Code.gs).
export function sendLeadToSheet(lead) {
  const url = config.sheets.webhookUrl;
  if (!url) return;
  post(url, leadRow(lead)).then((ok) => {
    if (ok) console.log(`[planilha] cadastro ${lead.id} salvo`);
    else console.error(`[planilha] NÃO salvou o cadastro ${lead.id} (${lead.createdAt})`);
  });
}

// Passo do lead (abriu o link do app, comprou fichas, chamou o suporte): o script anota na linha do cadastro.
export function sendLeadEventToSheet(id, type, at) {
  const url = config.sheets.webhookUrl;
  if (!url) return;
  post(url, { tipo: 'evento', id, evento: type, quando: at }).then((ok) => {
    if (!ok) console.warn(`[planilha] não anotou ${type} do cadastro ${id}`);
  });
}

// Post novo do blog na aba "Posts" (o script ignora o que já está lá): é dela que sai o e-mail semanal de novidades.
export async function registerPostInSheet(p) {
  const url = config.sheets.webhookUrl;
  if (!url) return false;
  return post(url, { tipo: 'post', slug: p.slug, titulo: p.title, resumo: p.description, data: p.date, capa: p.cover });
}

// Registro dos posts mandados ao Telegram (aba "Telegram"): devolve true se o post ainda não foi confirmado
// como enviado, false se já foi ou se a planilha não respondeu (melhor não postar do que postar repetido).
export async function claimTelegramPost(slug) {
  const url = config.sheets.webhookUrl;
  if (!url) return false;
  const res = await call(url, { tipo: 'telegram', slug });
  return res?.novo === true;
}

// Resultado do envio na coluna Situação: "enviado" ou "falhou: <motivo>" (o que falhou é tentado no próximo deploy).
export async function reportTelegramPost(slug, ok, erro = '') {
  const url = config.sheets.webhookUrl;
  if (!url) return;
  await call(url, { tipo: 'telegram-resultado', slug, ok, erro: String(erro).slice(0, 180) });
}

// Grupos do Telegram com o robô (aba "Grupos"): situacao = ativo, pausado, saiu ou migrou; ultima = dia da grade já enviada.
export async function registerGroup({ id, titulo = '', tipoChat = '', situacao, ultima = '' }) {
  const url = config.sheets.webhookUrl;
  if (!url) return false;
  return post(url, { tipo: 'grupo', id: String(id), titulo: String(titulo).slice(0, 120), tipoChat, situacao, ultima });
}

// Grupos ativos que ainda não receberam a grade do dia (a planilha marca "enviando"), ou null se ela não respondeu.
export async function claimGroupsForGrade(dia) {
  const url = config.sheets.webhookUrl;
  if (!url) return null;
  const res = await call(url, { tipo: 'grupos-grade', dia });
  return res ? res.grupos || [] : null;
}

export async function reportGroupGrade(id, dia, ok, erro = '', sair = false) {
  const url = config.sheets.webhookUrl;
  if (!url) return;
  await call(url, { tipo: 'grupo-grade', id: String(id), dia, ok, erro: String(erro).slice(0, 180), sair });
}
