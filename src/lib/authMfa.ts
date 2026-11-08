import { getMultiFactorResolver, TotpMultiFactorGenerator, type Auth, type MultiFactorResolver } from 'firebase/auth';
import { authErrorCode } from './authSecurity';

export function totpFactors(resolver: Pick<MultiFactorResolver, 'hints'>) {
  return resolver.hints.filter(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}
export function mfaResolverFromError(auth: Auth, error: unknown): MultiFactorResolver | null {
  if (authErrorCode(error) !== 'auth/multi-factor-auth-required') return null;
  return getMultiFactorResolver(auth, error as any);
}
export async function completeTotpSignIn(resolver: MultiFactorResolver, factorUid: string, value: string) {
  const code = value.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code) || !totpFactors(resolver).some(factor => factor.uid === factorUid)) throw { code: 'auth/invalid-verification-code' };
  return resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(factorUid, code));
}
