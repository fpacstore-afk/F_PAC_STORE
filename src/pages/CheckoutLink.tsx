import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getPublicApiUrl } from '../lib/api';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import type { CartItem } from '../types/cart';

export default function CheckoutLink() {
  const location = useLocation(), navigate = useNavigate();
  const { user } = useAuth();
  const { items: currentItems, restoreItems, updateCustomer, setPaymentMethod } = useCart();
  const [data, setData] = useState<{ id: string; items: CartItem[]; customer: { name: string; email: string; phone: string } } | null>(null);
  const [error, setError] = useState('');
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('id') || '', token = params.get('token') || '';
  useEffect(() => {
    const controller = new AbortController();
    if (!/^link_[a-f0-9]{32}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) { setError('Link inválido. Solicite outro à loja.'); return; }
    fetch(getPublicApiUrl('/api/checkout-links/open'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token }), signal: controller.signal })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Link indisponível.'); return payload; })
      .then(setData).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [id, token]);
  return <main className="mx-auto min-h-[70vh] max-w-2xl px-4 py-10 text-black">
    <h1 className="text-3xl font-black">Seu pedido F PAC está pronto</h1>
    <p className="mt-2 text-sm text-gray-600">Revise as peças e finalize no site. Preço, frete e disponibilidade serão confirmados antes do pagamento.</p>
    {error ? <p role="alert" className="mt-6 rounded bg-red-50 p-4">{error}</p> : !data ? <p role="status" className="mt-6">Conferindo o pedido…</p> : <>
      <ul className="mt-5 divide-y">{data.items.map((item, i) => <li key={i} className="flex gap-4 py-3">{item.image && <img src={item.image} alt="" className="h-20 w-16 object-cover" />}<div><b>{item.name}</b><p className="text-sm">{item.color} · {item.size} · {item.quantity} peça(s)</p><p className="text-sm">{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por peça</p></div></li>)}</ul>
      <p className="mt-3 rounded bg-amber-50 p-3 text-sm">Cashback da compra: apenas para cliente com conta, produto do catálogo e pagamento por Pix. O crédito entra após a entrega confirmada. Você pode escolher usar seu saldo disponível no checkout.</p>
      {!user && <p className="mt-3 text-sm"><Link className="font-bold underline" to="/account?mode=register">Criar conta e ganhar R$ 5 sem vencimento</Link> antes de pagar para receber também o cashback da compra. Depois, retorne a este link.</p>}
      {currentItems.length > 0 && <p className="mt-4 text-sm text-amber-800">Continuar substituirá os itens da sacola atual.</p>}
      <button type="button" className="mt-5 min-h-12 w-full rounded bg-black p-3 font-black text-[#eab308]" onClick={() => {
        restoreItems(data.items, id);
        updateCustomer({ name: data.customer.name || '', email: data.customer.email || user?.email || '', phone: data.customer.phone || '' });
        setPaymentMethod('PIX');
        sessionStorage.setItem('fpac_checkout_link', JSON.stringify({ id, token }));
        navigate('/bag');
      }}>Continuar para entrega e pagamento</button>
    </>}
  </main>;
}
