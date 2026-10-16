import React, { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/api';

export function EmailDeliveryStatus() {
  const [data, setData] = useState<any>({ deliveries: [] });
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/automation/email-deliveries');
      if (!response.ok) throw new Error();
      setData(await response.json());
    } catch { setData((previous: any) => ({ ...previous, warning: 'Não foi possível atualizar o acompanhamento dos e-mails.' })); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); const interval = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(interval); }, []);
  return <section className="border border-black/10 bg-white p-5" aria-label="Entrega dos e-mails">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-black uppercase">Entrega dos e-mails</h2><button type="button" onClick={() => void refresh()} disabled={loading} className="min-h-11 border border-black px-4 text-xs font-bold disabled:opacity-50">{loading ? 'Consultando…' : 'Atualizar entrega dos e-mails'}</button></div>
    <p className="mt-3 text-xs text-gray-600">Consulta automática a cada minuto enquanto este painel estiver aberto. Entregue significa aceito pelo servidor do destinatário; não confirma caixa de entrada ou leitura.</p>
    {data.warning && <p role="status" className="mt-3 bg-amber-50 p-3 text-sm">{data.warning}</p>}
    {data.checkedAt && <p className="mt-2 text-xs text-gray-500">Última consulta: {new Date(data.checkedAt).toLocaleString('pt-BR')}</p>}
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Envio</th><th className="p-2">Destinatário</th><th className="p-2">Mensagem</th><th className="p-2">Resultado do provedor</th></tr></thead><tbody>{data.deliveries.map((item: any) => <tr key={item.id} className="border-t border-black/10"><td className="p-2 whitespace-nowrap">{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td className="p-2">{item.recipient}</td><td className="p-2">{item.subject}</td><td className="p-2 font-bold">{item.status}</td></tr>)}</tbody></table></div>
    {!loading && data.deliveries.length === 0 && <p className="mt-3 text-sm text-gray-500">Nenhuma confirmação disponível nesta consulta.</p>}
  </section>;
}
