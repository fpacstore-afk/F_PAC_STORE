import { useEffect, useMemo, useState } from 'react';
import { useFinancialPrivacy } from '../../context/FinancialPrivacyContext';
import { authenticatedFetch, parseApiJson } from '../../lib/api';
import { productionUnitCost, readStockComponent, stockLineCents, summarizeValuation, type StockComponent, type ValuationRow } from '../../../shared/stockValuation';
import { savePrivateProductCost } from '../../services/productCostService';

export type ValuedProduct = ValuationRow & { type: 'product'; slug: string; price: number; recipe?: any };
type ComponentForm = Omit<StockComponent, 'quantity' | 'unitCostCents'> & { quantity: string; unitCost: string };
const input = 'min-h-11 w-full rounded border border-neutral-300 bg-white px-3 text-sm';
const button = 'min-h-11 rounded border border-neutral-300 bg-white px-3 text-sm font-bold disabled:opacity-50';
const primary = 'min-h-11 rounded bg-black px-4 text-sm font-bold text-white disabled:opacity-50';
const categories = ['Embalagens', 'Etiquetas e adesivos', 'Brindes', 'Estampas e DTF', 'Materiais de produção', 'Outros'];
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const decimal = (value: string, places: number) => {
  if (!new RegExp('^\\d+(?:[,.]\\d{1,' + places + '})?$').test(value.trim())) return NaN;
  return Number(value.trim().replace(',', '.'));
};
const formatInput = (cents: number | null) => cents === null ? '' : (cents / 100).toFixed(2).replace('.', ',');
const componentForm = (component?: StockComponent): ComponentForm => component
  ? { ...component, quantity: String(component.quantity).replace('.', ','), unitCost: formatInput(component.unitCostCents) }
  : { id: crypto.randomUUID(), revision: 0, name: '', category: 'Embalagens', unit: 'un.', quantity: '', unitCost: '', archived: false };
const sortNames = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

export function StockValuation({ products, reviewCount, loading, sourceError, onOpenProduct }: {
  products: ValuedProduct[];
  reviewCount: number;
  loading: boolean;
  sourceError: string;
  onOpenProduct: (product: ValuedProduct) => void;
}) {
  const { formatMoney, showFinancialValues } = useFinancialPrivacy();
  const [components, setComponents] = useState<StockComponent[] | null>(null);
  const [componentError, setComponentError] = useState('');
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState<ComponentForm | null>(null);
  const [product, setProduct] = useState<ValuedProduct | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('all');
  const [coverage, setCoverage] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const money = (cents: number) => formatMoney(cents / 100);
  useEffect(() => {
    const abort = new AbortController();
    setComponentError('');
    setComponents(null);
    authenticatedFetch('/api/admin/stock/components', { signal: abort.signal })
      .then(async response => {
        const data = await parseApiJson<{ components?: StockComponent[]; error?: string }>(response);
        if (!response.ok || !Array.isArray(data.components)) throw new Error(data.error || 'Falha ao consultar componentes.');
        if (!abort.signal.aborted) setComponents(data.components);
      })
      .catch((failure: Error) => { if (!abort.signal.aborted) setComponentError(failure.message); });
    return () => abort.abort();
  }, [reload]);

  useEffect(() => {
    if (!showFinancialValues) {
      setForm(null);
      setProduct(null);
    }
  }, [showFinancialValues]);

  const rows = useMemo(() => {
    const materials: ValuationRow[] = (components || []).filter(item => !item.archived).map(item => ({
      ...item, type: 'component', reference: '', costStatus: item.unitCostCents === null ? 'missing' : 'recorded'
    }));
    const costs = new Map([...products, ...materials].map(item => [item.type + ':' + item.id, item.unitCostCents]));
    const refreshed = products.map(item => {
      if (item.recipe?.method !== 'stock_components_v1' || !Array.isArray(item.recipe.components)) return item;
      const outdated = item.recipe.components.some((part: any) =>
        costs.get((part.kind === 'base' ? 'product' : 'component') + ':' + part.reference) !== part.unitCostCents);
      return outdated ? { ...item, costStatus: 'partial' as const } : item;
    });
    return [...refreshed, ...materials].sort((a, b) => sortNames(a.name, b.name));
  }, [products, components]);
  const filtered = rows.filter(row =>
    (!query || normalize([row.name, row.reference, row.category].join(' ')).includes(normalize(query))) &&
    (!category || row.category === category) &&
    (kind === 'all' || row.type === kind) &&
    (coverage === 'all' || row.costStatus === coverage) &&
    (includeZero || row.quantity > 0 || row.type === 'component')
  );
  const totals = summarizeValuation(rows);
  const categoryTotals = Array.from(new Set(filtered.map(row => row.category))).sort(sortNames)
    .map(name => ({ name, ...summarizeValuation(filtered.filter(row => row.category === name)) }));
  const resolved = Boolean(components) && !loading && !sourceError;
  const complete = resolved && !totals.missing && !totals.partial && !reviewCount;
  const archived = (components || []).filter(item => item.archived).sort((a, b) => sortNames(a.name, b.name));
  const componentById = new Map((components || []).map(item => [item.id, item]));
  const startForm = (item?: StockComponent) => {
    setError(''); setNotice(''); setProduct(null); setForm(componentForm(item));
  };
  async function saveComponent(draft: ComponentForm) {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = readStockComponent({
        ...draft,
        quantity: decimal(draft.quantity, 4),
        unitCostCents: draft.unitCost.trim() ? Math.round(decimal(draft.unitCost, 2) * 100) : null,
      });
      const response = await authenticatedFetch('/api/admin/stock/components/' + draft.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, revision: draft.revision }),
      });
      const payload = await parseApiJson<{ component?: StockComponent; error?: string }>(response);
      if (!response.ok || !payload.component) throw new Error(payload.error || 'Falha ao salvar o componente.');
      const saved = payload.component;
      setComponents(current => [...(current || []).filter(item => item.id !== saved.id), saved]);
      setForm(null); setNotice(saved.archived ? 'Componente arquivado.' : 'Componente salvo.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <section id="stock-valuation-panel" className="mx-auto max-w-7xl space-y-5 rounded-xl border border-black/10 bg-white p-4 sm:p-6" aria-labelledby="stock-valuation-title">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="stock-valuation-title" className="text-xl font-black text-black">Valor em estoque</h2><p className="mt-1 text-sm text-neutral-600">Quantidade física × custo unitário. Peças reservadas seguem no saldo enquanto estão fisicamente no estoque.</p></div>
      <button type="button" className={primary} disabled={!components || !showFinancialValues || busy} onClick={() => startForm()}>Adicionar componente</button>
    </header>
    {!showFinancialValues && <p className="text-sm text-neutral-600">Ative “Mostrar informações financeiras” no topo da Gestão para ver e editar os valores.</p>}
    {(!components && !componentError || loading) && <p role="status">Carregando saldos e custos…</p>}
    {(componentError || sourceError) && <div role="alert" className="flex flex-wrap items-center gap-3 rounded bg-red-50 p-3 text-sm text-red-900">
      <span>{[sourceError, componentError].filter(Boolean).join(' ')}</span>
      {componentError && <button type="button" className={button} onClick={() => setReload(value => value + 1)}>Recarregar componentes</button>}
    </div>}
    {resolved && <div className="grid gap-3 md:grid-cols-3">
      <article className="rounded-lg bg-neutral-950 p-4 text-white"><h3 className="text-sm font-bold">{complete ? 'Valor total em estoque' : 'Subtotal com custo cadastrado'}</h3><p className="mt-2 text-2xl font-black">{money(totals.subtotalCents)}</p></article>
      <article className="rounded-lg border border-black/10 p-4"><h3 className="text-sm font-bold">Valor com custo cadastrado completo</h3><p className="mt-2 text-2xl font-black">{money(totals.recordedCents)}</p></article>
      <article className="rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-bold">Conferência</h3><p className="mt-2 text-sm">{totals.missing} item(ns) com saldo sem custo · {totals.partial} com custo parcial ({money(totals.partialCents)}) · {reviewCount} registro(s) de estoque a conferir.</p></article>
    </div>}
    <div className="flex flex-wrap items-center gap-2 text-sm">{notice && <p role="status" className="text-emerald-800">{notice}</p>}{error && <><p role="alert" className="text-red-800">{error}</p><button className={button} type="button" onClick={() => { setForm(null); setError(''); setReload(value => value + 1); }}>Recarregar lista</button></>}</div>
    {form && showFinancialValues && <form className="rounded-lg border border-amber-300 bg-amber-50 p-4" onSubmit={event => { event.preventDefault(); if (!busy) void saveComponent(form); }}>
      <h3 className="mb-3 font-bold">{form.revision ? 'Editar componente' : 'Novo componente'}</h3>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs font-bold">Nome<input autoFocus value={form.name} required maxLength={120} className={input} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Sacola personalizada" /></label>
        <label className="grid gap-1 text-xs font-bold">Categoria<input value={form.category} list="stock-component-categories" required maxLength={60} className={input} onChange={event => setForm({ ...form, category: event.target.value })} /></label>
        <datalist id="stock-component-categories">{Array.from(new Set([...categories, ...(components || []).map(item => item.category)])).map(value => <option key={value} value={value} />)}</datalist>
        <label className="grid gap-1 text-xs font-bold">Unidade<input value={form.unit} required maxLength={24} className={input} onChange={event => setForm({ ...form, unit: event.target.value })} placeholder="un., metro ou folha" /></label>
        <label className="grid gap-1 text-xs font-bold">Quantidade em estoque<input value={form.quantity} required inputMode="decimal" className={input} onChange={event => setForm({ ...form, quantity: event.target.value })} /></label>
        <label className="grid gap-1 text-xs font-bold">Custo por unidade (R$)<input value={form.unitCost} inputMode="decimal" className={input} onChange={event => setForm({ ...form, unitCost: event.target.value })} placeholder="Em branco se desconhecido" /></label>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2"><button className={primary} disabled={busy}>Salvar componente</button><button type="button" disabled={busy} className={button} onClick={() => setForm(null)}>Cancelar</button></div>
    </form>}
    {product && showFinancialValues && <ProductionCostForm key={product.id} product={product} products={products} components={(components || []).filter(item => !item.archived)}
      onClose={() => setProduct(null)} onSaved={() => { setProduct(null); setNotice('Custo salvo no cadastro do produto.'); }} />}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="grid gap-1 text-xs font-bold">Buscar por nome, SKU ou categoria<input type="search" className={input} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-bold">Categoria<select className={input} value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas</option>{Array.from(new Set(rows.map(row => row.category))).sort(sortNames).map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-bold">Tipo<select className={input} value={kind} onChange={event => setKind(event.target.value)}><option value="all">Todos</option><option value="product">Produtos</option><option value="component">Componentes</option></select></label>
      <label className="grid gap-1 text-xs font-bold">Custo<select className={input} value={coverage} onChange={event => setCoverage(event.target.value)}><option value="all">Todos</option><option value="recorded">Cadastrado</option><option value="partial">Parcial</option><option value="missing">Sem custo</option></select></label>
    </div>
    <div className="flex flex-wrap items-center gap-4 text-sm"><label><input type="checkbox" checked={includeZero} onChange={event => setIncludeZero(event.target.checked)} /> Mostrar produtos sem saldo</label>
      {(query || category || kind !== 'all' || coverage !== 'all' || includeZero) && <button type="button" className={button} onClick={() => { setQuery(''); setCategory(''); setKind('all'); setCoverage('all'); setIncludeZero(false); }}>Limpar filtros</button>}
      {resolved && <p className="font-bold">Subtotal dos filtros {money(summarizeValuation(filtered).subtotalCents)}</p>}
    </div>
    {resolved && categoryTotals.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Valor por categoria">{categoryTotals.map(group =>
      <button type="button" key={group.name} className={button} onClick={() => setCategory(category === group.name ? '' : group.name)} aria-pressed={category === group.name}>
        {group.name} · {money(group.subtotalCents)}{group.missing + group.partial > 0 ? ' · a conferir' : ''}
      </button>)}</div>}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[660px] text-left text-sm">
        <thead className="bg-neutral-100"><tr>{['Item', 'Categoria', 'Saldo físico', 'Custo unitário', 'Valor em estoque', 'Ações'].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{filtered.map(row => {
          const amount = stockLineCents(row);
          const item = componentById.get(row.id);
          return <tr key={row.type + row.id} className="border-b border-neutral-200">
            <th scope="row" className="p-3 text-left">{row.name}{row.reference && <span className="block text-xs font-normal text-neutral-600">{row.reference}</span>}</th>
            <td className="p-3">{row.category}</td><td className="p-3 whitespace-nowrap">{row.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} {row.unit}</td>
            <td className="p-3 whitespace-nowrap">{row.unitCostCents === null ? 'A cadastrar' : money(row.unitCostCents)}{row.costStatus === 'partial' && <span className="block text-xs text-amber-800">Parcial</span>}</td>
            <td className="p-3 whitespace-nowrap font-bold">{amount === null ? '—' : money(amount)}</td>
            <td className="p-3">{showFinancialValues && <div className="flex flex-wrap gap-2">{row.type === 'product' ? <>
              <button type="button" className={button} onClick={() => { setForm(null); setProduct(row as ValuedProduct); setNotice(''); setError(''); requestAnimationFrame(() => document.getElementById('production-cost-form')?.scrollIntoView({ block: 'nearest' })); }}>Compor custo</button>
              <button type="button" className={button} onClick={() => onOpenProduct(row as ValuedProduct)}>Editar produto</button>
            </> : item && <>
              <button type="button" className={button} disabled={busy} onClick={() => { startForm(item); requestAnimationFrame(() => document.getElementById('stock-valuation-title')?.scrollIntoView({ block: 'start' })); }}>Editar</button>
              <button type="button" className={button} disabled={busy} onClick={() => { if (window.confirm('Arquivar “' + item.name + '” e retirar seu saldo deste indicador? Você pode restaurar o componente.')) void saveComponent({ ...componentForm(item), archived: true }); }}>Arquivar</button>
            </>}</div>}</td>
          </tr>;
        })}</tbody>
      </table>
      {resolved && !filtered.length && <p className="p-4 text-sm text-neutral-600">Nenhum item encontrado para estes filtros.</p>}
    </div>
    {archived.length > 0 && showFinancialValues && <div>
      <button type="button" className={button} aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>Componentes arquivados ({archived.length})</button>
      {showArchived && <ul className="mt-2">{archived.map(item => <li key={item.id} className="flex items-center justify-between gap-3 border-b p-2 text-sm">{item.name}<button type="button" className={button} disabled={busy} onClick={() => void saveComponent({ ...componentForm(item), archived: false })}>Restaurar</button></li>)}</ul>}
    </div>}
  </section>;
}

type Usage = { id: string; kind: 'component' | 'base'; reference: string; quantity: string };

function ProductionCostForm({ product, products, components, onClose, onSaved }: {
  product: ValuedProduct; products: ValuedProduct[]; components: StockComponent[]; onClose: () => void; onSaved: () => void;
}) {
  const { formatMoney } = useFinancialPrivacy();
  const saved = product.recipe?.method === 'stock_components_v1' ? product.recipe : null;
  const [extra, setExtra] = useState(() => formatInput(saved?.extraCents ?? null));
  const [lines, setLines] = useState<Usage[]>(() => (saved?.usage || []).map((item: Omit<Usage, 'id'>) => ({ ...item, id: crypto.randomUUID() })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const duplicateLines = new Set(lines.map(row => row.kind + ':' + row.reference)).size < lines.length;
  const bases = products.filter(item => item.id !== product.id && item.recipe?.method !== 'stock_components_v1');
  const items = lines.map(row => {
    const source = (row.kind === 'component' ? components : bases).find(item => item.id === row.reference);
    const provisional = source && 'costStatus' in source && source.costStatus !== 'recorded';
    return { row, name: source?.name, usage: decimal(row.quantity, 4), unitCostCents: provisional ? null : source?.unitCostCents ?? null };
  });
  const extraCents = extra.trim() ? Math.round(decimal(extra, 2) * 100) : 0;
  const parts = [...items, ...(extraCents === 0 ? [] : [{ unitCostCents: Number.isFinite(extraCents) ? extraCents : null, usage: 1 }])];
  const calculated = productionUnitCost(parts);
  const total = !duplicateLines && calculated !== null && calculated > 0 && calculated <= 100000000 ? calculated : null;
  async function save() {
    if (busy || total === null) return;
    setBusy(true); setError('');
    try {
      await savePrivateProductCost({
        productId: product.id, slug: product.slug, costPrice: total / 100,
        costCalculation: {
          method: 'stock_components_v1', coverage: 'complete', sourceLabel: 'Composição de estoque conferida',
          extraCents, unitCost: total / 100,
          usage: lines.map(({ kind, reference, quantity }) => ({ kind, reference, quantity })),
          components: items.map(item => ({ name: item.name, unitCost: item.unitCostCents! / 100 * item.usage })),
        }
      });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <form id="production-cost-form" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <h3 className="font-bold">Compor custo · {product.name}</h3>
    <p className="text-sm">Informe o consumo por peça. Revise a composição ao mudar o custo da base ou dos insumos. O preço de venda pode ser editado no cadastro do produto.</p>
    <fieldset disabled={busy} className="space-y-3">
      {lines.map((row, index) => <div key={row.id} className="grid gap-2 md:grid-cols-[1fr_2fr_1fr_auto]">
        <label className="grid gap-1 text-xs font-bold">Origem<select className={input} value={row.kind} onChange={event => setLines(lines.map(item => item.id === row.id ? { ...item, kind: event.target.value as Usage['kind'], reference: '' } : item))}><option value="component">Componente</option><option value="base">Produto base</option></select></label>
        <label className="grid gap-1 text-xs font-bold">Item<select required className={input} value={row.reference} onChange={event => setLines(lines.map(item => item.id === row.id ? { ...item, reference: event.target.value } : item))}>
          <option value="">Escolher</option>{(row.kind === 'component' ? components : bases).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label className="grid gap-1 text-xs font-bold">Consumo por peça<input required inputMode="decimal" className={input} value={row.quantity} onChange={event => setLines(lines.map(item => item.id === row.id ? { ...item, quantity: event.target.value } : item))} /></label>
        <button type="button" className={button + ' self-end'} aria-label={'Remover linha ' + (index + 1)} onClick={() => setLines(lines.filter(item => item.id !== row.id))}>Remover</button>
        {row.reference && items[index].unitCostCents === null && <span className="text-xs font-bold text-amber-950 md:col-span-4">Cadastre o custo completo deste item para salvar a composição.</span>}
      </div>)}
      <button type="button" className={button} disabled={lines.length >= 30} onClick={() => setLines([...lines, { id: crypto.randomUUID(), kind: 'component', reference: '', quantity: '1' }])}>Adicionar insumo ou base</button>
      <label className="grid max-w-sm gap-1 text-xs font-bold">Outros custos por peça (R$)<input className={input} inputMode="decimal" value={extra} onChange={event => setExtra(event.target.value)} placeholder="Ex.: aplicação ou mão de obra direta" /></label>
    </fieldset>
    {duplicateLines && <p className="text-sm text-amber-900">Agrupe o consumo do mesmo item em uma linha.</p>}
    <p className="text-sm">Custo por peça <strong>{total === null ? 'A completar' : formatMoney(total / 100)}</strong></p>
    {total !== null && product.price > 0 && <p className="text-sm">Margem bruta no preço de {formatMoney(product.price)}: <strong>{((product.price - total / 100) / product.price).toLocaleString('pt-BR', { style: 'percent', maximumFractionDigits: 1 })}</strong> antes de taxas, frete de venda e despesas da loja.</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className={primary} disabled={busy || total === null}>Salvar custo no produto</button><button type="button" className={button} disabled={busy} onClick={onClose}>Cancelar</button></div>
  </form>;
}
