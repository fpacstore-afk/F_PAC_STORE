import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../server/firebase.js';
import { planAuthSecurityConfiguration, planRecaptchaAuditConfiguration, summarizeAuthSecurity } from '../server/services/authSecurityConfiguration.service.js';

if (process.env.NODE_ENV !== 'production' || process.env.FIREBASE_PROJECT_ID !== 'fpac-store62' ||
    process.env.FIREBASE_DATABASE_ID !== 'ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a') throw new Error('Unexpected authentication configuration environment.');
async function main() {
  const db = getDb();
  try {
    const manager = getAuth().projectConfigManager();
    const before = await manager.getProjectConfig();
    console.log('AUTH_SECURITY_BEFORE '+JSON.stringify(summarizeAuthSecurity(before)));
    if (process.env.AUTH_SECURITY_APPLY === 'owner-approved-20261108') await manager.updateProjectConfig(planAuthSecurityConfiguration(before));
    if (process.env.AUTH_RECAPTCHA_APPLY === 'owner-approved-audit-20261108') {
      const audit = planRecaptchaAuditConfiguration(await manager.getProjectConfig());
      if (audit.recaptchaConfig) await manager.updateProjectConfig(audit);
    }
    const after = summarizeAuthSecurity(await manager.getProjectConfig());
    console.log('AUTH_SECURITY_AFTER '+JSON.stringify(after));
    if (process.env.AUTH_RECAPTCHA_APPLY && !['AUDIT', 'ENFORCE'].includes(after.emailPasswordBotProtection)) throw new Error('Bot protection configuration was not verified.');
    if (process.env.AUTH_SECURITY_APPLY && (!after.mfaEnabled || !after.totpEnabled || !after.emailEnumerationProtection || after.minimumPasswordLength < 12 || after.passwordEnforcement !== 'ENFORCE' || after.forcePasswordUpgradeOnSignin)) throw new Error('Provider security configuration was not verified.');
  } finally { await db.terminate(); }
}
main().catch(() => { console.error('AUTH_SECURITY_FAILED: configuration could not be applied and verified using the existing runtime identity. No IAM roles or credentials were changed.'); process.exitCode = 1; });
