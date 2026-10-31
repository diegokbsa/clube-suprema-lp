// Robô do Telegram (o mesmo TELEGRAM_BOT_TOKEN que posta no canal) que leva a grade de torneios a outros grupos:
//   - responde /torneios (os maiores do dia que ainda vão começar), /clube (ID, agente e como entrar) e /ajuda, no privado
//     e em qualquer grupo que o adicionar;
//   - manda a grade nos grupos ativos todo dia a partir das 9h (gradeToGroups, chamada por shareDailyGrade). Quem adiciona
//     o robô depois das 9h já recebe a grade do dia. O admin do grupo pausa com /pausar e volta com /ativar;
//   - os grupos ficam na aba "Grupos" da planilha, porque no Render grátis o disco zera a cada deploy.
// As mensagens chegam por long polling (getUpdates): sem rota pública e sem segredo novo. Só liga no Render (server.js).
import { config } from '../config.js';
import { SITE } from './blog.js';
import { claimGroupsForGrade, registerGroup, reportGroupGrade } from './sheets.js';
import { getGrade, highlights, hhmm, brl, dayLabel } from './torneios.js';

const GRADE_HOUR = 9;
const TOP = 8;
const COOLDOWN_MS = 20_000; // o mesmo comando no mesmo chat: no máximo 1 resposta a cada 20 s
const GROUP_TYPES = new Set(['group', 'supergroup']);
const INSIDE = new Set(['member', 'administrator', 'creator', 'restricted']);
const ANON_ADMIN = 1087968824; // @GroupAnonymousBot: admin que escreve como o próprio grupo
// Erros de envio que querem dizer "o robô não está mais lá" (o grupo sai da lista em vez de tentar de novo).
const GONE = /kicked|not a member|chat not found|bot was blocked|deactivated|have no rights|not enough rights|CHAT_WRITE_FORBIDDEN/i;
const ALIASES = { start: 'ajuda', ajuda: 'ajuda', help: 'ajuda', torneios: 'torneios', grade: 'torneios', hoje: 'torneios', clube: 'clube', entrar: 'clube', pausar: 'pausar', ativar: 'ativar' };
const COMMANDS = [
  { command: 'torneios', description: 'Os maiores torneios de hoje na Liga Suprema' },
  { command: 'clube', description: 'Como entrar no Clube Suprema (ID 10001)' },
  { command: 'ajuda', description: 'O que este robô faz' },
];
const ADMIN_COMMANDS = [
  ...COMMANDS.slice(0, 2),
  { command: 'pausar', description: 'Parar a grade das 9h neste grupo' },
  { command: 'ativar', description: 'Voltar a receber a grade das 9h' },
  COMMANDS[2],
];
const DESCRIPTION = 'Grade de torneios da Liga Suprema no Suprema Poker, todo dia, no horário de Brasília: horário, garantido e buy-in dos maiores torneios. Use /torneios para ver agora ou me adicione ao seu grupo para receber a grade às 9h. Clube Suprema · ID 10001. Somente maiores de 18 anos.';
const SHORT_DESCRIPTION = 'Torneios do dia da Liga Suprema (Suprema Poker), no horário de Brasília. Grade às 9h no seu grupo. 18+';
const RESPONSIBLE = '18+ · Jogue com responsabilidade.';

const state = { started: false, me: null, polledAt: null };
const lastReply = new Map(); // 'chat:comando' -> hora da última resposta
const welcomedAt = new Map(); // chat -> hora da mensagem de boas-vindas

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hourBR = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(d));

export const botUsername = () => state.me?.username || '';
// Para o vigia (GET /api/robo): o robô está lendo as mensagens? Sem dados de grupos.
export const botStatus = () => ({
  ativo: Boolean(state.me),
  robo: state.me ? '@' + state.me.username : '',
  entraEmGrupos: state.me ? Boolean(state.me.can_join_groups) : null,
  ultimaLeitura: state.polledAt ? state.polledAt.toISOString() : null,
});

class TelegramError extends Error {
  constructor(message, status, params) {
    super(message);
    this.status = status;
    this.params = params || {};
  }
}

async function api(method, body = {}, timeoutMs = 15_000) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new TelegramError(`${method}: ${String(data.description || `HTTP ${res.status}`).split(token).join('***').slice(0, 160)}`, data.error_code || res.status, data.parameters);
  return data.result;
}

// ---------- Textos ----------
const utmLink = (base, medium, campaign) => `${base}${base.includes('?') ? '&' : '?'}utm_source=telegram&utm_medium=${medium}&utm_campaign=${campaign}`;
const clubUrl = (medium) => utmLink(`${SITE.url}/`, medium, 'clube');
export const gradeUrl = (grade, medium) => utmLink(`${SITE.url}/torneios?d=${grade.day}`, medium, 'torneios');
export const addToGroupUrl = () => (botUsername() ? `https://t.me/${botUsername()}?startgroup=grade` : '');

// Os torneios em linhas (canal, grupos e /torneios usam o mesmo texto; cada um põe o próprio rodapé).
export function gradeMessage(grade, top, url) {
  const lines = top.map((e) => `${hhmm(e.start)} · <b>${escapeHtml(e.name)}</b>${e.guaranteed ? ` · ${brl(e.guaranteed)} GTD` : ''} · buy-in ${e.buyin ? brl(e.buyin) : 'grátis'}`);
  return `🏆 <b>Torneios de hoje na Liga Suprema</b>\n${dayLabel(grade)} · horário de Brasília\n\n${lines.join('\n')}\n\nGrade completa (${grade.events.length} torneios), com stack, blinds e late:\n${url}`;
}

function buttons(medium, { add = true, grade } = {}) {
  const row = [{ text: '♠️ Clube Suprema · ID 10001', url: clubUrl(medium) }];
  if (grade) row.unshift({ text: '📅 Grade completa', url: grade });
  const rows = [row];
  if (add && addToGroupUrl()) rows.push([{ text: '➕ Receber no meu grupo', url: addToGroupUrl() }]);
  return rows;
}

const gradeFooter = `\n\n♠️ Jogue no Clube Suprema (ID ${config.club.id}): /clube\n\n${RESPONSIBLE}`;

const helpPrivate = () => `🃏 <b>Grade de torneios da Liga Suprema</b>

Eu mostro os maiores torneios do dia no Suprema Poker, com horário de Brasília, garantido e buy-in.

/torneios · os torneios de hoje que ainda vão começar
/clube · como entrar no Clube Suprema (ID ${config.club.id})

<b>Quer a grade no seu grupo?</b> Me adicione pelo botão abaixo e eu mando os torneios todo dia às 9h. O admin pausa com /pausar e volta com /ativar.

${RESPONSIBLE}`;

const helpGroup = () => `Oi, pessoal! 👋 Sou o robô da grade de torneios da Liga Suprema (Suprema Poker).

Todo dia às 9h mando aqui os maiores torneios do dia, com horário de Brasília, garantido e buy-in.

/torneios · ver os torneios agora
/clube · entrar no Clube Suprema (ID ${config.club.id})
Admin: /pausar para parar a grade e /ativar para voltar.

${RESPONSIBLE}`;

const clubText = (medium) => `♠️ <b>Clube Suprema · ID ${config.club.id}</b>
Agente: <b>${config.club.agentId}</b>

<b>Como entrar</b>
1. Baixe o Suprema Poker (é grátis). Pelo nosso site, o convite já abre o clube com o agente.
2. Se o app pedir, use o clube ${config.club.id} e o agente ${config.club.agentId}.
3. Compre fichas por PIX no Fichas 24h, com o seu ID de jogador (fica no perfil do app).

Passo a passo e suporte 24h no WhatsApp: ${clubUrl(medium)}

${RESPONSIBLE}`;

function send(chatId, text, { keyboard, replyTo, thread, preview } = {}) {
  return api('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: preview ? { url: preview } : { is_disabled: true },
    ...(keyboard && { reply_markup: { inline_keyboard: keyboard } }),
    ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
    ...(thread && { message_thread_id: thread }),
  });
}

// Grade de agora num chat. Devolve o dia da grade se mandou os torneios.
async function sendGrade(chatId, medium, opts = {}) {
  const now = new Date();
  const grade = await getGrade(now);
  if (!grade) {
    await send(chatId, `Não consegui carregar a grade agora. Ela fica sempre em ${SITE.url}/torneios`, opts);
    return '';
  }
  const url = gradeUrl(grade, medium);
  const top = highlights(grade.events.filter((e) => e.start > now), TOP);
  if (!top.length) {
    await send(chatId, `Os torneios de hoje já começaram. A grade do próximo dia entra às 7h:\n${url}`, opts);
    return '';
  }
  await send(chatId, gradeMessage(grade, top, url) + gradeFooter, { ...opts, preview: url, keyboard: buttons(medium) });
  return grade.day;
}

// ---------- Mensagens recebidas ----------
async function isAdmin(m) {
  if (m.sender_chat?.id === m.chat.id || m.from?.id === ANON_ADMIN) return true;
  const member = await api('getChatMember', { chat_id: m.chat.id, user_id: m.from.id }).catch(() => null);
  return member?.status === 'creator' || member?.status === 'administrator';
}

async function onCommand(m, cmd) {
  const group = GROUP_TYPES.has(m.chat.type);
  const medium = group ? 'grupo' : 'bot';
  const opts = group ? { replyTo: m.message_id, thread: m.is_topic_message ? m.message_thread_id : undefined } : {};
  if (cmd === 'torneios') return sendGrade(m.chat.id, medium, opts);
  if (cmd === 'clube') return send(m.chat.id, clubText(medium), { ...opts, keyboard: [[{ text: '♠️ Entrar no Clube Suprema', url: clubUrl(medium) }], [{ text: '💬 Suporte 24h no WhatsApp', url: `https://wa.me/${config.supportWhatsapp}` }]] });
  if (cmd === 'ajuda') {
    if (!group) return send(m.chat.id, helpPrivate(), { keyboard: buttons(medium, { grade: utmLink(`${SITE.url}/torneios`, medium, 'torneios') }) });
    if (Date.now() - (welcomedAt.get(m.chat.id) || 0) < 60_000) return; // o /start do link de adicionar chega junto com as boas-vindas
    return send(m.chat.id, helpGroup(), opts);
  }
  // pausar / ativar
  if (!group) return send(m.chat.id, 'Esse comando é para o admin de um grupo: ele pausa ou volta a grade das 9h no grupo.');
  if (!(await isAdmin(m))) return send(m.chat.id, 'Só um admin do grupo pode pausar ou ativar a grade das 9h.', opts);
  const ok = await registerGroup({ id: m.chat.id, titulo: m.chat.title, tipoChat: m.chat.type, situacao: cmd === 'pausar' ? 'pausado' : 'ativo' });
  if (!ok) return send(m.chat.id, 'Não consegui mudar agora. Tente de novo daqui a alguns minutos.', opts);
  return send(m.chat.id, cmd === 'pausar'
    ? 'Pronto: a grade das 9h está pausada neste grupo. Para voltar, um admin manda /ativar. O /torneios continua funcionando.'
    : 'Pronto: a grade de torneios volta a chegar aqui todo dia às 9h.', opts);
}

async function onMessage(m) {
  if (m.migrate_to_chat_id) { // o grupo virou supergrupo e ganhou outro ID
    await registerGroup({ id: m.chat.id, titulo: m.chat.title, tipoChat: m.chat.type, situacao: 'migrou' });
    await registerGroup({ id: m.migrate_to_chat_id, titulo: m.chat.title, tipoChat: 'supergroup', situacao: 'ativo' });
    return;
  }
  const group = GROUP_TYPES.has(m.chat.type);
  if (!group && m.chat.type !== 'private') return;
  const match = String(m.text || '').match(/^\/([a-z_]+)(?:@(\w+))?/i);
  if (match?.[2] && match[2].toLowerCase() !== botUsername().toLowerCase()) return; // comando para outro robô
  // No privado, qualquer mensagem que não seja um comando conhecido recebe a ajuda; no grupo, só os comandos.
  const cmd = (match && ALIASES[match[1].toLowerCase()]) || (group ? undefined : 'ajuda');
  if (!cmd) return;
  const key = `${m.chat.id}:${cmd}`;
  if (Date.now() - (lastReply.get(key) || 0) < COOLDOWN_MS) return;
  lastReply.set(key, Date.now());
  await onCommand(m, cmd);
}

// O robô entrou ou saiu de um grupo. Canais (como o do clube) e conversas privadas ficam de fora.
async function onMembership(u) {
  const chat = u.chat;
  if (!GROUP_TYPES.has(chat.type)) return;
  const now = INSIDE.has(u.new_chat_member.status);
  const before = INSIDE.has(u.old_chat_member.status);
  if (now && !before) {
    welcomedAt.set(chat.id, Date.now());
    let ultima = '';
    try {
      await send(chat.id, helpGroup(), { keyboard: buttons('grupo', { add: false }) });
      if (hourBR() >= GRADE_HOUR) ultima = await sendGrade(chat.id, 'grupo');
    } catch (err) {
      console.warn(`[robo] boas-vindas em ${chat.id}: ${err.message}`);
    }
    await registerGroup({ id: chat.id, titulo: chat.title, tipoChat: chat.type, situacao: 'ativo', ultima });
    console.log(`[robo] entrou no grupo ${chat.id} (${chat.title})`);
  } else if (!now && before) {
    await registerGroup({ id: chat.id, titulo: chat.title, tipoChat: chat.type, situacao: 'saiu' });
    console.log(`[robo] saiu do grupo ${chat.id} (${chat.title})`);
  }
}

export async function handleUpdate(u) {
  if (u.my_chat_member) return onMembership(u.my_chat_member);
  if (u.message) return onMessage(u.message);
}

// ---------- Grade das 9h nos grupos ----------
// Chamada por shareDailyGrade. Devolve false se algum envio falhou por motivo passageiro (a próxima rodada tenta de novo).
export async function gradeToGroups(grade, top) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return true;
  const groups = await claimGroupsForGrade(grade.day);
  if (groups === null) throw new Error('a planilha não respondeu');
  const url = gradeUrl(grade, 'grupo');
  let allOk = true;
  let sent = 0;
  for (const g of groups) {
    try {
      await send(g.id, gradeMessage(grade, top, url) + gradeFooter, { preview: url, keyboard: buttons('grupo') });
      await reportGroupGrade(g.id, grade.day, true);
      sent++;
    } catch (err) {
      const migrated = err.params?.migrate_to_chat_id;
      if (migrated) { // entra na lista com o ID novo e recebe na próxima rodada
        await registerGroup({ id: g.id, titulo: g.titulo, situacao: 'migrou' });
        await registerGroup({ id: migrated, titulo: g.titulo, tipoChat: 'supergroup', situacao: 'ativo' });
        allOk = false;
        continue;
      }
      const gone = GONE.test(err.message);
      if (!gone) allOk = false;
      await reportGroupGrade(g.id, grade.day, false, err.message, gone);
      console.warn(`[robo] grade em ${g.id}: ${err.message}`);
    }
    await sleep(150); // o Telegram aceita até ~30 mensagens por segundo no total
  }
  if (groups.length) console.log(`[robo] grade de ${grade.day} mandada para ${sent} de ${groups.length} grupo(s)`);
  return allOk;
}

// ---------- Início ----------
async function setup() {
  state.me = await api('getMe');
  console.log(`[robo] @${state.me.username} lendo mensagens`);
  if (!state.me.can_join_groups) console.warn('[robo] o robô não pode entrar em grupos: no @BotFather, /setjoingroups → Enable');
  await api('setMyCommands', { commands: COMMANDS });
  await api('setMyCommands', { commands: ADMIN_COMMANDS, scope: { type: 'all_chat_administrators' } });
  // Descrições só entram se estiverem vazias, para não apagar o que foi escrito no @BotFather.
  if (!(await api('getMyDescription')).description) await api('setMyDescription', { description: DESCRIPTION });
  if (!(await api('getMyShortDescription')).short_description) await api('setMyShortDescription', { short_description: SHORT_DESCRIPTION });
}

// Long polling: cada getUpdates espera até 50 s por mensagem nova. Num deploy, as duas instâncias disputam por alguns
// segundos (409) e a nova fica sozinha quando a antiga desliga.
async function poll() {
  let offset = 0;
  let fails = 0;
  for (;;) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'my_chat_member'] }, 65_000);
      state.polledAt = new Date();
      fails = 0;
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(u).catch((err) => console.warn(`[robo] ${err.message}`));
      }
    } catch (err) {
      fails++;
      if (fails <= 3 || fails % 20 === 0) console.warn(`[robo] ${err.message}`);
      await sleep(err.status === 409 ? 30_000 : Math.min(300_000, 5_000 * 2 ** Math.min(fails, 6)));
    }
  }
}

export function startBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN || state.started) return;
  state.started = true;
  setup().catch((err) => console.warn(`[robo] configuração: ${err.message}`));
  poll();
}
