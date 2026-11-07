// Bot e canal do Telegram da operação, pela Bot API (https://api.telegram.org) com fetch injetável (app.fetchImpl).
// - Integração 'telegram': config pública { canal, botUsuario } e o token do bot selado no cofre (nunca volta para a tela,
//   nunca vai para log, auditoria nem mensagem de erro).
// - Publicação: espaços do calendário com canal 'telegram' e situação 'agendado' cuja hora passou saem no canal
//   (sendMessage ou sendPhoto, em HTML escapado) e são marcados pelos ajudantes do calendário (marcarPublicado/marcarErro).
// - Respostas no privado: getUpdates com offset guardado na public_config (sem webhook: o servidor fica atrás de túnel).
// - Grupos (PA-151, como o robô do suprema.blog): quem adiciona o bot ao grupo recebe as boas-vindas e a grade de torneios do
//   dia; o bot responde /torneios, /clube, /fichas, /suporte e /ajuda no grupo, e o admin pausa com /pausar e volta com /ativar.
//   Grade do dia nos grupos ativos a partir do horário configurado (padrão 09:00), uma vez por dia por grupo (ultima_grade).
//   A grade vem do módulo de torneios (lib/automacao.mjs → obterGrade); sem ele, /torneios avisa e nada é mandado.
// Laços: publicação a cada 60 s e respostas a cada 10 s, com unref. Desligados com PORTAL_SEM_ROTINAS=1 e nos testes (node --test).
//
// Situação da integração: 'ativo' quando o teste passa, porque é 'ativo' que o calendário entende como conta conectada
// (conexoesDosCanais em calendar.mjs). A tela recebe estado 'conectado'.
import { now, parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { scoped } from '../repo.mjs';
import { audit as gravarAuditoria } from '../tenants.mjs';
import { marcarPublicado, marcarErro, diaLocal } from './calendar.mjs';
import { dadosDaOperacao, siteDaOperacao } from './email.mjs';
import { lerConfig, gravarConfig, rotinasLigadas, fusoDe, horaOk, passouDa, obterGrade, gradeDisponivel, destaques, linhasDaGrade, diaRotulo } from '../automacao.mjs';

export const tables = ['telegram_grupos', 'automacao_config'];
export const nav = { id: 'telegram-grupos', label: 'Robô do Telegram', perm: 'integrations.read' };

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
    comandos: ['/start', '/torneios', '/clube', '/fichas', '/suporte'],
  };
}

// ---------------------------------------------------------------- mensagens prontas do bot

/** Resposta do bot no privado, montada das configurações da operação. HTML do Telegram, tudo escapado. */
export function respostaDoBot(d, texto) {
  const cmd = (String(texto || '').trim().split(/\s+/)[0] || '').toLowerCase().replace(/@[a-z0-9_]+$/, '');
  const nomeClube = `<b>${escHtml(d.clube)}</b>${d.poker && d.idClube ? ` (ID do clube <b>${escHtml(d.idClube)}</b>)` : ''}`;
  const suporte = d.whatsapp ? `Suporte no WhatsApp (a mensagem já vai pronta): ${link(d.whatsapp, 'chamar o suporte')}` : '';
  const site = d.siteUrl ? `Site: ${link(d.siteUrl, d.siteUrl)}` : '';
  const menu = `Comandos: ${d.temGrade ? '/torneios (torneios de hoje), ' : ''}/clube (como entrar), /fichas (canal oficial de fichas), /suporte (falar com a equipe).`;
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

// ---------------------------------------------------------------- respostas no privado e nos grupos

const GRUPOS = new Set(['group', 'supergroup']);
const DENTRO = new Set(['member', 'administrator', 'creator', 'restricted']);
const ADMIN_ANONIMO = 1087968824;  // @GroupAnonymousBot: admin que escreve como o próprio grupo
const ESPERA_MS = 20_000;          // o mesmo comando no mesmo chat: no máximo uma resposta a cada 20 s
const SAIU = /kicked|not a member|chat not found|bot was blocked|deactivated|have no rights|not enough rights|CHAT_WRITE_FORBIDDEN/i;
const APELIDOS = { torneios: 'torneios', grade: 'torneios', hoje: 'torneios', clube: 'clube', entrar: 'clube', fichas: 'fichas', suporte: 'suporte',
  ajuda: 'ajuda', help: 'ajuda', pausar: 'pausar', ativar: 'ativar' };
const PADRAO_GRUPOS = { gradeAtiva: true, gradeHora: '09:00', gradeNoCanal: false, destaques: 8 };

const leituras = new WeakMap();   // app -> Map(tenantId -> ISO da última leitura bem-sucedida)
const respostasRecentes = new WeakMap();
const mapaDe = (wm, app) => { if (!wm.has(app)) wm.set(app, new Map()); return wm.get(app); };

/** Quando o bot da operação leu as mensagens pela última vez (para o vigia). Null se não leu desde que o servidor ligou. */
export const ultimaLeitura = (app, tenantId) => mapaDe(leituras, app).get(tenantId) || null;

export function configDosGrupos(repo) {
  const c = lerConfig(repo, 'telegram_grupos', PADRAO_GRUPOS);
  return { gradeAtiva: Boolean(c.gradeAtiva), gradeHora: horaOk(c.gradeHora) || '09:00', gradeNoCanal: Boolean(c.gradeNoCanal),
    destaques: Math.max(3, Math.min(15, Math.round(Number(c.destaques) || 8))) };
}

const httpsOk = (u) => (/^https:\/\/[^\s<>"']+$/i.test(String(u || '')) ? String(u) : '');
const linkAdicionar = (cfg) => (cfg.botUsuario ? `https://t.me/${cfg.botUsuario.replace(/^@/, '')}?startgroup=grade` : '');

function botoes(d, cfg, { adicionar = true } = {}) {
  const linhas = [];
  const entrar = httpsOk(d.convite) || httpsOk(d.whatsapp) || httpsOk(d.siteUrl);
  if (entrar) linhas.push([{ text: `Entrar no ${d.clube}`.slice(0, 60), url: entrar }]);
  if (adicionar && linkAdicionar(cfg)) linhas.push([{ text: 'Receber a grade no meu grupo', url: linkAdicionar(cfg) }]);
  return linhas.length ? { inline_keyboard: linhas } : undefined;
}

/** Grade do dia em HTML do Telegram (tudo escapado). */
export function mensagemDaGrade(d, grade, top, tz, agora = new Date()) {
  const fuso = tz === 'America/Sao_Paulo' ? 'horário de Brasília' : `fuso ${tz}`;
  const linhas = linhasDaGrade(top, tz).map((l) => `${escHtml(l.hora)} · <b>${escHtml(l.nome)}</b>${l.garantido ? ` · ${escHtml(l.garantido)} GTD` : ''}${l.buyin ? ` · buy-in ${escHtml(l.buyin)}` : ''}`);
  return [
    '🏆 <b>Torneios de hoje</b>',
    `${escHtml(diaRotulo(tz, agora))} · ${escHtml(fuso)}`,
    '',
    ...linhas,
    ...(grade.url ? ['', `Grade completa (${grade.total} torneios): ${link(grade.url, grade.url)}`] : []),
    '',
    `♠️ Jogue no <b>${escHtml(d.clube)}</b>${d.poker && d.idClube ? ` (ID ${escHtml(d.idClube)})` : ''}: /clube`,
    ...(d.aviso ? ['', escHtml(d.aviso)] : []),
  ].join('\n');
}

function ajudaDoGrupo(d, gcfg, temGrade) {
  const comGrade = temGrade && gcfg.gradeAtiva;
  return [
    `Oi, pessoal! Sou o bot do <b>${escHtml(d.clube)}</b>.`,
    comGrade ? `Todo dia às ${escHtml(gcfg.gradeHora)} mando aqui os maiores torneios do dia.` : null,
    '',
    temGrade ? '/torneios · os torneios de hoje' : null,
    `/clube · como entrar no ${escHtml(d.clube)}`,
    '/fichas · canal oficial de fichas',
    '/suporte · falar com a equipe',
    comGrade ? 'Admin: /pausar para parar a grade e /ativar para voltar.' : null,
    ...(d.aviso ? ['', escHtml(d.aviso)] : []),
  ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function guardarGrupo(repo, chat, patch) {
  const chatId = String(chat.id);
  const atual = repo.get('telegram_grupos', { chat_id: chatId });
  const dados = { titulo: String(chat.title || atual?.titulo || '').slice(0, 120), tipo: GRUPOS.has(chat.type) ? chat.type : (atual?.tipo || 'group'), ...patch };
  return atual ? repo.update('telegram_grupos', atual.id, dados) : repo.insert('telegram_grupos', { chat_id: chatId, situacao: 'ativo', ...dados });
}

/** Texto da grade de agora para um chat, ou o aviso de que não há. */
async function textoDaGradeAgora(b) {
  const agora = new Date();
  const grade = await obterGrade(b.app, b.tenant, { agora });
  if (!grade) return { texto: 'A grade de torneios de hoje ainda não está disponível. Tente mais tarde.', grade: null };
  const top = destaques(grade, agora, b.gcfg.destaques);
  if (!top.length) return { texto: `Os torneios de hoje já começaram.${grade.url ? ` A grade fica em ${link(grade.url, grade.url)}` : ''}`, grade: null };
  return { texto: mensagemDaGrade(b.d, grade, top, b.tz, agora), grade };
}

const enviar = (b, chatId, text, extra = {}) => tg(b.app, b.token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

/** Marca a grade do dia como mandada para o grupo antes de mandar (dois laços ao mesmo tempo não repetem). */
function reservarGradeDoGrupo(db, grupo, dia) {
  return db.prepare('UPDATE telegram_grupos SET ultima_grade = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND (ultima_grade IS NULL OR ultima_grade != ?)')
    .run(dia, now(), grupo.tenant_id, grupo.id, dia).changes > 0;
}

/** Manda a grade a um grupo. Devolve 'ok' | 'saiu' | 'falhou' | 'repetido'. */
async function gradeParaGrupo(b, grupo, texto, dia) {
  if (!reservarGradeDoGrupo(b.app.db, grupo, dia)) return 'repetido';
  try {
    await enviar(b, grupo.chat_id, texto, { reply_markup: botoes(b.d, b.cfg) });
    b.repo.update('telegram_grupos', grupo.id, { ultimo_erro: null });
    return 'ok';
  } catch (e) {
    const motivo = esconder(e?.message || e, b.token).slice(0, 300);
    if (SAIU.test(motivo)) { b.repo.update('telegram_grupos', grupo.id, { situacao: 'saiu', ultimo_erro: motivo }); return 'saiu'; }
    b.repo.update('telegram_grupos', grupo.id, { ultima_grade: grupo.ultima_grade || null, ultimo_erro: motivo }); // tenta de novo na próxima rodada
    return 'falhou';
  }
}

async function souAdmin(b, m) {
  if (m.sender_chat?.id === m.chat.id || m.from?.id === ADMIN_ANONIMO) return true;
  const membro = await tg(b.app, b.token, 'getChatMember', { chat_id: m.chat.id, user_id: m.from?.id }).catch(() => null);
  return ['creator', 'administrator'].includes(membro?.status);
}

/** Comando num grupo. Devolve true se respondeu. */
async function comandoNoGrupo(b, m) {
  const casou = /^\/([a-z_]+)(?:@(\w+))?/i.exec(String(m.text || ''));
  if (!casou) return false;
  const meu = String(b.cfg.botUsuario || '').replace(/^@/, '').toLowerCase();
  if (casou[2] && casou[2].toLowerCase() !== meu) return false;              // comando para outro bot
  const cmd = APELIDOS[casou[1].toLowerCase()];
  if (!cmd) return false;                                                    // /start e o resto: no grupo, só os comandos conhecidos
  const recentes = mapaDe(respostasRecentes, b.app);
  const chave = `${b.tenant.id}:${m.chat.id}:${cmd}`;
  if (Date.now() - (recentes.get(chave) || 0) < ESPERA_MS) return false;
  recentes.set(chave, Date.now());
  const opts = { reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, ...(m.is_topic_message && m.message_thread_id ? { message_thread_id: m.message_thread_id } : {}) };
  const grupo = b.repo.get('telegram_grupos', { chat_id: String(m.chat.id) }) || guardarGrupo(b.repo, m.chat, { situacao: 'ativo' });
  if (cmd === 'torneios') {
    const { texto, grade } = await textoDaGradeAgora(b);
    await enviar(b, m.chat.id, texto, { ...opts, ...(grade ? { reply_markup: botoes(b.d, b.cfg) } : {}) });
  } else if (cmd === 'clube' || cmd === 'fichas' || cmd === 'suporte') {
    await enviar(b, m.chat.id, respostaDoBot(b.d, `/${cmd}`), { ...opts, ...(cmd === 'clube' ? { reply_markup: botoes(b.d, b.cfg, { adicionar: false }) } : {}) });
  } else if (cmd === 'ajuda') {
    await enviar(b, m.chat.id, ajudaDoGrupo(b.d, b.gcfg, b.temGrade), opts);
  } else {
    if (!(await souAdmin(b, m))) { await enviar(b, m.chat.id, 'Só um admin do grupo pode pausar ou ativar a grade do dia.', opts); return true; }
    b.repo.update('telegram_grupos', grupo.id, { situacao: cmd === 'pausar' ? 'pausado' : 'ativo' });
    gravarAuditoria(b.app.db, { tenantId: b.tenant.id, action: `telegram.grupo.${cmd}`, target: grupo.id, data: { origem: 'admin do grupo' } });
    await enviar(b, m.chat.id, cmd === 'pausar'
      ? 'Pronto: a grade do dia está pausada neste grupo. Para voltar, um admin manda /ativar. O /torneios continua funcionando.'
      : `Pronto: a grade de torneios volta a chegar aqui todo dia às ${escHtml(b.gcfg.gradeHora)}.`, opts);
  }
  return true;
}

/** O bot entrou ou saiu de um grupo (canais e privado ficam de fora). */
async function mudouMembro(b, u) {
  const chat = u?.chat;
  if (!chat || !GRUPOS.has(chat.type)) return false;
  const dentro = DENTRO.has(u.new_chat_member?.status);
  const antes = DENTRO.has(u.old_chat_member?.status);
  if (dentro && !antes) {
    const grupo = guardarGrupo(b.repo, chat, { situacao: 'ativo', ultimo_erro: null });
    gravarAuditoria(b.app.db, { tenantId: b.tenant.id, action: 'telegram.grupo.entrar', target: grupo.id, data: { tipo: chat.type } });
    try {
      await enviar(b, chat.id, ajudaDoGrupo(b.d, b.gcfg, b.temGrade), { reply_markup: botoes(b.d, b.cfg, { adicionar: false }) });
      const instante = new Date();
      if (b.gcfg.gradeAtiva && passouDa(b.tz, instante, b.gcfg.gradeHora)) {
        const grade = await obterGrade(b.app, b.tenant, { agora: instante });
        const top = destaques(grade, instante, b.gcfg.destaques);
        if (grade && top.length) await gradeParaGrupo(b, b.repo.get('telegram_grupos', grupo.id), mensagemDaGrade(b.d, grade, top, b.tz, instante), diaLocal(b.tz, instante));
      }
    } catch (e) {
      b.repo.update('telegram_grupos', grupo.id, { ultimo_erro: esconder(e?.message || e, b.token).slice(0, 300) });
    }
    return true;
  }
  if (!dentro && antes) {
    const grupo = guardarGrupo(b.repo, chat, { situacao: 'saiu' });
    gravarAuditoria(b.app.db, { tenantId: b.tenant.id, action: 'telegram.grupo.sair', target: grupo.id, data: {} });
    return true;
  }
  return false;
}

/** Lê as mensagens novas do bot (getUpdates) e responde no privado e nos grupos. Devolve { respondidas, noGrupo, grupos }. */
export async function responderMensagens(app) {
  const linhas = app.db.prepare(`SELECT i.* FROM integrations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.kind = 'telegram' AND i.status = 'ativo' AND i.secret IS NOT NULL AND t.status = 'ativa'`).all();
  const ocupados = andamento(app);
  const resumo = { respondidas: 0, noGrupo: 0, grupos: 0 };
  for (const row of linhas) {
    const chave = `bot:${row.tenant_id}`;
    if (ocupados.has(chave)) continue;
    ocupados.add(chave);
    const token = abrirToken(app, row);
    try {
      if (!token) continue;
      const repo = scoped(app.db, row.tenant_id);
      const cfg = configDe(row);
      const updates = await tg(app, token, 'getUpdates', { ...(cfg.updateOffset ? { offset: cfg.updateOffset } : {}), timeout: 0, limit: 50, allowed_updates: ['message', 'my_chat_member'] });
      mapaDe(leituras, app).set(row.tenant_id, now());
      if (!Array.isArray(updates) || !updates.length) continue;
      const proximo = Math.max(cfg.updateOffset, ...updates.map((u) => Number(u.update_id) + 1).filter(Number.isFinite));
      // grava o offset ANTES de responder: se cair no meio, ninguém recebe a mesma resposta duas vezes
      const fresco = repo.get('integrations', row.id);
      if (!fresco || fresco.secret !== row.secret) continue;          // o token mudou enquanto líamos
      repo.update('integrations', row.id, { public_config: JSON.stringify({ ...(parse(fresco.public_config, {}) || {}), updateOffset: proximo }) });
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(row.tenant_id);
      const temGrade = await gradeDisponivel(app);
      const d = { ...dadosDaOperacao(app, tenant), temGrade };
      const b = { app, token, tenant, repo, d, cfg, gcfg: configDosGrupos(repo), tz: fusoDe(tenant), temGrade };
      for (const u of updates) {
        try {
          if (u?.my_chat_member) { if (await mudouMembro(b, u.my_chat_member)) resumo.grupos++; continue; }
          const m = u?.message;
          if (!m || m.chat?.id == null) continue;
          if (m.migrate_to_chat_id && GRUPOS.has(m.chat.type)) {         // o grupo virou supergrupo e ganhou outro id
            guardarGrupo(repo, m.chat, { situacao: 'migrou' });
            guardarGrupo(repo, { id: m.migrate_to_chat_id, title: m.chat.title, type: 'supergroup' }, { situacao: 'ativo' });
            resumo.grupos++;
            continue;
          }
          if (m.from?.is_bot) continue;
          if (m.chat.type === 'private') {
            const cmd = (String(m.text || '').trim().split(/\s+/)[0] || '').toLowerCase().replace(/@[a-z0-9_]+$/, '');
            const texto = ['/torneios', '/grade', '/hoje'].includes(cmd) ? (await textoDaGradeAgora(b)).texto : respostaDoBot(d, m.text);
            await enviar(b, m.chat.id, texto);
            resumo.respondidas++;
          } else if (GRUPOS.has(m.chat.type)) {
            if (await comandoNoGrupo(b, m)) resumo.noGrupo++;
          }
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
  return resumo;
}

// ---------------------------------------------------------------- grade do dia nos grupos (e no canal, se ligado)

const pausa = (app) => new Promise((r) => setTimeout(r, app.pausaTelegramMs ?? 150)); // o Telegram aceita ~30 mensagens/s no total

/**
 * Manda a grade do dia aos grupos ativos que ainda não receberam hoje, a partir do horário da operação.
 * opts.tenantId: só uma operação; opts.ignorarHora: botão "mandar agora" do painel. Devolve { enviados, falhas, saiu, semGrade, canal }.
 */
export async function gradeNosGrupos(app, { agora = new Date(), tenantId = null, ignorarHora = false } = {}) {
  const linhas = app.db.prepare(`SELECT i.* FROM integrations i JOIN tenants t ON t.id = i.tenant_id
    WHERE i.kind = 'telegram' AND i.status = 'ativo' AND i.secret IS NOT NULL AND t.status = 'ativa' ${tenantId ? 'AND t.id = ?' : ''}`).all(...(tenantId ? [tenantId] : []));
  const resumo = { enviados: 0, falhas: 0, saiu: 0, semGrade: 0, canal: false };
  const ocupados = andamento(app);
  for (const row of linhas) {
    const chave = `grade:${row.tenant_id}`;
    if (ocupados.has(chave)) continue;
    ocupados.add(chave);
    const token = abrirToken(app, row);
    try {
      if (!token) continue;
      const repo = scoped(app.db, row.tenant_id);
      const gcfg = configDosGrupos(repo);
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(row.tenant_id);
      const tz = fusoDe(tenant);
      if (!gcfg.gradeAtiva || (!ignorarHora && !passouDa(tz, agora, gcfg.gradeHora))) continue;
      const dia = diaLocal(tz, agora);
      const cfg = configDe(row);
      const grupos = repo.all('telegram_grupos', { situacao: 'ativo' }, { order: 'created_at ASC', limit: 1000, extra: 'ultima_grade IS NULL OR ultima_grade != ?', extraParams: [dia] });
      const pub = parse(row.public_config, {}) || {};
      const noCanal = gcfg.gradeNoCanal && CANAL.test(cfg.canal) && pub.gradeCanalDia !== dia;
      if (!grupos.length && !noCanal) continue;
      const grade = await obterGrade(app, tenant, { agora });
      const top = destaques(grade, agora, gcfg.destaques);
      if (!grade || !top.length) { resumo.semGrade++; continue; }
      const b = { app, token, tenant, repo, d: { ...dadosDaOperacao(app, tenant), temGrade: true }, cfg, gcfg, tz };
      const texto = mensagemDaGrade(b.d, grade, top, tz, agora);
      let enviadosAqui = 0;
      for (const g of grupos) {
        const r = await gradeParaGrupo(b, g, texto, dia);
        if (r === 'ok') { resumo.enviados++; enviadosAqui++; }
        else if (r === 'saiu') resumo.saiu++;
        else if (r === 'falhou') resumo.falhas++;
        await pausa(app);
      }
      let canalOk = false;
      if (noCanal) {
        const fresco = repo.get('integrations', row.id);
        repo.update('integrations', row.id, { public_config: JSON.stringify({ ...(parse(fresco.public_config, {}) || {}), gradeCanalDia: dia }) });
        try {
          const add = linkAdicionar(cfg);
          await enviar(b, cfg.canal, `${texto}${add ? `\n\n➕ Quer esta grade no seu grupo todo dia? ${link(add, 'adicionar o bot')}` : ''}`);
          canalOk = true;
          resumo.canal = true;
        } catch (e) {
          const f = repo.get('integrations', row.id);
          repo.update('integrations', row.id, { public_config: JSON.stringify({ ...(parse(f.public_config, {}) || {}), gradeCanalDia: pub.gradeCanalDia || null }),
            last_error: `Grade no canal: ${esconder(e?.message || e, token).slice(0, 200)}` });
          resumo.falhas++;
        }
      }
      if (enviadosAqui || canalOk) gravarAuditoria(app.db, { tenantId: tenant.id, action: 'telegram.grade', target: dia, data: { grupos: enviadosAqui, canal: canalOk } });
    } catch (e) {
      console.error(`[telegram] grade nos grupos: ${esconder(e?.message || e, token)}`);
    } finally {
      ocupados.delete(chave);
    }
  }
  return resumo;
}

// ---------------------------------------------------------------- laços

export async function init(app) {
  if (!rotinasLigadas(app)) return null;
  const pub = setInterval(() => { publicarVencidos(app).catch((e) => console.error(`[telegram] publicação: ${String(e?.message || e).slice(0, 200)}`)); }, 60_000);
  const bot = setInterval(() => { responderMensagens(app).catch((e) => console.error(`[telegram] respostas: ${String(e?.message || e).slice(0, 200)}`)); }, 10_000);
  const grade = setInterval(() => { gradeNosGrupos(app).catch((e) => console.error(`[telegram] grade: ${String(e?.message || e).slice(0, 200)}`)); }, 60_000);
  pub.unref?.();
  bot.unref?.();
  grade.unref?.();
  return { pub, bot, grade };
}

// ---------------------------------------------------------------- rotas do painel

const grupoOut = (g) => ({ id: g.id, chatId: g.chat_id, titulo: g.titulo, tipo: g.tipo, situacao: g.situacao, ultimaGrade: g.ultima_grade, ultimoErro: g.ultimo_erro, desde: g.created_at });

async function telaDosGrupos(app, tenant, repo) {
  const row = integracao(repo);
  const cfg = configDe(row);
  const gcfg = configDosGrupos(repo);
  const tz = fusoDe(tenant);
  const temGrade = await gradeDisponivel(app);
  const grupos = repo.all('telegram_grupos', {}, { order: 'updated_at DESC', limit: 500 });
  const hoje = diaLocal(tz, new Date());
  return {
    config: gcfg, fuso: tz, conectado: row.status === 'ativo', estado: estadoDe(row), estadoLabel: ESTADOS[estadoDe(row)],
    botUsuario: cfg.botUsuario || '', linkAdicionar: linkAdicionar(cfg), canal: cfg.canal || '',
    gradeDisponivel: temGrade, ultimaLeitura: ultimaLeitura(app, tenant.id),
    grupos: grupos.map(grupoOut),
    contagem: { ativos: grupos.filter((g) => g.situacao === 'ativo').length, pausados: grupos.filter((g) => g.situacao === 'pausado').length,
      receberamHoje: grupos.filter((g) => g.ultima_grade === hoje).length },
    comandos: ['/torneios', '/clube', '/fichas', '/suporte', '/ajuda', '/pausar (admin)', '/ativar (admin)'],
    ajuda: temGrade ? 'Para o bot entrar em grupos: no @BotFather, /setjoingroups → Enable. Depois mande o link "adicionar ao grupo".'
      : 'A grade de torneios ainda não está ligada (falta o módulo de torneios). Os comandos /clube, /fichas e /suporte já funcionam nos grupos.',
  };
}

const rotasDosGrupos = [
  {
    method: 'GET', path: '/api/t/:tenant/telegram/grupos', perm: 'integrations.read',
    handler: ({ app, tenant, repo }) => telaDosGrupos(app, tenant, repo),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/telegram/grupos/config', perm: 'integrations.manage',
    handler: async ({ app, tenant, repo, body, audit }) => {
      const atual = lerConfig(repo, 'telegram_grupos', PADRAO_GRUPOS);
      const novo = { ...atual };
      if (body.gradeAtiva !== undefined) novo.gradeAtiva = Boolean(body.gradeAtiva);
      if (body.gradeNoCanal !== undefined) novo.gradeNoCanal = Boolean(body.gradeNoCanal);
      if (body.gradeHora !== undefined) { const h = horaOk(body.gradeHora); need(h, 400, 'Horário da grade inválido: use HH:MM.'); novo.gradeHora = h; }
      if (body.destaques !== undefined) { const n = Math.round(Number(body.destaques)); need(n >= 3 && n <= 15, 400, 'Destaques: de 3 a 15 torneios.'); novo.destaques = n; }
      gravarConfig(repo, 'telegram_grupos', novo);
      audit('telegram.grupos.config', KIND, { gradeAtiva: novo.gradeAtiva, gradeHora: novo.gradeHora, gradeNoCanal: novo.gradeNoCanal });
      return telaDosGrupos(app, tenant, repo);
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/telegram/grupos/:id', perm: 'integrations.manage',
    handler: ({ repo, params, body, audit }) => {
      const g = repo.get('telegram_grupos', String(params.id || ''));
      need(g, 404, 'Grupo não encontrado.');
      need(['ativo', 'pausado'].includes(body.situacao), 400, 'Situação inválida: use "ativo" ou "pausado".');
      need(['ativo', 'pausado'].includes(g.situacao), 409, 'O bot não está mais neste grupo.');
      const novo = repo.update('telegram_grupos', g.id, { situacao: body.situacao });
      audit(`telegram.grupo.${body.situacao === 'ativo' ? 'ativar' : 'pausar'}`, g.id, { origem: 'painel' });
      return { grupo: grupoOut(novo) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/telegram/grupos/grade', perm: 'integrations.manage',
    handler: async ({ app, tenant, repo, audit }) => {
      const row = integracao(repo);
      need(row.status === 'ativo', 409, 'Conecte o Telegram em Integrações (Testar) antes de mandar a grade.');
      need(await gradeDisponivel(app), 409, 'A grade de torneios ainda não está ligada nesta instalação.');
      const r = await gradeNosGrupos(app, { tenantId: tenant.id, ignorarHora: true });
      audit('telegram.grade.manual', KIND, r);
      return { ok: true, ...r, nota: r.semGrade ? 'Sem torneios por começar hoje: nada foi mandado.' : 'Grupos que já receberam hoje não recebem de novo.' };
    },
  },
];

export const routes = [
  ...rotasDosGrupos,
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
