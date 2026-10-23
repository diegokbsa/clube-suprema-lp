// Fichas 24h simulado. Gatilho de teste:
//   - e-mail com "+f24hexiste" -> conta já existe no Fichas 24h (faz login no lugar do cadastro)
import { randomInt, randomUUID } from 'node:crypto';
import { buildMockPixPayload } from '../lib/pix.js';

const charges = new Map();
const wait = (min = 500, max = 1200) => new Promise((r) => setTimeout(r, randomInt(min, max)));
const newSession = () => ({ userId: 'f24h_' + randomInt(100000, 999999), session: 'mock_' + randomUUID() });

export async function register({ email }) {
  await wait();
  if (email.includes('+f24hexiste')) return { exists: true };
  return newSession();
}

export async function login() {
  await wait(400, 800);
  return newSession();
}

export async function linkPlatformAccount() {
  await wait();
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
export async function getCharge(chargeId) {
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
