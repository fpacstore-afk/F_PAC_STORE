import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { getStageFromStatus } from '../constants/productionStages';
import { manualWhatsAppUrl } from '../../shared/notificationContacts';
import { getStageNotificationView, type NotificationAttempt, type NotificationSettingsSnapshot } from '../../shared/productionNotificationStatus';
import { resolveProductionStageMessage } from '../lib/productionStageMessage';

export function ProductionNotificationStatus({ order, settings, onRefresh, dark = false }: {
  order: any;
  settings: NotificationSettingsSnapshot | null;
  onRefresh?: () => void;
  dark?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState<NotificationAttempt | null>(null);
  const stage = getStageFromStatus(order.production?.status || order.productionStatus || 'waiting').id;
  const view = getStageNotificationView({ order, stage, settings, attempt });
  if (stage === 'completed' && !view.hasRecord) return null;
  const retry = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (inFlight.current || !view.canRetry) return;
    inFlight.current = true;
    setBusy(true);
    const orderId = order.id;
    try {
      const response = await authenticatedFetch('/api/automation/stage-notification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, newStageId: stage, channels: view.retryChannels })
      });
      const data = await parseApiJson<any>(response);
      if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Não foi possível enviar.');
      // A busy/skipped response contains no channel receipt and must not replace one.
      if (typeof data.whatsappSent === 'boolean' || typeof data.emailSent === 'boolean') {
        setAttempt({ orderId, stage, data });
      }
      if (data.reason) toast(data.reason);
      else if (data.whatsappStatus === 'Erro' || data.emailStatus === 'Erro') toast.error('Um dos avisos falhou. Confira os canais abaixo.');
      onRefresh?.();
    } catch (error: any) { toast.error(error.message); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const openWhatsApp = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!settings || !view.canOpenWhatsApp) return;
    try {
      const message = resolveProductionStageMessage(stage, order, undefined, settings.templates);
      window.open(manualWhatsAppUrl(view.phone, message), '_blank', 'noopener,noreferrer');
      toast('Confira a mensagem e toque em Enviar no WhatsApp.');
    } catch (error: any) { toast.error(error.message); }
  };
  return <div className={'mt-2 border-t pt-2 text-xs ' + (dark ? 'border-zinc-800 text-gray-200' : 'border-neutral-200 text-neutral-700')} aria-label="Avisos ao cliente">
    <div role="status" aria-live="polite">
      <p>WhatsApp: {view.whatsapp.label}</p>
      <p>E-mail: {view.email.label}</p>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      {view.canRetry && <button type="button" disabled={busy} onClick={retry}
        className={'min-h-11 rounded border px-3 py-2 font-bold disabled:opacity-50 ' + (dark ? 'border-amber-400 bg-amber-400 text-black' : 'border-neutral-300 bg-white')}>
        {busy ? 'Enviando avisos…' : view.hasFailure ? 'Tentar envio novamente' : 'Enviar avisos automáticos'}
      </button>}
      {view.canOpenWhatsApp && <button type="button" onClick={openWhatsApp}
        className="min-h-11 rounded border border-emerald-700 bg-emerald-700 px-3 py-2 font-bold text-white">
        Abrir WhatsApp
      </button>}
    </div>
    {view.canOpenWhatsApp && <p className="mt-1 text-[11px]">O envio manual é concluído no WhatsApp.</p>}
  </div>;
}
