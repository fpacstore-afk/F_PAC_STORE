import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authenticatedFetch, parseApiJson } from '../lib/api';

type Credit = { id: string; source: string; status: string; originalCents: number; remainingCents: number; expiresAt?: string | null };
type Wallet = { availableCents: number; pendingCents: number; heldCents: number; debtCents: number; credits: Credit[] };
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CashbackWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    void authenticatedFetch('/api/cashback/wallet').then(async response => {
      const payload = await parseApiJson<Wallet & { error?: string }>(response);
      if (!response.ok) throw new Error(payload.error || 'Saldo indisponível.');
      if (active) setWallet(payload);
    }).catch(() => { if (active) setError('Não foi possível consultar o saldo. Tente novamente mais tarde.'); });
    return () => { active = false; };
  }, [user]);
  return <section className="mt-6 rounded-xl border-2 border-[#eab308] bg-white p-5" aria-labelledby="cashback-title">
    <h2 id="cashback-title" className="text-xl font-black">Meu cashback F PAC</h2>
    {error ? <p role="alert" className="mt-3 text-sm">{error}</p> : !wallet ? <p role="status" className="mt-3 text-sm">Consultando saldo…</p> : <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <p className="rounded-lg bg-[#eab308] p-4"><span className="block text-sm font-bold">Disponível</span><strong className="text-2xl">{money(wallet.availableCents)}</strong></p>
        <p className="rounded-lg bg-gray-100 p-4"><span className="block text-sm font-bold">Pendente</span><strong className="text-2xl">{money(wallet.pendingCents)}</strong></p>
        <p className="rounded-lg bg-gray-100 p-4"><span className="block text-sm font-bold">Em pagamento</span><strong className="text-2xl">{money(wallet.heldCents)}</strong></p>
      </div>
      {wallet.debtCents > 0 && <p className="mt-3 rounded bg-amber-50 p-3 text-sm">Há {money(wallet.debtCents)} de crédito usado em uma compra depois devolvida. Os próximos créditos de compra abatem esse valor antes de ficar disponíveis.</p>}
      <p className="mt-4 text-sm">O bônus único de R$ 5 ao criar a conta não vence e fica disponível após confirmar seu e-mail. Apenas compras por link pagas por Pix, com conta e itens do catálogo, geram cashback: 2% a partir de R$ 60, 3% a partir de R$ 150 ou 4% a partir de R$ 250 em produtos após descontos, limitado a R$ 20 por compra. Personalizados não participam. O crédito entra assim que a entrega for confirmada e vale por 180 dias. Em cancelamento, devolução ou reembolso, o crédito da compra é estornado. Para usar no próximo pedido por link e Pix, o pedido deve ter ao menos R$ 60 em produtos; o uso fica limitado a 10% dos produtos e R$ 20 por pedido.</p>
      <h3 className="mt-5 font-bold">Histórico de créditos</h3>
      <ul className="mt-2 divide-y divide-gray-200 text-sm">{wallet.credits.map(credit => <li key={credit.id} className="flex flex-wrap justify-between gap-2 py-3"><span>{credit.source === 'signup' ? 'Boas-vindas' : 'Compra'} · {credit.status === 'available' ? 'Disponível' : credit.status === 'pending' ? 'Aguardando entrega' : credit.status === 'pending_verification' ? 'Aguardando confirmação de e-mail' : credit.status === 'expired' ? 'Vencido' : credit.status === 'reversed' ? 'Estornado' : credit.status}</span><span className="font-bold">{money(credit.originalCents)}{credit.expiresAt ? ` · vence ${new Date(credit.expiresAt).toLocaleDateString('pt-BR')}` : credit.source === 'signup' ? ' · sem vencimento' : ' · prazo começa na entrega'}</span></li>)}</ul>
    </>}
  </section>;
}
