// Atribuição de afiliados.
// Regra (documentada em docs/ARQUITETURA.md): ÚLTIMO CLIQUE VÁLIDO dentro da janela da operação (padrão 30 dias).
//  - Clique: /r/<operação>/<código> grava um clique e o cookie primário pa_<operação> (vale a janela inteira); um clique novo substitui o anterior.
//  - Lead: herda o clique do cookie no momento do envio do formulário.
//  - Conversão: chega por webhook assinado (HMAC) ou integração. Crédito vai para o clique informado na conversão; se não vier,
//    para o clique do lead (por lead_id ou e-mail). Clique fora da janela não credita ninguém.
//  - Duplicidade: (operação, source, external_id) é único; reenvio devolve a conversão existente sem criar outra.
//  - Comissão é calculada depois (módulo de comissões) e só a partir de conversão verified=1. Nunca dispara pagamento.
import { now } from './db.mjs';

export const DEFAULT_WINDOW_DAYS = 30;
export const cookieName = (tenantSlug) => `pa_${String(tenantSlug).replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export function pickUtm(obj = {}) {
  const out = {};
  for (const k of UTM_KEYS) if (obj[k]) out[k] = String(obj[k]).slice(0, 120);
  return out;
}

/** UTM padronizada para links de afiliado: source=afiliado, medium=<canal>, campaign=<campanha>, content=<código>. */
export function affiliateLink(baseUrl, tenantSlug, code, { to = '', medium = 'link', campaign = '' } = {}) {
  const u = new URL(`/r/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(code)}`, baseUrl);
  if (to) u.searchParams.set('to', to);
  u.searchParams.set('utm_source', 'afiliado');
  u.searchParams.set('utm_medium', medium);
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  u.searchParams.set('utm_content', code);
  return u.toString();
}

export const windowDaysOf = (tenant) => {
  const d = Number(JSON.parse(tenant.settings || '{}').attributionWindowDays);
  return Number.isFinite(d) && d >= 1 && d <= 365 ? d : DEFAULT_WINDOW_DAYS;
};

export function recordClick(repo, affiliate, { siteId = null, landing = '', utm = {} } = {}) {
  if (!affiliate || affiliate.status !== 'ativo') return null;
  return repo.insert('clicks', { affiliate_id: affiliate.id, site_id: siteId, landing: String(landing).slice(0, 300), utm: JSON.stringify(pickUtm(utm)) });
}

/** Clique válido para uma data? Devolve o clique ou null. */
export function validClick(repo, clickId, { windowDays, at = now() }) {
  if (!clickId) return null;
  const c = repo.get('clicks', String(clickId));
  if (!c) return null;
  const age = (Date.parse(at) - Date.parse(c.created_at)) / 864e5;
  if (!(age >= -0.01 && age <= windowDays)) return null; // -0.01: tolerância de relógio para eventos no mesmo instante
  const aff = repo.get('affiliates', c.affiliate_id);
  return aff && aff.status === 'ativo' ? c : null;
}

export function attribute(repo, { clickId, lead, windowDays, at }) {
  const direct = validClick(repo, clickId, { windowDays, at });
  if (direct) return { affiliate_id: direct.affiliate_id, click_id: direct.id, rule: 'ultimo_clique', via: 'conversao' };
  const viaLead = lead && validClick(repo, lead.click_id, { windowDays, at });
  if (viaLead) return { affiliate_id: viaLead.affiliate_id, click_id: viaLead.id, rule: 'ultimo_clique', via: 'lead' };
  return { affiliate_id: null, click_id: null, rule: 'sem_credito', via: clickId || lead?.click_id ? 'fora_da_janela_ou_invalido' : 'sem_clique' };
}

const KIND = /^[a-z0-9_]{2,40}$/;

/** Registra conversão verificada (ou não). Devolve { created, conversion }. Idempotente por (source, external_id). */
export function recordConversion(repo, tenant, payload, { verified }) {
  const source = String(payload.source || 'webhook').slice(0, 40);
  const externalId = String(payload.external_id || '').slice(0, 120);
  if (!externalId) throw Object.assign(new Error('external_id é obrigatório'), { status: 400 });
  if (!KIND.test(String(payload.kind || ''))) throw Object.assign(new Error('kind inválido'), { status: 400 });
  const existing = repo.get('conversions', { source, external_id: externalId });
  if (existing) return { created: false, conversion: existing };
  const occurredAt = payload.occurred_at && !Number.isNaN(Date.parse(payload.occurred_at)) ? new Date(payload.occurred_at).toISOString() : now();
  let lead = null;
  if (payload.lead_id) lead = repo.get('leads', String(payload.lead_id));
  if (!lead && payload.email) lead = repo.all('leads', { email: String(payload.email).trim().toLowerCase() }, { limit: 1 })[0] || null;
  const attr = attribute(repo, { clickId: payload.click_id, lead, windowDays: windowDaysOf(tenant), at: occurredAt });
  const value = Math.max(0, Math.round(Number(payload.value_cents) || 0));
  try {
    const conversion = repo.insert('conversions', { source, external_id: externalId, kind: payload.kind, value_cents: value, lead_id: lead?.id || null,
      affiliate_id: attr.affiliate_id, click_id: attr.click_id, attribution: JSON.stringify(attr), verified: verified ? 1 : 0, occurred_at: occurredAt });
    if (lead) repo.insert('lead_events', { lead_id: lead.id, kind: 'conversao', data: JSON.stringify({ kind: payload.kind, value_cents: value, conversion: conversion.id }) });
    return { created: true, conversion };
  } catch (e) {
    if (/UNIQUE/.test(e.message)) return { created: false, conversion: repo.get('conversions', { source, external_id: externalId }) };
    throw e;
  }
}
