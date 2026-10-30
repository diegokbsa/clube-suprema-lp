// Depois de cada deploy no Render, avisa que há post novo ou atualizado:
//   - IndexNow (Bing, Yandex e outros; o Bing alimenta a busca do ChatGPT e do Copilot): posts com data ou
//     atualização nos últimos 3 dias, mais /blog. Sem chave secreta: a chave é o arquivo público em public/.
//   - Canal do Telegram (config.links.telegram): posts publicados nos últimos 3 dias que ainda não foram,
//     com capa, título, resumo e link. Só liga com TELEGRAM_BOT_TOKEN no Render; o bot precisa ser
//     administrador do canal com permissão de publicar. A aba "Telegram" da planilha evita post repetido e mostra,
//     na coluna Situação, "enviado" ou o motivo da falha (post que falhou é tentado de novo no próximo deploy).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { getPosts, SITE } from './blog.js';
import { claimTelegramPost, reportTelegramPost } from './sheets.js';

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
  await postNewToTelegram();
}

// Também roda a cada 30 min (server.js): um post que falhou (bot ainda não era administrador, Telegram fora do ar)
// sai sozinho na próxima rodada, sem precisar de outro deploy. Os já enviados a planilha responde que não.
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
