// Camada real do Fichas 24h. Usa as mesmas chamadas do app web (app.fichas24horas.com.br, Flutter), lidas no
// main.dart.js em 05/11/2026 (docs/integracao-fichas24h.md):
//   Supabase (login):  POST {supabase}/auth/v1/token?grant_type=password|refresh_token, /auth/v1/verify, /auth/v1/resend
//   API:               POST /users_app/register            { name, birthday, inscription (CPF), phone, email, password, confirmation_password }
//                      GET  /clubs/public/list?platform=10  (acha o id interno do clube 10001)
//                      POST /user_plataforms_accounts       { id_club, player_id, description }
//                      POST /user_plataforms_accounts/:id/start-validation   -> { hash } (o Fichas manda fichas para a conta)
//                      POST /user_plataforms_accounts/:id/finish-validation  { value } (o valor que o jogador recebeu)
//                      GET  /auto-attendance-items/list     (itens do auto-atendimento)
//                      POST /auto-attendance/sendApp        { idUserAccount, value, sendType: 'vip', paymentType: 'fichas', itemId, itemQuantity }
//                      GET  /users_app/me/transactions      (para saber se o PIX caiu)
// Só ligar (F24H_MODE=real) com o OK formal da Sayplus e o IP do servidor liberado (docs/pedido-devs.md).
// Os pontos marcados CONFERIR dependem da resposta real, que ainda não vimos.
import { config } from '../config.js';

const { apiBase, supabaseUrl, supabaseAnonKey, platformId } = config.fichas24h;
const TIMEOUT_MS = 20_000;

class F24hError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Formato da resposta sem os valores: { campo: tipo }, listas pelo 1º item. Mensagens de erro curtas aparecem inteiras.
function shape(v, depth = 0) {
  if (Array.isArray(v)) return `[${v.length}× ${v.length ? shape(v[0], depth + 1) : ''}]`;
  if (v && typeof v === 'object') {
    if (depth > 2) return '{…}';
    return `{${Object.entries(v).map(([k, x]) => `${k}:${/message|msg|error|status|code|type|validated|situation/i.test(k) && typeof x !== 'object' ? JSON.stringify(x).slice(0, 80) : shape(x, depth + 1)}`).join(', ')}}`;
  }
  return typeof v;
}

function messageFrom(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  return body.message || body.msg || body.error_description || body.error || fallback;
}

async function call(url, { method = 'GET', body, token, headers = {}, query } = {}) {
  const full = new URL(url);
  for (const [k, v] of Object.entries(query || {})) full.searchParams.set(k, String(v));
  const res = await fetch(full, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  // F24H_DEBUG=1: registra o formato das respostas (só os nomes dos campos e o status, nunca token ou dados pessoais).
  if (process.env.F24H_DEBUG) console.log(`[f24h] ${method} ${full.pathname} -> ${res.status} ${shape(data)}`);
  // 403 em texto (não JSON) é o firewall do Fichas 24h barrando o nosso servidor: só a Sayplus libera (IP do servidor).
  if (res.status === 403 && typeof data !== 'object') {
    throw new F24hError('O Fichas 24h ainda não liberou o nosso servidor. Fale com o suporte 24h para terminar sua compra de fichas.', 403, data);
  }
  if (!res.ok) throw new F24hError(messageFrom(data, `Fichas 24h respondeu ${res.status}.`), res.status, data);
  return data;
}

const auth = (path, opts = {}) => call(`${supabaseUrl}/auth/v1${path}`, { ...opts, headers: { apikey: supabaseAnonKey, ...opts.headers } });
const api = (path, session, opts = {}) => call(`${apiBase}${path}`, { ...opts, token: session?.accessToken });
const data = (body) => (body && typeof body === 'object' && 'data' in body ? body.data : body);

function toSession(tok) {
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: tok.expires_at ? tok.expires_at * 1000 : Date.now() + (tok.expires_in || 3600) * 1000,
    userId: tok.user?.id || null,
  };
}

// Renova o token quando faltar menos de 1 minuto (o orquestrador guarda a sessão só em memória).
async function fresh(session) {
  if (!session) throw new F24hError('Sessão do Fichas 24h ausente.', 401);
  if (session.expiresAt - Date.now() > 60_000) return session;
  const tok = await auth('/token', { method: 'POST', query: { grant_type: 'refresh_token' }, body: { refresh_token: session.refreshToken } });
  return Object.assign(session, toSession(tok));
}

const isoBirth = (birth) => String(birth || '').slice(0, 10); // CONFERIR: o app pode mandar dd/mm/aaaa
const digits = (v) => String(v ?? '').replace(/\D/g, '');

export async function register({ name, email, cpf, birth, phone, password }) {
  try {
    await api('/users_app/register', null, {
      method: 'POST',
      body: {
        name,
        birthday: isoBirth(birth),
        inscription: digits(cpf),
        phone: digits(phone),
        email: String(email).trim().toLowerCase(),
        password,
        confirmation_password: password,
      },
    });
  } catch (err) {
    // CONFERIR: texto/código exato de "e-mail ou CPF já cadastrado".
    if (err.status === 409 || /j[aá] (cadastrad|existe)|already/i.test(err.message)) return { exists: true };
    throw err;
  }
  // O cadastro manda um código para o e-mail (tela "Verificação de email" do app).
  return { emailVerificationRequired: true };
}

export async function verifyEmail({ email, code }) {
  try {
    const tok = await auth('/verify', { method: 'POST', body: { type: 'signup', email: String(email).toLowerCase(), token: String(code) } });
    return { ok: true, session: tok?.access_token ? toSession(tok) : null };
  } catch (err) {
    return { ok: false, error: err.status === 400 || err.status === 403 ? 'Código incorreto ou vencido.' : err.message };
  }
}

export async function resendEmailCode({ email }) {
  await auth('/resend', { method: 'POST', body: { type: 'signup', email: String(email).toLowerCase(), gotrue_meta_security: { captcha_token: null } } });
  return { ok: true };
}

export async function login({ email, password }) {
  const tok = await auth('/token', {
    method: 'POST',
    query: { grant_type: 'password' },
    body: { email: String(email).toLowerCase(), password, gotrue_meta_security: { captcha_token: null } },
  });
  const session = toSession(tok);
  return { userId: session.userId, session };
}

// Id interno do clube 10001 no Fichas 24h (o app manda id_club, não o número do clube).
let clubCache = config.fichas24h.clubId || null;
async function internalClubId(session, clubNumber) {
  if (clubCache) return clubCache;
  const list = data(await api('/clubs/public/list', session, { query: { platform: platformId } })) || [];
  const club = list.find((c) => String(c.external_club_id ?? c.club ?? c.externalClubId) === String(clubNumber));
  if (!club) throw new F24hError(`Clube ${clubNumber} não encontrado no Fichas 24h. Defina F24H_CLUB_ID.`, 404);
  clubCache = club.id;
  return clubCache;
}

async function findAccount(session, supremaId) {
  const list = data(await api('/user_plataforms_accounts', session)) || [];
  return list.find((a) => String(a.player_id) === String(supremaId)) || null;
}

export async function linkPlatformAccount({ session, supremaId, clubId }) {
  const s = await fresh(session);
  const existing = await findAccount(s, supremaId);
  if (existing) return { accountId: existing.id, validated: Boolean(existing.validated) };
  const created = data(await api('/user_plataforms_accounts', s, {
    method: 'POST',
    body: { id_club: await internalClubId(s, clubId), player_id: String(supremaId), description: 'Clube Suprema' },
  }));
  const account = created?.id ? created : await findAccount(s, supremaId);
  if (!account) throw new F24hError('O Fichas 24h não confirmou o vínculo da conta.', 502);
  return { accountId: account.id, validated: Boolean(account.validated) };
}

// O Fichas 24h manda umas fichas para a conta da Suprema; o jogador informa quanto chegou.
export async function startValidation({ session, accountId }) {
  const res = data(await api(`/user_plataforms_accounts/${encodeURIComponent(accountId)}/start-validation`, await fresh(session), { method: 'POST', body: {} }));
  if (!res?.hash) throw new F24hError('Resposta inválida do Fichas 24h ao iniciar a validação.', 502);
  return { hash: res.hash };
}

export async function finishValidation({ session, accountId, value }) {
  try {
    await api(`/user_plataforms_accounts/${encodeURIComponent(accountId)}/finish-validation`, await fresh(session), { method: 'POST', body: { value: Number(value) } });
    return { ok: true };
  } catch (err) {
    if (err.status >= 400 && err.status < 500) return { ok: false, error: 'Esse não é o valor que chegou. Confira no app e tente de novo.' };
    throw err;
  }
}

let itemCache = config.fichas24h.itemId || null;
async function chipsItemId(session) {
  if (itemCache) return itemCache;
  const items = data(await api('/auto-attendance-items/list', session)) || [];
  const item = items.find((i) => i.active !== false) || items[0];
  if (!item) throw new F24hError('Nenhum item de fichas disponível no Fichas 24h. Defina F24H_ITEM_ID.', 502);
  itemCache = item.id;
  return itemCache;
}

// CONFERIR: nomes dos campos do PIX na resposta. Procura o copia e cola nos nomes mais comuns (Asaas usa "payload").
function findPixCode(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  for (const key of ['payload', 'copiaECola', 'copia_e_cola', 'pixCopiaECola', 'qrCode', 'qr_code', 'brCode', 'emv']) {
    if (typeof obj[key] === 'string' && obj[key].startsWith('000201')) return obj[key];
  }
  for (const value of Object.values(obj)) {
    if (typeof value === 'string' && value.startsWith('000201')) return value;
    const found = findPixCode(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export async function createPix({ session, accountId, amount, ttlMinutes }) {
  const s = await fresh(session);
  const res = data(await api('/auto-attendance/sendApp', s, {
    method: 'POST',
    body: { idUserAccount: accountId, value: amount, sendType: 'vip', paymentType: 'fichas', itemId: await chipsItemId(s), itemQuantity: 1 },
  }));
  const copiaECola = findPixCode(res);
  if (!copiaECola) throw new F24hError('O Fichas 24h não devolveu o código PIX.', 502, res);
  return {
    chargeId: String(res.id ?? res.transactionId ?? res.transaction_id ?? res.paymentId ?? copiaECola.slice(-25)),
    copiaECola,
    expiresAt: res.expirationDate || res.expires_at || new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
}

// CONFERIR: status das transações. Mapeia os nomes mais prováveis (Asaas: PENDING, RECEIVED, CONFIRMED).
export async function getCharge({ session, chargeId }) {
  const list = data(await api('/users_app/me/transactions', await fresh(session), { query: { page: 1, itemsPerPage: 20 } })) || [];
  const tx = list.find((t) => [t.id, t.transaction_id, t.payment_id, t.paymentId].map(String).includes(String(chargeId)));
  if (!tx) return { status: 'pendente' };
  const st = String(tx.status || tx.situation || '').toLowerCase();
  if (/credit|conclu|finaliz|enviad|sent|done|success/.test(st)) return { status: 'creditado' };
  if (/pag|paid|received|confirm|aprov/.test(st)) return { status: 'pago' };
  if (/expir|cancel|refund|estorn|fail|falh/.test(st)) return { status: 'desconhecido' };
  return { status: 'pendente' };
}

export function simulatePaid() { return false; }
