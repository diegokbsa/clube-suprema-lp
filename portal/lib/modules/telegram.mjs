// Bot e canal do Telegram da operação, pela Bot API (https://api.telegram.org) com fetch injetável (app.fetchImpl).
// - Integração 'telegram': config pública { canal, botUsuario } e o token do bot selado no cofre (nunca volta para a tela,
//   nunca vai para log, auditoria nem mensagem de erro).
// - Publicação: espaços do calendário com canal 'telegram' e situação 'agendado' cuja hora passou saem no canal
//   (sendMessage ou sendPhoto, em HTML escapado) e são marcados pelos ajudantes do calendário (marcarPublicado/marcarErro).
// - Respostas no privado: getUpdates com offset guardado na public_config (sem webhook: o servidor fica atrás de túnel).
// Laços: publicação a cada 60 s e respostas a cada 10 s, com unref. Desligados com PORTAL_SEM_ROTINAS=1 e nos testes (node --test).
//
// Situação da integração: 'ativo' quando o teste passa, porque é 'ativo' que o calendário entende como conta conectada
// (conexoesDosCanais em calendar.mjs). A tela recebe estado 'conectado'.
import { now, parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { scoped } from '../repo.mjs';
import { audit as gravarAuditoria } from '../tenants.mjs';
import { marcarPublicado, marcarErro } from './calendar.mjs';
import { dadosDaOperacao, siteDaOperacao } from './email.mjs';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

const KIND = 'telegram';
const API = 'https://api.telegram.org';
const CANAL = /^(@[A-Za-z][A-Za-z0-9_]{3,31}|-?\d{5,20})$/;
const BOT = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/;
const TOKEN = /^\d{5,12}:[A-Za-z0-9_-]{30,60}$/;
const LIMITE_TEXTO = 4096;
const LIMITE_LEGENDA = 1024;
const ESTADOS = { pendente: 'Pendente de configuração', conectado: 'Conectado', erro: 'Erro na última chamada' };

const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (url, rotulo) => `<a href="${escHtml(url)}">${escHtml(rotulo)}</a>`;

// ---------------------------------------------------------------- chamada à Bot API

class TgErro extends Error {
  constructor(mensagem, codigo = 0) { super(mensagem); this.codigo = codigo; }
}

const esconder = (texto, token) => (token ? String(texto ?? '').split(token).join('***') : String(texto ?? '')).slice(0, 400);

/** Chama um método da Bot API. Erros saem sem o token. */
export async function tg(app, token, metodo, corpo = {}) {
  const fetchImpl = app.fetchImpl || globalThis.fetch;
  let r;
  try {
    r = await fetchImpl(`${API}/bot${token}/${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new TgErro(`Não deu para falar com o Telegram: ${esconder(e?.message || e, token)}`);
  }
  let data = null;
  try { data = typeof r.json === 'function' ? await r.json() : null; } catch { data = null; }
  if (!data?.ok) {
    const motivo = data?.description || `HTTP ${r.status}`;
    throw new TgErro(`O Telegram recusou (${metodo}): ${esconder(motivo, token).slice(0, 200)}`, Number(data?.error_code) || Number(r.status) || 0);
  }
  return data.result;
}

// ---------------------------------------------------------------- integração

function integracao(repo) {
  return repo.get('integrations', { kind: KIND }) || repo.insert('integrations', { kind: KIND, status: 'pendente', public_config: '{}' });
}

const configDe = (row) => {
  const c = parse(row?.public_config, {}) || {};
  return { canal: c.canal || '', botUsuario: c.botUsuario || '', canalTitulo: c.canalTitulo || '', updateOffset: Number(c.updateOffset) || 0 };
};

function abrirToken(app, row) {
  try { return row?.secret ? app.vault.open(row.secret) : null; } catch { return null; }
}

const estadoDe = (row) => (row.status === 'ativo' ? 'conectado' : row.status === 'erro' ? 'erro' : 'pendente');

function saida(row) {
  const cfg = configDe(row);
  const estado = estadoDe(row);
  return {
    config: { canal: cfg.canal, botUsuario: cfg.botUsuario, canalTitulo: cfg.canalTitulo },
    tokenGravado: row.secret ? 'sim' : 'não',
    temToken: Boolean(row.secret),
    estado, estadoLabel: ESTADOS[estado], conectado: estado === 'conectado',
    lastCheck: row.last_check || null, lastError: row.last_error || null,
    ajuda: 'Crie o bot no @BotFather (comando /newbot) e copie o token. Depois ponha o bot como administrador do canal, com permissão de publicar, e use "Testar".',
    comandos: ['/start', '/clube', '/fichas', '/suporte'],
  };
}

// ---------------------------------------------------------------- mensagens prontas do bot

/** Resposta do bot no privado, montada das configurações da operação. HTML do Telegram, tudo escapado. */
export function respostaDoBot(d, texto) {
  const cmd = (String(texto || '').trim().split(/\s+/)[0] || '').toLowerCase().replace(/@[a-z0-9_]+$/, '');
  const nomeClube = `<b>${escHtml(d.clube)}</b>${d.poker && d.idClube ? ` (ID do clube <b>${escHtml(d.idClube)}</b>)` : ''}`;
  const suporte = d.whatsapp ? `Suporte no WhatsApp (a mensagem já vai pronta): ${link(d.whatsapp, 'chamar o suporte')}` : '';
  const site = d.siteUrl ? `Site: ${link(d.siteUrl, d.siteUrl)}` : '';
  const menu = 'Comandos: /clube (como entrar), /fichas (canal oficial de fichas), /suporte (falar com a equipe).';
  const clube = () => {
    if (!d.poker) return [`Para conhecer ${nomeClube}, veja o site.`, site, suporte];
    const passos = [
      `Baixe ${d.appNome ? `o app <b>${escHtml(d.appNome)}</b>` : 'o aplicativo do clube'} e crie sua conta.`,
      d.idClube ? `ID do clube: <b>${escHtml(d.idClube)}</b>` : '',
      d.agente ? `ID do agente: <b>${escHtml(d.agente)}</b>` : '',
    ].filter(Boolean).map((p, i) => `${i + 1}. ${p}`);
    return [
      `<b>Como entrar no ${escHtml(d.clube)}</b>`,
      ...passos,
      d.convite ? `Link de convite do clube: ${link(d.convite, 'entrar no clube')}`
        : d.whatsapp ? `Peça o link de convite no suporte: ${link(d.whatsapp, 'chamar no WhatsApp')}` : 'Peça o link de convite à equipe do clube.',
    ];
  };
  const fichas = () => [d.fichas ? `Fichas só pelo canal oficial do clube: ${link(d.fichas, 'canal de fichas')}`
    : d.whatsapp ? `Para fichas, fale com o suporte: ${link(d.whatsapp, 'chamar no WhatsApp')}` : 'Para fichas, fale com a equipe do clube.'];
  const SEP = '\u0000';                                            // linha em branco de propósito; '' some
  let corpo;
  if (cmd === '/start') corpo = [`Olá! Aqui é o bot do ${nomeClube}.`, SEP, ...clube(), SEP, menu];
  else if (cmd === '/clube') corpo = clube();
  else if (cmd === '/fichas') corpo = fichas();
  else if (cmd === '/suporte' || cmd === '/ajuda' || cmd === '/help') corpo = [suporte || 'Fale com a equipe do clube pelo site.', site];
  else corpo = [`Este é o bot do ${nomeClube}.`, menu, suporte];
  return [...corpo, SEP, d.aviso].filter(Boolean).join('\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- publicação dos espaços do calendário

/** URL pública da imagem do espaço: https direto ou /assets/... resolvido pela origem do site da operação. */
export function imagemDoEspaco(app, tenant, item) {
  const ref = String(item.creative_id || '').trim();
  if (/^https:\/\/[^\s<>"']+$/i.test(ref)) return ref;
  if (/^\/assets\/[A-Za-z0-9._\/-]+$/.test(ref) && !ref.includes('..')) {
    const site = siteDaOperacao(app.db, tenant.id);
    const base = site?.domain ? `https://${site.domain}` : app.originOf(tenant.edition);
    return `${base.replace(/\/$/, '')}${ref}`;
  }
  return null;
}

const emAndamento = new WeakMap();
const andamento = (app) => { if (!emAndamento.has(app)) emAndamento.set(app, new Set()); return emAndamento.get(app); };

/** Publica no canal os espaços vencidos. Devolve { publicados, erros }. */
export async function publicarVencidos(app, { agora = new Date() } = {}) {
  const itens = app.db.prepare(`SELECT c.* FROM calendar c JOIN tenants t ON t.id = c.tenant_id
    WHERE c.channel = 'telegram' AND c.status = 'agendado' AND c.scheduled_at <= ? AND t.status = 'ativa'
    ORDER BY c.scheduled_at ASC LIMIT 100`).all(agora.toISOString());
  const ocupados = andamento(app);
  const resumo = { publicados: 0, erros: 0 };
  for (const item of itens) {
    const chave = `cal:${item.id}`;
    if (ocupados.has(chave)) continue;
    ocupados.add(chave);
    try {
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(item.tenant_id);
      const repo = scoped(app.db, tenant.id);
      const atual = repo.get('calendar', item.id);
      if (!atual || atual.status !== 'agendado') continue;          // alguém mudou no meio do caminho
      const falhar = (motivo) => { marcarErro(repo, item.id, motivo); resumo.erros++; };
      const texto = String(atual.caption || '').trim();
      if (!texto) { falhar('Espaço sem texto: escreva a legenda antes de publicar no Telegram.'); continue; }
      if (texto.length > LIMITE_TEXTO) { falhar(`Texto com ${texto.length} caracteres: o Telegram aceita até ${LIMITE_TEXTO}.`); continue; }
      const row = repo.get('integrations', { kind: KIND });
      const cfg = configDe(row);
      const token = abrirToken(app, row);
      if (!token || !CANAL.test(cfg.canal)) { falhar('Telegram sem token ou sem canal: configure em Integrações e use "Testar".'); continue; }
      if (row.status !== 'ativo') { falhar('A conexão com o Telegram não está ativa: use "Testar" em Integrações e agende de novo.'); continue; }
      const imagem = imagemDoEspaco(app, tenant, atual);
      const html = escHtml(texto);
      try {
        let msg;
        if (imagem && texto.length <= LIMITE_LEGENDA) {
          msg = await tg(app, token, 'sendPhoto', { chat_id: cfg.canal, photo: imagem, caption: html, parse_mode: 'HTML' });
        } else {
          if (imagem) await tg(app, token, 'sendPhoto', { chat_id: cfg.canal, photo: imagem });
          msg = await tg(app, token, 'sendMessage', { chat_id: cfg.canal, text: html, parse_mode: 'HTML' });
        }
        marcarPublicado(repo, item.id);
        resumo.publicados++;
        gravarAuditoria(app.db, { tenantId: tenant.id, action: 'telegram.publicar', target: item.id, data: { mensagem: msg?.message_id ?? null, imagem: Boolean(imagem) } });
      } catch (e) {
        falhar(`Não publicou no Telegram: ${esconder(e?.message || e, token)}`);
        if (e?.codigo === 401) repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: 'O Telegram recusou o token (401). Gere um novo no @BotFather.' });
      }
    } catch (e) {
      console.error(`[telegram] falha ao publicar espaço ${item.id}: ${String(e?.message || e).slice(0, 200)}`);
    } finally {
      ocupados.delete(chave);
    }
  }
  return resumo;
}

// ---------------------------------------------------------------- respostas no privado

/** Lê as mensagens novas do bot (getUpdates) e responde. Devolve { respondidas }. */
export async function responderMensagens(app) {
  const linhas = app.db.prepare(`SELECT i.* FROM integrations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.kind = 'telegram' AND i.status = 'ativo' AND i.secret IS NOT NULL AND t.status = 'ativa'`).all();
  const ocupados = andamento(app);
  let respondidas = 0;
  for (const row of linhas) {
    const chave = `bot:${row.tenant_id}`;
    if (ocupados.has(chave)) continue;
    ocupados.add(chave);
    const token = abrirToken(app, row);
    try {
      if (!token) continue;
      const repo = scoped(app.db, row.tenant_id);
      const cfg = configDe(row);
      const updates = await tg(app, token, 'getUpdates', { ...(cfg.updateOffset ? { offset: cfg.updateOffset } : {}), timeout: 0, limit: 50, allowed_updates: ['message'] });
      if (!Array.isArray(updates) || !updates.length) continue;
      const proximo = Math.max(cfg.updateOffset, ...updates.map((u) => Number(u.update_id) + 1).filter(Number.isFinite));
      // grava o offset ANTES de responder: se cair no meio, ninguém recebe a mesma resposta duas vezes
      const fresco = repo.get('integrations', row.id);
      if (!fresco || fresco.secret !== row.secret) continue;          // o token mudou enquanto líamos
      repo.update('integrations', row.id, { public_config: JSON.stringify({ ...(parse(fresco.public_config, {}) || {}), updateOffset: proximo }) });
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(row.tenant_id);
      const d = dadosDaOperacao(app, tenant);
      for (const u of updates) {
        const m = u?.message;
        if (!m || m.chat?.type !== 'private' || m.from?.is_bot || m.chat?.id == null) continue;
        try {
          await tg(app, token, 'sendMessage', { chat_id: m.chat.id, text: respostaDoBot(d, m.text), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
          respondidas++;
        } catch (e) {
          console.error(`[telegram] não respondeu uma mensagem: ${esconder(e?.message || e, token)}`);
        }
      }
    } catch (e) {
      const msg = esconder(e?.message || e, token);
      const patch = { last_check: now(), last_error: msg };
      if (e?.codigo === 401) Object.assign(patch, { status: 'erro', last_error: 'O Telegram recusou o token (401). Gere um novo no @BotFather.' });
      try { scoped(app.db, row.tenant_id).update('integrations', row.id, patch); } catch { /* banco fechado no fim dos testes */ }
    } finally {
      ocupados.delete(chave);
    }
  }
  return { respondidas };
}

// ---------------------------------------------------------------- laços

export async function init(app) {
  if (process.env.PORTAL_SEM_ROTINAS === '1' || process.env.NODE_TEST_CONTEXT || app.semRotinas) return null;
  const pub = setInterval(() => { publicarVencidos(app).catch((e) => console.error(`[telegram] publicação: ${String(e?.message || e).slice(0, 200)}`)); }, 60_000);
  const bot = setInterval(() => { responderMensagens(app).catch((e) => console.error(`[telegram] respostas: ${String(e?.message || e).slice(0, 200)}`)); }, 10_000);
  pub.unref?.();
  bot.unref?.();
  return { pub, bot };
}

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/telegram', perm: 'integrations.read',
    handler: ({ repo }) => saida(integracao(repo)),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/telegram', perm: 'integrations.manage',
    handler: ({ app, repo, body, audit }) => {
      const row = integracao(repo);
      const antes = configDe(row);
      // aceita também o link (https://t.me/canal) que o dono copia do Telegram
      const deLink = (v) => { const s = String(v ?? '').trim(); const m = /^(?:https?:\/\/)?(?:t|telegram)\.me\/([A-Za-z0-9_]{4,64})\/?$/i.exec(s); return m ? `@${m[1]}` : s; };
      const canal = deLink(body?.canal ?? antes.canal);
      need(!canal || CANAL.test(canal), 400, 'Canal inválido: use @usuario_do_canal ou o id numérico (ex.: -1001234567890).');
      let botUsuario = deLink(body?.botUsuario ?? antes.botUsuario);
      need(!botUsuario || BOT.test(botUsuario), 400, 'Usuário do bot inválido (ex.: @meuclube_bot).');
      if (botUsuario && !botUsuario.startsWith('@')) botUsuario = `@${botUsuario}`;
      const token = String(body?.token ?? '').trim();
      need(!token || TOKEN.test(token), 400, 'Token inválido: copie o token inteiro que o @BotFather mandou (número:letras).');
      const mudouAcesso = Boolean(token) || canal !== antes.canal;
      const cfg = { canal, botUsuario, canalTitulo: canal === antes.canal ? antes.canalTitulo : '', updateOffset: token ? 0 : antes.updateOffset };
      const patch = { public_config: JSON.stringify(cfg) };
      if (token) patch.secret = app.vault.seal(token);            // só no cofre: nunca volta para a tela nem para o log
      if (mudouAcesso) Object.assign(patch, { status: 'pendente', last_error: null, last_check: now() });
      const atualizado = repo.update('integrations', row.id, patch);
      audit('telegram.salvar', KIND, { canal: Boolean(canal), token: Boolean(atualizado.secret) });
      return { ok: true, ...saida(atualizado),
        nota: atualizado.secret && canal ? 'Configuração salva. Use "Testar" para conectar (o bot precisa ser administrador do canal).'
          : 'Falta o token do bot ou o canal para o Telegram funcionar.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/telegram/teste', perm: 'integrations.manage',
    handler: async ({ app, repo, audit }) => {
      const row = integracao(repo);
      const cfg = configDe(row);
      const token = abrirToken(app, row);
      need(token && cfg.canal, 400, 'Telegram pendente de configuração: salve o token do bot e o canal antes de testar.');
      let detalhe;
      let ok = false;
      const extra = {};
      try {
        const bot = await tg(app, token, 'getMe');
        const chat = await tg(app, token, 'getChat', { chat_id: cfg.canal });
        const membro = await tg(app, token, 'getChatMember', { chat_id: cfg.canal, user_id: bot.id });
        const admin = ['administrator', 'creator'].includes(membro?.status);
        const publica = membro?.status === 'creator' || chat?.type !== 'channel' || membro?.can_post_messages !== false;
        extra.botUsuario = bot?.username ? `@${bot.username}` : cfg.botUsuario;
        extra.canalTitulo = String(chat?.title || chat?.username || '').slice(0, 120);
        if (!admin) detalhe = `O bot ${extra.botUsuario} não é administrador de ${extra.canalTitulo || cfg.canal}. Ponha o bot como administrador do canal, com permissão de publicar.`;
        else if (!publica) detalhe = `O bot é administrador, mas sem permissão de publicar em ${extra.canalTitulo || cfg.canal}.`;
        else { ok = true; detalhe = `Bot ${extra.botUsuario} conectado ao canal ${extra.canalTitulo || cfg.canal}.`; }
      } catch (e) {
        detalhe = esconder(e?.message || e, token);
      }
      const fresco = repo.get('integrations', row.id);
      repo.update('integrations', row.id, {
        status: ok ? 'ativo' : 'erro', last_check: now(), last_error: ok ? null : detalhe,
        public_config: JSON.stringify({ ...(parse(fresco.public_config, {}) || {}), ...extra }),
      });
      audit('telegram.teste', KIND, { resultado: ok ? 'conectado' : 'erro' });
      return { ok, estado: ok ? 'conectado' : 'erro', estadoLabel: ok ? ESTADOS.conectado : ESTADOS.erro, detalhe, ...extra };
    },
  },
];
