import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Barcode, Camera, ClipboardList, Factory, PackagePlus, Printer, ScanLine, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authenticatedFetch, parseApiJson } from '../../../lib/api';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import type { LabelVariant } from './posLabels';
import PosCash from './PosCash';

type Variant = LabelVariant & {
  sku: string; slug: string; variantKey: string; unitCents: number; available: number; physical: number; reserved: number;
};
type Mode = 'sale' | 'entry' | 'count' | 'label' | 'cash' | 'production';
type Sale = {
  orderId: string; requestId: string; state: 'reserved' | 'charging' | 'completed' | 'cancelled';
  total: number; expiresAt: string; method: string;
  lines: Array<{ code: string; name: string; color: string; size: string; quantity: number; unitCents: number }>;
};
type Selection = Record<string, number>;
const modes = [
  { id: 'sale', title: 'Venda rápida', Icon: ScanLine },
  { id: 'entry', title: 'Entrada', Icon: PackagePlus },
  { id: 'count', title: 'Contagem', Icon: ClipboardList },
  { id: 'label', title: 'Etiquetas', Icon: Printer },
  { id: 'production', title: 'Peça pronta', Icon: Factory },
  { id: 'cash', title: 'Caixa físico', Icon: Wallet }
] as const;
const primary = 'min-h-11 rounded-md bg-[#eab308] px-4 py-2 font-bold text-black disabled:opacity-50';
const secondary = 'min-h-11 rounded-md border border-black/20 bg-white px-3 py-2 font-semibold text-black disabled:opacity-50';
const field = 'min-h-11 w-full min-w-0 rounded-md border border-black/25 bg-white px-3 py-2 text-black';
const money = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
const base = '/api/admin/pdv';
type Draft = { sale: Selection; requestId: string | null };
function readDraft(key: string): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (saved && typeof saved.sale === 'object' && saved.sale) {
      return { sale: saved.sale, requestId: typeof saved.requestId === 'string' ? saved.requestId : null };
    }
  } catch { /* Storage is optional. */ }
  return { sale: {}, requestId: null };
}
function saveDraft(key: string, sale: Selection, requestId: string | null) {
  try {
    if (Object.keys(sale).length || requestId) sessionStorage.setItem(key, JSON.stringify({ sale, requestId }));
    else sessionStorage.removeItem(key);
  } catch { /* The server still records active sales. */ }
}
class PosHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await parseApiJson<T & { message?: string; error?: string }>(response);
  if (!response.ok) throw new PosHttpError(data.message || data.error || 'Não foi possível concluir a operação.', response.status);
  return data;
}

export default function AdminPos({ onNewOrder, operatorId = 'local' }: { onNewOrder: () => void; operatorId?: string }) {
  const draftKey = 'fpac:pdv:draft:' + operatorId;
  const [draft] = useState(() => readDraft(draftKey));
  const { showFinancialValues } = useFinancialPrivacy();
  const [mode, setMode] = useState<Mode>('sale');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [aliases, setAliases] = useState<{ alias: string; code: string }[]>([]);
  const [alias, setAlias] = useState('');
  const [conversion, setConversion] = useState({ sourceCode: '', targetCode: '', quantity: 1, stamps: '' });
  const conversionAttempt = useRef<{ signature: string; requestId: string } | null>(null);
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<Record<'sale' | 'entry' | 'count', Selection>>({ sale: draft.sale, entry: {}, count: {} });
  const [label, setLabel] = useState<Variant | null>(null);
  const [copies, setCopies] = useState(1);
  const [sale, setSale] = useState<Sale | null>(null);
  const [pending, setPending] = useState<Sale[]>([]);
  const [method, setMethod] = useState('PIX');
  const [unpaid, setUnpaid] = useState(false);
  const [reference, setReference] = useState('');
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7));
  const [batch, setBatch] = useState<{ slug: string; requestId: string; updates: { variantKey: string; quantity: number }[] }[] | null>(null);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [countId, setCountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const search = useRef<HTMLInputElement>(null);
  const attempt = useRef<string | null>(draft.requestId);
  const lock = useRef(false);
  const display = (amount: number) => showFinancialValues ? money.format(amount) : 'R$ ••••';

  const refresh = useCallback(async () => {
    const [catalog, sales] = await Promise.all([
      request<{ variants: Variant[]; aliases: { alias: string; code: string }[] }>(base + '/variants'),
      request<{ sales: Sale[] }>(base + '/sales')
    ]);
    setVariants(catalog.variants);
    setAliases(catalog.aliases || []);
    setPending(sales.sales);
  }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir a operação.'); }
    finally { lock.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    void run(async () => {
      await refresh();
      if (draft.requestId) {
        try { setSale(await request<Sale>(base + '/sales/' + draft.requestId)); }
        catch (failure) {
          if (!(failure instanceof PosHttpError) || failure.status !== 404) throw failure;
          setMessage('Nenhuma reserva confirmada ainda. Você pode reenviar a mesma tentativa.');
        }
      }
    });
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, [run, refresh, draft, draftKey]);
  useEffect(() => { saveDraft(draftKey, choices.sale, attempt.current); }, [draftKey, choices.sale]);

  const inputLocked = (mode === 'sale' && (sale !== null || attempt.current !== null)) ||
    (mode === 'entry' && batch !== null) || (mode === 'count' && countId !== null);
  const selected = mode === 'label' || mode === 'cash' || mode === 'production' ? {} : choices[mode];
  const rows = Object.entries(selected).flatMap(([code, quantity]) => {
    const item = variants.find(row => row.code === code);
    return item ? [{ ...item, quantity }] : [];
  });
  const total = rows.reduce((sum, row) => sum + row.unitCents * row.quantity, 0) / 100;
  const filtered = variants.filter(item => {
    if (mode === 'sale' && (item.unitCents <= 0 || item.available <= 0)) return false;
    const haystack = normalize([item.name, item.color, item.size, item.sku, item.code, item.neckline].join(' '));
    return normalize(query).split(/\s+/).every(term => haystack.includes(term));
  }).slice(0, query.trim() ? 35 : 8);
  const variantCaption = (item: Variant) => [item.color, item.size, item.neckline, item.finish === 'plain' ? 'Lisa' : 'Pronta'].filter(Boolean).join(' · ');

  function change(code: string, qty: number) {
    if (mode === 'label' || mode === 'cash' || mode === 'production') return;
    setChoices(current => {
      const next = { ...current[mode] };
      if (qty < 0 || (qty === 0 && mode !== 'count')) delete next[code];
      else next[code] = qty;
      return { ...current, [mode]: next };
    });
  }

  function add(item: Variant) {
    if (inputLocked) return;
    if (mode === 'label') { setLabel(item); setLabelFile(null); setAlias(''); return; }
    const next = (selected[item.code] ?? 0) + 1;
    if (next > 100000) return;
    if (mode === 'sale' && (item.unitCents <= 0 || next > item.available || next > 100)) {
      setError('Esta variação não tem saldo ou preço disponível para esta venda.');
      return;
    }
    change(item.code, next);
    setError(''); setMessage(item.name + ' adicionada.'); setQuery('');
    search.current?.focus();
  }

  function scan(value: string) {
    const key = normalize(value);
    if (!key) return;
    const exact = variants.filter(item => normalize(item.code) === key || (item.sku && normalize(item.sku) === key) ||
      aliases.some(alias => alias.code === item.code && normalize(alias.alias) === key));
    if (exact.length === 1) add(exact[0]);
    else if (exact.length > 1) setError('Código ambíguo. Selecione a variação pelo nome.');
    else setError('Código não encontrado. Confira a etiqueta ou use a busca.');
  }

  function reserve(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const requestId = attempt.current ??= crypto.randomUUID();
      saveDraft(draftKey, choices.sale, requestId);
      try {
        const result = await request<Sale>(base + '/sales', {
          requestId, lines: rows.map(row => ({ code: row.code, quantity: row.quantity, unitCents: row.unitCents }))
        });
        setSale(result);
      } catch (failure) {
        if (failure instanceof PosHttpError && [400, 409].includes(failure.status)) {
          try {
            setSale(await request<Sale>(base + '/sales/' + requestId));
            return;
          } catch (lookup) {
            if (lookup instanceof PosHttpError && lookup.status === 404) {
              attempt.current = null;
              saveDraft(draftKey, choices.sale, null);
            } else {
              throw lookup;
            }
          }
        }
        throw failure;
      }
    });
  }

  function updateSale(action: 'charge' | 'complete' | 'cancel') {
    if (!sale) return;
    void run(async () => {
      const body = action === 'charge' ? { method } : action === 'cancel' ? { confirmedUnpaid: unpaid } : {};
      const result = await request<Sale>(base + '/sales/' + sale.requestId + '/' + action, body);
      setSale(result);
      setUnpaid(false);
      if (['completed', 'cancelled'].includes(result.state)) {
        setChoices(current => ({ ...current, sale: {} }));
        attempt.current = null;
        setPending(items => items.filter(item => item.requestId !== result.requestId));
        await refresh();
      }
    });
  }

  function receive() {
    void run(async () => {
      let groups = batch;
      if (!groups) {
        groups = [...new Set(rows.map(row => row.slug))].map(slug => ({
          slug, requestId: crypto.randomUUID(), updates: rows.filter(row => row.slug === slug).map(row => ({ variantKey: row.variantKey, quantity: row.quantity }))
        }));
      }
      setBatch(groups);
      for (const group of groups) {
        await request('/api/admin/stock/bulk-adjust', {
          mode: 'receive', productSlug: group.slug, reason: reference.trim(),
          idempotencyKey: group.requestId,
          updates: group.updates
        });
        setBatch(previous => previous?.filter(item => item.requestId !== group.requestId) || []);
      }
      setBatch(null);
      setReference('');
      setChoices(current => ({ ...current, entry: {} }));
      setMessage('Entrada confirmada no estoque. Vincule a compra no financeiro pelo registro existente.');
      await refresh();
    });
  }

  function saveCount() {
    void run(async () => {
      const requestId = countId ?? crypto.randomUUID();
      setCountId(requestId);
      try {
        const result = await request<{ differenceCount: number }>('/api/admin/stock/inventory-counts', {
          reference: month, requestId,
          counts: rows.map(row => ({ productSlug: row.slug, variantKey: row.variantKey, counted: row.quantity }))
        });
        setCountId(null);
        setChoices(current => ({ ...current, count: {} }));
        setMessage('Contagem salva. Divergências para revisar no Inventário: ' + result.differenceCount + '.');
      } catch (failure) {
        if (failure instanceof PosHttpError && failure.status === 400) setCountId(null);
        throw failure;
      }
    });
  }

  return <section className="mx-auto max-w-5xl space-y-5 pb-10 text-black">
    <header className="rounded-lg border-b-4 border-[#eab308] bg-black p-5 text-white">
      <div className="text-xs font-bold uppercase tracking-widest text-[#eab308]">F PAC STORE · Central de Gestão</div>
      <h1 className="mt-1 text-3xl font-bold">PDV</h1>
      <p className="mt-2 text-sm text-white/80">Venda e organize o estoque pelo celular ou computador.</p>
    </header>
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="Operações do PDV">
      {modes.map(({ id, title, Icon }) => <button key={id} type="button" aria-pressed={mode === id}
        className={mode === id ? primary : secondary} onClick={() => { setMode(id); setQuery(''); setError(''); setMessage(''); }}>
        <Icon size={16} className="mr-2 inline" aria-hidden="true" />{title}
      </button>)}
    </nav>
    <div className="flex flex-wrap gap-2 text-sm">
      <button type="button" className={secondary} onClick={onNewOrder}>Novo pedido / Personalizados</button>
      <Link to="/gestao?tab=orders" className={secondary}>Pedidos e devoluções</Link>
      <Link to="/gestao?tab=inventory_audit" className={secondary}>Revisar inventário</Link>
      <Link to="/gestao?tab=financial&finance=register" className={secondary}><Wallet size={16} className="mr-1 inline" /> Caixa</Link>
      <Link to="/gestao?tab=financial&finance=cashflow" className={secondary}>Fluxo de caixa</Link>
      <button type="button" className={secondary} disabled={!online || busy} onClick={() => void run(refresh)}>Atualizar</button>
    </div>
    {!online && <p role="alert" className="rounded bg-amber-100 p-3">Sem conexão. Sua seleção fica nesta tela. Confirme depois que a internet voltar.</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-900">{error}</p>}
    {message && <p role="status" className="rounded bg-green-50 p-3 text-green-900">{message}</p>}

    {mode === 'sale' && pending.length > 0 && !sale && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-bold">Vendas em andamento</h2>
      <p className="text-sm">Abra uma venda existente antes de repetir uma cobrança.</p>
      <div className="mt-2 flex flex-wrap gap-2">{pending.map(item =>
        <button type="button" className={secondary} key={item.requestId} disabled={busy || !online} onClick={() => void run(async () => {
          const found = await request<Sale>(base + '/sales/' + item.requestId);
          setSale(found); setUnpaid(false);
        })}>
          {item.requestId.slice(0, 8)} · {display(item.total)} · {item.state === 'charging' ? 'Conferir pagamento' : 'Reserva'}
        </button>)}</div>
    </div>}

    {mode === 'cash' ? <PosCash request={request} online={online} /> : mode === 'production' ? <form className="max-w-2xl space-y-3 rounded-lg border border-black/15 bg-white p-4" onSubmit={event => {
      event.preventDefault();
      void run(async () => {
        const body = { sourceCode: conversion.sourceCode, targetCode: conversion.targetCode, quantity: conversion.quantity, consumeStamps: conversion.stamps === 'consume' };
        const signature = JSON.stringify(body);
        if (conversionAttempt.current?.signature !== signature) conversionAttempt.current = { signature, requestId: crypto.randomUUID() };
        await request(base + '/transform', { ...body, requestId: conversionAttempt.current.requestId });
        conversionAttempt.current = null;
        setConversion({ sourceCode: '', targetCode: '', quantity: 1, stamps: '' });
        setMessage('Transformação confirmada. Gere a etiqueta no estoque de peças prontas.');
        await refresh();
      });
    }}>
      <h2 className="text-lg font-bold">Transformar peça lisa em pronta</h2>
      <label className="block">Peça lisa que sai do estoque
        <select className={field} value={conversion.sourceCode} required onChange={event => setConversion({ ...conversion, sourceCode: event.target.value, targetCode: '' })}>
          <option value="">Selecione a peça lisa</option>
          {variants.filter(item => item.finish === 'plain' && item.available > 0).map(item => <option key={item.code} value={item.code}>{item.name} · {variantCaption(item)} · {item.available} disponíveis</option>)}
        </select>
      </label>
      <label className="block">Peça pronta que entra no estoque
        <select className={field} value={conversion.targetCode} required onChange={event => setConversion({ ...conversion, targetCode: event.target.value })}>
          <option value="">Selecione a peça estampada</option>
          {variants.filter(item => item.finish === 'ready' && item.variantKey === variants.find(source => source.code === conversion.sourceCode)?.variantKey).map(item => <option key={item.code} value={item.code}>{item.name} · {variantCaption(item)}</option>)}
        </select>
      </label>
      <label className="block">Quantidade
        <input className={field} type="number" min={1} max={100} required value={conversion.quantity} onChange={event => setConversion({ ...conversion, quantity: event.target.valueAsNumber || 0 })} />
      </label>
      <label className="block">Consumo de DTF
        <select className={field} value={conversion.stamps} required onChange={event => setConversion({ ...conversion, stamps: event.target.value })}>
          <option value="">Confirme como registrar a estampa</option><option value="consume">Baixar a estampa cadastrada</option><option value="already">Consumo já registrado ou estampa sem controle</option>
        </select>
      </label>
      <button type="submit" className={primary} disabled={busy || !online}>Confirmar transformação</button>
    </form> : mode === 'sale' && sale ? <div className="space-y-3 rounded-lg border border-black/15 bg-white p-4">
      <h2 className="text-lg font-bold">{sale.state === 'completed' ? 'Venda concluída' : sale.state === 'cancelled' ? 'Venda cancelada' : 'Recebimento'} · {display(sale.total)}</h2>
      <ul className="space-y-1 text-sm">{sale.lines.map(line => <li key={line.code}>{line.quantity} × {line.name} · {line.color} / {line.size}</li>)}</ul>
      {sale.state === 'reserved' && <>
        <p className="text-sm">Reserve antes de receber. Confirme o início e só então cobre no banco ou na maquininha.</p>
        <label className="block max-w-xs">Forma de pagamento
          <select className={field} value={method} onChange={event => setMethod(event.target.value)}>
            {['PIX', 'DINHEIRO', 'DÉBITO', 'CRÉDITO'].map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className={primary} disabled={busy || !online} onClick={() => updateSale('charge')}>Iniciar cobrança</button>
      </>}
      {sale.state === 'charging' && <>
        <p className="text-sm">Forma escolhida: {sale.method}. Confira a aprovação ou o dinheiro recebido antes de confirmar e entregar as peças.</p>
        <button type="button" className={primary} disabled={busy || !online} onClick={() => updateSale('complete')}>Confirmar pagamento e entrega</button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unpaid} onChange={event => setUnpaid(event.target.checked)} />
          Conferi que esta venda não foi paga.
        </label>
      </>}
      {['reserved', 'charging'].includes(sale.state) ? <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} disabled={busy || !online || (sale.state === 'charging' && !unpaid)} onClick={() => updateSale('cancel')}>Cancelar e liberar peças</button>
        <button type="button" className={secondary} disabled={busy || !online} onClick={() => void run(async () => {
          setSale(await request<Sale>(base + '/sales/' + sale.requestId));
        })}>Consultar situação</button>
      </div> : <div className="flex flex-wrap gap-2">
        {sale.state === 'completed' && <Link className={secondary} to={'/gestao?tab=orders&orderId=' + encodeURIComponent(sale.orderId)}>Abrir pedido</Link>}
        <button type="button" className={primary} onClick={() => {
          setSale(null); attempt.current = null; setChoices(current => ({ ...current, sale: {} }));
        }}>Nova venda</button>
      </div>}
    </div> : <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3 rounded-lg border border-black/15 bg-white p-4">
        <h2 className="text-lg font-bold">Identificar peça</h2>
        <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); scan(query); }}>
          <label className="min-w-0 grow">Nome, código, cor ou tamanho
            <input ref={search} className={field} value={query} maxLength={160} disabled={inputLocked} onChange={event => setQuery(event.target.value)} autoComplete="off" />
          </label>
          <button className={secondary + ' self-end'} type="submit" disabled={inputLocked || !query.trim()}><Barcode size={17} className="mr-1 inline" />Ler código</button>
        </form>
        <label className={secondary + ' inline-flex cursor-pointer items-center gap-2'}>
          <Camera size={17} /> Fotografar etiqueta
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={inputLocked || busy}
            onChange={event => {
              const file = event.target.files?.[0]; event.target.value = '';
              if (!file) return;
              void run(async () => {
                if (file.size > 20 * 1024 * 1024) throw new Error('Foto muito grande. Tire outra foto da etiqueta.');
                const url = URL.createObjectURL(file);
                try {
                  const { BrowserMultiFormatReader } = await import('@zxing/browser');
                  const result = await new BrowserMultiFormatReader().decodeFromImageUrl(url).catch(() => null);
                  if (!result) throw new Error('Não consegui ler a foto. Aproxime a etiqueta ou digite o código.');
                  scan(result.getText());
                } finally { URL.revokeObjectURL(url); }
              });
            }} />
        </label>
        <div className="divide-y divide-black/10">{filtered.map(item => <button type="button" key={item.code}
          className="block w-full py-3 text-left hover:bg-neutral-50 disabled:opacity-50" disabled={inputLocked || busy} onClick={() => add(item)}>
          <span className="block font-bold">{item.name}</span>
          <span className="block text-sm text-neutral-700">{variantCaption(item)} · {mode === 'sale' ? display(item.unitCents / 100) + ' · ' + item.available + ' disponíveis' : item.code}</span>
        </button>)}</div>
        {!filtered.length && <p className="text-sm text-neutral-700">{busy ? 'Consultando estoque…' : 'Nenhuma variação encontrada.'}</p>}
      </div>
      <div className="space-y-3 rounded-lg border border-black/15 bg-white p-4">
        <h2 className="text-lg font-bold">{mode === 'sale' ? 'Carrinho · ' + display(total) : mode === 'entry' ? 'Receber mercadoria' : mode === 'count' ? 'Contagem física' : 'Imprimir etiqueta'}</h2>
        {mode !== 'label' && <>
          {!rows.length && <p className="text-sm text-neutral-700">Selecione a primeira peça.</p>}
          <ul className="space-y-3">{rows.map(item => <li key={item.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 pb-2">
            <div><strong>{item.name}</strong><div className="text-sm text-neutral-700">{variantCaption(item)}</div>
              {mode === 'count' && <div className="text-xs">Físico: {item.physical} · reservado: {item.reserved}</div>}</div>
            <div className="flex items-center gap-2">
              <input type="number" min={mode === 'count' ? 0 : 1} max={mode === 'sale' ? Math.min(item.available, 100) : 100000} aria-label={'Quantidade de ' + item.name + ' ' + variantCaption(item)}
                className={field + ' w-20'} value={item.quantity} disabled={inputLocked || busy} onChange={event => {
                  const qty = event.currentTarget.valueAsNumber;
                  if (Number.isInteger(qty) && qty >= 0 && qty <= (mode === 'sale' ? Math.min(item.available, 100) : 100000)) change(item.code, qty);
                }} />
              <button type="button" className={secondary} disabled={inputLocked || busy} onClick={() => change(item.code, -1)}>Remover</button>
            </div>
          </li>)}</ul>
        </>}
        {mode === 'sale' && <form onSubmit={reserve}>
          <button type="submit" className={primary} disabled={!rows.length || rows.length !== Object.keys(choices.sale).length || rows.length > 20 || !online || busy}>
            {attempt.current ? 'Consultar ou repetir reserva' : 'Reservar e continuar'}
          </button>
        </form>}
        {mode === 'entry' && <>
          <label className="block">Fornecedor e referência da compra
            <input className={field} value={reference} disabled={batch !== null} onChange={event => setReference(event.target.value)} maxLength={180} />
          </label>
          <p className="text-sm text-neutral-700">A confirmação soma as quantidades ao saldo atual por produto. Lotes com mais de um produto são confirmados em sequência.</p>
          <button type="button" className={primary} disabled={!reference.trim() || !rows.length || busy || !online} onClick={receive}>{batch ? 'Retomar entrada pendente' : 'Confirmar entrada'}</button>
        </>}
        {mode === 'count' && <>
          <label className="block">Mês da contagem <input className={field} type="month" value={month} disabled={countId !== null} onChange={event => setMonth(event.target.value)} /></label>
          <p className="text-sm text-neutral-700">Conte as peças fisicamente presentes, inclusive as reservadas. Revise diferenças na tela de Inventário antes do ajuste.</p>
          <button type="button" className={primary} disabled={!month || !rows.length || busy || !online} onClick={saveCount}>{countId ? 'Consultar ou repetir contagem' : 'Salvar contagem'}</button>
        </>}
        {mode === 'label' && (label ? <>
          <div className="rounded border border-black/15 p-4"><strong>{label.name}</strong><div>{variantCaption(label)}</div><div className="font-mono">{label.code}</div></div>
          <label className="block">Cópias no PDF <input type="number" className={field} min={1} max={20} value={copies} onChange={event => { setCopies(event.target.valueAsNumber || 1); setLabelFile(null); }} /></label>
          <p className="text-sm text-neutral-700">Use papel de 100 × 150 mm e tamanho real no OpenLabel. PNG gera uma imagem por vez.</p>
          <div className="flex flex-wrap gap-2">{(['pdf', 'png'] as const).map(format => <button key={format} type="button" className={secondary} disabled={busy || !Number.isInteger(copies) || copies < 1 || copies > 20} onClick={() => void run(async () => {
            const { createPosLabel } = await import('./posLabels');
            setLabelFile(await createPosLabel(label, format, copies));
          })}>Gerar {format.toUpperCase()}</button>)}</div>
          {labelFile && <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => {
              const url = URL.createObjectURL(labelFile);
              const anchor = document.createElement('a'); anchor.href = url; anchor.download = labelFile.name; anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}>Baixar etiqueta</button>
            {navigator.canShare?.({ files: [labelFile] }) && <button type="button" className={secondary} onClick={() => {
              void navigator.share({ files: [labelFile] }).catch(failure => { if (failure.name !== 'AbortError') setError('Baixe o arquivo e abra pelo OpenLabel.'); });
            }}>Compartilhar etiqueta</button>}
          </div>}
          <form className="space-y-2 border-t border-black/10 pt-3" onSubmit={event => {
            event.preventDefault();
            void run(async () => {
              await request(base + '/aliases', { code: label.code, alias });
              setAlias(''); setMessage('Código de fornecedor vinculado a esta variação.');
              await refresh();
            });
          }}>
            <label className="block">Vincular código do fornecedor
              <input className={field} value={alias} onChange={event => setAlias(event.target.value)} maxLength={64} />
            </label>
            <button type="submit" className={secondary} disabled={busy || !online || alias.trim().length < 4}>Vincular código</button>
          </form>
        </> : <p className="text-sm text-neutral-700">Selecione uma variação para gerar a etiqueta.</p>)}
      </div>
    </div>}
  </section>;
}
