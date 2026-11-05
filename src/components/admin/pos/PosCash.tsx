import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

type Session = { sessionId: string; state: 'open' | 'closed'; openingCents: number; expectedCents: number; salesCents: number; countedCents?: number; differenceCents?: number };
type Card = { requestId: string; orderId: string; saleDate: string; method: string; paidCents: number; refundedCents: number };
type Request = <T>(path: string, body?: unknown) => Promise<T>;
const base = '/api/admin/pdv';
const input = 'min-h-11 w-full rounded-md border border-black/20 px-2';
const button = 'min-h-11 rounded-md bg-[#eab308] px-3 py-2 font-bold text-black disabled:opacity-50';
const brDate = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const cents = (value: string) => /^\d{1,8}(?:[.,]\d{1,2})?$/.test(value.trim()) ? Math.round(Number(value.trim().replace(',', '.')) * 100) : null;
const blankCard = () => ({ date: brDate(), deposit: '', fee: '0', refund: '0', reference: '' });

export default function PosCash({ request, online }: { request: Request; online: boolean }) {
  const { formatMoney } = useFinancialPrivacy();
  const [session, setSession] = useState<Session | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [card, setCard] = useState<Card | null>(null);
  const [cardForm, setCardForm] = useState(blankCard);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState('close');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const display = (value: number) => formatMoney(value / 100);
  async function load() {
    const [drawer, settlement] = await Promise.all([
      request<{ current: Session | null }>(base + '/cash'),
      request<{ pending: Card[] }>(base + '/cards')
    ]);
    setSession(drawer.current); setCards(settlement.pending);
  }
  async function run(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(''); setMessage('');
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir.'); }
    finally { setPending(false); lock.current = false; }
  }
  useEffect(() => { if (online) void run(load); }, [online]);

  function saveDrawer(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const value = cents(amount);
      if (value === null) throw new Error('Informe um valor válido.');
      const kind = session?.state !== 'open' ? 'open' : action === 'close' ? 'close' : 'adjust';
      const body = { cents: value, reason, sessionId: session?.sessionId, direction: action };
      const signature = JSON.stringify([kind, body]);
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      const result = await request<{ current: Session }>(base + '/cash/' + kind, { ...body, requestId: attempt.current.id });
      setSession(result.current); setAmount(''); setReason(''); setAction('close'); attempt.current = null;
      setMessage('Operação de caixa registrada.');
    });
  }
  function saveCard(event: FormEvent) {
    event.preventDefault();
    if (!card) return;
    void run(async () => {
      const depositCents = cents(cardForm.deposit), feeCents = cents(cardForm.fee), refundCents = cents(cardForm.refund);
      if (depositCents === null || feeCents === null || refundCents === null) throw new Error('Informe os valores da conciliação.');
      await request(base + '/cards/' + card.requestId + '/settle', { date: cardForm.date, reference: cardForm.reference, depositCents, feeCents, refundCents });
      setCards(items => items.filter(item => item.requestId !== card.requestId));
      setCard(null); setCardForm(blankCard()); setMessage('Crédito da operadora conciliado.');
    });
  }
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-900">{error}</p>}
    {message && <p role="status" className="rounded bg-green-50 p-3 text-green-900">{message}</p>}
    <button type="button" disabled={!online || pending} className={button} onClick={() => void run(load)}>Atualizar caixa</button>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-lg border border-black/15 bg-white p-4">
        <h2 className="text-lg font-bold">Caixa em dinheiro</h2>
        <p className="text-sm text-neutral-700">Use a sessão quando tiver dinheiro físico. Troco, reforços e retiradas desta sessão servem à conferência da gaveta.</p>
        {session?.state === 'open' && <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>Troco inicial</dt><dd>{display(session.openingCents)}</dd></div>
          <div className="flex justify-between"><dt>Vendas em dinheiro</dt><dd>{display(session.salesCents)}</dd></div>
          <div className="flex justify-between font-bold"><dt>Dinheiro esperado</dt><dd>{display(session.expectedCents)}</dd></div>
        </dl>}
        {session?.state === 'closed' && <p className="text-sm">Último fechamento · contado {display(session.countedCents || 0)} · diferença {display(session.differenceCents || 0)}</p>}
        <form className="space-y-3" onSubmit={saveDrawer}>
          {session?.state === 'open' && <label className="block">Operação
            <select className={input} value={action} onChange={event => setAction(event.target.value)}>
              <option value="close">Fechar e conferir</option><option value="in">Reforçar caixa</option><option value="out">Retirar dinheiro</option>
            </select>
          </label>}
          <label className="block">{session?.state !== 'open' ? 'Troco inicial' : action === 'close' ? 'Valor contado' : 'Valor da movimentação'}
            <input required inputMode="decimal" className={input} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" />
          </label>
          {session?.state === 'open' && action !== 'close' && <label className="block">Motivo
            <input required maxLength={180} className={input} value={reason} onChange={event => setReason(event.target.value)} />
          </label>}
          <button type="submit" className={button} disabled={!online || pending}>{session?.state !== 'open' ? 'Abrir caixa' : action === 'close' ? 'Fechar caixa' : 'Registrar movimentação'}</button>
        </form>
      </section>
      <section className="space-y-3 rounded-lg border border-black/15 bg-white p-4">
        <h2 className="text-lg font-bold">Cartão a conciliar</h2>
        <p className="text-sm text-neutral-700">Registre o depósito da operadora após conferir o extrato. Inclua taxas e estornos que já foram descontados desse crédito.</p>
        {!cards.length && <p className="text-sm">Nenhuma venda de cartão aguardando conciliação.</p>}
        <div className="divide-y divide-black/10">{cards.map(item => <button type="button" key={item.requestId} className="block min-h-11 w-full py-2 text-left hover:bg-neutral-50" onClick={() => { setCard(item); setCardForm(blankCard()); }}>
          <strong>{item.method} · {display(item.paidCents)}</strong><div className="text-xs">{item.saleDate} · {item.requestId.slice(0, 8)}</div>
        </button>)}</div>
        {card && <form className="space-y-2 border-t border-black/10 pt-3" onSubmit={saveCard}>
          <div className="text-sm font-bold">Venda {card.requestId.slice(0, 8)} · {display(card.paidCents)}</div>
          {card.refundedCents > 0 && <p className="text-xs">Estornos no pedido: {display(card.refundedCents)}.</p>}
          {([{ key: 'deposit', title: 'Valor creditado' }, { key: 'fee', title: 'Taxa' }, { key: 'refund', title: 'Estorno descontado' }] as const).map(({ key, title }) =>
            <label className="block" key={key}>{title}
              <input required inputMode="decimal" className={input} value={cardForm[key]} onChange={event => setCardForm({ ...cardForm, [key]: event.target.value })} />
            </label>)}
          <label className="block">Data efetiva <input required type="date" className={input} max={brDate()} value={cardForm.date} onChange={event => setCardForm({ ...cardForm, date: event.target.value })} /></label>
          <label className="block">Referência do extrato <input required className={input} maxLength={120} value={cardForm.reference} onChange={event => setCardForm({ ...cardForm, reference: event.target.value })} /></label>
          <button type="submit" className={button} disabled={!online || pending}>Conciliar depósito</button>
        </form>}
      </section>
    </div>
  </div>;
}
