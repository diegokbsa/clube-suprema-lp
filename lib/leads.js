// Versão convite: guarda o e-mail do jogador e os cliques de cada passo, para medir o funil.
import { randomUUID } from 'node:crypto';
import { store } from './store.js';
import { sendLeadToSheet, sendLeadEventToSheet } from './sheets.js';

export const LEAD_EVENTS = {
  invite_click: 'Abriu o link do app',
  buy_chips_click: 'Clicou em comprar fichas',
  whatsapp_click: 'Chamou o suporte',
  app_android: 'Baixou no Android',
  app_ios: 'Baixou no iPhone',
  app_desktop: 'Baixou no computador',
};

export function createLead({ email, whatsapp = '' }, { utm = {} } = {}) {
  const existing = store.findLeadByEmail(email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const lead = store.saveLead({ id: randomUUID(), createdAt: now, email, whatsapp, utm, events: {} });
  sendLeadToSheet(lead); // cópia permanente na planilha do Google (só cadastros novos)
  return lead;
}

// Eventos já mandados à planilha neste processo, para leads que o db.json não tem mais (zera a cada deploy).
const sentToSheet = new Set();

// Cada passo vai também para a planilha (1ª vez de cada um), onde fica mesmo depois de um deploy:
// assim dá para ver se o cadastro baixou o app, clicou em comprar fichas ou chamou o suporte.
export function recordLeadEvent(id, type) {
  if (!LEAD_EVENTS[type]) return false;
  const now = new Date().toISOString();
  const lead = store.getLead(id);
  if (lead) {
    if (lead.events[type]) return true;
    lead.events[type] = now;
    store.saveLead(lead);
  } else if (sentToSheet.has(`${id}:${type}`)) {
    return true;
  }
  sentToSheet.add(`${id}:${type}`);
  sendLeadEventToSheet(id, type, now);
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
    list: leads.map(({ id, createdAt, email, whatsapp, utm, events }) => ({ id, createdAt, email, whatsapp, utm, events })),
  };
}
