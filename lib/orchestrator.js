// Camada que faz o cadastro "por trás": cada cadastro anda por etapas e,
// se uma falhar, a próxima tentativa recomeça dela (não do zero).
// Fase "conta": só e-mail e senha. Fase "pix": dados do pagador, pedidos no 1º depósito.
// Com SUPREMA_MODE=app, o jogador cria a conta da Suprema no app aberto pelo link oficial do clube (já entra no
// clube 10001 com o agente) e informa o ID aqui; o resto (Fichas 24h, código, validação e PIX) acontece na página.
import { randomInt, randomUUID } from 'node:crypto';
import { config, testMode } from '../config.js';
import { store } from './store.js';
import { suprema, fichas24h } from '../adapters/index.js';
import { onlyDigits, passwordError, validatePayer } from '../public/shared/validate.js';

export const STEPS = [
  { key: 'suprema_conta', label: suprema.VIA_APP ? 'Conta no app e entrada no clube' : 'Conta na Suprema', phase: 'conta' },
  { key: 'suprema_email', label: 'E-mail confirmado', phase: 'conta' },
  { key: 'f24h_conta', label: 'Conta de fichas criada', phase: 'pix' },
  { key: 'f24h_email', label: 'E-mail das fichas confirmado', phase: 'pix' },
  { key: 'f24h_vinculo', label: 'Fichas ligadas à sua conta da Suprema', phase: 'pix' },
  { key: 'f24h_validacao', label: 'Conta da Suprema validada', phase: 'pix' },
];

// Apelido gerado a partir do e-mail (regra do app: 2 a 20 letras ou números).
function nickFromEmail(email) {
  const base = email.split('@')[0].normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  return (base.length >= 2 ? base : 'jogador') + randomInt(1000, 9999);
}

// Senha e sessão ficam só em memória: nunca vão para o arquivo.
const secrets = new Map(); // signupId -> { password, expiresAt }
const sessions = new Map(); // signupId -> sessão do Fichas 24h
const running = new Set();

class NeedsPlayer extends Error {
  constructor(need) {
    super(need);
    this.need = need;
  }
}
class Fatal extends Error {}

const now = () => new Date().toISOString();

function addLog(signup, msg) {
  signup.log.push({ at: now(), msg });
  if (signup.log.length > 60) signup.log.shift();
}

function setStep(signup, key, state, error) {
  signup.steps[key] = { state, at: now(), ...(error ? { error } : {}) };
}

function passwordOf(id) {
  const secret = secrets.get(id);
  if (!secret || secret.expiresAt < Date.now()) {
    secrets.delete(id);
    return null;
  }
  return secret.password;
}

function requirePassword(id) {
  const password = passwordOf(id);
  if (!password) throw new Fatal('A senha expirou por segurança. O jogador precisa refazer o cadastro.');
  return password;
}

function rememberPassword(id, password) {
  secrets.set(id, { password, expiresAt: Date.now() + config.passwordTtlMinutes * 60_000 });
}

const stepsOk = (signup, phase) => STEPS.filter((s) => s.phase === phase).every((s) => signup.steps[s.key].state === 'ok');

export function createSignup(data, { utm = {} } = {}) {
  const signup = {
    id: randomUUID(),
    createdAt: now(),
    updatedAt: now(),
    status: 'em_andamento',
    needs: null,
    error: null,
    fatal: false,
    attempts: 0,
    player: { nick: nickFromEmail(data.email), email: data.email, name: null, cpf: null, phone: null, birth: null },
    supremaId: null,
    f24hUserId: null,
    f24hAccountId: null,
    f24hEmailPending: false,
    f24hValidated: false,
    f24hValidationStarted: false,
    existingSupremaAccount: false,
    emailVerified: false,
    steps: Object.fromEntries(STEPS.map((s) => [s.key, { state: 'pendente', at: null }])),
    utm,
    log: [],
  };
  addLog(signup, 'Cadastro recebido');
  store.saveSignup(signup);
  rememberPassword(signup.id, data.password);
  run(signup.id);
  return signup;
}

async function execStep(signup, key) {
  switch (key) {
    case 'suprema_conta': {
      const { nick, email } = signup.player;
      const result = await suprema.createAccount({ nick, email, password: requirePassword(signup.id) });
      if (result.viaApp) throw new NeedsPlayer('entrar_clube');
      if (result.exists) throw new NeedsPlayer('id_suprema');
      signup.supremaId = result.supremaId;
      signup.emailVerified = !result.emailVerificationRequired;
      addLog(signup, `Conta criada na Suprema (ID ${result.supremaId})`);
      return;
    }
    case 'suprema_email': {
      if (suprema.VIA_APP) return addLog(signup, 'Conta criada no app: o próprio app confirma o e-mail');
      if (signup.existingSupremaAccount) return addLog(signup, 'Conta já existia: sem confirmação de e-mail');
      if (!signup.emailVerified) throw new NeedsPlayer('codigo_email');
      return;
    }
    case 'f24h_conta': {
      const password = passwordOf(signup.id);
      if (!signup.player.cpf || !signup.player.name || !password) throw new NeedsPlayer('dados_pix');
      const result = await fichas24h.register({ ...signup.player, password });
      if (result.exists) {
        await loginF24h(signup, password);
        return addLog(signup, 'Conta no Fichas 24h já existia: login feito');
      }
      signup.f24hEmailPending = Boolean(result.emailVerificationRequired);
      if (result.session) sessions.set(signup.id, result.session);
      return addLog(signup, 'Conta criada no Fichas 24h');
    }
    case 'f24h_email': {
      if (signup.f24hEmailPending) throw new NeedsPlayer('codigo_f24h');
      if (!sessions.get(signup.id)) await loginF24h(signup, requirePassword(signup.id));
      return;
    }
    case 'f24h_vinculo': {
      const link = await fichas24h.linkPlatformAccount({
        session: sessions.get(signup.id),
        supremaId: signup.supremaId,
        clubId: config.club.id,
        agentId: config.club.agentId,
      });
      signup.f24hAccountId = link.accountId;
      signup.f24hValidated = Boolean(link.validated);
      return addLog(signup, 'ID da Suprema vinculado no Fichas 24h');
    }
    case 'f24h_validacao': {
      if (signup.f24hValidated) return;
      if (!signup.f24hValidationStarted) {
        await fichas24h.startValidation({ session: sessions.get(signup.id), accountId: signup.f24hAccountId });
        signup.f24hValidationStarted = true;
        addLog(signup, 'Fichas de validação enviadas para a conta da Suprema');
      }
      throw new NeedsPlayer('valor_fichas');
    }
  }
}

async function loginF24h(signup, password) {
  const result = await fichas24h.login({ email: signup.player.email, password });
  signup.f24hUserId = result.userId;
  sessions.set(signup.id, result.session);
}

export async function run(id) {
  if (running.has(id)) return;
  const signup = store.getSignup(id);
  if (!signup || signup.status === 'pronto') return;
  running.add(id);
  let current = null;
  try {
    signup.status = 'em_andamento';
    signup.needs = null;
    signup.error = null;
    store.saveSignup(signup);

    for (const { key } of STEPS) {
      if (signup.steps[key].state === 'ok') continue;
      current = key;
      setStep(signup, key, 'rodando');
      store.saveSignup(signup);
      await execStep(signup, key);
      setStep(signup, key, 'ok');
      store.saveSignup(signup);
    }

    signup.status = 'pronto';
    secrets.delete(id);
    addLog(signup, 'Pronto para depositar');
    store.saveSignup(signup);
  } catch (err) {
    if (err instanceof NeedsPlayer) {
      if (current) setStep(signup, current, 'aguardando');
      signup.status = 'aguardando_jogador';
      signup.needs = err.need;
      store.saveSignup(signup);
      return;
    }
    signup.attempts += 1;
    signup.fatal = err instanceof Fatal;
    if (current) setStep(signup, current, 'erro', err.message);
    signup.status = 'falhou';
    signup.error = err.message;
    addLog(signup, `Erro em "${current}": ${err.message}`);
    store.saveSignup(signup);
    if (!signup.fatal && signup.attempts < config.maxAutoRetries) {
      setTimeout(() => run(id), 1500 * signup.attempts);
    }
  } finally {
    running.delete(id);
  }
}

export async function submitEmailCode(id, code) {
  const signup = store.getSignup(id);
  if (!signup || signup.needs !== 'codigo_email') return { ok: false, error: 'Não há código para confirmar agora.' };
  const result = await suprema.verifyEmail({ supremaId: signup.supremaId, email: signup.player.email, code: String(code ?? '').trim() });
  if (!result.ok) return { ok: false, error: result.error || 'Código incorreto.' };
  signup.emailVerified = true;
  signup.needs = null;
  signup.status = 'em_andamento';
  addLog(signup, 'E-mail confirmado');
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export async function resendEmailCode(id) {
  const signup = store.getSignup(id);
  if (!signup || signup.needs !== 'codigo_email') return { ok: false, error: 'Não há código para reenviar agora.' };
  await suprema.resendEmailCode({ supremaId: signup.supremaId, email: signup.player.email });
  addLog(signup, 'Código de e-mail reenviado');
  store.saveSignup(signup);
  return { ok: true };
}

export async function submitSupremaId(id, rawId) {
  const signup = store.getSignup(id);
  if (!signup || !['id_suprema', 'entrar_clube'].includes(signup.needs)) return { ok: false, error: 'Não há ID para vincular agora.' };
  const supremaId = onlyDigits(rawId);
  if (supremaId.length < 4 || supremaId.length > 12) return { ok: false, error: 'Confira o ID: só números, como aparece no seu perfil.' };
  await suprema.linkExistingAccount({ supremaId, email: signup.player.email });
  signup.supremaId = supremaId;
  signup.existingSupremaAccount = signup.needs === 'id_suprema';
  signup.needs = null;
  signup.status = 'em_andamento';
  setStep(signup, 'suprema_conta', 'ok');
  addLog(signup, `ID da Suprema informado (${supremaId})`);
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export async function submitF24hCode(id, code) {
  const signup = store.getSignup(id);
  if (!signup || signup.needs !== 'codigo_f24h') return { ok: false, error: 'Não há código para confirmar agora.' };
  const result = await fichas24h.verifyEmail({ email: signup.player.email, code: String(code ?? '').trim() });
  if (!result.ok) return { ok: false, error: result.error || 'Código incorreto.' };
  if (result.session) sessions.set(id, result.session);
  signup.f24hEmailPending = false;
  signup.needs = null;
  signup.status = 'em_andamento';
  addLog(signup, 'E-mail do Fichas 24h confirmado');
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export async function resendF24hCode(id) {
  const signup = store.getSignup(id);
  if (!signup || signup.needs !== 'codigo_f24h') return { ok: false, error: 'Não há código para reenviar agora.' };
  await fichas24h.resendEmailCode({ email: signup.player.email });
  addLog(signup, 'Código do Fichas 24h reenviado');
  store.saveSignup(signup);
  return { ok: true };
}

// Valor das fichas de validação, como o jogador vê no app ("3,5" ou "3.5").
function parseChips(raw) {
  const text = String(raw ?? '').trim();
  return Number(text.includes(',') ? text.replace(/[.]/g, '').replace(',', '.') : text);
}

export async function submitValidationValue(id, raw) {
  const signup = store.getSignup(id);
  if (!signup || signup.needs !== 'valor_fichas') return { ok: false, error: 'Não há validação para confirmar agora.' };
  const value = parseChips(raw);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Digite o valor que chegou, como aparece no app (ex.: 3,5).' };
  const result = await fichas24h.finishValidation({ session: sessions.get(id), accountId: signup.f24hAccountId, value });
  if (!result.ok) return { ok: false, error: result.error };
  signup.f24hValidated = true;
  signup.needs = null;
  signup.status = 'em_andamento';
  addLog(signup, 'Conta da Suprema validada no Fichas 24h');
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export function submitPayer(id, input) {
  const signup = store.getSignup(id);
  if (!signup) return { ok: false, error: 'Cadastro não encontrado.' };
  if (signup.status === 'pronto') return { ok: true };
  if (!stepsOk(signup, 'conta')) return { ok: false, error: 'Termine a criação da conta primeiro.' };

  const { ok, errors, data } = validatePayer(input, { allowTestCpf: config.modes.fichas24h === 'mock' });
  const needsPassword = !passwordOf(id);
  if (needsPassword) {
    const pwdError = passwordError(input.password);
    if (pwdError) errors.password = pwdError;
  }
  if (!ok || errors.password) return { ok: false, errors };

  if (needsPassword) rememberPassword(id, String(input.password));
  Object.assign(signup.player, data);
  signup.needs = null;
  signup.status = 'em_andamento';
  signup.attempts = 0;
  addLog(signup, 'Dados do PIX recebidos');
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export function retry(id) {
  const signup = store.getSignup(id);
  if (!signup || signup.status !== 'falhou') return { ok: false, error: 'Este cadastro não está com falha.' };
  if (signup.fatal) return { ok: false, error: signup.error };
  signup.attempts = 0;
  addLog(signup, 'Nova tentativa manual');
  store.saveSignup(signup);
  run(id);
  return { ok: true };
}

export function publicSignup(signup) {
  return {
    id: signup.id,
    status: signup.status,
    needs: signup.needs,
    error: signup.error,
    retrying: signup.status === 'falhou' && !signup.fatal && signup.attempts < config.maxAutoRetries,
    accountReady: stepsOk(signup, 'conta'),
    needsPassword: signup.status !== 'pronto' && !passwordOf(signup.id),
    steps: STEPS.map(({ key, label, phase }) => ({ key, label, phase, state: signup.steps[key].state })),
    player: { nick: signup.player.nick, email: signup.player.email },
    supremaId: signup.supremaId,
    testHints: testMode ? {
      emailCode: suprema.MOCK_EMAIL_CODE || null,
      f24hCode: fichas24h.MOCK_EMAIL_CODE || null,
      validationValue: fichas24h.mockValidationValue?.(signup.f24hAccountId) ?? null,
    } : null,
  };
}

// ---------- Depósitos ----------

export async function createDeposit(signupId, rawAmount) {
  const signup = store.getSignup(signupId);
  if (!signup || signup.status !== 'pronto') return { ok: false, error: 'Termine o cadastro antes de depositar.' };

  const amount = Math.round(Number(String(rawAmount).replace(',', '.')) * 100) / 100;
  const { min, max, pixTtlMinutes } = config.deposit;
  if (!Number.isFinite(amount) || amount < min || amount > max) {
    return { ok: false, error: `Escolha um valor entre R$ ${min} e R$ ${max}.` };
  }

  let session = sessions.get(signupId);
  if (!session) {
    if (config.modes.fichas24h !== 'mock') return { ok: false, error: 'Sua sessão no Fichas 24h expirou. Fale com o suporte.' };
    session = (await fichas24h.login({ email: signup.player.email })).session;
    sessions.set(signupId, session);
  }

  const charge = await fichas24h.createPix({ session, accountId: signup.f24hAccountId, amount, ttlMinutes: pixTtlMinutes });
  const deposit = store.saveDeposit({
    id: randomUUID(),
    signupId,
    amount,
    status: 'aguardando_pagamento',
    chargeId: charge.chargeId,
    copiaECola: charge.copiaECola,
    expiresAt: charge.expiresAt,
    createdAt: now(),
    paidAt: null,
    creditedAt: null,
  });
  addLog(signup, `PIX gerado: R$ ${amount.toFixed(2)}`);
  store.saveSignup(signup);
  return { ok: true, deposit: publicDeposit(deposit) };
}

export async function refreshDeposit(id) {
  const deposit = store.getDeposit(id);
  if (!deposit) return null;
  if (deposit.status === 'creditado' || deposit.status === 'expirado') return deposit;

  const { status } = await fichas24h.getCharge({ chargeId: deposit.chargeId, session: sessions.get(deposit.signupId) });
  const expired = Date.parse(deposit.expiresAt) < Date.now();
  if (status === 'creditado') {
    deposit.paidAt ??= now();
    deposit.creditedAt = now();
    deposit.status = 'creditado';
    const signup = store.getSignup(deposit.signupId);
    if (signup) {
      addLog(signup, `Fichas creditadas: R$ ${deposit.amount.toFixed(2)}`);
      store.saveSignup(signup);
    }
  } else if (status === 'pago') {
    deposit.paidAt ??= now();
    deposit.status = 'pago';
  } else if (status === 'desconhecido' || (status === 'pendente' && expired)) {
    deposit.status = 'expirado';
  }
  return store.saveDeposit(deposit);
}

export function simulateDepositPaid(id) {
  const deposit = store.getDeposit(id);
  if (!testMode || !deposit) return false;
  return fichas24h.simulatePaid(deposit.chargeId);
}

export function publicDeposit(deposit) {
  const { id, amount, status, copiaECola, expiresAt, createdAt, paidAt, creditedAt } = deposit;
  return { id, amount, status, copiaECola, expiresAt, createdAt, paidAt, creditedAt };
}

// ---------- Painel ----------

export function adminOverview() {
  const signups = store.listSignups();
  const deposits = store.listDeposits();
  const paid = deposits.filter((d) => d.status === 'pago' || d.status === 'creditado');
  const count = (status) => signups.filter((s) => s.status === status).length;
  return {
    funnel: {
      cadastros: signups.length,
      prontos: count('pronto'),
      aguardando: count('aguardando_jogador'),
      falhas: count('falhou'),
      pixGerados: deposits.length,
      pixPagos: paid.length,
      valorPago: paid.reduce((sum, d) => sum + d.amount, 0),
    },
    signups: signups.map((s) => {
      const own = deposits.filter((d) => d.signupId === s.id);
      return {
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        status: s.status,
        needs: s.needs,
        error: s.error,
        fatal: s.fatal,
        attempts: s.attempts,
        player: { ...s.player, cpf: s.player.cpf ? s.player.cpf.replace(/^(\d{3})\d{6}(\d{2})$/, '$1.***.***-$2') : null },
        supremaId: s.supremaId,
        steps: STEPS.map(({ key, label }) => ({ key, label, ...s.steps[key] })),
        utm: s.utm,
        log: s.log,
        deposits: own.map(({ id, amount, status, createdAt }) => ({ id, amount, status, createdAt })),
      };
    }),
  };
}
