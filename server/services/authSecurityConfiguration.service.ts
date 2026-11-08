import type { ProjectConfig, UpdateProjectConfigRequest } from 'firebase-admin/auth';

export function summarizeAuthSecurity(config: Pick<ProjectConfig, 'multiFactorConfig' | 'passwordPolicyConfig' | 'emailPrivacyConfig' | 'recaptchaConfig'>) {
  return { status: 'verified', mfaEnabled: config.multiFactorConfig?.state === 'ENABLED',
    totpEnabled: Boolean(config.multiFactorConfig?.providerConfigs?.some(provider => provider.state === 'ENABLED' && provider.totpProviderConfig)),
    emailEnumerationProtection: config.emailPrivacyConfig?.enableImprovedEmailPrivacy === true,
    passwordEnforcement: config.passwordPolicyConfig?.enforcementState || 'OFF',
    minimumPasswordLength: config.passwordPolicyConfig?.constraints?.minLength || 6,
    forcePasswordUpgradeOnSignin: config.passwordPolicyConfig?.forceUpgradeOnSignin === true,
    emailPasswordBotProtection: config.recaptchaConfig?.emailPasswordEnforcementState || 'OFF',
    recaptchaKeyConfigured: Boolean(config.recaptchaConfig?.recaptchaKeys?.length) };
}

/** Existing account factors, sign-in providers and user records are never changed. */
export function planAuthSecurityConfiguration(config: Pick<ProjectConfig, 'multiFactorConfig' | 'passwordPolicyConfig' | 'emailPrivacyConfig' | 'recaptchaConfig'>): UpdateProjectConfigRequest {
  const mfa = config.multiFactorConfig;
  const password = config.passwordPolicyConfig;
  if (password?.forceUpgradeOnSignin) throw new Error('Existing forced password policy requires manual review before changing its minimum.');
  const minimum = Math.max(12, password?.constraints?.minLength || 6);
  if ((password?.constraints?.maxLength || 4096) < minimum) throw new Error('Password length limits require manual review.');
  return {
    multiFactorConfig: { state: 'ENABLED', factorIds: mfa?.state === 'ENABLED' ? mfa.factorIds || [] : [],
      providerConfigs: [...(mfa?.providerConfigs || []).filter(provider => !provider.totpProviderConfig),
        { state: 'ENABLED', totpProviderConfig: { adjacentIntervals: Math.min(1, mfa?.providerConfigs?.find(provider => provider.totpProviderConfig)?.totpProviderConfig?.adjacentIntervals ?? 1) } }] },
    passwordPolicyConfig: { enforcementState: 'ENFORCE', forceUpgradeOnSignin: false,
      constraints: { ...password?.constraints, minLength: minimum } },
    emailPrivacyConfig: { enableImprovedEmailPrivacy: true },
    // reCAPTCHA is intentionally absent: enabling it accepts separate terms and can incur charges.
  };
}

/** Prepared for a separate, explicit owner approval of reCAPTCHA terms and usage billing. */
export function planRecaptchaAuditConfiguration(config: Pick<ProjectConfig, 'recaptchaConfig'>): UpdateProjectConfigRequest {
  if (['AUDIT', 'ENFORCE'].includes(config.recaptchaConfig?.emailPasswordEnforcementState || '')) return {};
  return { recaptchaConfig: { ...config.recaptchaConfig, emailPasswordEnforcementState: 'AUDIT' } };
}
