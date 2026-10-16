import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { isNotificationSettingsSnapshot, type NotificationSettingsSnapshot } from '../../shared/productionNotificationStatus';

// Call once per screen, then pass the snapshot to all cards. Never fetch per order.
export function useProductionNotificationSettings() {
  const [state, setState] = useState<{ data: NotificationSettingsSnapshot | null; loading: boolean; error: string }>({
    data: null, loading: true, error: ''
  });
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState({ data: null, loading: true, error: '' });
    try {
      const response = await authenticatedFetch('/api/automation/production-settings', {
        headers: { Accept: 'application/json' }, signal: controller.signal
      });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível conferir a configuração dos avisos.');
      if (!isNotificationSettingsSnapshot(data)) throw new Error('A configuração dos avisos veio incompleta. Tente novamente.');
      if (generation.current === request) setState({ data, loading: false, error: '' });
    } catch (error: any) {
      if (generation.current === request && !controller.signal.aborted) {
        setState({ data: null, loading: false, error: error.message || 'Não foi possível conferir os avisos.' });
      }
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      generation.current++;
      pending.current?.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  return { ...state, refresh };
}
