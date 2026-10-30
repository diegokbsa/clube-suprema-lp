/**
 * @OnlyCurrentDoc  (o script só acessa esta planilha, nenhuma outra da conta)
 *
 * Planilha "Cadastros · Clube Suprema": recebe uma cópia de cada cadastro do suprema.blog,
 * manda o e-mail de boas-vindas e a sequência de 7 e-mails (1 por dia), anota os passos de cada lead (baixou o app,
 * comprou fichas, chamou o suporte) e guarda na aba "Telegram" os posts que o site já mandou ao canal.
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
  'Chamou o suporte', 'Sequência (e-mails)', 'Saiu da lista'];
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

// Abrir a URL no navegador só confirma que o script está no ar (não mostra dados). Com ?sair=<ID> tira o lead da lista.
function doGet(e) {
  const sair = e && e.parameter && e.parameter.sair;
  if (sair) return paginaSair_(sairDaLista_(String(sair)));
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
    ['Boas-vindas enviado', 'Abriu o link do app', 'Clicou em comprar fichas', 'Chamou o suporte', 'Saiu da lista'].forEach((nome) => {
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

// ---------- E-mails: boas-vindas (dia 0) e sequência de 7 dias ----------
// Visual do site (docs/design-system.md): fundo preto, cartão quase preto com borda dourada discreta, título branco
// em caixa alta peso 900, botão em degradê dourado, capa do post do blog no topo. Cada e-mail leva a um post.

const WEBAPP = 'https://script.google.com/macros/s/AKfycbyRFSDt6RJOU9RIh_MUB9KltHLC81yqyM13_38_iAVaR7vsB_H-OwRu0ENpL75yMUA3bw/exec';
const FONTE = "Montserrat,'Segoe UI',Helvetica,Arial,sans-serif";

const post_ = (slug, campanha) => SITE + '/blog/' + slug + '?utm_source=email&utm_medium=sequencia&utm_campaign=' + campanha;
const capa_ = (slug) => SITE + '/img/blog/' + slug + '/cover.jpg';
const linkApp_ = (id) => SITE + '/baixar' + (/^[\w-]{10,64}$/.test(id || '') ? '?l=' + encodeURIComponent(id) : '');
const linkSair_ = (id) => WEBAPP + '?sair=' + encodeURIComponent(id || 'teste');
const linkSuporte_ = (email) => 'https://wa.me/' + WHATSAPP_SUPORTE + '?text=' + encodeURIComponent('Oi! Me cadastrei no Clube Suprema com o e-mail ' + email + ' e preciso de ajuda.');

const BOAS_VINDAS = {
  assunto: 'Bem-vindo ao Clube Suprema: seus 3 passos para jogar',
  preheader: 'Clube ' + CLUBE + ', agente ' + AGENTE + '. Baixe o app, entre no clube e compre fichas por PIX.',
  capa: SITE + '/img/og-clube-suprema.jpg',
  selo: 'Cadastro confirmado',
  titulo: 'Bem-vindo ao Clube Suprema',
  paragrafos: ['Seu cadastro chegou. Em poucos minutos você está na mesa: são **3 passos**, e o suporte 24h acompanha se travar em algum.'],
  passos: [
    { titulo: 'Baixe o app Suprema Poker', texto: 'É grátis. No celular, o nosso link já abre o convite do clube com o agente.', botao: ['Baixar o app e entrar no clube', '{app}'] },
    { titulo: 'Entre no clube', texto: 'Se o app pedir, use os dois números abaixo.', ids: true },
    { titulo: 'Compre fichas por PIX', texto: 'No Fichas 24h, com o seu ID de jogador (fica no perfil do app), o clube **' + CLUBE + '** e o agente **' + AGENTE + '**. O PIX sai de uma conta no seu CPF.', link: ['Comprar fichas no Fichas 24h', FICHAS] },
  ],
};

// dia = dias corridos depois do cadastro (horário de Brasília). O acionador diário manda um por dia, na ordem.
const SEQUENCIA = [
  {
    dia: 1, assunto: 'Já está dentro do Clube Suprema?',
    preheader: 'Pelo link oficial, o clube e o agente já vêm preenchidos. Veja o passo a passo.',
    capa: capa_('como-entrar-no-clube-suprema'), selo: 'Dia 1 · Entrar no clube', titulo: 'Já está dentro do clube?',
    paragrafos: ['No Suprema Poker toda mesa pertence a um clube. Pelo **link oficial**, no celular, o Clube Suprema e o agente já vêm preenchidos: é só aceitar o convite.',
      'Prefere digitar? No app, use a opção de entrar em um clube com os números abaixo.'],
    ids: true,
    destaque: 'Pedido pendente? Aguarde alguns minutos ou chame o suporte 24h com o seu ID de jogador, que fica no perfil do app.',
    botao: ['Abrir o link do clube', '{app}'], link: ['Ver o passo a passo com imagens', post_('como-entrar-no-clube-suprema', 'dia-1')],
  },
  {
    dia: 2, assunto: 'Fichas por PIX, a qualquer hora',
    preheader: 'Como comprar fichas no Fichas 24h em poucos minutos, direto do seu CPF.',
    capa: capa_('fichas-24-horas-suprema-poker-pix'), selo: 'Dia 2 · Fichas por PIX', titulo: 'Suas fichas por PIX, 24 horas',
    paragrafos: ['No Clube Suprema as fichas são compradas no **Fichas 24h**, por PIX, a qualquer hora do dia.',
      'Na primeira compra, crie a conta em fichas24horas.com.br, cadastre o seu **ID da Suprema** e o clube **' + CLUBE + '**, verifique a conta e gere o QR Code em Comprar Fichas.'],
    destaque: 'O PIX precisa sair de uma conta de pessoa física no seu próprio CPF, sempre pelo QR Code gerado na compra, nunca para a conta de uma pessoa.',
    botao: ['Comprar fichas no Fichas 24h', FICHAS], link: ['Passo a passo com imagens', post_('fichas-24-horas-suprema-poker-pix', 'dia-2')],
  },
  {
    dia: 3, assunto: 'Um tour rápido pelo app',
    preheader: 'Lobby, mesa, saldo e perfil: onde fica cada coisa no Suprema Poker.',
    capa: capa_('guia-do-app-suprema-poker'), selo: 'Dia 3 · Conheça o app', titulo: 'Um tour rápido pelo app',
    paragrafos: ['Cinco minutos de app e você joga com tranquilidade. Onde fica cada coisa:'],
    lista: ['**Lobby do clube:** as mesas de cash, os torneios e o Spin.', '**Mesa:** as ações de aposta ficam na parte de baixo da tela.',
      '**Fichas e saldo:** cada clube tem o seu saldo próprio.', '**Perfil:** o seu ID de jogador, pedido pelo Fichas 24h e pelo suporte.'],
    destaque: 'O mesmo login funciona no celular e no computador com Windows.',
    botao: ['Ver o guia do app', post_('guia-do-app-suprema-poker', 'dia-3')],
  },
  {
    dia: 4, assunto: 'Cash, torneio, Sit & Go ou Spin?',
    preheader: 'Os formatos do Suprema Poker e qual combina com o seu tempo de jogo.',
    capa: capa_('formatos-de-torneio-poker-online'), selo: 'Dia 4 · Escolha a mesa', titulo: 'Qual mesa combina com você?',
    paragrafos: ['Cada formato pede um ritmo diferente:'],
    lista: ['**Cash game:** as fichas têm valor fixo e você entra e sai quando quiser.', '**Torneio:** stack fixo, os blinds sobem e quem fica sem fichas sai.',
      '**Sit & Go:** um torneio que começa assim que a mesa enche.', '**Spin:** Sit & Go relâmpago, com prêmio sorteado por uma roleta.'],
    destaque: 'Começando agora? Escolha limites baixos até pegar o ritmo da mesa e defina antes quanto vai jogar.',
    botao: ['Entender os formatos', post_('formatos-de-torneio-poker-online', 'dia-4')],
  },
  {
    dia: 5, assunto: 'Spin: a roleta que sorteia o prêmio',
    preheader: 'Mesas de 3 ou 6 jogadores, buy-in fixo e multiplicador sorteado antes da primeira mão.',
    // sem capa: a do post mostra o prêmio em reais, que no e-mail soaria como promessa de ganho
    selo: 'Dia 5 · Spin Suprema', titulo: 'Spin: o prêmio sai na roleta',
    paragrafos: ['O **Spin Suprema** é o formato relâmpago do app: mesas de 3 ou 6 jogadores e buy-in fixo.',
      'Antes da primeira mão, uma roleta sorteia o multiplicador do prêmio, que pode chegar a **50.000 vezes o buy-in** nas mesas de 6.'],
    destaque: 'Multiplicadores altos são raros. A tabela de chances fica no próprio app.',
    botao: ['Ver como o Spin funciona', post_('spin-suprema-como-funciona-e-primeiro-grande-ganhador', 'dia-5')],
  },
  {
    dia: 6, assunto: 'Jogue também no computador',
    preheader: 'O mesmo login do celular funciona no Windows. Veja como instalar.',
    capa: capa_('como-baixar-suprema-poker-no-pc'), selo: 'Dia 6 · No computador', titulo: 'A mesa também no PC',
    paragrafos: ['Tela grande e várias mesas à vista: o Suprema Poker tem instalador oficial para **Windows**, e o login é o mesmo do celular.',
      'No computador, a entrada no clube é com o ID: clube **' + CLUBE + '** e agente **' + AGENTE + '**.'],
    destaque: 'No MacBook não há versão oficial: jogue pelo celular.',
    botao: ['Como baixar no PC', post_('como-baixar-suprema-poker-no-pc', 'dia-6')],
  },
  {
    dia: 7, assunto: 'Suporte 24h, saque e o nosso canal',
    preheader: 'Fichas, PIX, saque ou login: o suporte responde a qualquer hora. E os torneios no Telegram.',
    capa: capa_('perguntas-frequentes-suporte'), selo: 'Dia 7 · Sempre por perto', titulo: 'Estamos por perto, 24 horas',
    paragrafos: ['Dúvida sobre fichas, PIX, saque ou login? O **suporte 24h** responde no WhatsApp a qualquer hora.',
      'O saque vai para a chave PIX do seu CPF. Ninguém do clube pede a sua senha nem PIX para a conta de uma pessoa.'],
    destaque: 'No nosso **canal do Telegram** você acompanha os torneios e as novidades do clube.',
    botao: ['Entrar no canal do Telegram', TELEGRAM], link: ['Perguntas frequentes do suporte', post_('perguntas-frequentes-suporte', 'dia-7')],
    fim: 'Este é o último e-mail da série de boas-vindas. Bons jogos!',
  },
];

function boasVindas_(para, id) {
  enviaModelo_(para, id, BOAS_VINDAS, '');
}

// Monta o HTML e o texto simples de um e-mail a partir dos dados (BOAS_VINDAS ou um item de SEQUENCIA).
function enviaModelo_(para, id, m, prefixo) {
  const troca = (url) => (url === '{app}' ? linkApp_(id) : url);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const forte = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b style="color:#ffffff;font-weight:700">$1</b>');
  const limpo = (s) => String(s).replace(/\*\*(.+?)\*\*/g, '$1');
  const fonte = 'font-family:' + FONTE + ';';
  const p = (s) => '<p style="margin:0 0 14px;' + fonte + 'font-size:15px;line-height:1.65;color:#c9c4bc">' + forte(s) + '</p>';
  const botao = (b) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 6px"><tr>'
    + '<td align="center" bgcolor="#efa144" style="border-radius:14px;background-color:#efa144;background-image:linear-gradient(180deg,#f9cf7f 0%,#efa144 52%,#d4852a 100%)">'
    + '<a href="' + esc(troca(b[1])) + '" style="display:block;padding:15px 16px;' + fonte + 'font-size:14px;line-height:1.3;font-weight:800;letter-spacing:.05em;text-transform:uppercase;text-align:center;color:#1c1408;text-decoration:none">'
    + esc(b[0]) + '&nbsp;&rarr;</a></td></tr></table>';
  const link = (b) => '<p style="margin:10px 0 0;' + fonte + 'font-size:14px"><a href="' + esc(troca(b[1])) + '" style="color:#f3b662;text-decoration:underline">' + esc(b[0]) + '</a></p>';
  const caixaId = (rotulo, valor) => '<td width="50%" style="padding:12px 12px;background-color:#0b0905;border:1px solid #3d2c15;border-radius:12px">'
    + '<p style="margin:0;' + fonte + 'font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a857d">' + rotulo + '</p>'
    + '<p style="margin:4px 0 0;' + fonte + 'font-size:20px;font-weight:800;color:#f3b662">' + valor + '</p></td>';
  const ids = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px"><tr>'
    + caixaId('ID do clube', CLUBE) + '<td width="10" style="font-size:0">&nbsp;</td>' + caixaId('ID do agente', AGENTE) + '</tr></table>';
  const destaque = (s) => '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr>'
    + '<td style="padding:14px 16px;background-color:#17110a;border-left:3px solid #efa144;border-radius:10px">'
    + '<p style="margin:0;' + fonte + 'font-size:14px;line-height:1.6;color:#e6dfd4">' + forte(s) + '</p></td></tr></table>';

  let corpo = (m.paragrafos || []).map(p).join('');
  (m.passos || []).forEach((ps, i) => {
    corpo += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr>'
      + '<td width="40" valign="top"><div style="width:30px;height:30px;line-height:30px;border-radius:50%;background-color:#efa144;text-align:center;' + fonte + 'font-size:15px;font-weight:800;color:#1c1408">' + (i + 1) + '</div></td>'
      + '<td valign="top"><p style="margin:4px 0 6px;' + fonte + 'font-size:17px;font-weight:800;color:#ffffff">' + esc(ps.titulo) + '</p>'
      + '<p style="margin:0 0 10px;' + fonte + 'font-size:14px;line-height:1.6;color:#c9c4bc">' + forte(ps.texto) + '</p>'
      + (ps.ids ? ids : '') + (ps.botao ? botao(ps.botao) : '') + (ps.link ? link(ps.link) : '') + '</td></tr></table>';
  });
  if (m.lista) {
    corpo += '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">'
      + m.lista.map((s) => '<tr><td width="20" valign="top" style="padding:3px 0 9px;color:#efa144;font-size:14px">&#9670;</td>'
        + '<td valign="top" style="padding:0 0 9px;' + fonte + 'font-size:15px;line-height:1.6;color:#c9c4bc">' + forte(s) + '</td></tr>').join('') + '</table>';
  }
  if (m.ids) corpo += ids;
  if (m.destaque) corpo += destaque(m.destaque);
  if (m.botao) corpo += botao(m.botao);
  if (m.link) corpo += link(m.link);
  if (m.fim) corpo += '<p style="margin:22px 0 0;' + fonte + 'font-size:14px;color:#c9c4bc">' + forte(m.fim) + '</p>';

  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
    + '<style>@import url(https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;800;900&display=swap);</style></head>'
    + '<body style="margin:0;padding:0;background-color:#000000">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + esc(m.preheader) + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background-color:#000000"><tr><td align="center" style="padding:24px 10px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">'
    // topo: marca
    + '<tr><td style="padding:0 4px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td width="46" valign="middle"><img src="' + SITE + '/img/icon-192.png" width="40" height="40" alt="Clube Suprema" style="display:block;border-radius:10px"></td>'
    + '<td valign="middle"><p style="margin:0;' + fonte + 'font-size:16px;font-weight:800;color:#ffffff">Clube Suprema</p>'
    + '<p style="margin:2px 0 0;' + fonte + 'font-size:12px;letter-spacing:.08em;color:#f3b662">ID ' + CLUBE + ' · Suprema Poker</p></td>'
    + '<td align="right" valign="middle"><a href="' + SITE + '" style="' + fonte + 'font-size:12px;color:#8a857d;text-decoration:none">suprema.blog</a></td>'
    + '</tr></table></td></tr>'
    // cartão
    + '<tr><td style="background-color:#0d0a06;border:1px solid #2e2210;border-radius:20px;padding:22px 18px 22px">'
    + (m.capa ? '<img src="' + m.capa + '" width="510" alt="" style="display:block;width:100%;max-width:510px;height:auto;border:1px solid #3d2c15;border-radius:14px;margin:0 0 22px">' : '')
    + '<p style="margin:0 0 14px"><span style="display:inline-block;padding:5px 12px;border:1px solid #6b4a1f;border-radius:90px;' + fonte + 'font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#f3b662">' + esc(m.selo) + '</span></p>'
    + '<h1 style="margin:0 0 16px;' + fonte + 'font-size:25px;line-height:1.15;font-weight:900;text-transform:uppercase;color:#ffffff">' + esc(m.titulo) + '</h1>'
    + corpo + '</td></tr>'
    // rodapé
    + '<tr><td style="padding:22px 8px 0;text-align:center">'
    + '<p style="margin:0 0 10px;' + fonte + 'font-size:13px;line-height:1.6;color:#c9c4bc">Dúvida? Responda este e-mail ou <a href="' + esc(linkSuporte_(para)) + '" style="color:#f3b662">chame o suporte 24h no WhatsApp</a> · <a href="' + TELEGRAM + '" style="color:#f3b662">Canal no Telegram</a></p>'
    + '<p style="margin:0;' + fonte + 'font-size:12px;line-height:1.7;color:#8a857d">Clube Suprema · ID ' + CLUBE + ' · suprema.blog<br>Somente maiores de 18 anos. Jogue com responsabilidade.<br>'
    + '<a href="' + esc(linkSair_(id)) + '" style="color:#8a857d;text-decoration:underline">Não quer mais receber? Sair da lista</a></p>'
    + '</td></tr></table></td></tr></table></body></html>';

  const linhas = [m.titulo.toUpperCase(), ''];
  (m.paragrafos || []).forEach((s) => linhas.push(limpo(s), ''));
  (m.passos || []).forEach((ps, i) => {
    linhas.push((i + 1) + '. ' + ps.titulo, limpo(ps.texto));
    if (ps.ids) linhas.push('ID do clube: ' + CLUBE + ' · ID do agente: ' + AGENTE);
    if (ps.botao) linhas.push(ps.botao[0] + ': ' + troca(ps.botao[1]));
    if (ps.link) linhas.push(ps.link[0] + ': ' + troca(ps.link[1]));
    linhas.push('');
  });
  (m.lista || []).forEach((s) => linhas.push('- ' + limpo(s)));
  if (m.lista) linhas.push('');
  if (m.ids) linhas.push('ID do clube: ' + CLUBE + ' · ID do agente: ' + AGENTE, '');
  if (m.destaque) linhas.push(limpo(m.destaque), '');
  if (m.botao) linhas.push(m.botao[0] + ': ' + troca(m.botao[1]));
  if (m.link) linhas.push(m.link[0] + ': ' + troca(m.link[1]));
  if (m.fim) linhas.push('', limpo(m.fim));
  linhas.push('', 'Dúvida? Responda este e-mail ou chame o suporte 24h no WhatsApp: ' + linkSuporte_(para), 'Canal no Telegram: ' + TELEGRAM, '',
    'Clube Suprema · ID ' + CLUBE + ' · suprema.blog', 'Somente maiores de 18 anos. Jogue com responsabilidade.', 'Sair da lista: ' + linkSair_(id));

  enviaEmail_(para, prefixo + m.assunto, linhas.join('\n'), html, linkSair_(id));
}

function enviaEmail_(para, assunto, texto, html, sair) {
  const b64 = (s) => Utilities.base64Encode(s, Utilities.Charset.UTF_8).replace(/.{76}/g, '$&\r\n');
  const cab = (s) => '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
  const limite = 'cs' + Utilities.getUuid().replace(/-/g, '');
  const mime = [
    'From: ' + cab(REMETENTE_NOME) + ' <' + REMETENTE + '>',
    'To: ' + para,
    'Reply-To: ' + REMETENTE,
    'Subject: ' + cab(assunto),
    'List-Unsubscribe: <' + sair + '>, <mailto:' + REMETENTE + '?subject=sair>',
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

// Dia no calendário de Brasília (para contar "dias depois do cadastro" sem depender da hora).
function diaBr_(d) {
  const s = Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd').split('-');
  return Date.UTC(Number(s[0]), Number(s[1]) - 1, Number(s[2])) / 86400000;
}

// Acionador diário (Acionadores → enviarSequencia, contador de dias, 18h–19h). Liga com a propriedade SEQUENCIA = sim.
// Só entra quem recebeu as boas-vindas e não saiu da lista; manda no máximo 1 e-mail por pessoa por dia, na ordem.
function enviarSequencia() {
  if (PropertiesService.getScriptProperties().getProperty('SEQUENCIA') !== 'sim') return;
  const aba = aba_();
  const n = aba.getLastRow();
  if (n < 2) return;
  const hoje = diaBr_(new Date());
  const linhas = aba.getRange(2, 1, n - 1, CABECALHO.length).getValues();
  linhas.forEach((r, i) => {
    const boasVindas = r[COL('Boas-vindas enviado') - 1];
    if (!(boasVindas instanceof Date) || r[COL('Saiu da lista') - 1] !== '') return;
    const feitos = Number(r[COL('Sequência (e-mails)') - 1]) || 0;
    const proximo = SEQUENCIA[feitos];
    if (!proximo) return;
    const cadastro = r[0] instanceof Date ? r[0] : boasVindas;
    if (hoje - diaBr_(cadastro) < proximo.dia) return;
    try {
      enviaModelo_(String(r[COL('E-mail') - 1]), String(r[COL('ID do cadastro') - 1]), proximo, '');
      aba.getRange(i + 2, COL('Sequência (e-mails)')).setValue(feitos + 1);
    } catch (err) {
      console.error('sequência, linha ' + (i + 2) + ': ' + err); // tenta de novo amanhã
    }
  });
}

// Link "Sair da lista" do rodapé (e cabeçalho List-Unsubscribe): marca a data e para a sequência.
function sairDaLista_(id) {
  if (!/^[\w-]{10,64}$/.test(id)) return false;
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const aba = aba_();
    const linha = linhaDoId_(aba, id);
    if (!linha) return false;
    const celula = aba.getRange(linha, COL('Saiu da lista'));
    if (celula.getValue() === '') celula.setValue(new Date());
    return true;
  } finally {
    lock.releaseLock();
  }
}

function paginaSair_(ok) {
  const titulo = ok ? 'Pronto, você saiu da lista' : 'Link inválido';
  const texto = ok ? 'Você não vai mais receber os e-mails do Clube Suprema.' : 'Não encontramos esse cadastro.';
  return HtmlService.createHtmlOutput('<div style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 16px;text-align:center">'
    + '<h2>' + titulo + '</h2><p>' + texto + '</p><p><a href="' + SITE + '">Voltar ao suprema.blog</a></p></div>').setTitle('Clube Suprema');
}

// Rode pelo editor (Executar → testeBoasVindas) para receber o e-mail na caixa do REMETENTE e conferir.
function testeBoasVindas() {
  boasVindas_(REMETENTE, '');
}

// Rode pelo editor para receber as boas-vindas e os 7 e-mails da sequência na caixa do REMETENTE, de uma vez.
function testeSequencia() {
  enviaModelo_(REMETENTE, '', BOAS_VINDAS, '[Prévia 0/7] ');
  SEQUENCIA.forEach((m) => enviaModelo_(REMETENTE, '', m, '[Prévia ' + m.dia + '/7] '));
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
