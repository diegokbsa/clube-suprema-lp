// Fichas 24h simulado, com as mesmas etapas do real: cadastro, código por e-mail, vínculo do ID da Suprema,
// validação por fichas (o Fichas manda um valor para a conta e o jogador digita) e PIX.
// Gatilhos de teste:
//   - e-mail com "+f24hexiste" -> conta já existe no Fichas 24h (faz login no lugar do cadastro)
import { randomInt, randomUUID } from 'node:crypto';
import { buildMockPixPayload } from '../lib/pix.js';

export const MOCK_EMAIL_CODE = '654321';

const charges = new Map();
const validations = new Map(); // accountId -> valor enviado
const wait = (min = 500, max = 1200) => new Promise((r) => setTimeout(r, randomInt(min, max)));
const newSession = () => ({ userId: 'f24h_' + randomInt(100000, 999999), session: 'mock_' + randomUUID() });

export async function register({ email }) {
  await wait();
  if (email.includes('+f24hexiste')) return { exists: true };
  return { emailVerificationRequired: true };
}

export async function verifyEmail({ code }) {
  await wait(300, 700);
  if (String(code) !== MOCK_EMAIL_CODE) return { ok: false, error: 'Código incorreto ou vencido.' };
  return { ok: true };
}

export async function resendEmailCode() {
  await wait(300, 600);
  return { ok: true };
}

export async function login() {
  await wait(400, 800);
  return newSession();
}

export async function linkPlatformAccount() {
  await wait();
  return { accountId: 'acc_' + randomInt(10000, 99999), validated: false };
}

export async function startValidation({ accountId }) {
  await wait();
  validations.set(accountId, Number((randomInt(11, 99) / 10).toFixed(1)));
  return { hash: randomUUID() };
}

// Só no modo teste: o valor que "chegou" na conta, para a página mostrar a dica.
export const mockValidationValue = (accountId) => validations.get(accountId) ?? null;

export async function finishValidation({ accountId, value }) {
  await wait(300, 700);
  const sent = validations.get(accountId);
  if (sent == null || Math.abs(Number(value) - sent) > 0.001) return { ok: false, error: 'Esse não é o valor que chegou. Confira no app e tente de novo.' };
  validations.delete(accountId);
  return { ok: true };
}

export async function createPix({ amount, ttlMinutes }) {
  await wait(400, 900);
  const chargeId = 'TESTE' + randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
  charges.set(chargeId, { status: 'pendente', amount });
  return {
    chargeId,
    copiaECola: buildMockPixPayload({ amount, txid: chargeId }),
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
}

// pendente -> pago -> creditado (as fichas caem uns segundos depois do pagamento)
export async function getCharge({ chargeId }) {
  const charge = charges.get(chargeId);
  if (!charge) return { status: 'desconhecido' };
  if (charge.status === 'pago' && Date.now() - charge.paidAt > 2500) charge.status = 'creditado';
  return { status: charge.status };
}

export function simulatePaid(chargeId) {
  const charge = charges.get(chargeId);
  if (!charge) return false;
  if (charge.status === 'pendente') {
    charge.status = 'pago';
    charge.paidAt = Date.now();
  }
  return true;
}
