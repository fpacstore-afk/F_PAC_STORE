import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { correctRecordedPayment } from '../../../services/orders/orderService';
import { getOrderPaidAmount, getOrderTotal } from '../../../../shared/orderFinancialCore';
import { paymentCorrectionRevision } from '../../../../shared/paymentCorrection';
import { parseCurrencyInput } from '../../../../shared/currencyInput';
import { FinancialPrivacyToggle, useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

export function PaymentCorrectionForm({ order, onUpdated, onClose }: {
  order: any; onUpdated: (patch: any) => void; onClose: () => void;
}) {
  const { formatMoney } = useFinancialPrivacy();
  const baseline = useRef({ paid: getOrderPaidAmount(order), total: getOrderTotal(order), revision: paymentCorrectionRevision(order) }).current;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const value = parseCurrencyInput(amount);
  const valid = amount.trim() !== '' && Number.isFinite(value) && value >= 0 && value < baseline.paid && value <= baseline.total;
  const changed = () => { setKey(crypto.randomUUID()); setConfirmed(false); };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !confirmed || reason.trim().length < 5 || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await correctRecordedPayment(order.id, { correctedPaidAmount: value, reason: reason.trim(),
        expectedRevision: baseline.revision, confirmed: true, idempotencyKey: key });
      onUpdated(result.order);
      toast.success('Valor recebido corrigido; o saldo devedor foi recalculado.');
      onClose();
    } catch (error: any) { toast.error(error.message || 'Atualize o pedido e confira os valores.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <form onSubmit={submit} className="border border-amber-300 bg-amber-50 p-4 space-y-4 text-xs">
    <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black">Corrigir valor recebido</h3><FinancialPrivacyToggle /></div>
    <p>Use quando uma baixa manual foi lançada por engano. Informe o <strong>total realmente recebido até agora</strong>, somando todos os pagamentos válidos.</p>
    <p>Esta correção preserva o total do pedido e o histórico. Não envia dinheiro ao cliente. Para uma devolução real, use Reembolso.</p>
    <div className="grid grid-cols-2 gap-3"><div>Total do pedido<strong className="block">{formatMoney(baseline.total)}</strong></div><div>Recebido registrado<strong className="block">{formatMoney(baseline.paid)}</strong></div></div>
    <label className="block font-bold">Total recebido correto (R$)
      <input type="text" inputMode="decimal" autoComplete="off" autoFocus required disabled={busy} value={amount}
        aria-label="Total recebido correto em reais" onChange={event => {setAmount(event.target.value); changed();}}
        placeholder="Ex.: 570,00" className="mt-1 w-full border border-amber-300 bg-white p-3 text-base" />
    </label>
    {amount && !valid && <p role="alert" className="text-red-700">Informe um total entre zero e o recebido registrado, menor que o valor atual. Novos recebimentos devem ser registrados em Pagamento.</p>}
    {valid && <div aria-live="polite" className="bg-white border border-amber-200 p-3 space-y-1">
      <p>Recebido após a correção: <strong>{formatMoney(value)}</strong></p>
      <p>Baixa lançada a mais: <strong>{formatMoney(baseline.paid - value)}</strong></p>
      <p>Saldo a cobrar: <strong>{formatMoney(Math.max(0, baseline.total - value))}</strong></p>
    </div>}
    <p className="text-gray-600">Na apuração por data, o ajuste retira primeiro valores sem data confirmada e depois os lançamentos mais recentes. As datas dos recebimentos mantidos são preservadas.</p>
    <label className="block font-bold">Motivo da correção
      <textarea required minLength={5} maxLength={500} disabled={busy} value={reason} aria-label="Motivo da correção do recebimento"
        onChange={event=>{setReason(event.target.value);changed();}} placeholder="Ex.: marquei como quitado por engano; recebi apenas a entrada."
        className="mt-1 w-full border border-amber-300 bg-white p-3" />
    </label>
    <label className="flex gap-2 items-start"><input type="checkbox" required disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />Conferi o total efetivamente recebido e confirmo o saldo restante.</label>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy} onClick={onClose} className="border border-gray-300 bg-white p-3 font-bold">Cancelar</button>
      <button type="submit" disabled={busy || !valid || !confirmed || reason.trim().length < 5} className="bg-black text-yellow-400 p-3 font-black disabled:opacity-40">{busy ? 'Salvando correção...' : 'Confirmar correção do recebimento'}</button>
    </div>
  </form>;
}
