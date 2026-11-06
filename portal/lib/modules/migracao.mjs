// PA-140 · Trilha "Migrar para o pôquer" (só edição SX).
//   /migrar (público)             candidatura em uma tela. É candidatura: não cria operação, usuário nem página.
//   fila do superadmin            aprovar cria a operação (createTenant) com site e páginas em RASCUNHO, o usuário admin do agente SEM senha
//                                 e um link de primeiro acesso de validade curta, que o superadmin copia. O portal não envia nada a ninguém.
//   página de perguntas           "O pôquer também foi proibido?" nasce em rascunho, marcada para revisão do Kbsa.
//   kit de 7 dias                 pautas por canal com o link rastreado do agente, passadas pelo preflight (lib/migracao/kit.mjs).
//   placar                        candidaturas por origem, leads pelo link do agente e primeiras recargas verificadas em 7 e 30 dias.
//   chave migracao.ativa          (edicao_config) pausa a trilha inteira se a MP mudar.
import { randomBytes, createHash } from 'node:crypto';
import { id as newId, now, parse, tx } from '../db.mjs';
import { HttpError, readBody, decodeBody, rateLimiter, clientIp, send } from '../http.mjs';
import { hashPassword, passwordProblem } from '../auth.mjs';
import { createTenant, audit as writeAudit, publicTenant, slugify } from '../tenants.mjs';
import { loadTemplates } from '../templates.mjs';
import { scoped } from '../repo.mjs';
import { affiliateLink } from '../attribution.mjs';
import { normPhone } from '../migrations.mjs';
import { checarTexto } from '../preflight.mjs';
import { faqBlocks, FAQ_SLUG, FAQ_TITULO, REVISADO_EM, ANCORA_REVISAO, textoPublicoFaq } from '../migracao/faq.mjs';
import { montarKit, CANAIS } from '../migracao/kit.mjs';
import { renderMigrar, renderPrimeiroAcesso, textoPublicoMigrar, PAGE_CSP, CONSENTIMENTO_VERSAO, CANAIS_FORM, AUDIENCIAS, ORIGENS, rotulo } from '../migracao/paginas.mjs';

export const tables = ['migracao_kits', 'migracao_revisoes'];
export const nav = { id: 'migracao', label: 'Trilha de migração', perm: 'leads.read', editions: ['sx'] };

export const VALIDADE_HORAS = 24;              // link de primeiro acesso
export const LIMITE_CANDIDATURAS = 5;          // por IP por hora
const SEM_SENHA = '!sem-senha';                // checkPassword recusa tudo: ninguém entra até criar a senha pelo link
const APP_PADRAO = 'Suprema Poker';

export const AVISO_RISCO = [
  { titulo: 'A conta de rede social do agente pode cair.', texto: 'Quem vem de bet tem histórico de conteúdo de apostas. Instagram, TikTok, YouTube e até o Telegram podem restringir ou derrubar a conta por esse histórico, mesmo com conteúdo novo de pôquer. Avise o agente antes de aprovar e sugira que ele guarde os contatos do público fora da rede.' },
  { titulo: 'A MP pode mudar.', texto: 'Ela ainda depende do Congresso e está em discussão no STF. Se mudar, pause a trilha aqui (chave migracao.ativa): /migrar para de aceitar candidaturas e nenhuma aprovação nova sai até você religar.' },
  { titulo: 'Nada sai sozinho.', texto: 'Aprovar cria a operação com o site e a página de perguntas em rascunho e gera um link de primeiro acesso que você copia. O portal não manda WhatsApp nem e-mail: você decide se e quando enviar.' },
];

const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };
const sha = (t) => createHash('sha256').update(String(t)).digest('hex');
const soSx = (edition) => need(edition?.id === 'sx', 404, 'Rota não encontrada.');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const html = (res, status, body) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': PAGE_CSP, 'Referrer-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' });

// limites em memória por instância do portal (cada servidor de teste tem os seus)
const LIMITES = new WeakMap();
function limites(app) {
  if (!LIMITES.has(app)) LIMITES.set(app, { candidatura: rateLimiter(LIMITE_CANDIDATURAS, 60 * 60_000), acesso: rateLimiter(10, 15 * 60_000) });
  return LIMITES.get(app);
}

// ---------- configuração da edição ----------
export function lerConfig(db, edition, chave, padrao) {
  return db.prepare('SELECT valor FROM edicao_config WHERE edition = ? AND chave = ?').get(edition, chave)?.valor ?? padrao;
}
const trilhaAtiva = (db) => lerConfig(db, 'sx', 'migracao.ativa', '1') === '1';

// ---------- modelos de mundo da SX (os 25) ----------
const TIPOS = { clube: 'Clube do jogador', fichas: 'Fichas 24h', torneios: 'Agenda de torneios', parceiro: 'Seja parceiro', blog: 'Blog educativo' };
export function modelosMundo() {
  return [...loadTemplates().values()].filter((t) => t.id.startsWith('sx-') && t.theme?.world && t.niches.includes('poker'))
    .map((t) => {
      const tipo = t.id.split('-').pop();
      return { id: t.id, nome: t.name, mundo: t.theme.world, tipo, tipoNome: TIPOS[tipo] || tipo, descricao: t.description || '',
        cores: { bg: t.theme.bg, surface: t.theme.surface, text: t.theme.text, primary: t.theme.primary, accent: t.theme.accent, border: t.theme.border },
        paginas: t.pages.length };
    })
    .sort((a, b) => a.mundo.localeCompare(b.mundo) || a.tipo.localeCompare(b.tipo));
}

// ---------- primeiro acesso ----------
export function novoLinkPrimeiroAcesso(db, { userId, tenantId, criadoPor, origin }) {
  const token = randomBytes(32).toString('base64url');
  const agora = now();
  const expiraEm = new Date(Date.now() + VALIDADE_HORAS * 3600_000).toISOString();
  db.prepare('UPDATE migracao_primeiro_acesso SET usado_em = ? WHERE user_id = ? AND usado_em IS NULL').run(`substituido ${agora}`, userId); // só o link mais novo vale
  db.prepare('INSERT INTO migracao_primeiro_acesso (token_hash, user_id, tenant_id, expira_em, criado_por, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha(token), userId, tenantId, expiraEm, criadoPor || null, agora);
  return { link: `${origin}/primeiro-acesso/${token}`, expiraEm };
}
function tokenValido(db, token, edition) {
  const row = db.prepare('SELECT * FROM migracao_primeiro_acesso WHERE token_hash = ?').get(sha(token));
  if (!row || row.usado_em || Date.parse(row.expira_em) <= Date.now()) return null;
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(row.tenant_id);
  const user = db.prepare('SELECT id, email, name, pass FROM users WHERE id = ?').get(row.user_id);
  if (!tenant || !user || tenant.edition !== edition.id) return null;
  return { row, tenant, user };
}
const fmtBr = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

// ---------- placar ----------
/** Placar de uma operação vinda da trilha. Só lê pelo repositório da operação. */
export function placarOperacao(repo, tenant, cand) {
  const t0 = Date.parse(tenant.created_at);
  const ate = (dias) => new Date(t0 + dias * 864e5).toISOString();
  const conv = (dias, af) => repo.count('conversions', { verified: 1, kind: 'primeiro_deposito', ...(af ? { affiliate_id: af } : {}) }, 'occurred_at <= ?', [ate(dias)]);
  const af = cand?.afiliado_id || null;
  const p = {
    desde: tenant.created_at,
    leadsTotal: repo.count('leads'),
    leadsLink: af ? repo.count('leads', { affiliate_id: af }) : 0,
    cliquesLink: af ? repo.count('clicks', { affiliate_id: af }) : 0,
    conv7: conv(7), conv30: conv(30),
    conv7Link: af ? conv(7, af) : 0, conv30Link: af ? conv(30, af) : 0,
  };
  p.semDados = !p.leadsTotal && !p.cliquesLink && !p.conv30;
  return p;
}

function candidaturaOut(c) {
  return { id: c.id, nome: c.nome, contato: c.contato, contatoTipo: c.contato_tipo, canal: c.canal, canalNome: rotulo(CANAIS_FORM, c.canal),
    audiencia: c.audiencia, audienciaNome: rotulo(AUDIENCIAS, c.audiencia), nicho: c.nicho, origem: c.origem, origemNome: rotulo(ORIGENS, c.origem),
    status: c.status, motivo: c.motivo, decididoEm: c.decidido_em, tenantId: c.tenant_id, codigoAgente: c.codigo_agente, createdAt: c.created_at };
}

// ---------- página pública ----------
function lerCandidatura(body) {
  const v = { nome: String(body.nome || '').trim().slice(0, 80), contato: String(body.contato || '').trim().slice(0, 120), canal: String(body.canal || ''),
    audiencia: String(body.audiencia || ''), origem: String(body.origem || ''), nicho: String(body.nicho || '').trim().slice(0, 80),
    maior18: ['1', 'on', 'true', true].includes(body.maior18), consentimento: ['1', 'on', 'true', true].includes(body.consentimento) };
  const erros = {};
  if (v.nome.length < 2) erros.nome = 'Diga o seu nome.';
  let contato = null;
  let tipo = null;
  if (v.contato.includes('@')) { if (EMAIL.test(v.contato)) { contato = v.contato.toLowerCase(); tipo = 'email'; } }
  else { const ph = normPhone(v.contato); if (ph && ph.length <= 13) { contato = ph; tipo = 'whatsapp'; } }
  if (!contato) erros.contato = 'Informe um WhatsApp com DDD (ex.: 11 98765-4321) ou um e-mail válido.';
  if (!CANAIS_FORM.some(([k]) => k === v.canal)) erros.canal = 'Escolha o canal principal.';
  if (!AUDIENCIAS.some(([k]) => k === v.audiencia)) erros.audiencia = 'Escolha uma faixa.';
  if (!ORIGENS.some(([k]) => k === v.origem)) erros.origem = 'Escolha de onde você vem.';
  if (!v.maior18) erros.maior18 = 'A trilha é só para maiores de 18 anos.';
  if (!v.consentimento) erros.consentimento = 'Sem o consentimento não dá para analisar a candidatura.';
  return { v, erros, contato, tipo };
}

export const rootRoutes = [
  {
    method: 'GET', path: '/migrar', editions: ['sx'], handler: ({ res, url, db, edition }) => {
      if (!trilhaAtiva(db)) return html(res, 200, renderMigrar({ estado: 'pausada', brand: edition.name }));
      return html(res, 200, renderMigrar({ estado: url.searchParams.get('enviado') ? 'enviado' : 'form', brand: edition.name }));
    },
  },
  {
    method: 'POST', path: '/migrar', editions: ['sx'], handler: async ({ req, res, db, app, edition }) => {
      const json = String(req.headers.accept || '').includes('application/json');
      const raw = await readBody(req, 20_000);
      const body = decodeBody(raw, req.headers['content-type'] || '');
      const ok = () => (json ? send(res, 201, { ok: true }) : send(res, 303, '', { Location: '/migrar?enviado=1#candidatura' }));
      if (!trilhaAtiva(db)) return json ? send(res, 403, { error: 'A trilha está pausada.' }) : html(res, 403, renderMigrar({ estado: 'pausada', brand: edition.name }));
      if (body.website) return ok(); // armadilha para robôs: finge sucesso e não grava nada
      const ip = clientIp(req);
      const { v, erros, contato, tipo } = lerCandidatura(body);
      if (!limites(app).candidatura(sha(ip))) {
        const msg = 'Muitas candidaturas deste endereço. Tente de novo daqui a uma hora.';
        return json ? send(res, 429, { error: msg }) : html(res, 429, renderMigrar({ valores: v, aviso: msg, brand: edition.name }));
      }
      if (Object.keys(erros).length) return json ? send(res, 400, { error: 'Confira os campos.', erros }) : html(res, 400, renderMigrar({ valores: v, erros, brand: edition.name }));
      const at = now();
      const idc = newId();
      db.prepare(`INSERT INTO migracao_candidaturas (id, edition, nome, contato, contato_tipo, canal, audiencia, nicho, origem, maior18, consentimento, consentido_em, ip_hash, status, created_at)
        VALUES (?, 'sx', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'nova', ?)`).run(idc, v.nome, contato, tipo, v.canal, v.audiencia, v.nicho || null, v.origem, CONSENTIMENTO_VERSAO, at, sha(`${ip}|migracao`), at);
      writeAudit(db, { action: 'migracao.candidatura', target: idc, data: { origem: v.origem, canal: v.canal, audiencia: v.audiencia } }); // sem dado pessoal na auditoria
      return ok();
    },
  },
  {
    method: 'GET', path: '/primeiro-acesso/:token', handler: ({ res, params, db, edition }) => {
      const t = tokenValido(db, params.token, edition);
      if (!t || t.user.pass !== SEM_SENHA) return html(res, 410, renderPrimeiroAcesso({ estado: 'invalido', brand: edition.name }));
      return html(res, 200, renderPrimeiroAcesso({ email: t.user.email, operacao: `Clube ${t.tenant.number} · ${t.tenant.name}`, expira: fmtBr(t.row.expira_em), brand: edition.name }));
    },
  },
  {
    method: 'POST', path: '/primeiro-acesso/:token', handler: async ({ req, res, params, db, app, edition }) => {
      const body = decodeBody(await readBody(req, 5_000), req.headers['content-type'] || '');
      if (!limites(app).acesso(sha(clientIp(req)))) return html(res, 429, renderPrimeiroAcesso({ estado: 'invalido', brand: edition.name }));
      const t = tokenValido(db, params.token, edition);
      if (!t || t.user.pass !== SEM_SENHA) return html(res, 410, renderPrimeiroAcesso({ estado: 'invalido', brand: edition.name }));
      const base = { email: t.user.email, operacao: `Clube ${t.tenant.number} · ${t.tenant.name}`, expira: fmtBr(t.row.expira_em), brand: edition.name };
      const senha = String(body.senha || '');
      const erro = senha !== String(body.senha2 || '') ? 'As duas senhas não são iguais.' : passwordProblem(senha);
      if (erro) return html(res, 400, renderPrimeiroAcesso({ ...base, erro }));
      tx(db, () => {
        db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashPassword(senha), t.user.id);
        db.prepare('UPDATE migracao_primeiro_acesso SET usado_em = ? WHERE token_hash = ?').run(now(), t.row.token_hash);
      });
      writeAudit(db, { tenantId: t.tenant.id, userId: t.user.id, action: 'usuario.primeiro_acesso', target: t.user.id });
      return html(res, 200, renderPrimeiroAcesso({ ...base, estado: 'feito' }));
    },
  },
];

// ---------- aprovação ----------
function molduraDoSite(repo, siteId) {
  const pages = repo.all('pages', { site_id: siteId }, { order: 'position ASC' });
  const blocos = pages.map((p) => parse(p.draft, []));
  const home = blocos[0] || [];
  const topo = home[0] && /nav|topo/.test(home[0].type) ? home[0] : null;
  const rodape = [...home].reverse().find((b) => b.type === 'footer') || blocos.flat().find((b) => b.type === 'footer') || null;
  return { topo, rodape, posicao: pages.length };
}

function gravarKit(repo, { tenant, canal, code, origin }) {
  const settings = parse(tenant.settings, {});
  const pautas = montarKit({ canal, app: settings.app || APP_PADRAO, clube: `Clube ${tenant.number}`,
    linkPara: (to) => affiliateLink(origin, tenant.slug, code, { to, medium: canal, campaign: 'migracao-7d' }) });
  for (const old of repo.all('migracao_kits', { canal })) repo.remove('migracao_kits', old.id);
  for (const p of pautas) {
    repo.insert('migracao_kits', { canal: p.canal, dia: p.dia, formato: p.formato, gancho: p.gancho, tema: p.tema, chamada: p.chamada, link: p.link, preflight: JSON.stringify(p.preflight) });
  }
  return pautas;
}

function aprovar({ db, body, user, origin, params }) {
  need(trilhaAtiva(db), 409, 'A trilha está pausada (migracao.ativa desligada). Religue para aprovar.');
  const cand = db.prepare("SELECT * FROM migracao_candidaturas WHERE id = ? AND edition = 'sx'").get(params.id);
  need(cand, 404, 'Candidatura não encontrada.');
  need(cand.status === 'nova', 409, 'Esta candidatura já foi decidida.');
  const nome = String(body.nome || '').trim().slice(0, 80);
  const numero = String(body.numero || '').trim().slice(0, 20);
  const codigo = String(body.codigoAgente || '').trim().slice(0, 30);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  need(nome.length >= 2, 400, 'Dê um nome para a operação do agente.');
  need(/^[A-Za-z0-9-]{1,20}$/.test(numero), 400, 'Informe o número do clube (letras, números e hífen).');
  need(/^[A-Za-z0-9_-]{2,30}$/.test(codigo), 400, 'Informe o código de agente (letras, números, hífen ou sublinhado).');
  need(EMAIL.test(email), 400, 'Informe o e-mail de acesso do agente.');
  const modelos = modelosMundo();
  need(modelos.some((m) => m.id === body.modelo), 400, 'Escolha um dos modelos de mundo da SX.');
  const slug = slugify(`Clube-${numero}`);
  need(!db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(slug), 409, `Já existe uma operação com o número ${numero}.`);
  const existente = db.prepare('SELECT id, email, name, is_super, pass FROM users WHERE email = ?').get(email);
  need(!existente?.is_super, 400, 'Esse e-mail é de um superadministrador. Use o e-mail do agente.');
  const comSenha = Boolean(existente && existente.pass !== SEM_SENHA);
  if (comSenha && body.confirmoMesmaPessoa !== true) {
    // e-mail que já tem conta com senha: não vincula em silêncio; a tela mostra quem é e pede confirmação
    const papeis = db.prepare('SELECT t.name, t.number, t.niche_id, t.edition, m.role FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? ORDER BY t.created_at').all(existente.id)
      .map((r) => ({ operacao: `${r.number ? `Clube ${r.number} · ` : ''}${r.name}`, edicao: r.edition, papel: r.role }));
    throw new HttpError(409, 'Este e-mail já tem conta no portal. Confirme que é a mesma pessoa para vincular.', { contaExistente: { nome: existente.name, email: existente.email, papeis } });
  }
  const code = slugify(codigo).replace(/-/g, '').slice(0, 20) || randomBytes(4).toString('hex');

  // 1. operação + site do modelo (createTenant: páginas só em rascunho, integrações pendentes)
  const settings = { app: APP_PADRAO, agentId: codigo, ...(cand.contato_tipo === 'whatsapp' ? { whatsapp: cand.contato } : {}), ...(cand.contato_tipo === 'email' ? { email: cand.contato } : {}) };
  const { tenant, site } = createTenant(db, { name: nome, number: numero, niche: 'poker', edition: 'sx', template: body.modelo, settings, slug }, { userId: user.id });
  const repo = scoped(db, tenant.id);

  // 2. resto numa transação: usuário, afiliado (link rastreado), página de perguntas, kit, link de primeiro acesso, candidatura
  const out = tx(db, () => {
    let userId = existente?.id;
    if (!existente) {
      userId = newId();
      db.prepare('INSERT INTO users (id, email, name, pass, is_super, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(userId, email, cand.nome, SEM_SENHA, now());
    }
    db.prepare('INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, ?) ON CONFLICT(user_id, tenant_id) DO UPDATE SET role = excluded.role').run(userId, tenant.id, 'admin');
    const afiliado = repo.insert('affiliates', { name: cand.nome, email: cand.contato_tipo === 'email' ? cand.contato : null, code, status: 'ativo', user_id: userId });

    let pagina = null;
    if (site) {
      const m = molduraDoSite(repo, site.id);
      const blocks = faqBlocks(m);
      pagina = repo.insert('pages', { site_id: site.id, slug: FAQ_SLUG, title: FAQ_TITULO, position: m.posicao,
        seo: JSON.stringify({ title: `${FAQ_TITULO} · ${nome}`.slice(0, 70), description: `O que a MP 1.394/2026 diz e não diz sobre o pôquer, com fontes oficiais. Revisado em ${REVISADO_EM}.`.slice(0, 170), noindex: false }),
        draft: JSON.stringify(blocks) });
      repo.insert('page_versions', { page_id: pagina.id, blocks: pagina.draft, note: 'criada pela trilha de migração · aguardando revisão do Kbsa', created_by: user.id });
      repo.insert('migracao_revisoes', { page_id: pagina.id, status: 'aguardando_revisao', revisado_em_texto: REVISADO_EM });
    }
    const kit = gravarKit(repo, { tenant, canal: CANAIS[cand.canal] ? cand.canal : 'outro', code, origin });
    const acesso = !existente || existente.pass === SEM_SENHA ? novoLinkPrimeiroAcesso(db, { userId, tenantId: tenant.id, criadoPor: user.id, origin }) : null;
    db.prepare("UPDATE migracao_candidaturas SET status = 'aprovada', decidido_por = ?, decidido_em = ?, tenant_id = ?, codigo_agente = ?, afiliado_id = ? WHERE id = ?")
      .run(user.id, now(), tenant.id, codigo, afiliado.id, cand.id);
    writeAudit(db, { tenantId: tenant.id, userId: user.id, action: 'migracao.aprovar', target: cand.id,
      data: { modelo: body.modelo, numero, codigoAgente: codigo, usuario: userId, usuarioExistente: Boolean(existente), pagina: pagina?.id || null, kit: kit.length } });
    if (comSenha) writeAudit(db, { tenantId: tenant.id, userId: user.id, action: 'migracao.conta_existente_confirmada', target: userId, data: { email, confirmadoPor: user.id } });
    if (acesso) writeAudit(db, { tenantId: tenant.id, userId: user.id, action: 'migracao.link_primeiro_acesso', target: userId, data: { expiraEm: acesso.expiraEm } });
    return { acesso, pagina, afiliado, kit };
  });
  return { status: 201, body: { tenant: publicTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenant.id)), adminUrl: `/admin/#/t/${tenant.slug}`,
    link: out.acesso?.link || null, expiraEm: out.acesso?.expiraEm || null, usuarioExistente: Boolean(existente && existente.pass !== SEM_SENHA),
    paginaPerguntas: out.pagina?.id || null, linkAgente: affiliateLink(origin, tenant.slug, code, { medium: 'link', campaign: 'migracao' }),
    nota: 'Nada foi publicado nem enviado. Copie o link e mande você mesmo, se quiser.' } };
}

// ---------- trava de publicação ----------
/** Página de perguntas com a revisão do Kbsa pendente não pode ser publicada (gancho prePublish do servidor). */
export function prePublish({ repo, page }) {
  const rev = repo.get('migracao_revisoes', { page_id: page.id, status: 'aguardando_revisao' });
  if (rev) throw new HttpError(409, 'Esta página espera a revisão do Kbsa.');
}

// ---------- rotas da API ----------
export const routes = [
  {
    method: 'GET', path: '/api/admin/migracao', super: true, handler: ({ db, edition, query }) => {
      soSx(edition);
      const status = ['nova', 'aprovada', 'recusada'].includes(query.status) ? query.status : 'nova';
      const rows = db.prepare("SELECT * FROM migracao_candidaturas WHERE edition = 'sx' AND status = ? ORDER BY created_at DESC LIMIT 300").all(status);
      const contagens = Object.fromEntries(db.prepare("SELECT status, COUNT(*) n FROM migracao_candidaturas WHERE edition = 'sx' GROUP BY status").all().map((r) => [r.status, r.n]));
      const porOrigem = db.prepare(`SELECT origem, COUNT(*) total, SUM(status = 'aprovada') aprovadas, SUM(status = 'recusada') recusadas
        FROM migracao_candidaturas WHERE edition = 'sx' GROUP BY origem ORDER BY total DESC`).all()
        .map((r) => ({ origem: r.origem, nome: rotulo(ORIGENS, r.origem), total: r.total, aprovadas: r.aprovadas || 0, recusadas: r.recusadas || 0 }));
      const aprovadas = db.prepare("SELECT c.*, t.slug, t.name tname, t.number, t.created_at tcreated FROM migracao_candidaturas c JOIN tenants t ON t.id = c.tenant_id WHERE c.edition = 'sx' AND c.status = 'aprovada' ORDER BY c.decidido_em DESC").all();
      const porAgente = aprovadas.map((c) => {
        const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(c.tenant_id);
        return { candidatura: c.id, nome: c.nome, origem: rotulo(ORIGENS, c.origem), slug: c.slug, operacao: `Clube ${c.number} · ${c.tname}`, ...placarOperacao(scoped(db, t.id), t, c) };
      });
      const soma = (k) => porAgente.reduce((s, a) => s + a[k], 0);
      const revisoes = db.prepare(`SELECT r.tenant_id, r.page_id, r.status, t.slug, t.name, t.number FROM migracao_revisoes r JOIN tenants t ON t.id = r.tenant_id
        WHERE t.edition = 'sx' AND r.status = 'aguardando_revisao' ORDER BY r.created_at`).all();
      return {
        ativa: trilhaAtiva(db), status, candidaturas: rows.map((c) => {
          const out = candidaturaOut(c);
          if (c.tenant_id) { const a = porAgente.find((x) => x.candidatura === c.id); if (a) Object.assign(out, { slug: a.slug, operacao: a.operacao, placar: a }); }
          return out;
        }),
        contagens: { nova: contagens.nova || 0, aprovada: contagens.aprovada || 0, recusada: contagens.recusada || 0 },
        porOrigem, placar: { agentes: porAgente.length, leadsLink: soma('leadsLink'), leadsTotal: soma('leadsTotal'), conv7: soma('conv7'), conv30: soma('conv30'),
          conv7Link: soma('conv7Link'), conv30Link: soma('conv30Link') },
        revisoesPendentes: revisoes.map((r) => ({ slug: r.slug, operacao: `Clube ${r.number} · ${r.name}`, pageId: r.page_id })),
        modelos: modelosMundo(), aviso: AVISO_RISCO, validadeHoras: VALIDADE_HORAS,
      };
    },
  },
  { method: 'POST', path: '/api/admin/migracao/:id/aprovar', super: true, handler: (ctx) => { soSx(ctx.edition); return aprovar(ctx); } },
  {
    method: 'POST', path: '/api/admin/migracao/:id/recusar', super: true, handler: ({ db, edition, params, body, user }) => {
      soSx(edition);
      const c = db.prepare("SELECT * FROM migracao_candidaturas WHERE id = ? AND edition = 'sx'").get(params.id);
      need(c, 404, 'Candidatura não encontrada.');
      need(c.status === 'nova', 409, 'Esta candidatura já foi decidida.');
      const motivo = String(body.motivo || '').trim().slice(0, 300) || null;
      db.prepare("UPDATE migracao_candidaturas SET status = 'recusada', motivo = ?, decidido_por = ?, decidido_em = ? WHERE id = ?").run(motivo, user.id, now(), c.id);
      writeAudit(db, { userId: user.id, action: 'migracao.recusar', target: c.id, data: { motivo: Boolean(motivo) } });
      return { ok: true, nota: 'Recusada. Ninguém foi avisado: se quiser responder, faça você mesmo.' };
    },
  },
  {
    method: 'POST', path: '/api/admin/migracao/:id/link', super: true, handler: ({ db, edition, params, user, origin }) => {
      soSx(edition);
      const c = db.prepare("SELECT * FROM migracao_candidaturas WHERE id = ? AND edition = 'sx' AND status = 'aprovada'").get(params.id);
      need(c, 404, 'Candidatura aprovada não encontrada.');
      const ultimo = db.prepare('SELECT user_id FROM migracao_primeiro_acesso WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1').get(c.tenant_id);
      need(ultimo, 409, 'Esta aprovação usou um usuário que já tinha senha. Não há link de primeiro acesso.');
      const u = db.prepare('SELECT pass FROM users WHERE id = ?').get(ultimo.user_id);
      need(u?.pass === SEM_SENHA, 409, 'O agente já criou a senha. O link não é mais necessário.');
      const acesso = novoLinkPrimeiroAcesso(db, { userId: ultimo.user_id, tenantId: c.tenant_id, criadoPor: user.id, origin });
      writeAudit(db, { tenantId: c.tenant_id, userId: user.id, action: 'migracao.link_primeiro_acesso', target: ultimo.user_id, data: { expiraEm: acesso.expiraEm, novo: true } });
      return { ...acesso, nota: 'Link novo gerado; o anterior deixou de valer. Nada foi enviado.' };
    },
  },
  {
    method: 'PATCH', path: '/api/admin/migracao/config', super: true, handler: ({ db, edition, body, user }) => {
      soSx(edition);
      need(typeof body.ativa === 'boolean', 400, 'Informe ativa: true ou false.');
      db.prepare(`INSERT INTO edicao_config (edition, chave, valor, atualizado_por, atualizado_em) VALUES ('sx', 'migracao.ativa', ?, ?, ?)
        ON CONFLICT(edition, chave) DO UPDATE SET valor = excluded.valor, atualizado_por = excluded.atualizado_por, atualizado_em = excluded.atualizado_em`).run(body.ativa ? '1' : '0', user.id, now());
      writeAudit(db, { userId: user.id, action: 'migracao.config', target: 'migracao.ativa', data: { ativa: body.ativa } });
      return { ativa: body.ativa };
    },
  },

  // ---------- painel da operação do agente ----------
  {
    method: 'GET', path: '/api/t/:tenant/migracao', perm: 'leads.read', handler: ({ db, repo, tenant, edition, origin }) => {
      soSx(edition);
      const cand = db.prepare("SELECT * FROM migracao_candidaturas WHERE tenant_id = ? AND edition = 'sx'").get(tenant.id);
      if (!cand) return { veioDaTrilha: false };
      const af = cand.afiliado_id ? repo.get('affiliates', cand.afiliado_id) : null;
      const rev = repo.all('migracao_revisoes', {}, { order: 'created_at ASC', limit: 1 })[0] || null;
      const pg = rev ? repo.get('pages', rev.page_id) : null;
      const kits = repo.all('migracao_kits', {}, { order: 'canal ASC, dia ASC', limit: 200 });
      return {
        veioDaTrilha: true, ativa: trilhaAtiva(db),
        candidatura: { canal: cand.canal, canalNome: rotulo(CANAIS_FORM, cand.canal), origemNome: rotulo(ORIGENS, cand.origem), audienciaNome: rotulo(AUDIENCIAS, cand.audiencia), aprovadaEm: cand.decidido_em },
        placar: placarOperacao(repo, tenant, cand),
        link: af ? affiliateLink(origin, tenant.slug, af.code, { medium: 'link', campaign: 'migracao' }) : null,
        perguntas: pg ? { pageId: pg.id, titulo: pg.title, publicada: Boolean(pg.published), revisao: rev.status, revisadoEmTexto: rev.revisado_em_texto, revisadoEm: rev.revisado_em } : null,
        canais: Object.entries(CANAIS).map(([id, c]) => ({ id, nome: c.nome, formato: c.formato })),
        kit: kits.map((k) => ({ canal: k.canal, dia: k.dia, formato: k.formato, gancho: k.gancho, tema: k.tema, chamada: k.chamada, link: k.link, preflight: parse(k.preflight, {}) })),
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/migracao/kit', perm: 'creatives.edit', handler: ({ db, repo, tenant, edition, origin, body, audit }) => {
      soSx(edition);
      const cand = db.prepare("SELECT * FROM migracao_candidaturas WHERE tenant_id = ? AND edition = 'sx'").get(tenant.id);
      need(cand, 404, 'Esta operação não veio da trilha de migração.');
      need(CANAIS[body.canal], 400, 'Canal inválido.');
      const af = repo.get('affiliates', cand.afiliado_id || '');
      need(af, 409, 'O afiliado do agente não existe mais nesta operação.');
      const kit = gravarKit(repo, { tenant, canal: body.canal, code: af.code, origin });
      audit('migracao.kit', tenant.id, { canal: body.canal, pautas: kit.length, bloqueadas: kit.filter((p) => !p.preflight.ok).length });
      return { kit };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/migracao/perguntas/revisar', super: true, handler: ({ repo, edition, user, audit }) => {
      soSx(edition);
      const rev = repo.all('migracao_revisoes', { status: 'aguardando_revisao' }, { limit: 1 })[0];
      need(rev, 404, 'Nada aguardando revisão nesta operação.');
      const pg = repo.get('pages', rev.page_id);
      need(pg, 404, 'A página de perguntas não existe mais.');
      const blocos = parse(pg.draft, []).filter((b) => b.props?.anchor !== ANCORA_REVISAO); // tira o aviso interno do rascunho
      repo.insert('page_versions', { page_id: pg.id, blocks: pg.draft, note: 'antes da revisão do Kbsa', created_by: user.id });
      repo.update('pages', pg.id, { draft: JSON.stringify(blocos) });
      repo.update('migracao_revisoes', rev.id, { status: 'revisado', revisado_por: user.id, revisado_em: now() });
      audit('migracao.perguntas_revisadas', pg.id, { revisadoEmTexto: rev.revisado_em_texto });
      return { ok: true, nota: 'Revisão marcada. A página continua em rascunho: publicar é outro passo, no construtor.' };
    },
  },
];

// Textos públicos desta trilha (para o preflight no teste e para quem revisar).
export const textosPublicos = () => ({ migrar: textoPublicoMigrar(), perguntas: textoPublicoFaq() });
export const preflightPublico = () => Object.fromEntries(Object.entries(textosPublicos()).map(([k, t]) => [k, checarTexto(t, { nicho: 'poker', edicao: 'sx', rede: 'site' })]));
