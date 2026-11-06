// E-mail do CRM pela conta da operação (ex.: Gmail com senha de app), por SMTP próprio e sem dependências.
// - Cliente SMTP mínimo: TLS direto na 465 ou STARTTLS na 587 (texto puro só para servidor local, ex.: testes).
// - Integração 'email_smtp': config pública { remetente, nomeRemetente, host, porta, usuario, respostaPara } e a senha de app
//   selada no cofre. A senha nunca volta para a tela, nunca vai para log, auditoria nem histórico do lead.
// - Boas-vindas: depois de cada lead (gancho onLead) sai uma vez o "passo a passo" montado das configurações da operação.
// - CRM: e-mail avulso para um lead, registrado no histórico.
// O transporte é injetável: app.emailTransport(envio) substitui o SMTP (o padrão é smtpEnviar).
import net from 'node:net';
import tls from 'node:tls';
import { randomBytes, randomUUID } from 'node:crypto';
import { now, parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { templateVars } from '../tenants.mjs';
import { cleanTheme, fillPlaceholders } from '../templates.mjs';

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

const KIND = 'email_smtp';
const HOST_PADRAO = 'smtp.gmail.com';
const PORTA_PADRAO = 465;
const EMAIL = /^[^@\s<>"'(),;:\\[\]]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
const HOST = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*$/;
const LOCAL = new Set(['127.0.0.1', 'localhost', '::1']);
const ESTADOS = { pendente: 'Pendente de configuração', conectado: 'Conectado', erro: 'Erro no último envio' };

const emailValido = (e) => EMAIL.test(String(e || '')) && String(e).length <= 120;
const umaLinha = (s, max = 200) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------- cliente SMTP

class SmtpErro extends Error {
  constructor(mensagem, codigo = 0, etapa = '') { super(mensagem); this.codigo = codigo; this.etapa = etapa; }
}

/** Lê as respostas do servidor (inclusive as de várias linhas "250-...") e permite trocar o socket no STARTTLS. */
function sessao(socketInicial, timeoutMs) {
  let socket = socketInicial;
  let buf = '';
  let linhas = [];
  const prontas = [];
  const espera = [];
  let falha = null;

  const entregar = () => {
    while (espera.length && (prontas.length || falha)) {
      const w = espera.shift();
      clearTimeout(w.timer);
      if (prontas.length) w.resolve(prontas.shift()); else w.reject(falha);
    }
  };
  const onData = (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      linhas.push(l);
      if (/^\d{3}-/.test(l)) continue;                      // continua na próxima linha
      prontas.push({ codigo: Number(l.slice(0, 3)) || 0, linhas: linhas.map((x) => x.slice(4)), texto: linhas.join(' ') });
      linhas = [];
    }
    entregar();
  };
  const onErro = (e) => { falha ||= new SmtpErro(`A conexão com o servidor de e-mail caiu: ${e.message}`); entregar(); };
  const onFim = () => { falha ||= new SmtpErro('O servidor de e-mail fechou a conexão.'); entregar(); };
  const ligar = (s) => { s.on('data', onData); s.on('error', onErro); s.on('close', onFim); };
  const soltar = (s) => { s.off('data', onData); s.off('error', onErro); s.off('close', onFim); s.on('error', () => {}); };
  ligar(socket);

  return {
    resposta() {
      return new Promise((resolve, reject) => {
        const w = { resolve, reject, timer: null };
        w.timer = setTimeout(() => {
          const k = espera.indexOf(w);
          if (k >= 0) espera.splice(k, 1);
          reject(new SmtpErro(`O servidor de e-mail não respondeu em ${Math.round(timeoutMs / 1000)} s.`));
        }, timeoutMs);
        espera.push(w);
        entregar();
      });
    },
    escrever(texto) { socket.write(texto); },
    /** Solta o socket atual (para o TLS assumir) e devolve ele. */
    soltar() { soltar(socket); buf = ''; linhas = []; return socket; },
    ligar(novo) { socket = novo; ligar(novo); },
    fechar() { soltar(socket); socket.destroy(); },
  };
}

function conectar({ host, porta, tlsDireto, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const s = tlsDireto
      ? tls.connect({ host, port: porta, servername: net.isIP(host) ? undefined : host })
      : net.connect({ host, port: porta });
    const t = setTimeout(() => { s.destroy(); reject(new SmtpErro(`Sem resposta de ${host}:${porta} em ${Math.round(timeoutMs / 1000)} s.`, 0, 'conexao')); }, timeoutMs);
    const onErr = (e) => { clearTimeout(t); s.destroy(); reject(new SmtpErro(`Não deu para conectar em ${host}:${porta}: ${e.message}`, 0, 'conexao')); };
    s.once('error', onErr);
    s.once(tlsDireto ? 'secureConnect' : 'connect', () => { clearTimeout(t); s.off('error', onErr); resolve(s); });
  });
}

function subirTls(cru, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ socket: cru, servername: net.isIP(host) ? undefined : host });
    const t = setTimeout(() => { s.destroy(); reject(new SmtpErro('O STARTTLS não terminou a tempo.', 0, 'STARTTLS')); }, timeoutMs);
    const onErr = (e) => { clearTimeout(t); s.destroy(); reject(new SmtpErro(`Falha no STARTTLS: ${e.message}`, 0, 'STARTTLS')); };
    s.once('error', onErr);
    s.once('secureConnect', () => { clearTimeout(t); s.off('error', onErr); resolve(s); });
  });
}

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
/** Ponto no começo da linha vira dois pontos (RFC 5321, 4.5.2). */
const pontear = (msg) => String(msg).replace(/\r?\n/g, '\r\n').replace(/(\r\n)+$/, '').replace(/^\./gm, '..');

const DICA = {
  530: 'O servidor exige login: confira o usuário.',
  534: 'O Google pediu login mais seguro: use uma senha de app (com a verificação em 2 etapas ligada).',
  535: 'Usuário ou senha de app recusados. Confira a senha de app de 16 letras e se a verificação em 2 etapas está ligada na conta.',
};

/**
 * Manda uma mensagem pronta (MIME) por SMTP.
 * envio: { host, porta, usuario, senha, de, para, mensagem, timeoutMs?, helo? }
 * Porta 465 = TLS direto. Outras portas: STARTTLS obrigatório, exceto em servidor local (127.0.0.1 / localhost), onde a conversa pode ser em texto puro.
 */
export async function smtpEnviar({ host, porta, usuario, senha, de, para, mensagem, timeoutMs = 20_000, helo }) {
  porta = Number(porta) || PORTA_PADRAO;
  const tlsDireto = porta === 465;
  const local = LOCAL.has(String(host).toLowerCase());
  const nome = helo || (String(de).split('@')[1] || 'localhost');
  const s = sessao(await conectar({ host, porta, tlsDireto, timeoutMs }), timeoutMs);
  const passo = async (cmd, esperados, etapa) => {
    if (cmd != null) s.escrever(`${cmd}\r\n`);
    const r = await s.resposta();
    if (!esperados.includes(r.codigo)) {
      const txt = umaLinha(r.texto, 300);
      throw new SmtpErro(`${etapa}: o servidor respondeu "${txt}".${DICA[r.codigo] ? ` ${DICA[r.codigo]}` : ''}`, r.codigo, etapa);
    }
    return r;
  };
  try {
    await passo(null, [220], 'Saudação');
    let recursos = (await passo(`EHLO ${nome}`, [250], 'EHLO')).linhas.map((l) => l.toUpperCase());
    if (!tlsDireto) {
      if (recursos.some((r) => r.startsWith('STARTTLS'))) {
        await passo('STARTTLS', [220], 'STARTTLS');
        s.ligar(await subirTls(s.soltar(), host, timeoutMs));
        recursos = (await passo(`EHLO ${nome}`, [250], 'EHLO')).linhas.map((l) => l.toUpperCase());
      } else if (!local) {
        throw new SmtpErro('O servidor não oferece STARTTLS: a senha não sai sem criptografia. Use a porta 465 (SSL) ou 587 (STARTTLS).', 0, 'STARTTLS');
      }
    }
    if (usuario) {
      const auth = recursos.find((r) => /^AUTH[ =]/.test(r)) || '';
      if (/\bLOGIN\b/.test(auth) && !/\bPLAIN\b/.test(auth)) {
        await passo('AUTH LOGIN', [334], 'Login');
        await passo(b64(usuario), [334], 'Login');
        await passo(b64(senha || ''), [235], 'Login');
      } else {
        await passo(`AUTH PLAIN ${b64(`\0${usuario}\0${senha || ''}`)}`, [235], 'Login');
      }
    }
    await passo(`MAIL FROM:<${de}>`, [250], 'Remetente');
    await passo(`RCPT TO:<${para}>`, [250, 251], 'Destinatário');
    await passo('DATA', [354], 'Envio');
    const fim = await passo(`${pontear(mensagem)}\r\n.`, [250], 'Envio');
    try { s.escrever('QUIT\r\n'); await s.resposta(); } catch { /* o servidor pode fechar antes de responder */ }
    return { ok: true, resposta: umaLinha(fim.texto, 300) };
  } finally {
    s.fechar();
  }
}

// ---------------------------------------------------------------- MIME

/** Cabeçalho em UTF-8: =?UTF-8?B?...?= em pedaços de até ~72 caracteres, sem quebrar letra acentuada. */
export function palavraCodificada(texto) {
  const s = umaLinha(texto, 300);
  if (/^[\x20-\x7e]*$/.test(s) && !/[=?"(),.:;<>@[\]\\]/.test(s)) return s;
  const partes = [];
  let atual = '';
  for (const ch of s) {
    if (Buffer.byteLength(atual + ch, 'utf8') > 45) { partes.push(atual); atual = ''; }
    atual += ch;
  }
  if (atual) partes.push(atual);
  return partes.map((p) => `=?UTF-8?B?${b64(p)}?=`).join('\r\n ');
}

const base64Linhas = (texto) => b64(texto).replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');

/** Mensagem multipart/alternative (texto + HTML) em UTF-8 e base64. */
export function montarMensagem({ de, nomeDe, para, respostaPara, assunto, texto, html, descadastro, data = new Date() }) {
  const fronteira = `=_pa_${randomBytes(12).toString('hex')}`;
  const dominio = String(de).split('@')[1] || 'localhost';
  const cab = [
    `From: ${nomeDe ? `${palavraCodificada(nomeDe)} ` : ''}<${de}>`,
    `To: <${para}>`,
    respostaPara ? `Reply-To: <${respostaPara}>` : null,
    `Subject: ${palavraCodificada(assunto)}`,
    `Date: ${data.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomUUID()}@${dominio}>`,
    'MIME-Version: 1.0',
    descadastro ? `List-Unsubscribe: <${descadastro}>` : null,
    `Content-Type: multipart/alternative; boundary="${fronteira}"`,
  ].filter(Boolean);
  const parte = (tipo, corpo) => [`--${fronteira}`, `Content-Type: ${tipo}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Linhas(corpo)].join('\r\n');
  return [...cab, '', 'Mensagem em formato MIME.', '', parte('text/plain', texto), parte('text/html', html), `--${fronteira}--`, ''].join('\r\n');
}

// ---------------------------------------------------------------- dados da operação (também usados pelo bot do Telegram)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkOk = (u) => (/^https?:\/\/[^\s<>"']+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

/** Site principal da operação: o primeiro publicado (ou externo); se não houver, o primeiro criado. */
export function siteDaOperacao(db, tenantId) {
  return db.prepare("SELECT * FROM sites WHERE tenant_id = ? AND (status != 'rascunho' OR external_url IS NOT NULL) ORDER BY created_at ASC LIMIT 1").get(tenantId)
    || db.prepare('SELECT * FROM sites WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1').get(tenantId) || null;
}

/** Endereço público do site (domínio próprio, site externo ou /s/<slug>/ na origem da edição). */
export function urlDoSite(app, tenant, site) {
  if (!site) return app.originOf(tenant.edition);
  if (site.external_url) return linkOk(site.external_url) || app.originOf(tenant.edition);
  if (site.domain) return `https://${site.domain}`;
  return `${app.originOf(tenant.edition)}/s/${site.slug}/`;
}

/** Tudo o que as mensagens prontas usam, tirado das configurações da operação. */
export function dadosDaOperacao(app, tenant, site = null) {
  const settings = parse(tenant.settings, {}) || {};
  const vars = templateVars(tenant, settings);
  const s = site || siteDaOperacao(app.db, tenant.id);
  const poker = tenant.niche_id === 'poker';
  return {
    vars, settings, site: s, siteUrl: urlDoSite(app, tenant, s), poker,
    clube: tenant.name, idClube: tenant.number || '', unidade: vars.unit || 'Operação',
    agente: umaLinha(settings.agentId, 40), appNome: umaLinha(settings.app, 60),
    convite: linkOk(settings.inviteLink), fichas: linkOk(settings.chipsUrl),
    whatsapp: vars.whatsappLink && vars.whatsappLink !== '#contato' ? vars.whatsappLink : '',
    aviso: vars.disclaimer || (poker ? 'Somente maiores de 18 anos. Jogue com responsabilidade.' : ''),
  };
}

/** Variáveis para {{...}} nos textos que o dono escreve (assunto e texto das boas-vindas, e-mail avulso). */
function variaveis(d, lead) {
  const pedirLink = d.whatsapp ? `peça o link no suporte: ${d.whatsapp}` : 'peça o link respondendo este e-mail';
  return { ...d.vars, nome: lead?.name || '', clube: d.clube, idClube: d.idClube, agente: d.agente, app: d.appNome || d.vars.app || '',
    linkConvite: d.convite || pedirLink, canalFichas: d.fichas, fichas: d.fichas, suporte: d.whatsapp, whatsappLink: d.whatsapp, site: d.siteUrl };
}

// ---------------------------------------------------------------- conteúdo dos e-mails

/** Rodapé comum: site, +18 e descadastro. */
function rodape(d, descadastro) {
  return [
    d.siteUrl ? `Site: ${d.siteUrl}` : '',
    d.aviso,
    `Você recebeu este e-mail porque se cadastrou em ${d.clube} e autorizou o contato. Para não receber mais, responda com "Descadastrar" ou use: ${descadastro}`,
  ].filter(Boolean);
}

/** Passos do "passo a passo" (mesma fonte para o texto e o HTML). */
function passosPadrao(d) {
  const p = [];
  if (d.poker) {
    p.push({ titulo: 'Baixe o aplicativo', texto: d.appNome ? `Instale o ${d.appNome} no celular e crie sua conta.` : 'Instale o aplicativo do clube no celular e crie sua conta.' });
    const ids = [d.idClube && `ID do clube: ${d.idClube}`, d.agente && `ID do agente: ${d.agente}`].filter(Boolean).join(' · ');
    p.push({
      titulo: 'Entre no clube',
      texto: `${ids ? `${ids}. ` : ''}${d.convite ? 'Use o link de convite do clube:' : d.whatsapp
        ? 'Para receber o link de convite, chame o suporte no WhatsApp.' : 'Para receber o link de convite, responda este e-mail.'}`,
      link: d.convite ? { url: d.convite, rotulo: 'Abrir o convite do clube' } : d.whatsapp ? { url: d.whatsapp, rotulo: 'Pedir o link no WhatsApp' } : null,
    });
    if (d.fichas) p.push({ titulo: 'Fichas', texto: 'Fichas só pelo canal oficial do clube:', link: { url: d.fichas, rotulo: 'Canal oficial de fichas' } });
  } else {
    p.push({ titulo: 'Conheça', texto: `Veja tudo sobre ${d.clube} no site:`, link: d.siteUrl ? { url: d.siteUrl, rotulo: 'Abrir o site' } : null });
  }
  if (d.whatsapp) p.push({ titulo: 'Suporte', texto: 'Dúvidas? Fale com o suporte no WhatsApp; a mensagem já vai pronta.', link: { url: d.whatsapp, rotulo: 'Chamar o suporte no WhatsApp' } });
  return p;
}

const linkificar = (txt) => esc(txt).replace(/(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+)/g, (u) => `<a href="${u}" style="color:inherit;text-decoration:underline;">${u}</a>`);

/** HTML de e-mail simples e compatível: tabelas, estilos inline, cores do tema do site. */
function htmlDoEmail({ tema, assunto, cabecalho, titulo, intro, passos = [], paragrafos = [], rodapeLinhas = [] }) {
  const t = tema;
  const fonte = 'font-family:Arial,Helvetica,sans-serif;';
  const botao = (l) => `<a href="${esc(l.url)}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:${t.primary};color:${t.primaryText};text-decoration:none;border-radius:8px;font-weight:bold;${fonte}font-size:14px;">${esc(l.rotulo)}</a>`;
  const linhaPasso = (p, i) => `<tr><td style="padding:0 24px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="36" valign="top" style="padding-top:2px;"><div style="width:26px;height:26px;border-radius:13px;background:${t.primary};color:${t.primaryText};text-align:center;line-height:26px;font-weight:bold;${fonte}font-size:13px;">${i + 1}</div></td>
<td valign="top" style="${fonte}color:${t.text};font-size:15px;line-height:1.5;"><strong>${esc(p.titulo)}</strong><br>${esc(p.texto)}${p.link ? `<br>${botao(p.link)}` : ''}</td></tr></table></td></tr>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:${t.bg};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${t.surface};border:1px solid ${t.border};border-radius:12px;">
<tr><td style="padding:24px 24px 6px;${fonte}color:${t.primary};font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;">${esc(cabecalho)}</td></tr>
<tr><td style="padding:0 24px 10px;${fonte}color:${t.text};font-size:22px;line-height:1.3;font-weight:bold;">${esc(titulo)}</td></tr>
${intro ? `<tr><td style="padding:0 24px 18px;${fonte}color:${t.text};font-size:15px;line-height:1.6;">${esc(intro)}</td></tr>` : ''}
${passos.map(linhaPasso).join('\n')}
${paragrafos.map((p) => `<tr><td style="padding:0 24px 14px;${fonte}color:${t.text};font-size:15px;line-height:1.6;">${linkificar(p).replace(/\n/g, '<br>')}</td></tr>`).join('\n')}
<tr><td style="padding:12px 24px 24px;border-top:1px solid ${t.border};${fonte}color:${t.muted};font-size:12px;line-height:1.6;">${rodapeLinhas.map(linkificar).join('<br>')}</td></tr>
</table></td></tr></table></body></html>`;
}

function temaDo(site) { return cleanTheme(parse(site?.theme, {}) || {}); }

/** Monta assunto, texto e HTML das boas-vindas. settings.emailBoasVindas = { assunto, texto } sobrescreve o padrão. */
export function boasVindas(app, tenant, site, lead, cfg) {
  const d = dadosDaOperacao(app, tenant, site);
  const vars = variaveis(d, lead);
  const descadastro = `mailto:${cfg.respostaPara || cfg.remetente}?subject=Descadastrar`;
  const pers = d.settings.emailBoasVindas && typeof d.settings.emailBoasVindas === 'object' ? d.settings.emailBoasVindas : {};
  const assunto = umaLinha(fillPlaceholders(String(pers.assunto || ''), vars), 150)
    || (d.poker ? `Seu passo a passo para entrar no ${d.clube}` : `Recebemos seu cadastro: ${d.clube}`);
  const ola = lead?.name ? `Olá, ${umaLinha(lead.name, 60)}!` : 'Olá!';
  const cabecalho = [d.clube, d.poker && d.idClube ? `ID ${d.idClube}` : ''].filter(Boolean).join(' · ');
  const rod = rodape(d, descadastro);

  if (pers.texto) {
    const corpo = String(fillPlaceholders(String(pers.texto), vars)).replace(/\r\n/g, '\n').trim().slice(0, 10_000);
    return { assunto, descadastro,
      texto: [corpo, '', '--', ...rod].join('\n'),
      html: htmlDoEmail({ tema: temaDo(d.site), assunto, cabecalho, titulo: assunto, paragrafos: corpo.split(/\n{2,}/), rodapeLinhas: rod }) };
  }
  const intro = d.poker ? `Recebemos seu cadastro no ${d.clube}. Aqui está o passo a passo para entrar:` : `Recebemos seu cadastro em ${d.clube}. Os próximos passos:`;
  const passos = passosPadrao(d);
  const texto = [ola, '', intro, '',
    ...passos.map((p, i) => `${i + 1}. ${p.titulo}: ${p.texto}${p.link ? ` ${p.link.url}` : ''}`), '', '--', ...rod].join('\n');
  return { assunto, descadastro, texto, html: htmlDoEmail({ tema: temaDo(d.site), assunto, cabecalho, titulo: ola, intro, passos, rodapeLinhas: rod }) };
}

/** E-mail avulso do CRM: o texto que a equipe escreveu (com {{variaveis}}) e o mesmo rodapé. */
function avulso(app, tenant, lead, cfg, { assunto, texto }) {
  const site = lead.site_id ? app.db.prepare('SELECT * FROM sites WHERE tenant_id = ? AND id = ?').get(tenant.id, lead.site_id) : null;
  const d = dadosDaOperacao(app, tenant, site);
  const vars = variaveis(d, lead);
  const descadastro = `mailto:${cfg.respostaPara || cfg.remetente}?subject=Descadastrar`;
  const a = umaLinha(fillPlaceholders(assunto, vars), 150);
  const corpo = String(fillPlaceholders(texto, vars)).replace(/\r\n/g, '\n').trim();
  const rod = rodape(d, descadastro);
  return { assunto: a, descadastro, texto: [corpo, '', '--', ...rod].join('\n'),
    html: htmlDoEmail({ tema: temaDo(d.site), assunto: a, cabecalho: d.clube, titulo: a, paragrafos: corpo.split(/\n{2,}/), rodapeLinhas: rod }) };
}

// ---------------------------------------------------------------- envio pela conta da operação

function integracao(repo) {
  return repo.get('integrations', { kind: KIND }) || repo.insert('integrations', { kind: KIND, status: 'pendente', public_config: '{}' });
}

function configDe(row) {
  const c = parse(row?.public_config, {}) || {};
  return { remetente: c.remetente || '', nomeRemetente: c.nomeRemetente || '', host: c.host || HOST_PADRAO, porta: Number(c.porta) || PORTA_PADRAO,
    usuario: c.usuario || c.remetente || '', respostaPara: c.respostaPara || '' };
}

/** Tira a senha (e as formas em base64 que vão no AUTH) de qualquer texto antes de gravar ou devolver. */
function esconder(texto, senha) {
  let s = String(texto ?? '');
  if (senha) for (const v of [senha, b64(senha)]) if (v) s = s.split(v).join('***');
  return s.slice(0, 500);
}

/** Envia pela conta da operação. Nunca lança: devolve { ok, resposta } ou { ok: false, erro, codigo }. */
export async function enviarEmail(app, repo, { para, assunto, texto, html, descadastro }) {
  const row = repo.get('integrations', { kind: KIND });
  const cfg = configDe(row);
  let senha = null;
  try { senha = row?.secret ? app.vault.open(row.secret) : null; } catch { senha = null; }
  if (!senha || !emailValido(cfg.remetente)) return { ok: false, erro: 'E-mail do CRM pendente de configuração: salve o remetente e a senha de app.', codigo: 0 };
  if (!emailValido(para)) return { ok: false, erro: 'Endereço de destino inválido.', codigo: 0 };
  const mensagem = montarMensagem({ de: cfg.remetente, nomeDe: cfg.nomeRemetente, para, respostaPara: cfg.respostaPara, assunto, texto, html, descadastro });
  const envio = { host: cfg.host, porta: cfg.porta, usuario: cfg.usuario, senha, de: cfg.remetente, para, mensagem };
  const transporte = typeof app.emailTransport === 'function' ? app.emailTransport : smtpEnviar;
  try {
    const r = await transporte(envio);
    return { ok: true, resposta: esconder(r?.resposta || 'Aceito pelo servidor.', senha) };
  } catch (e) {
    return { ok: false, erro: esconder(e?.message || e, senha), codigo: Number(e?.codigo) || 0 };
  }
}

const LOGIN_RECUSADO = new Set([530, 534, 535]);

// ---------------------------------------------------------------- boas-vindas automáticas

/** Gancho do servidor depois de gravar o lead: manda o passo a passo uma vez, se o e-mail estiver conectado. */
export async function onLead({ app, tenant, site, repo, lead }) {
  if (!lead?.email || !lead.consent) return;
  const row = repo.get('integrations', { kind: KIND });
  if (!row || row.status !== 'conectado' || !row.secret) return;
  if (repo.get('lead_events', { lead_id: lead.id, kind: 'email_boas_vindas' })) return; // uma vez por lead
  const cfg = configDe(row);
  const msg = boasVindas(app, tenant, site, lead, cfg);
  const ev = repo.insert('lead_events', { lead_id: lead.id, kind: 'email_boas_vindas', data: JSON.stringify({ status: 'enviando', para: lead.email, assunto: msg.assunto }) });
  const r = await enviarEmail(app, repo, { para: lead.email, ...msg });
  repo.update('lead_events', ev.id, { data: JSON.stringify({ status: r.ok ? 'enviado' : 'erro', para: lead.email, assunto: msg.assunto, ...(r.ok ? { resposta: r.resposta } : { erro: r.erro }) }) });
  if (!r.ok && LOGIN_RECUSADO.has(r.codigo)) repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: r.erro });
}

// ---------------------------------------------------------------- rotas do painel

function saida(row, { tenant, app }) {
  const cfg = configDe(row);
  const pers = (parse(tenant.settings, {}) || {}).emailBoasVindas || null;
  const previa = boasVindas(app, tenant, null, { name: 'Fulano' }, { ...cfg, remetente: cfg.remetente || 'contato@exemplo.com' });
  return {
    config: cfg,
    senhaGravada: row.secret ? 'sim' : 'não',
    temSenha: Boolean(row.secret),
    estado: ESTADOS[row.status] ? row.status : 'pendente',
    estadoLabel: ESTADOS[row.status] || ESTADOS.pendente,
    lastCheck: row.last_check || null,
    lastError: row.last_error || null,
    boasVindas: { personalizado: pers ? { assunto: pers.assunto || '', texto: pers.texto || '' } : null, previa: { assunto: previa.assunto, texto: previa.texto } },
    ajuda: 'Gmail: ligue a verificação em 2 etapas e gere uma senha de app em https://myaccount.google.com/apppasswords. Servidor smtp.gmail.com, porta 465.',
  };
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/email', perm: 'integrations.read',
    handler: ({ app, repo, tenant }) => saida(integracao(repo), { app, tenant }),
  },
  {
    method: 'PUT', path: '/api/t/:tenant/email', perm: 'integrations.manage',
    handler: ({ app, db, repo, tenant, body, audit }) => {
      const row = integracao(repo);
      const antes = configDe(row);
      const pega = (k, padrao) => (body?.[k] === undefined ? padrao : body[k]);
      const remetente = umaLinha(pega('remetente', antes.remetente), 120).toLowerCase();
      need(!remetente || emailValido(remetente), 400, 'Remetente inválido: use o e-mail completo da conta (ex.: clube@gmail.com).');
      const nomeRemetente = umaLinha(pega('nomeRemetente', antes.nomeRemetente), 80);
      const host = umaLinha(pega('host', antes.host), 120).toLowerCase() || HOST_PADRAO;
      need(HOST.test(host) || net.isIP(host), 400, 'Servidor SMTP inválido. Para Gmail: smtp.gmail.com.');
      const porta = Number(pega('porta', antes.porta)) || PORTA_PADRAO;
      need(Number.isInteger(porta) && porta > 0 && porta < 65536, 400, 'Porta inválida. Para Gmail: 465 (SSL) ou 587 (STARTTLS).');
      const usuario = umaLinha(pega('usuario', antes.usuario === antes.remetente ? '' : antes.usuario), 120) || remetente;
      const respostaPara = umaLinha(pega('respostaPara', antes.respostaPara), 120).toLowerCase();
      need(!respostaPara || emailValido(respostaPara), 400, 'Responder para: e-mail inválido.');
      const senha = String(body?.senha ?? '').replace(/\s+/g, '');
      need(!senha || (senha.length >= 8 && senha.length <= 200), 400, 'Senha de app inválida: a do Google tem 16 letras.');

      const cfg = { remetente, nomeRemetente, host, porta, usuario, respostaPara };
      const mudouAcesso = Boolean(senha) || ['remetente', 'host', 'porta', 'usuario'].some((k) => cfg[k] !== antes[k]);
      const patch = { public_config: JSON.stringify(cfg) };
      if (senha) patch.secret = app.vault.seal(senha);           // só no cofre: nunca volta para a tela nem para o log
      if (mudouAcesso) Object.assign(patch, { status: 'pendente', last_error: null, last_check: now() });
      const atualizado = repo.update('integrations', row.id, patch);

      if (body?.boasVindas !== undefined) {                       // assunto e texto próprios das boas-vindas (null volta ao padrão)
        const settings = parse(db.prepare('SELECT settings FROM tenants WHERE id = ?').get(tenant.id).settings, {}) || {};
        const bv = body.boasVindas;
        if (bv && (String(bv.assunto || '').trim() || String(bv.texto || '').trim())) {
          settings.emailBoasVindas = { assunto: umaLinha(bv.assunto, 150), texto: String(bv.texto || '').replace(/\r\n/g, '\n').slice(0, 10_000) };
        } else delete settings.emailBoasVindas;
        db.prepare('UPDATE tenants SET settings = ? WHERE id = ?').run(JSON.stringify(settings), tenant.id);
      }
      audit('email.salvar', KIND, { remetente: Boolean(remetente), senha: Boolean(atualizado.secret), host, porta, boasVindas: body?.boasVindas !== undefined });
      const fresco = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id);
      return { ok: true, ...saida(atualizado, { app, tenant: fresco }),
        nota: atualizado.secret && remetente ? 'Configuração salva. Use "Enviar teste" para a conta aparecer como conectada.'
          : 'Falta o remetente ou a senha de app para o e-mail do CRM funcionar.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/email/teste', perm: 'integrations.manage',
    handler: async ({ app, repo, tenant, body, audit }) => {
      const row = integracao(repo);
      const cfg = configDe(row);
      need(row.secret && cfg.remetente, 400, 'E-mail do CRM pendente de configuração: salve o remetente e a senha de app antes de testar.');
      const para = umaLinha(body?.para || cfg.remetente, 120).toLowerCase();
      need(emailValido(para), 400, 'Para: e-mail inválido.');
      const d = dadosDaOperacao(app, tenant);
      const descadastro = `mailto:${cfg.respostaPara || cfg.remetente}?subject=Descadastrar`;
      const assunto = `Teste do e-mail do CRM: ${d.clube}`;
      const corpo = 'Este é um e-mail de teste do portal. Se ele chegou, as boas-vindas dos novos cadastros e os e-mails do CRM vão sair por esta conta.';
      const rod = rodape(d, descadastro);
      const r = await enviarEmail(app, repo, { para, assunto, descadastro, texto: [corpo, '', '--', ...rod].join('\n'),
        html: htmlDoEmail({ tema: temaDo(d.site), assunto, cabecalho: d.clube, titulo: 'E-mail do CRM funcionando', paragrafos: [corpo], rodapeLinhas: rod }) });
      repo.update('integrations', row.id, { status: r.ok ? 'conectado' : 'erro', last_check: now(), last_error: r.ok ? null : r.erro });
      audit('email.teste', KIND, { resultado: r.ok ? 'enviado' : 'erro' });
      return { ok: r.ok, estado: r.ok ? 'conectado' : 'erro', estadoLabel: r.ok ? ESTADOS.conectado : ESTADOS.erro, detalhe: r.ok ? r.resposta : r.erro };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/leads/:id/email', perm: 'leads.edit',
    handler: async ({ app, repo, tenant, params, body, user, audit }) => {
      const lead = repo.get('leads', String(params.id));
      need(lead, 404, 'Lead não encontrado.');
      need(emailValido(lead.email), 400, 'Este lead não tem e-mail válido.');
      need(!repo.get('lead_events', { lead_id: lead.id, kind: 'descadastro' }), 409, 'Este lead pediu para não receber e-mails.');
      const assunto = umaLinha(body?.assunto, 150);
      const texto = String(body?.texto ?? '').trim().slice(0, 10_000);
      need(assunto, 400, 'Escreva o assunto.');
      need(texto, 400, 'Escreva o texto do e-mail.');
      const row = integracao(repo);
      need(row.status === 'conectado' && row.secret, 400, 'Conecte o e-mail do CRM antes: salve a senha de app e use "Enviar teste".');
      const msg = avulso(app, tenant, lead, configDe(row), { assunto, texto });
      const r = await enviarEmail(app, repo, { para: lead.email, ...msg });
      const ev = repo.insert('lead_events', { lead_id: lead.id, kind: 'email_avulso', by_user: user?.id || null,
        data: JSON.stringify({ status: r.ok ? 'enviado' : 'erro', para: lead.email, assunto: msg.assunto, ...(r.ok ? { resposta: r.resposta } : { erro: r.erro }) }) });
      if (!r.ok && LOGIN_RECUSADO.has(r.codigo)) repo.update('integrations', row.id, { status: 'erro', last_check: now(), last_error: r.erro });
      audit('email.avulso', lead.id, { resultado: r.ok ? 'enviado' : 'erro' });
      return { ok: r.ok, estado: r.ok ? 'enviado' : 'erro', detalhe: r.ok ? r.resposta : r.erro, eventoId: ev.id };
    },
  },
];
