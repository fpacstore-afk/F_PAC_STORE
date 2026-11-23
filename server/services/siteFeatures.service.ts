import { getDb } from '../firebase.js';

export type SiteFeatures = { clubEnabled: boolean; signupBonusEnabled: boolean; signupBonusStartedAt: string };
const ref = () => getDb().collection('settings').doc('site_features');

// The first public read establishes the campaign start. Existing accounts do not
// silently receive a new-account promotion when this release is deployed.
export async function getSiteFeatures(): Promise<SiteFeatures> {
  const snapshot = await ref().get();
  if (snapshot.exists) {
    const data = snapshot.data() || {};
    return { clubEnabled: data.clubEnabled === true, signupBonusEnabled: data.signupBonusEnabled !== false,
      signupBonusStartedAt: String(data.signupBonusStartedAt || '') };
  }
  const defaults: SiteFeatures = { clubEnabled: false, signupBonusEnabled: true, signupBonusStartedAt: new Date().toISOString() };
  try { await ref().create(defaults); return defaults; }
  catch { const current = (await ref().get()).data() || {}; return {
    clubEnabled: current.clubEnabled === true, signupBonusEnabled: current.signupBonusEnabled !== false,
    signupBonusStartedAt: String(current.signupBonusStartedAt || '')
  }; }
}

export async function setClubEnabled(enabled: boolean, actor: string): Promise<SiteFeatures> {
  await getSiteFeatures();
  await ref().update({ clubEnabled: enabled, updatedAt: new Date().toISOString(), updatedBy: actor });
  return getSiteFeatures();
}
