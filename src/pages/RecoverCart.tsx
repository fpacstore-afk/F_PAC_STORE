import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getPublicApiUrl } from '../lib/api';
import { useCart } from '../hooks/useCart';
import type { CartItem } from '../types/cart';

export default function RecoverCart() {
  const location = useLocation();
  const navigate = useNavigate();
  const { items: currentItems, restoreItems } = useCart();
  const [result, setResult] = useState<{ items: CartItem[]; messages: string[] } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('id') || '', token = params.get('token') || '';
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setResult(null);
    if (!/^lead_[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) { setError('Link de recuperação inválido.'); return; }
    fetch(getPublicApiUrl('/api/checkout/recovery/restore'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token }), signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível recuperar sua sacola.'); return data; })
      .then(setResult).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [id, token, retry]);
  return <main className="mx-auto min-h-[60vh] max-w-2xl px-4 py-10 text-black">
    <h1 className="text-2xl font-black uppercase">Recuperar sua sacola</h1>
    <p className="mt-3 text-sm text-gray-600">Confira as peças com os preços e a disponibilidade atuais. O frete será calculado na sacola.</p>
    {error ? <div className="mt-6 space-y-4"><p role="alert">{error}</p><button type="button" className="min-h-11 border border-black px-4 font-bold" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : !result ? <p role="status" className="mt-6">Conferindo os itens da sua sacola…</p> : <>
      {result.messages.length > 0 && <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm" role="status">{result.messages.map((message, index) => <p key={index}>{message}</p>)}</div>}
      <ul className="mt-6 divide-y divide-black/10">{result.items.map((item, index) => <li key={index} className="flex items-center gap-4 py-4">{item.image && <img src={item.image} alt="" className="h-20 w-20 rounded object-cover" />}<div><p className="font-bold">{item.name}</p><p className="text-sm">{item.color} · {item.size} · {item.quantity} {item.quantity === 1 ? 'peça' : 'peças'}</p><p className="text-sm">{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por peça</p>{item.printConfigs?.length ? <p className="text-xs">{item.printConfigs.length} aplicações personalizadas recuperadas</p> : null}</div></li>)}</ul>
      {result.items.length > 0 && <>{currentItems.length > 0 && <p className="my-4 text-sm text-amber-800">Ao continuar, sua sacola atual será substituída pelas peças acima.</p>}<button type="button" className="mt-5 min-h-12 w-full rounded-xl bg-black p-4 font-bold text-[#eab308]" onClick={() => { restoreItems(result.items, id); navigate('/bag', { replace: true }); }}>{currentItems.length ? 'Substituir minha sacola e continuar' : 'Restaurar sacola e continuar'}</button></>}
    </>}
    <Link className="mt-6 inline-block py-3 text-sm underline" to="/catalog/all">Escolher outros produtos</Link>
  </main>;
}
