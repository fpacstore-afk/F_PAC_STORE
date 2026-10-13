import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { getStageFromStatus } from '../constants/productionStages';

export function ProductionNotificationStatus({ order, onRefresh }: { order: any; onRefresh?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState<any>(null);
  const stage = getStageFromStatus(order.production?.status || order.productionStatus || 'waiting').id;
  const saved = order.sentStageNotifications?.[stage];
  const log = order.notificationLogs?.find((entry: any) => entry.stageId === stage);
  const result = attempt?.stage === stage ? attempt : saved || log;
  if (stage === 'completed' && !result) return null;
  const retry = async () => {
    setBusy(true);
    try {
      const response = await authenticatedFetch('/api/automation/stage-notification', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, newStageId: stage })
      });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.message || data.error || 'Não foi possível enviar.');
      setAttempt({ ...data, stage });
      if (data.reason) toast(data.reason);
      onRefresh?.();
    } catch (error: any) { toast.error(error.message); }
    finally { setBusy(false); }
  };
  return <div className="mt-2 border-t border-neutral-200 pt-2 text-[10px] text-neutral-700" aria-label="Avisos ao cliente">
    <p>WhatsApp: {result?.whatsappSent ? 'Enviado' : result?.whatsappStatus || 'Sem envio registrado'}</p>
    <p>E-mail: {result?.emailSent ? 'Enviado' : result?.emailStatus || 'Sem envio registrado'}</p>
    {(!result?.whatsappSent || !result?.emailSent) && <button type="button" disabled={busy} onClick={retry}
      className="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 font-bold disabled:opacity-50">
      {busy ? 'Enviando avisos…' : 'Enviar avisos pendentes'}
    </button>}
  </div>;
}
