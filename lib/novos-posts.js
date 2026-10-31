// Depois de cada deploy no Render, avisa que há post novo ou atualizado:
//   - IndexNow (Bing, Yandex e outros; o Bing alimenta a busca do ChatGPT e do Copilot): posts com data ou
//     atualização nos últimos 3 dias, mais /blog. Sem chave secreta: a chave é o arquivo público em public/.
//   - Canal do Telegram (config.links.telegram): posts publicados nos últimos 3 dias que ainda não foram,
//     com capa, título, resumo e link. Só liga com TELEGRAM_BOT_TOKEN no Render; o bot precisa ser
//     administrador do canal com permissão de publicar. A aba "Telegram" da planilha evita post repetido e mostra,
//     na coluna Situação, "enviado" ou o motivo da falha (post que falhou é tentado de novo no próximo deploy).
//   - Perfil do Bluesky (config.links.bluesky): os mesmos posts, com cartão de link (capa, título, resumo). Só liga com
//     BLUESKY_APP_PASSWORD no Render (senha de app, não a senha da conta); BLUESKY_HANDLE é opcional. Sem planilha:
//     antes de postar, lê o próprio perfil e pula o post cujo link já está lá.
//   - Aba "Posts" da planilha (título, resumo, capa): o Apps Script manda daí o e-mail semanal de novidades.
// E, uma vez por dia a partir das 9h (shareDailyGrade), a grade de torneios: IndexNow de /torneios e os destaques do dia
// no Telegram e no Bluesky, com o link da página.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPosts, SITE } from './blog.js';
import { claimTelegramPost, registerPostInSheet, reportTelegramPost } from './sheets.js';
import { getGrade, highlights, hhmm, brl, dayLabel, shortDay } from './torneios.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const DAYS = 3;

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function recentPosts(field) {
  const since = new Date(Date.now() - DAYS * 86400_000).toISOString().slice(0, 10);
  return getPosts().filter((p) => p[field] >= since);
}

async function pingIndexNow(urls) {
  const keyFile = fs.readdirSync(PUBLIC_DIR).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (!keyFile || !urls.length) return;
  const key = keyFile.replace('.txt', '');
  const host = new URL(SITE.url).host;
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation: `${SITE.url}/${key}.txt`, urlList: urls }),
    signal: AbortSignal.timeout(15_000),
  });
  console.log(`[novos-posts] IndexNow: HTTP ${res.status} para ${urls.length} URLs`);
}

async function postToTelegram(token, chat, post) {
  const link = `${SITE.url}/blog/${post.slug}?utm_source=telegram&utm_medium=canal`;
  const caption = `<b>${escapeHtml(post.title)}</b>\n\n${escapeHtml(post.description).slice(0, 600)}\n\n👉 ${link}\n\n18+ · Jogue com responsabilidade.`;
  const method = post.cover ? 'sendPhoto' : 'sendMessage';
  const body = post.cover
    ? { chat_id: chat, photo: SITE.url + post.cover, caption, parse_mode: 'HTML' }
    : { chat_id: chat, text: caption, parse_mode: 'HTML' };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram ${res.status}: ${String(data.description || '').slice(0, 160)}`);
  console.log(`[novos-posts] Telegram: ${post.slug} publicado em ${chat}`);
}

export async function announceNewPosts() {
  const changed = recentPosts('updated');
  if (changed.length) {
    await pingIndexNow([...changed.map((p) => `${SITE.url}/blog/${p.slug}`), `${SITE.url}/blog`])
      .catch((err) => console.warn(`[novos-posts] IndexNow falhou: ${err.message}`));
  }
  await shareNewPosts();
}

// Também roda a cada 30 min (server.js): um post que falhou (bot ainda não era administrador, rede fora do ar)
// sai sozinho na próxima rodada, sem precisar de outro deploy. Um canal com erro não impede o outro.
export async function shareNewPosts() {
  await postNewToTelegram().catch((err) => console.warn(`[novos-posts] Telegram: ${err.message}`));
  await postNewToBluesky().catch((err) => console.warn(`[novos-posts] Bluesky: ${String(err.message).slice(0, 200)}`));
  await registerNewPosts().catch((err) => console.warn(`[novos-posts] planilha: ${err.message}`));
}

// Aba "Posts" da planilha, base do e-mail semanal de novidades (Code.gs, enviarNovidades). Repetir não duplica,
// mas cada post só é mandado uma vez por processo, para não chamar a planilha a cada 30 min à toa.
const registered = new Set();
async function registerNewPosts() {
  for (const post of recentPosts('date').reverse()) {
    if (!registered.has(post.slug) && (await registerPostInSheet(post))) registered.add(post.slug);
  }
}

// Os já enviados a planilha responde que não.
export async function postNewToTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const chat = process.env.TELEGRAM_CHAT_ID || '@' + config.links.telegram.split('/').pop();
  for (const post of recentPosts('date').reverse()) {
    if (!(await claimTelegramPost(post.slug))) continue;
    console.log(`[novos-posts] mandando ${post.slug} para ${chat}`);
    try {
      await postToTelegram(token, chat, post);
      await reportTelegramPost(post.slug, true);
    } catch (err) {
      const motivo = (/not a member/.test(err.message) ? await notMemberHint(token, chat) : String(err.message)).split(token).join('***'); // o token nunca vai para log nem planilha
      console.error(`[novos-posts] ${post.slug}: ${motivo}`);
      await reportTelegramPost(post.slug, false, motivo);
    }
  }
}

// "bot is not a member": diz qual é o bot do token e em quais chats ele foi adicionado nas últimas 24 h
// (getUpdates guarda esses avisos), para achar quando ele entrou como administrador em outro chat.
async function notMemberHint(token, chat) {
  const api = (method) => fetch(`https://api.telegram.org/bot${token}/${method}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
  try {
    const me = await api('getMe');
    const upd = await api('getUpdates?allowed_updates=%5B%22my_chat_member%22%5D');
    const chats = new Map();
    for (const u of upd.ok ? upd.result : []) {
      const m = u.my_chat_member;
      if (m) chats.set(m.chat.id, `${m.chat.title || m.chat.username} (${m.chat.type} ${m.chat.username ? '@' + m.chat.username : m.chat.id}, ${m.new_chat_member.status})`);
    }
    const onde = chats.size ? [...chats.values()].join('; ') : 'nenhum chat nas últimas 24 h';
    return `@${me.result?.username} não está em ${chat}; foi adicionado em: ${onde}`;
  } catch {
    return 'bot is not a member of the channel chat';
  }
}

const BSKY = 'https://bsky.social/xrpc/';
const BSKY_TEXT_MAX = 300; // limite do Bluesky, em caracteres visíveis
const BSKY_THUMB_MAX = 1_000_000; // a capa do cartão de link precisa ter até ~1 MB

async function xrpc(method, { token, query, json, bytes, type } = {}) {
  const url = BSKY + method + (query ? '?' + new URLSearchParams(query) : '');
  const res = await fetch(url, {
    method: json || bytes ? 'POST' : 'GET',
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(json && { 'Content-Type': 'application/json' }), ...(bytes && { 'Content-Type': type }) },
    body: json ? JSON.stringify(json) : bytes,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${data.error || ''} ${data.message || ''}`.trim());
  return data;
}

function blueskyText(post) {
  const head = post.title;
  const tail = '18+ · Jogue com responsabilidade.';
  const room = BSKY_TEXT_MAX - [...head].length - [...tail].length - 4;
  const desc = [...post.description];
  const body = desc.length > room ? desc.slice(0, room - 1).join('').trimEnd() + '…' : post.description;
  return `${head}\n\n${body}\n\n${tail}`;
}

async function blueskyThumb(token, cover) {
  if (!cover) return undefined;
  const res = await fetch(SITE.url + cover, { signal: AbortSignal.timeout(15_000) });
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!res.ok || bytes.length > BSKY_THUMB_MAX) return undefined;
  const { blob } = await xrpc('com.atproto.repo.uploadBlob', { token, bytes, type: res.headers.get('content-type') || 'image/jpeg' });
  return blob;
}

// Sessão no perfil do Bluesky e os links (cartões) dos últimos 50 posts dele, para não postar repetido.
async function blueskySession() {
  const identifier = process.env.BLUESKY_HANDLE || config.links.bluesky?.split('/').pop();
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  const { did, accessJwt: token } = await xrpc('com.atproto.server.createSession', { json: { identifier, password } });
  const { feed } = await xrpc('app.bsky.feed.getAuthorFeed', { token, query: { actor: did, limit: 50, filter: 'posts_no_replies' } });
  const links = feed.map((item) => item.post.record.embed?.external?.uri).filter(Boolean);
  return { identifier, did, token, links };
}

async function blueskyPost(s, text, external, tags) {
  await xrpc('com.atproto.repo.createRecord', {
    token: s.token,
    json: {
      repo: s.did,
      collection: 'app.bsky.feed.post',
      record: { $type: 'app.bsky.feed.post', text, createdAt: new Date().toISOString(), langs: ['pt'], tags, embed: { $type: 'app.bsky.embed.external', external } },
    },
  });
}

export async function postNewToBluesky() {
  const posts = recentPosts('date').reverse();
  if (!posts.length) return;
  const s = await blueskySession();
  if (!s) return;
  const { identifier } = s;
  const already = new Set(s.links.map((uri) => {
    try { return new URL(uri).pathname; } catch { return ''; }
  }));
  for (const post of posts) {
    if (already.has(`/blog/${post.slug}`)) continue;
    const external = {
      uri: `${SITE.url}/blog/${post.slug}?utm_source=bluesky&utm_medium=social`,
      title: post.title,
      description: post.description.slice(0, 300),
      thumb: await blueskyThumb(s.token, post.cover).catch(() => undefined),
    };
    await blueskyPost(s, blueskyText(post), external, ['poker', 'supremapoker', 'pokeronline']);
    console.log(`[novos-posts] Bluesky: ${post.slug} publicado em @${identifier}`);
  }
}

// ---------- Grade de torneios do dia (/torneios) ----------
// A partir das 9h de Brasília, uma vez por dia: IndexNow de /torneios e /torneios.txt e os maiores torneios que ainda vão
// começar no Telegram e no Bluesky, com o link da grade (?d=<dia> só diferencia o link de cada dia; o canônico é /torneios).
// O Telegram não repete depois de um deploy porque usa a aba Telegram da planilha (slug grade-<dia>); o Bluesky confere o perfil.
const GRADE_HOUR = 9;
const gradeDone = { indexnow: '', telegram: '', bluesky: '' };

export async function shareDailyGrade(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour < GRADE_HOUR) return;
  const grade = await getGrade(now);
  if (!grade || Object.values(gradeDone).every((d) => d === grade.day)) return;
  const top = highlights(grade.events.filter((e) => e.start > now), 6);
  if (!top.length) return;
  const link = (source, medium) => `${SITE.url}/torneios?d=${grade.day}&utm_source=${source}&utm_medium=${medium}`;
  if (gradeDone.indexnow !== grade.day) {
    await pingIndexNow([`${SITE.url}/torneios`, `${SITE.url}/torneios.txt`])
      .then(() => { gradeDone.indexnow = grade.day; })
      .catch((err) => console.warn(`[novos-posts] IndexNow da grade: ${err.message}`));
  }
  if (gradeDone.telegram !== grade.day) {
    await gradeToTelegram(grade, top, link('telegram', 'canal'))
      .then(() => { gradeDone.telegram = grade.day; })
      .catch((err) => console.warn(`[novos-posts] grade no Telegram: ${err.message}`));
  }
  if (gradeDone.bluesky !== grade.day) {
    await gradeToBluesky(grade, top, link('bluesky', 'social'))
      .then(() => { gradeDone.bluesky = grade.day; })
      .catch((err) => console.warn(`[novos-posts] grade no Bluesky: ${String(err.message).slice(0, 200)}`));
  }
}

async function gradeToTelegram(grade, top, url) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  const slug = `grade-${grade.day}`;
  if (!(await claimTelegramPost(slug))) return;
  const chat = process.env.TELEGRAM_CHAT_ID || '@' + config.links.telegram.split('/').pop();
  const lines = top.map((e) => `${hhmm(e.start)} · <b>${escapeHtml(e.name)}</b>${e.guaranteed ? ` · ${brl(e.guaranteed)} GTD` : ''} · buy-in ${e.buyin ? brl(e.buyin) : 'grátis'}`);
  const text = `🏆 <b>Torneios de hoje na Liga Suprema</b>\n${dayLabel(grade)} · horário de Brasília\n\n${lines.join('\n')}\n\nGrade completa (${grade.events.length} torneios), com stack, blinds e late:\n${url}\n\n18+ · Jogue com responsabilidade.`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { url } }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${res.status}: ${String(data.description || '').slice(0, 160)}`);
    await reportTelegramPost(slug, true);
    console.log(`[novos-posts] Telegram: grade de ${grade.day} publicada em ${chat}`);
  } catch (err) {
    await reportTelegramPost(slug, false, String(err.message).split(token).join('***'));
    throw err;
  }
}

async function gradeToBluesky(grade, top, url) {
  const s = await blueskySession();
  if (!s || s.links.some((uri) => uri.includes(`/torneios?d=${grade.day}`))) return;
  const tail = '\n\nGrade completa no link. 18+';
  let text = `Torneios de hoje na Liga Suprema (${shortDay(grade)}, horário de Brasília):`;
  for (const e of top) {
    const line = `\n${hhmm(e.start)} ${e.name}${e.guaranteed ? ` · ${brl(e.guaranteed)} GTD` : ''}`;
    if ([...(text + line + tail)].length > BSKY_TEXT_MAX) break;
    text += line;
  }
  const external = {
    uri: url,
    title: `Torneios de hoje (${shortDay(grade)}) no Suprema Poker: grade da Liga Suprema`,
    description: `${grade.events.length} torneios hoje na Liga Suprema, com horário de Brasília, buy-in, garantido, stack, blinds e late reg.`,
    thumb: await blueskyThumb(s.token, '/img/og-clube-suprema.jpg').catch(() => undefined),
  };
  await blueskyPost(s, text + tail, external, ['poker', 'supremapoker', 'torneiodepoker']);
  console.log(`[novos-posts] Bluesky: grade de ${grade.day} publicada em @${s.identifier}`);
}
