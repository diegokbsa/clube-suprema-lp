// Grade de torneios da Liga Suprema para a página /torneios: a mesma de https://www.sx-co.com/torneios.
// Fonte: API pública da PokerByte, liga 106 ("Suprema"): /mtt/list/106/all/<AAAA-MM-DD>/guaranteed/desc, em que a data
// é o dia de Brasília e os horários vêm em UTC. O "dia de poker" vai das 7h às 7h do dia seguinte (como no site da SX).
// Cada dia fica 10 min em memória; se a API cair, vale a última resposta boa daquele dia.
const API = 'https://api.pokerbyte.com.br/mtt/list/106/all/';
const TTL_MS = 10 * 60_000;
const DAY_START_H = 7;
const cache = new Map(); // 'AAAA-MM-DD' -> { at, list }

const brDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const brHour = (d) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(d));
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00-03:00`) + n * 86400_000).toISOString().slice(0, 10);

async function fetchDay(day) {
  const hit = cache.get(day);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.list;
  try {
    const res = await fetch(`${API}${day}/guaranteed/desc`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Object.values(data || {}).find(Array.isArray) || [];
    cache.set(day, { at: Date.now(), list });
    return list;
  } catch (err) {
    console.warn(`[torneios] ${day}: ${err.message}`);
    return hit ? hit.list : null;
  }
}

function normalize(t) {
  const start = new Date(t.date);
  const late = t.late ? new Date(t.late) : null;
  return {
    id: t.id,
    name: String(t.name || 'Torneio').trim(),
    start,
    late: late && !Number.isNaN(late.getTime()) ? late : null,
    type: String(t.type || 'NLH').toUpperCase(),
    buyin: Number(t.buyin || 0),
    guaranteed: Number(t.guaranteed || 0),
    stack: Number(t.stack || 0),
    blinds: Number(t.temponivelmMeta || 0),
    mainEvent: t.tournament === 'Main Event',
    satellite: t.tournament === 'Satelite' || Number(t.stack || 0) === 0,
    ko: Boolean(t.isKO),
    seats: Number(t.maxPl || 0),
  };
}

// Formatação comum à página, à versão em texto e aos posts do Telegram e do Bluesky (tudo no horário de Brasília).
const TZ = 'America/Sao_Paulo';
export const hhmm = (d) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
export const brl = (n) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
export const kilo = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
export const modality = (t) => t.replace(/^PLO(\d)$/, 'PLO $1'); // "PLO5" em caixa alta espaçada parece "PLOS"
export function dayLabel(grade) {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(grade.from);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const shortDay = (grade) => grade.day.slice(8, 10) + '/' + grade.day.slice(5, 7);
// Os n maiores garantidos do dia (sem satélites), em ordem de horário.
export const highlights = (events, n) => events.filter((e) => !e.satellite).sort((a, b) => b.guaranteed - a.guaranteed).slice(0, n).sort((a, b) => a.start - b.start);

// { day, from, to, events } com os torneios do dia de poker em ordem de horário, ou null se a API não respondeu.
export async function getGrade(now = new Date()) {
  const today = brDate(now);
  const day = brHour(now) < DAY_START_H ? addDays(today, -1) : today;
  const from = new Date(`${day}T0${DAY_START_H}:00:00-03:00`);
  const to = new Date(from.getTime() + 86400_000);
  const lists = await Promise.all([fetchDay(day), fetchDay(addDays(day, 1))]);
  if (lists.every((l) => l === null)) return null;
  const seen = new Set();
  const events = lists.flat().filter(Boolean)
    .filter((t) => t.date && !seen.has(t.id) && seen.add(t.id))
    .map(normalize)
    .filter((e) => e.start >= from && e.start < to)
    .sort((a, b) => a.start - b.start || b.guaranteed - a.guaranteed);
  return { day, from, to, events };
}
