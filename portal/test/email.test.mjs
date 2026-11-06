// E-mail do CRM: cliente SMTP próprio contra um servidor SMTP falso local (nunca a internet), integração com a senha
// de app no cofre (nunca volta para a tela), teste de conexão, boas-vindas uma vez por lead, texto próprio das
// boas-vindas, e-mail avulso do CRM, permissões e senha fora de respostas, histórico do lead e auditoria.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startPortal, client } from './helpers.mjs';
import { scoped } from '../lib/repo.mjs';
import { smtpEnviar, montarMensagem, palavraCodificada, onLead } from '../lib/modules/email.mjs';

const SENHA = 'abcd efgh ijkl mnop';
const SENHA_LIMPA = SENHA.replace(/\s+/g, '');
const SLUG = 'clube-10070';

// ---------------------------------------------------------------- servidor SMTP falso (só registra a conversa)

function smtpFalso() {
  const estado = { conversas: [], falharLogin: false, soLogin: false };
  const srv = net.createServer((sock) => {
    const c = { linhas: [], dados: null };
    estado.conversas.push(c);
    let buf = '';
    let emDados = false;
    let loginPasso = 0;
    sock.write('220 falso.local ESMTP pronto\r\n');
    sock.on('error', () => {});
    sock.on('data', (ch) => {
      buf += ch.toString('utf8');
      for (;;) {
        if (emDados) {
          const fim = buf.indexOf('\r\n.\r\n');
          if (fim < 0) break;
          c.dados = buf.slice(0, fim);
          buf = buf.slice(fim + 5);
          emDados = false;
          sock.write('250 2.0.0 OK enfileirada\r\n');
          continue;
        }
        const i = buf.indexOf('\r\n');
        if (i < 0) break;
        const l = buf.slice(0, i);
        buf = buf.slice(i + 2);
        c.linhas.push(l);
        const up = l.toUpperCase();
        if (loginPasso === 1) { loginPasso = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (loginPasso === 2) { loginPasso = 0; sock.write(estado.falharLogin ? '535 5.7.8 Username and Password not accepted\r\n' : '235 2.7.0 Accepted\r\n'); continue; }
        if (up.startsWith('EHLO')) sock.write(`250-falso.local oi\r\n250-SIZE 35882577\r\n250-AUTH ${estado.soLogin ? 'LOGIN' : 'LOGIN PLAIN'}\r\n250 8BITMIME\r\n`);
        else if (up.startsWith('AUTH PLAIN')) sock.write(estado.falharLogin ? '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 Saiba mais\r\n' : '235 2.7.0 Accepted\r\n');
        else if (up === 'AUTH LOGIN') { loginPasso = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
        else if (up.startsWith('MAIL FROM')) sock.write('250 2.1.0 OK\r\n');
        else if (up.startsWith('RCPT TO')) sock.write('250 2.1.5 OK\r\n');
        else if (up === 'DATA') { emDados = true; sock.write('354 Pode mandar\r\n'); }
        else if (up === 'QUIT') sock.end('221 2.0.0 Tchau\r\n');
        else sock.write('502 5.5.1 Comando desconhecido\r\n');
      }
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ ...estado, estado, porta: srv.address().port, fechar: () => new Promise((f) => srv.close(f)) })));
}

/** Lê a mensagem MIME gravada pelo servidor falso: assunto decodificado, texto e HTML. */
function lerMensagem(dados) {
  const [cab] = dados.split('\r\n\r\n');
  const desdobrado = cab.replace(/\r\n /g, ' ');
  const header = (k) => (new RegExp(`^${k}: (.*)$`, 'mi').exec(desdobrado) || [])[1] || '';
  const decod = (v) => v.replace(/\?=\s+=\?/g, '?==?').replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8')).trim();
  const fronteira = /boundary="([^"]+)"/.exec(cab)[1];
  const partes = dados.split(`--${fronteira}`).slice(1, -1).map((p) => {
    const [h, ...corpo] = p.replace(/^\r\n/, '').split('\r\n\r\n');
    return { tipo: /Content-Type: ([^;]+)/.exec(h)[1], corpo: Buffer.from(corpo.join('').replace(/\s+/g, ''), 'base64').toString('utf8') };
  });
  return { assunto: decod(header('Subject')), de: decod(header('From')), para: header('To'), listaDescadastro: header('List-Unsubscribe'),
    texto: partes.find((p) => p.tipo === 'text/plain')?.corpo || '', html: partes.find((p) => p.tipo === 'text/html')?.corpo || '' };
}

const esperar = async (cond, ms = 3000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { const v = cond(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); }
  return cond();
};

let P;
let sup;
let mkt;
let S;
let site;
let tenant;
const respostas = [];

const guardar = (r) => { respostas.push(JSON.stringify(r.data)); return r; };
const eventosDe = (leadId, kind) => P.db.prepare('SELECT * FROM lead_events WHERE lead_id = ? AND kind = ? ORDER BY created_at ASC').all(leadId, kind);
const novoLead = async (email, name) => {
  const r = await fetch(`${P.url}/f/${site.id}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, name, consent: '1', page: '' }).toString() });
  assert.equal(r.status, 201, await r.text());
  return P.db.prepare('SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC').get(email);
};

before(async () => {
  S = await smtpFalso();
  P = await startPortal();
  sup = client(P.url);
  await sup.login('super@teste.local', 'senha-forte-123');
  const r = await sup.req('POST', '/api/tenants', { name: 'Clube Hot', number: '10070', niche: 'poker', template: 'clube-poker-premium',
    settings: { app: 'Suprema Poker', agentId: '777123', whatsapp: '5511999990000', chipsUrl: 'https://fichas.exemplo.com/entrar' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  tenant = P.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(SLUG);
  site = (await sup.req('GET', `/api/t/${SLUG}/sites`)).data.sites[0];
  await sup.req('POST', `/api/t/${SLUG}/users`, { email: 'mkt@email.test', name: 'Marketing', role: 'marketing', password: 'marketing-senha-123' });
  mkt = client(P.url);
  await mkt.login('mkt@email.test', 'marketing-senha-123');
});
after(async () => { await P.close(); await S.fechar(); });

test('a integração aparece na lista com o grupo crm e começa pendente', async () => {
  const r = await sup.req('GET', `/api/t/${SLUG}/integrations`);
  const i = r.data.integrations.find((x) => x.kind === 'email_smtp');
  assert.ok(i, 'email_smtp está em INTEGRATIONS');
  assert.equal(i.label, 'E-mail do CRM (Gmail / SMTP)');
  assert.equal(i.group, 'crm');
  assert.equal(i.status, 'pendente');
  const g = guardar(await sup.req('GET', `/api/t/${SLUG}/email`));
  assert.equal(g.data.senhaGravada, 'não');
  assert.equal(g.data.config.host, 'smtp.gmail.com');
  assert.equal(g.data.config.porta, 465);
});

test('cliente SMTP: AUTH LOGIN, assunto em UTF-8, multipart texto + HTML e ponto no começo da linha', async () => {
  S.estado.soLogin = true;
  const antes = S.conversas.length;
  const mensagem = montarMensagem({ de: 'clube@exemplo.com', nomeDe: 'Clube Hót', para: 'jogador@exemplo.com', assunto: 'Ação: passo a passo do clube — teste longo com acentuação',
    texto: 'linha 1\n.linha com ponto\nfim', html: '<p>olá</p>', descadastro: 'mailto:clube@exemplo.com?subject=Descadastrar' });
  const r = await smtpEnviar({ host: '127.0.0.1', porta: S.porta, usuario: 'clube@exemplo.com', senha: SENHA_LIMPA, de: 'clube@exemplo.com', para: 'jogador@exemplo.com', mensagem, timeoutMs: 3000 });
  S.estado.soLogin = false;
  assert.equal(r.ok, true);
  assert.match(r.resposta, /250 2\.0\.0/);
  const c = S.conversas[antes];
  assert.match(c.linhas[0], /^EHLO /);
  assert.equal(c.linhas[1], 'AUTH LOGIN');
  assert.equal(Buffer.from(c.linhas[2], 'base64').toString(), 'clube@exemplo.com');
  assert.ok(c.linhas.includes('MAIL FROM:<clube@exemplo.com>'));
  assert.ok(c.linhas.includes('RCPT TO:<jogador@exemplo.com>'));
  assert.equal(c.linhas.at(-1), 'QUIT');
  const m = lerMensagem(c.dados);
  assert.equal(m.assunto, 'Ação: passo a passo do clube — teste longo com acentuação');
  assert.equal(m.de, 'Clube Hót <clube@exemplo.com>');
  assert.equal(m.texto, 'linha 1\r\n.linha com ponto\r\nfim'.replace(/\r\n/g, '\n'));
  assert.equal(m.html, '<p>olá</p>');
  assert.equal(m.listaDescadastro, '<mailto:clube@exemplo.com?subject=Descadastrar>');
  assert.ok(!/[\r\n]/.test(palavraCodificada('a\r\nBcc: x@y.com').replace(/\r\n /g, '')), 'cabeçalho não aceita quebra de linha');
});

test('cliente SMTP: erro claro com a resposta do servidor e prazo de resposta', async () => {
  S.estado.falharLogin = true;
  await assert.rejects(smtpEnviar({ host: '127.0.0.1', porta: S.porta, usuario: 'u@exemplo.com', senha: SENHA_LIMPA, de: 'u@exemplo.com', para: 'x@exemplo.com', mensagem: 'x', timeoutMs: 3000 }),
    (e) => { assert.match(e.message, /535/); assert.match(e.message, /senha de app/); assert.ok(!e.message.includes(SENHA_LIMPA)); return true; });
  S.estado.falharLogin = false;

  const mudo = net.createServer((s) => { s.on('error', () => {}); });            // aceita e nunca responde
  await new Promise((r) => mudo.listen(0, '127.0.0.1', r));
  await assert.rejects(smtpEnviar({ host: '127.0.0.1', porta: mudo.address().port, usuario: '', senha: '', de: 'u@exemplo.com', para: 'x@exemplo.com', mensagem: 'x', timeoutMs: 300 }),
    /não respondeu/);
  mudo.close();
});

test('salvar a configuração: senha só no cofre, nunca na resposta; marketing lê mas não grava', async () => {
  let r = guardar(await sup.req('PUT', `/api/t/${SLUG}/email`, { remetente: 'nao-e-email', senha: SENHA }));
  assert.equal(r.status, 400);
  r = guardar(await sup.req('PUT', `/api/t/${SLUG}/email`, { remetente: 'hotpokerclub@exemplo.com', nomeRemetente: 'Clube Hot', host: '127.0.0.1', porta: S.porta, senha: SENHA }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.senhaGravada, 'sim');
  assert.equal(r.data.estado, 'pendente', 'salvar não conecta; só o teste');
  assert.equal(r.data.config.usuario, 'hotpokerclub@exemplo.com', 'usuário padrão = remetente');
  const row = scoped(P.db, tenant.id).get('integrations', { kind: 'email_smtp' });
  assert.ok(row.secret && !row.secret.includes(SENHA_LIMPA), 'senha selada no cofre');
  assert.equal(P.app.vault.open(row.secret), SENHA_LIMPA, 'espaços da senha de app do Google são tirados');

  const lido = guardar(await mkt.req('GET', `/api/t/${SLUG}/email`));
  assert.equal(lido.status, 200);
  assert.equal(lido.data.senhaGravada, 'sim');
  const negado = guardar(await mkt.req('PUT', `/api/t/${SLUG}/email`, { remetente: 'outro@exemplo.com' }));
  assert.equal(negado.status, 403);
  const testeNegado = guardar(await mkt.req('POST', `/api/t/${SLUG}/email/teste`, {}));
  assert.equal(testeNegado.status, 403);
});

test('e-mail de teste: erro do servidor marca "erro" com a mensagem (sem a senha); sucesso marca "conectado"', async () => {
  S.estado.falharLogin = true;
  let r = guardar(await sup.req('POST', `/api/t/${SLUG}/email/teste`, { para: 'dono@exemplo.com' }));
  S.estado.falharLogin = false;
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, false);
  assert.equal(r.data.estado, 'erro');
  assert.match(r.data.detalhe, /535/);
  let row = scoped(P.db, tenant.id).get('integrations', { kind: 'email_smtp' });
  assert.equal(row.status, 'erro');
  assert.match(row.last_error, /Username and Password not accepted/);

  const antes = S.conversas.length;
  r = guardar(await sup.req('POST', `/api/t/${SLUG}/email/teste`, { para: 'dono@exemplo.com' }));
  assert.equal(r.data.ok, true, JSON.stringify(r.data));
  assert.equal(r.data.estado, 'conectado');
  row = scoped(P.db, tenant.id).get('integrations', { kind: 'email_smtp' });
  assert.equal(row.status, 'conectado');
  assert.equal(row.last_error, null);
  const c = S.conversas[antes];
  assert.match(c.linhas.find((l) => l.startsWith('AUTH PLAIN')), /^AUTH PLAIN /, 'servidor com PLAIN usa PLAIN');
  const m = lerMensagem(c.dados);
  assert.equal(m.para, '<dono@exemplo.com>');
  assert.match(m.assunto, /Teste do e-mail do CRM: Clube Hot/);
});

test('boas-vindas: o passo a passo sai uma vez por lead, das configurações da operação', async () => {
  const antes = S.conversas.length;
  const lead = await novoLead('jogador1@exemplo.com', 'Ana');
  const ev = await esperar(() => eventosDe(lead.id, 'email_boas_vindas').find((e) => JSON.parse(e.data).status !== 'enviando'));
  assert.ok(ev, 'evento de boas-vindas registrado');
  assert.equal(JSON.parse(ev.data).status, 'enviado', ev.data);
  assert.equal(S.conversas.length, antes + 1);
  const m = lerMensagem(S.conversas[antes].dados);
  assert.equal(m.para, '<jogador1@exemplo.com>');
  assert.equal(m.assunto, 'Seu passo a passo para entrar no Clube Hot');
  for (const t of [m.texto, m.html]) {
    assert.match(t, /Ana/);
    assert.match(t, /Suprema Poker/);
    assert.match(t, /10070/, 'ID do clube');
    assert.match(t, /777123/, 'ID do agente');
    assert.match(t, /chame o suporte no WhatsApp/i, 'sem link de convite: manda chamar o suporte');
    assert.match(t, /https:\/\/wa\.me\/5511999990000\?text=Oi!%20Venho%20do%20clube%2010070%2C%20agente%20777123/, 'WhatsApp com a mensagem padrão');
    assert.match(t, /https:\/\/fichas\.exemplo\.com\/entrar/, 'canal de fichas');
    assert.match(t, /maiores de 18 anos/);
    assert.match(t, /Jogue com responsabilidade/);
    assert.match(t, /mailto:hotpokerclub@exemplo\.com\?subject=Descadastrar/);
    assert.match(t, /\/s\/clube-10070\//, 'link do site');
    assert.doesNotMatch(t, /b[ôo]nus|gr[áa]tis|ganh[eo]|garantid/i, 'nada de promessa de ganho, bônus ou fichas grátis');
  }
  const theme = JSON.parse(P.db.prepare('SELECT theme FROM sites WHERE id = ?').get(site.id).theme);
  assert.ok(m.html.includes(theme.primary) && m.html.includes(theme.bg), 'HTML na cor do tema do site');
  assert.match(m.html, /<table role="presentation"/);

  // o gancho rodar de novo para o mesmo lead não manda outro e-mail
  const repo = scoped(P.db, tenant.id);
  await onLead({ app: P.app, db: P.db, tenant, site: repo.get('sites', site.id), repo, lead });
  assert.equal(S.conversas.length, antes + 1, 'não reenviou');
  assert.equal(eventosDe(lead.id, 'email_boas_vindas').length, 1);
});

test('boas-vindas com assunto e texto próprios (settings.emailBoasVindas com {{variaveis}}) e link de convite', async () => {
  P.db.prepare('UPDATE tenants SET settings = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(tenant.settings), inviteLink: 'https://convite.exemplo.com/c/10070' }), tenant.id);
  const r = guardar(await sup.req('PUT', `/api/t/${SLUG}/email`, { boasVindas: { assunto: 'Bem-vinda, {{nome}}', texto: 'Clube {{idClube}}, agente {{agente}}.\n\nConvite: {{linkConvite}}' } }));
  assert.equal(r.status, 200);
  assert.equal(r.data.estado, 'conectado', 'mudar só o texto não desconecta');
  assert.equal(r.data.boasVindas.personalizado.assunto, 'Bem-vinda, {{nome}}');
  const antes = S.conversas.length;
  const lead = await novoLead('jogadora2@exemplo.com', 'Bia');
  await esperar(() => eventosDe(lead.id, 'email_boas_vindas').find((e) => JSON.parse(e.data).status === 'enviado'));
  const m = lerMensagem(S.conversas[antes].dados);
  assert.equal(m.assunto, 'Bem-vinda, Bia');
  assert.match(m.texto, /Clube 10070, agente 777123\./);
  assert.match(m.texto, /Convite: https:\/\/convite\.exemplo\.com\/c\/10070/);
  assert.match(m.texto, /maiores de 18 anos/, 'rodapé +18 continua');
  assert.match(m.texto, /Descadastrar/);
  await sup.req('PUT', `/api/t/${SLUG}/email`, { boasVindas: null });
  assert.equal(JSON.parse(P.db.prepare('SELECT settings FROM tenants WHERE id = ?').get(tenant.id).settings).emailBoasVindas, undefined, 'null volta ao padrão');
});

test('CRM: e-mail avulso para um lead, registrado no histórico; transporte injetável', async () => {
  const lead = P.db.prepare('SELECT * FROM leads WHERE email = ?').get('jogador1@exemplo.com');
  let r = guardar(await mkt.req('POST', `/api/t/${SLUG}/leads/${lead.id}/email`, { assunto: '', texto: 'oi' }));
  assert.equal(r.status, 400);
  const antes = S.conversas.length;
  r = guardar(await mkt.req('POST', `/api/t/${SLUG}/leads/${lead.id}/email`, { assunto: 'Seu acesso, {{nome}}', texto: 'Oi {{nome}}, o ID do clube é {{idClube}}.' }));
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ok, true);
  const m = lerMensagem(S.conversas[antes].dados);
  assert.equal(m.assunto, 'Seu acesso, Ana');
  assert.match(m.texto, /Oi Ana, o ID do clube é 10070\./);
  const ev = eventosDe(lead.id, 'email_avulso');
  assert.equal(ev.length, 1);
  assert.equal(JSON.parse(ev[0].data).status, 'enviado');
  assert.ok(ev[0].by_user, 'quem mandou fica no histórico');
  const det = guardar(await mkt.req('GET', `/api/t/${SLUG}/leads/${lead.id}`));
  assert.ok(det.data.events.some((e) => e.kind === 'email_avulso'));

  const vistos = [];
  P.app.emailTransport = async (envio) => { vistos.push(envio); return { resposta: '250 falso injetado' }; };
  r = guardar(await sup.req('POST', `/api/t/${SLUG}/leads/${lead.id}/email`, { assunto: 'Outro', texto: 'Texto' }));
  P.app.emailTransport = undefined;
  assert.equal(r.data.ok, true);
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0].para, 'jogador1@exemplo.com');
  assert.match(vistos[0].mensagem, /multipart\/alternative/);

  const outro = scoped(P.db, tenant.id).insert('leads', { email: 'sai@exemplo.com', name: 'Sai', stage: 'novo', consent: 1 });
  scoped(P.db, tenant.id).insert('lead_events', { lead_id: outro.id, kind: 'descadastro', data: '{}' });
  r = guardar(await sup.req('POST', `/api/t/${SLUG}/leads/${outro.id}/email`, { assunto: 'Oi', texto: 'Texto' }));
  assert.equal(r.status, 409, 'quem se descadastrou não recebe');
});

test('a senha nunca aparece em resposta de API, histórico de lead, auditoria nem config pública', async () => {
  const tudo = [
    ...respostas,
    JSON.stringify(P.db.prepare('SELECT * FROM lead_events').all()),
    JSON.stringify(P.db.prepare('SELECT * FROM audit').all()),
    JSON.stringify(P.db.prepare('SELECT public_config, last_error FROM integrations').all()),
  ].join('\n');
  for (const s of [SENHA, SENHA_LIMPA, Buffer.from(SENHA_LIMPA).toString('base64')]) assert.ok(!tudo.includes(s), `vazou: ${s}`);
});
