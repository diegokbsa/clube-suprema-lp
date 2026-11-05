// Suprema "pelo app": sem API da Suprema, o próprio jogador cria a conta no app aberto pelo link oficial do clube
// (config.links.clubInvite, que já o coloca no clube 10001 com o agente 1439098) e informa o ID do jogador na página.
// O orquestrador pede esse ID com o passo "entrar_clube"; aqui só confirmamos o formato.

export const MOCK_EMAIL_CODE = null;
export const VIA_APP = true;

export async function createAccount() {
  return { viaApp: true };
}

export async function verifyEmail() {
  return { ok: true };
}

export async function resendEmailCode() {
  return { ok: true };
}

export async function linkExistingAccount({ supremaId }) {
  if (!/^\d{4,12}$/.test(String(supremaId))) throw new Error('ID da Suprema inválido.');
  return { ok: true };
}
