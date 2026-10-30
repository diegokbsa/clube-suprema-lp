/**
 * @OnlyCurrentDoc  (o script só acessa esta planilha, nenhuma outra da conta)
 *
 * Planilha "Cadastros · Clube Suprema": recebe uma cópia de cada cadastro do suprema.blog,
 * manda o e-mail de boas-vindas, anota os passos de cada lead (baixou o app, comprou fichas, chamou o suporte)
 * e guarda na aba "Telegram" os posts que o site já mandou ao canal.
 *
 * Como instalar (uma vez): na planilha, Extensões → Apps Script, colar este arquivo e o appsscript.json
 * (Configurações do projeto → "Mostrar o arquivo de manifesto"), salvar,
 * Implantar → Nova implantação → App da Web → Executar como: eu · Quem pode acessar: qualquer pessoa.
 * A URL /exec gerada vai em SHEETS_WEBHOOK_URL (config.js do site). Ao atualizar o código:
 * Implantar → Gerenciar implantações → editar → Nova versão (a URL continua a mesma).
 *
 * E-mail: sai pela API do Gmail só com permissão de envio (gmail.send, ver appsscript.json).
 * O remetente é REMETENTE quando ele está em Gmail → Configurações → Contas → "Enviar e-mail como";
 * sem isso o Gmail troca pelo endereço do dono do script. As respostas vão para REMETENTE nos dois casos.
 *
 * Segurança: só grava e-mails válidos, corta textos longos, neutraliza fórmulas (=, +, -, @)
 * e ignora cadastros repetidos pelo ID.
 */
const ABA = 'Cadastros';
const CABECALHO = ['Data/hora', 'E-mail', 'Origem (utm_source)', 'Mídia (utm_medium)', 'Campanha (utm_campaign)',
  'Termo (utm_term)', 'Conteúdo (utm_content)', 'gclid', 'fbclid', 'Indicação (ref)', 'Página de entrada', 'ID do cadastro',
  'Veio de (site)', 'WhatsApp', 'Boas-vindas enviado', 'Abriu o link do app', 'Aparelho', 'Clicou em comprar fichas',
  'Chamou o suporte'];
const COL = (nome) => CABECALHO.indexOf(nome) + 1;

const SITE = 'https://suprema.blog';
const CLUBE = '10001';
const AGENTE = '1439098';
const WHATSAPP_SUPORTE = '5511952138293';
const FICHAS = 'https://fichas24horas.com.br/auto-atendimento';
const TELEGRAM = 'https://t.me/supremapokerxx';
const REMETENTE = 'supremaclubxx@gmail.com';
const REMETENTE_NOME = 'Clube Suprema';
// Liga/desliga sem nova implantação: Configurações do projeto → Propriedades do script → BOAS_VINDAS = sim.
// Fica desligado até REMETENTE estar confirmado em "Enviar e-mail como" (senão sai com o e-mail do dono do script).
const boasVindasAtivo_ = () => PropertiesService.getScriptProperties().getProperty('BOAS_VINDAS') === 'sim';

// Passos que o site manda (lib/leads.js): cada um vira a data na coluna, só na 1ª vez.
const EVENTOS = { invite_click: 'Abriu o link do app', buy_chips_click: 'Clicou em comprar fichas', whatsapp_click: 'Chamou o suporte' };
const APARELHOS = { app_android: 'Android', app_ios: 'iPhone', app_desktop: 'Computador' };

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.tipo === 'evento') return saida_(anotaEvento_(d));
    if (d.tipo === 'telegram') return saida_(marcaPostTelegram_(d));
    const email = String(d.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) return saida_({ ok: false, erro: 'email' });
    const aba = aba_();
    const id = limpa_(d.id);
    if (id && linhaDoId_(aba, id)) return saida_({ ok: true, repetido: true });
    const quando = d.createdAt ? new Date(d.createdAt) : new Date();
    const whats = String(d.whatsapp || '').replace(/\D/g, '');
    aba.appendRow([
      isNaN(quando) ? new Date() : quando,
      limpa_(email),
      limpa_(d.utm_source), limpa_(d.utm_medium), limpa_(d.utm_campaign), limpa_(d.utm_term), limpa_(d.utm_content),
      limpa_(d.gclid), limpa_(d.fbclid), limpa_(d.ref), limpa_(d.landing), id,
      limpa_(d.referrer), /^\d{10,11}$/.test(whats) ? 'https://wa.me/55' + whats : '',
    ]);
    const linha = aba.getLastRow();
    if (boasVindasAtivo_()) {
      try {
        boasVindas_(email, id);
        aba.getRange(linha, COL('Boas-vindas enviado')).setValue(new Date());
      } catch (err) {
        aba.getRange(linha, COL('Boas-vindas enviado')).setValue('erro: ' + String(err).slice(0, 120));
      }
    }
    return saida_({ ok: true });
  } catch (err) {
    return saida_({ ok: false, erro: String(err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

// Abrir a URL no navegador só confirma que o script está no ar (não mostra dados).
function doGet() {
  return saida_({ ok: true, servico: 'cadastros-clube-suprema' });
}

function anotaEvento_(d) {
  const id = String(d.id || '');
  const evento = String(d.evento || '');
  if (!/^[\w-]{10,64}$/.test(id) || !(EVENTOS[evento] || APARELHOS[evento])) return { ok: false, erro: 'evento' };
  const aba = aba_();
  const linha = linhaDoId_(aba, id);
  if (!linha) return { ok: true, semCadastro: true };
  const celula = aba.getRange(linha, COL(EVENTOS[evento] || 'Aparelho'));
  if (celula.getValue() === '') {
    const quando = d.quando ? new Date(d.quando) : new Date();
    celula.setValue(APARELHOS[evento] || (isNaN(quando) ? new Date() : quando));
  }
  return { ok: true };
}

// Posts já mandados ao canal do Telegram pelo site (lib/novos-posts.js): novo = true só na 1ª vez de cada post.
function marcaPostTelegram_(d) {
  const slug = String(d.slug || '');
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return { ok: false, erro: 'slug' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName('Telegram');
  if (!aba) {
    aba = ss.insertSheet('Telegram');
    aba.appendRow(['Data/hora', 'Post enviado ao canal']);
    aba.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#000000').setFontColor('#ffa51f');
    aba.setFrozenRows(1);
  }
  const n = aba.getLastRow();
  const ja = n > 1 && aba.getRange(2, 2, n - 1, 1).getValues().some((r) => r[0] === slug);
  if (!ja) aba.appendRow([new Date(), slug]);
  return { ok: true, novo: !ja };
}

function aba_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(ABA) : ss.insertSheet(ABA);
  }
  let mudou = false;
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
    aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
    aba.setColumnWidth(1, 150);
    aba.setColumnWidth(2, 260);
    mudou = true;
  }
  // Planilhas criadas antes das colunas novas ganham o resto do cabeçalho.
  if (aba.getLastColumn() < CABECALHO.length) {
    aba.getRange(1, 1, 1, CABECALHO.length).setValues([CABECALHO]);
    mudou = true;
  }
  if (mudou) {
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold').setBackground('#000000').setFontColor('#ffa51f');
    ['Boas-vindas enviado', 'Abriu o link do app', 'Clicou em comprar fichas', 'Chamou o suporte'].forEach((nome) => {
      aba.getRange(2, COL(nome), aba.getMaxRows() - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    });
  }
  return aba;
}

function linhaDoId_(aba, id) {
  const n = aba.getLastRow();
  if (n < 2) return 0;
  const ids = aba.getRange(2, COL('ID do cadastro'), n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return 0;
}

function limpa_(v) {
  let s = String(v == null ? '' : v).slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- E-mail de boas-vindas ----------

function boasVindas_(para, id) {
  const app = SITE + '/baixar' + (/^[\w-]{10,64}$/.test(id || '') ? '?l=' + encodeURIComponent(id) : '');
  const guia = SITE + '/blog/como-entrar-no-clube-suprema?utm_source=email&utm_medium=boas-vindas';
  const wa = 'https://wa.me/' + WHATSAPP_SUPORTE + '?text=' + encodeURIComponent('Oi! Me cadastrei no Clube Suprema com o e-mail ' + para + ' e preciso de ajuda.');
  const assunto = 'Seu acesso ao Clube Suprema: clube ' + CLUBE + ', agente ' + AGENTE;

  const texto = [
    'Olá! Recebemos seu cadastro no Clube Suprema. Faltam 3 passos para jogar:',
    '',
    '1. Baixe o app Suprema Poker (grátis)',
    app,
    'No celular, o link já abre o convite do clube com o nosso agente.',
    '',
    '2. Entre no clube',
    'Se o app pedir, use o ID do clube ' + CLUBE + ' e o ID do agente ' + AGENTE + '.',
    '',
    '3. Compre fichas por PIX no Fichas 24h',
    'Informe o seu ID de jogador (fica no seu perfil no app), o clube ' + CLUBE + ' e o agente ' + AGENTE + ':',
    FICHAS,
    '',
    'Travou em algum passo? Responda este e-mail ou chame o suporte 24h no WhatsApp:',
    wa,
    '',
    'Passo a passo com imagens: ' + guia,
    'Torneios e novidades no Telegram: ' + TELEGRAM,
    '',
    'Bons jogos!',
    'Clube Suprema · suprema.blog',
    '',
    'Somente maiores de 18 anos. Jogue com responsabilidade.',
    'Não quer mais receber e-mails? Responda com "sair".',
  ].join('\n');

  const botao = (href, rotulo) => '<a href="' + href + '" style="display:inline-block;background:#efa144;color:#000;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:8px">' + rotulo + '</a>';
  const passo = (n, titulo, corpo) => '<tr><td style="padding:0 0 22px"><p style="margin:0 0 6px;font-size:17px;font-weight:bold">' + n + '. ' + titulo + '</p>' + corpo + '</td></tr>';
  const html = '<div style="background:#f4f4f4;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#111">'
    + '<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px">'
    + '<tr><td style="padding:0 0 18px"><p style="margin:0;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a86a1c;font-weight:bold">Clube Suprema</p>'
    + '<h1 style="margin:6px 0 0;font-size:22px">Faltam 3 passos para jogar</h1></td></tr>'
    + passo(1, 'Baixe o app Suprema Poker (grátis)', '<p style="margin:0 0 12px;color:#444">No celular, o link já abre o convite do clube com o nosso agente.</p>' + botao(app, 'Baixar o app e entrar no clube'))
    + passo(2, 'Entre no clube', '<p style="margin:0;color:#444">Se o app pedir, use o clube <b>' + CLUBE + '</b> e o agente <b>' + AGENTE + '</b>.</p>')
    + passo(3, 'Compre fichas por PIX', '<p style="margin:0 0 12px;color:#444">No Fichas 24h, informe o seu ID de jogador (fica no seu perfil no app), o clube <b>' + CLUBE + '</b> e o agente <b>' + AGENTE + '</b>.</p>' + botao(FICHAS, 'Comprar fichas no Fichas 24h'))
    + '<tr><td style="padding:4px 0 0;border-top:1px solid #eee"><p style="margin:16px 0 8px;color:#444">Travou em algum passo? Responda este e-mail ou <a href="' + wa + '" style="color:#a86a1c">chame o suporte 24h no WhatsApp</a>.</p>'
    + '<p style="margin:0 0 8px;color:#444"><a href="' + guia + '" style="color:#a86a1c">Passo a passo com imagens</a> · <a href="' + TELEGRAM + '" style="color:#a86a1c">Torneios no Telegram</a></p>'
    + '<p style="margin:18px 0 0;font-size:12px;color:#888">Somente maiores de 18 anos. Jogue com responsabilidade.<br>Não quer mais receber e-mails? Responda com "sair".</p></td></tr>'
    + '</table></div>';

  enviaEmail_(para, assunto, texto, html);
}

function enviaEmail_(para, assunto, texto, html) {
  const b64 = (s) => Utilities.base64Encode(s, Utilities.Charset.UTF_8).replace(/.{76}/g, '$&\r\n');
  const cab = (s) => '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
  const limite = 'cs' + Utilities.getUuid().replace(/-/g, '');
  const mime = [
    'From: ' + cab(REMETENTE_NOME) + ' <' + REMETENTE + '>',
    'To: ' + para,
    'Reply-To: ' + REMETENTE,
    'Subject: ' + cab(assunto),
    'List-Unsubscribe: <mailto:' + REMETENTE + '?subject=sair>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + limite + '"',
    '',
    '--' + limite,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(texto),
    '--' + limite,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    '--' + limite + '--',
  ].join('\r\n');
  Gmail.Users.Messages.send({ raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8) }, 'me');
}

// Rode pelo editor (Executar → testeBoasVindas) para receber o e-mail na caixa do REMETENTE e conferir.
function testeBoasVindas() {
  boasVindas_(REMETENTE, '');
}

// Rode pelo editor depois de ligar BOAS_VINDAS: manda para quem se cadastrou nos últimos 3 dias e ainda não recebeu.
function enviarPendentes() {
  if (!boasVindasAtivo_()) throw new Error('Ligue antes a propriedade BOAS_VINDAS = sim.');
  const aba = aba_();
  const n = aba.getLastRow();
  if (n < 2) return;
  const desde = Date.now() - 3 * 86400000;
  const linhas = aba.getRange(2, 1, n - 1, CABECALHO.length).getValues();
  linhas.forEach((r, i) => {
    const quando = r[0] instanceof Date ? r[0].getTime() : 0;
    if (quando < desde || r[COL('Boas-vindas enviado') - 1] !== '') return;
    const celula = aba.getRange(i + 2, COL('Boas-vindas enviado'));
    try {
      boasVindas_(String(r[COL('E-mail') - 1]), String(r[COL('ID do cadastro') - 1]));
      celula.setValue(new Date());
    } catch (err) {
      celula.setValue('erro: ' + String(err).slice(0, 120));
    }
  });
}

// Rode uma vez pelo editor (Executar → configurar) para criar ou completar o cabeçalho.
function configurar() {
  aba_();
}
