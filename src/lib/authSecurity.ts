export const PASSWORD_RESET_NOTICE = 'Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.';

export function authErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^auth\/[a-z-]+$/.test(code) ? code : 'auth/unknown';
}

/** Provider diagnostics and submitted account data are never customer-facing messages. */
export function authErrorMessage(error: unknown): string {
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Confira o endereço de e-mail.',
    'auth/wrong-password': 'E-mail ou senha inválidos.',
    'auth/user-not-found': 'E-mail ou senha inválidos.',
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/email-already-in-use': 'Não foi possível criar a conta. Tente entrar ou recuperar o acesso.',
    'auth/weak-password': 'Escolha uma senha mais longa e difícil de adivinhar.',
    'auth/password-does-not-meet-requirements': 'A senha não atende aos requisitos de segurança.',
    'auth/popup-blocked': 'Permita a janela de login no navegador e tente novamente.',
    'auth/popup-closed-by-user': 'Login cancelado. Você pode tentar novamente.',
    'auth/network-request-failed': 'Confira sua conexão e tente novamente.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde antes de tentar novamente.',
    'auth/multi-factor-auth-required': 'Sua conta exige uma segunda verificação. Use o método de acesso configurado para ela.',
  };
  return messages[authErrorCode(error)] || 'Não foi possível concluir o acesso. Tente novamente em instantes.';
}

export async function requestPrivatePasswordReset(email: string, send: (email: string) => Promise<void>): Promise<string> {
  try { await send(email.trim()); }
  catch (error) {
    // Older provider configurations can still return this code for absent accounts.
    if (authErrorCode(error) !== 'auth/user-not-found') throw error;
  }
  return PASSWORD_RESET_NOTICE;
}

/** Passwords, tokens and privilege flags cannot accidentally become profile fields. */
export function profileUpdateFields(data: Record<string, unknown>): Record<string, string> {
  const fields = ['name', 'email', 'phone', 'phone2', 'cpf', 'address', 'number', 'complement', 'neighborhood', 'city', 'state', 'cep'];
  return Object.fromEntries(fields.filter(field => Object.hasOwn(data, field) && typeof data[field] === 'string')
    .map(field => [field, data[field] as string]));
}
