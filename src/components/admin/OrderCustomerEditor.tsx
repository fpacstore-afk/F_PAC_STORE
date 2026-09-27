import React, { useState } from 'react';
import toast from 'react-hot-toast';

export interface OrderCustomerDetails {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

export function OrderCustomerEditor({ order, onSave }: {
  order: Partial<OrderCustomerDetails> & { id: string };
  onSave: (orderId: string, details: OrderCustomerDetails) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<OrderCustomerDetails>({ customerName: '', customerPhone: '', customerEmail: '' });

  const startEditing = () => {
    setDraft({
      customerName: order.customerName || '',
      customerPhone: order.customerPhone || '',
      customerEmail: order.customerEmail || '',
    });
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const details = {
      customerName: draft.customerName.trim(),
      customerPhone: draft.customerPhone.trim(),
      customerEmail: draft.customerEmail.trim(),
    };
    if (!details.customerName) { toast.error('Informe o nome do comprador.'); return; }
    if (details.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.customerEmail)) {
      toast.error('Informe um e-mail válido ou deixe o campo vazio.'); return;
    }
    setSaving(true);
    try {
      await onSave(order.id, details);
      setEditing(false);
      toast.success('Dados do comprador atualizados.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar os dados do comprador.');
    } finally { setSaving(false); }
  };

  if (!editing) return <button type="button" onClick={startEditing} className="min-h-10 border border-black/20 px-3 py-2 text-xs font-bold hover:bg-amber-50">Editar dados do comprador</button>;

  return <form onSubmit={save} className="space-y-3 border border-amber-300 bg-amber-50 p-3 text-xs">
    <p className="font-bold">Dados do comprador neste pedido</p>
    <fieldset disabled={saving} className="space-y-3">
      <label className="block">Nome do comprador
        <input required maxLength={200} autoComplete="off" value={draft.customerName} onChange={event => setDraft(current => ({ ...current, customerName: event.target.value }))} className="mt-1 w-full border border-black/20 bg-white p-2 text-black" />
      </label>
      <label className="block">Telefone do comprador
        <input type="tel" maxLength={40} autoComplete="off" value={draft.customerPhone} onChange={event => setDraft(current => ({ ...current, customerPhone: event.target.value }))} className="mt-1 w-full border border-black/20 bg-white p-2 text-black" />
      </label>
      <label className="block">E-mail do comprador
        <input type="email" maxLength={254} autoComplete="off" value={draft.customerEmail} onChange={event => setDraft(current => ({ ...current, customerEmail: event.target.value }))} className="mt-1 w-full border border-black/20 bg-white p-2 text-black" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="min-h-10 bg-black px-3 py-2 font-bold text-white">{saving ? 'Salvando...' : 'Salvar dados do comprador'}</button>
        <button type="button" onClick={() => setEditing(false)} className="min-h-10 border border-black/20 px-3 py-2">Cancelar</button>
      </div>
    </fieldset>
  </form>;
}
