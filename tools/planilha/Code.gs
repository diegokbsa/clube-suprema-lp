/**
 * @OnlyCurrentDoc  (o script só acessa esta planilha, nenhuma outra da conta)
 *
 * Planilha "Cadastros · Clube Suprema": recebe uma cópia de cada cadastro do suprema.blog.
 *
 * Como instalar (uma vez): na planilha, Extensões → Apps Script, colar este arquivo, salvar,
 * Implantar → Nova implantação → App da Web → Executar como: eu · Quem pode acessar: qualquer pessoa.
 * A URL /exec gerada vai em SHEETS_WEBHOOK_URL (config.js do site).
 *
 * Segurança: só grava e-mails válidos, corta textos longos, neutraliza fórmulas (=, +, -, @)
 * e ignora cadastros repetidos pelo ID.
 */
const ABA = 'Cadastros';
const CABECALHO = ['Data/hora', 'E-mail', 'Origem (utm_source)', 'Mídia (utm_medium)', 'Campanha (utm_campaign)',
  'Termo (utm_term)', 'Conteúdo (utm_content)', 'gclid', 'fbclid', 'Indicação (ref)', 'Página de entrada', 'ID do cadastro'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const email = String(d.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) return saida_({ ok: false, erro: 'email' });
    const aba = aba_();
    const id = limpa_(d.id);
    if (id && jaExiste_(aba, id)) return saida_({ ok: true, repetido: true });
    const quando = d.createdAt ? new Date(d.createdAt) : new Date();
    aba.appendRow([
      isNaN(quando) ? new Date() : quando,
      limpa_(email),
      limpa_(d.utm_source), limpa_(d.utm_medium), limpa_(d.utm_campaign), limpa_(d.utm_term), limpa_(d.utm_content),
      limpa_(d.gclid), limpa_(d.fbclid), limpa_(d.ref), limpa_(d.landing), id,
    ]);
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

function aba_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.getSheets().length === 1 && ss.getSheets()[0].getLastRow() === 0 ? ss.getSheets()[0].setName(ABA) : ss.insertSheet(ABA);
  }
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold').setBackground('#000000').setFontColor('#ffa51f');
    aba.setFrozenRows(1);
    aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
    aba.setColumnWidth(1, 150);
    aba.setColumnWidth(2, 260);
  }
  return aba;
}

function jaExiste_(aba, id) {
  const n = aba.getLastRow();
  if (n < 2) return false;
  return aba.getRange(2, CABECALHO.length, n - 1, 1).getValues().some((r) => r[0] === id);
}

function limpa_(v) {
  let s = String(v == null ? '' : v).slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Rode uma vez pelo editor (Executar → configurar) para criar o cabeçalho antes do primeiro cadastro.
function configurar() {
  aba_();
}
