// Camada real da Suprema. Hoje não existe API oficial: aqui entram as mesmas chamadas
// que o app faz no cadastro (contrato a levantar com os devs).
// A entrada no clube é feita pelo link oficial de convite (config.links.clubInvite).
//
// O que cada função precisa fazer:
//   createAccount({ nick, email, password })
//     -> { supremaId, emailVerificationRequired } ou { exists: true } se o e-mail já tem conta
//   verifyEmail({ supremaId, email, code })      -> { ok } ou { ok: false, error }
//   resendEmailCode({ supremaId, email })        -> { ok }
//   linkExistingAccount({ supremaId, email })    -> { ok } (confere se o ID existe)

export const MOCK_EMAIL_CODE = null;

function notReady(what) {
  throw new Error(`Integração real da Suprema ainda não configurada (${what}).`);
}

export async function createAccount() { notReady('criar conta'); }
export async function verifyEmail() { notReady('confirmar e-mail'); }
export async function resendEmailCode() { notReady('reenviar código'); }
export async function linkExistingAccount() { notReady('vincular conta existente'); }
