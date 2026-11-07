// Peças comuns das automações por operação (PA-151): configuração guardada por operação, token de serviço do redator,
// rotinas ligadas ou não, e o ponto de ligação com a grade de torneios.
//
// Grade de torneios: outra frente faz o módulo de torneios com `gradeDoDia(tenant)`. Aqui só há o encaixe, tolerante:
//   1. `app.gradeDoDia(tenant, { agora, app })`, se alguém pendurar a função no app (testes, ou o próprio módulo no init);
//   2. senão, `gradeDoDia` exportada por `lib/modules/torneios.mjs` (import dinâmico; se o arquivo não existir, segue sem grade).
// A função pode ser assíncrona e devolver null (sem grade hoje). Formatos aceitos (os dois nomes valem):
//   { dia | day, url?, eventos | events | torneios: [{ inicio | start | horario, nome | name, garantido | guaranteed | gtd, buyin | buyIn | buy_in }] }
// `inicio` é um instante (ISO, Date ou milissegundos). Valores em reais como número.
import { createHash, timingSafeEqual } from 'node:crypto';
import { parse } from './db.mjs';
import { registerTable } from './repo.mjs';
import { diaLocal, horaLocal, fusoValido } from './modules/calendar.mjs';

registerTable('automacao_config');

export const FUSO_PADRAO = 'America/Sao_Paulo';
export const fusoDe = (tenant) => {
  const tz = (parse(tenant?.settings, {}) || {}).timezone;
  return fusoValido(tz) ? String(tz) : FUSO_PADRAO;
};

// ---------------------------------------------------------------- configuração por operação

export function lerConfig(repo, chave, padrao = {}) {
  const row = repo.get('automacao_config', { chave });
  return { ...padrao, ...((row && parse(row.config, {})) || {}) };
}

export function gravarConfig(repo, chave, config) {
  const row = repo.get('automacao_config', { chave });
  const texto = JSON.stringify(config);
  if (row) repo.update('automacao_config', row.id, { config: texto });
  else repo.insert('automacao_config', { chave, config: texto });
  return config;
}

/** Laços automáticos ligados? Desligados com PORTAL_SEM_ROTINAS=1, nos testes (node --test) e com app.semRotinas. */
export const rotinasLigadas = (app) => !(process.env.PORTAL_SEM_ROTINAS === '1' || process.env.NODE_TEST_CONTEXT || app.semRotinas);

// ---------------------------------------------------------------- token de serviço (redator externo)

/** Authorization: Bearer <token de serviço> (data/token-servico.txt ou PORTAL_SERVICE_TOKEN; também os extras). */
export function servicoOk(app, header) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(header || ''));
  const tokens = [].concat(app.serviceToken || [], app.serviceTokensExtra || []).filter(Boolean);
  if (!m || !tokens.length) return false;
  const a = createHash('sha256').update(m[1]).digest();
  return tokens.some((t) => timingSafeEqual(a, createHash('sha256').update(String(t)).digest()));
}

// ---------------------------------------------------------------- horários

export const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "9", "9:00", "09:00" -> "09:00"; inválido -> null. */
export function horaOk(valor) {
  const s = String(valor ?? '').trim();
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
  return HORA.test(h) ? h : null;
}

/** A hora local da operação já passou de "HH:MM"? */
export const passouDa = (tz, agora, hhmm) => horaLocal(tz, agora) >= hhmm;

// ---------------------------------------------------------------- texto

const segmentador = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;
export const graficos = (s) => (segmentador ? [...segmentador.segment(String(s ?? ''))].map((x) => x.segment) : [...String(s ?? '')]);
export const tamanho = (s) => graficos(s).length;
export function cortar(s, max) {
  const g = graficos(String(s ?? '').trim());
  return g.length <= max ? g.join('') : `${g.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`;
}

export const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
const valor = (v) => (typeof v === 'number' && Number.isFinite(v) ? brl(v) : (String(v ?? '').trim() || null));

// ---------------------------------------------------------------- grade de torneios (ponto de ligação)

let torneios; // undefined = ainda não tentou; null = não existe
async function moduloDeTorneios() {
  if (torneios !== undefined) return torneios;
  try { torneios = await import('./modules/torneios.mjs'); } catch { torneios = null; }
  return torneios;
}

function fonteDaGrade(app) {
  if (typeof app?.gradeDoDia === 'function') return app.gradeDoDia;
  return null;
}

/** A grade já tem fonte (gancho no app ou módulo de torneios)? */
export async function gradeDisponivel(app) {
  if (fonteDaGrade(app)) return true;
  const mod = await moduloDeTorneios();
  return typeof mod?.gradeEstruturada === 'function';
}

const instante = (v) => {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === 'number') return new Date(v);
  const t = Date.parse(String(v ?? ''));
  return Number.isFinite(t) ? new Date(t) : null;
};

/** Normaliza o que a fonte devolveu. Null quando não há grade utilizável. */
export function normalizarGrade(g, tz, agora = new Date()) {
  if (!g || typeof g !== 'object') return null;
  const lista = g.eventos || g.events || g.torneios;
  if (!Array.isArray(lista)) return null;
  const eventos = lista.map((e) => ({
    inicio: instante(e?.inicio ?? e?.start ?? e?.horario),
    nome: String(e?.nome ?? e?.name ?? e?.titulo ?? '').trim().slice(0, 120),
    garantido: e?.garantido ?? e?.guaranteed ?? e?.gtd ?? null,
    buyin: e?.buyin ?? e?.buyIn ?? e?.buy_in ?? null,
  })).filter((e) => e.inicio && e.nome);
  const url = /^https:\/\/[^\s<>"']+$/i.test(String(g.url || '')) ? String(g.url) : '';
  return { dia: String(g.dia || g.day || diaLocal(tz, agora)).slice(0, 10), url, eventos, total: eventos.length };
}

/** Grade do dia da operação, ou null (sem módulo de torneios, sem grade hoje ou falha da fonte). Nunca lança. */
export async function obterGrade(app, tenant, { agora = new Date() } = {}) {
  try {
    let fonte = fonteDaGrade(app);
    if (!fonte) {
      const mod = await moduloDeTorneios();
      if (typeof mod?.gradeEstruturada === 'function') fonte = mod.gradeEstruturada;
    }
    if (!fonte) return null;
    return normalizarGrade(await fonte(tenant, { agora, app }), fusoDe(tenant), agora);
  } catch (e) {
    console.error(`[automacao] grade de torneios: ${String(e?.message || e).slice(0, 200)}`);
    return null;
  }
}

/** Os maiores garantidos que ainda vão começar, em ordem de horário. */
export function destaques(grade, agora = new Date(), n = 8) {
  if (!grade) return [];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return grade.eventos.filter((e) => e.inicio > agora)
    .sort((a, b) => num(b.garantido) - num(a.garantido) || a.inicio - b.inicio)
    .slice(0, Math.max(1, Math.min(20, Number(n) || 8)))
    .sort((a, b) => a.inicio - b.inicio);
}

/** Uma linha por torneio, sem HTML: "20:00 · Nome · R$ 10.000 GTD · buy-in R$ 50". */
export function linhasDaGrade(eventos, tz) {
  return eventos.map((e) => {
    const gtd = valor(e.garantido);
    const buy = e.buyin === 0 ? 'freeroll' : valor(e.buyin);
    return { hora: horaLocal(tz, e.inicio), nome: e.nome, garantido: gtd, buyin: buy };
  });
}

export const diaRotulo = (tz, agora = new Date()) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit' }).format(agora);
