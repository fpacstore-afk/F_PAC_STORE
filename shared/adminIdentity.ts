/** Email is an administrative fallback only after the identity provider verifies it. */
export const ADMIN_EMAILS = ['fpacstore@gmail.com', 'atendimento@fpacstore.com.br'] as const;

export function isAdminIdentity(identity: {
  uid?: string; email?: string | null; email_verified?: boolean; emailVerified?: boolean;
  admin?: unknown; role?: unknown;
} | null | undefined, allowedEmails: readonly string[] = ADMIN_EMAILS): boolean {
  if (!identity?.uid) return false;
  if (identity.admin === true || identity.role === 'admin') return true;
  const verified = identity.email_verified === true || identity.emailVerified === true;
  return verified && allowedEmails.includes((identity.email || '').trim().toLowerCase());
}
