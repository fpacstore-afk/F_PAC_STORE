import { useSyncExternalStore } from 'react';
import { CAMPAIGN_1111_END, CAMPAIGN_1111_START, isCampaign1111Active } from '../../shared/campaign1111';

function subscribe(onChange: () => void) {
  const now = Date.now();
  const timers = [CAMPAIGN_1111_START, CAMPAIGN_1111_END]
    .map(boundary => boundary - now)
    .filter(delay => delay > 0 && delay <= 2_147_483_647)
    .map(delay => window.setTimeout(onChange, delay));
  document.addEventListener('visibilitychange', onChange);
  return () => {
    timers.forEach(timer => window.clearTimeout(timer));
    document.removeEventListener('visibilitychange', onChange);
  };
}

export function useCampaign1111Active() {
  return useSyncExternalStore(subscribe, isCampaign1111Active, () => false);
}
