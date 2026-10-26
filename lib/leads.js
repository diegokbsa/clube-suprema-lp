// Versão convite: guarda o e-mail do jogador e os cliques de cada passo, para medir o funil.
import { randomUUID } from 'node:crypto';
import { store } from './store.js';
import { sendLeadToSheet } from './sheets.js';

export const LEAD_EVENTS = {
  invite_click: 'Abriu o link do app',
  buy_chips_click: 'Clicou em comprar fichas',
  whatsapp_click: 'Chamou o suporte',
  app_android: 'Baixou no Android',
  app_ios: 'Baixou no iPhone',
  app_desktop: 'Baixou no computador',
};

export function createLead({ email }, { utm = {} } = {}) {
  const existing = store.findLeadByEmail(email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const lead = store.saveLead({ id: randomUUID(), createdAt: now, email, utm, events: {} });
  sendLeadToSheet(lead); // cópia permanente na planilha do Google (só cadastros novos)
  return lead;
}

export function recordLeadEvent(id, type) {
  const lead = store.getLead(id);
  if (!lead || !LEAD_EVENTS[type]) return false;
  lead.events[type] ??= new Date().toISOString();
  store.saveLead(lead);
  return true;
}

export function leadsOverview() {
  const leads = store.listLeads();
  const count = (type) => leads.filter((l) => l.events[type]).length;
  return {
    funnel: {
      leads: leads.length,
      convite: count('invite_click'),
      fichas: count('buy_chips_click'),
      suporte: count('whatsapp_click'),
    },
    list: leads.map(({ id, createdAt, email, utm, events }) => ({ id, createdAt, email, utm, events })),
  };
}
