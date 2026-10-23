// Suprema simulada, para testar o fluxo sem a camada real.
// Gatilhos de teste:
//   - e-mail com "+existe"  -> conta já existe na Suprema (pede o ID do jogador)
//   - apelido com "falha"   -> a primeira tentativa falha (testa a nova tentativa automática)
import { randomInt } from 'node:crypto';

export const MOCK_EMAIL_CODE = '123456';

const failedOnce = new Set();
const wait = (min = 500, max = 1300) => new Promise((r) => setTimeout(r, randomInt(min, max)));

export async function createAccount({ nick, email }) {
  await wait();
  if (/falha/i.test(nick) && !failedOnce.has(email)) {
    failedOnce.add(email);
    throw new Error('A Suprema não respondeu (falha simulada).');
  }
  if (email.includes('+existe')) return { exists: true };
  return { supremaId: String(randomInt(1_000_000, 9_999_999)), emailVerificationRequired: true };
}

export async function verifyEmail({ code }) {
  await wait(300, 700);
  if (code !== MOCK_EMAIL_CODE) return { ok: false, error: 'Código incorreto.' };
  return { ok: true };
}

export async function resendEmailCode() {
  await wait(300, 600);
  return { ok: true };
}

export async function linkExistingAccount() {
  await wait();
  return { ok: true };
}
