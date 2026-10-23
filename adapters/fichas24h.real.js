// Camada real do Fichas 24h. Endereços vistos no app web (app.fichas24horas.com.br),
// que fala com https://apis.fichas24horas.com.br e usa autenticação Supabase:
//   POST /users_app/register            cria o usuário
//   /user_plataforms_accounts           vincula a conta da plataforma (Suprema = id 10)
//   /paymentQRCode                      gera a cobrança PIX
//   GET  /users_app/me/transactions     histórico, para saber se o PIX caiu
//   /start-validation, /finish-validation  validação de conta (KYC)
//   /login/refresh-from-cookie          renova a sessão
// Os campos e as respostas exatas precisam ser confirmados com o time do Fichas 24h.
//
// O que cada função precisa fazer:
//   register({ nick, email, cpf, birth, phone, password }) -> { userId, session } ou { exists: true }
//   login({ email, password })                            -> { userId, session }
//   linkPlatformAccount({ session, supremaId, clubId, agentId }) -> { ok }
//   createPix({ session, amount, ttlMinutes })            -> { chargeId, copiaECola, expiresAt }
//   getCharge(chargeId)                                   -> { status: 'pendente' | 'pago' | 'creditado' | 'desconhecido' }

function notReady(what) {
  throw new Error(`Integração real do Fichas 24h ainda não configurada (${what}).`);
}

export async function register() { notReady('criar conta'); }
export async function login() { notReady('login'); }
export async function linkPlatformAccount() { notReady('vincular ID da Suprema'); }
export async function createPix() { notReady('gerar PIX'); }
export async function getCharge() { notReady('consultar PIX'); }
export function simulatePaid() { return false; }
