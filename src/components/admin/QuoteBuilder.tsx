import React, { useState } from 'react';
import { ChevronDown, Copy, Plus, Shirt, Trash2 } from 'lucide-react';
import {
  type Catalog, type ItemInput, type PrintInput, type QuoteInput,
  calculateQuote, money, normalize, round,
} from '../../../shared/pricingWorkbench';

type QuoteResult = ReturnType<typeof calculateQuote>;
type ItemResult = QuoteResult['items'][number];
type Props = {
  catalog: Catalog;
  quote: QuoteInput;
  result: QuoteResult;
  disabled: boolean;
  locked: boolean;
  onChange: (quote: QuoteInput) => void;
  actions: React.ReactNode;
  dtfDetails: React.ReactNode;
};

const numeric = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
const amount = (value: number | null | undefined) => value == null ? 'Pendente' : money(value);
const positions = ['Peito esquerdo', 'Frente', 'Costas', 'Manga'];
const measures = [[6, 8], [8, 6], [10, 10], [15, 15], [20, 20], [30, 30], [30, 40]];

function Input({ label, value, onChange, type = 'text', hint, min = 0, step = 'any', ...props }: {
  label: string; value: string | number | null | undefined; onChange: (value: string) => void;
  type?: string; hint?: string; min?: number; step?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return <label className="pw-field"><span>{label}</span><input {...props} type={type} value={value ?? ''}
    onChange={event => onChange(event.target.value)}
    {...(type === 'number' ? { min, step, inputMode: step === '1' ? 'numeric' : 'decimal' } : {})} />
    {hint && <small>{hint}</small>}</label>;
}

function Options({ label, value, onChange, children }: {
  label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  return <label className="pw-field"><span>{label}</span><select value={value}
    onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

function PrintRow({ print, catalog, cost, index, onChange, onRemove }: {
  print: PrintInput; catalog: Catalog; cost: number | null | undefined; index: number;
  onChange: (print: PrintInput) => void; onRemove: () => void;
}) {
  const stamps = catalog.entries.filter(entry => entry.active && entry.kind === 'stamp');
  const preset = measures.find(([width, height]) => print.width === width && print.height === height);
  const set = (patch: Partial<PrintInput>) => onChange({ ...print, ...patch });
  return <div className="qb-print">
    <div className="qb-print-head"><strong>Estampa {index + 1}</strong><span>{amount(cost)} <small>/ peça na precificação</small></span>
      <button type="button" className="qb-icon" aria-label={`Remover estampa ${index + 1}`} onClick={onRemove}><Trash2 size={16} /></button></div>
    <div className="qb-print-fields">
      <Options label="Estampa / serviço" value={print.stampId} onChange={id => {
        const entry = stamps.find(stamp => stamp.id === id);
        set({ stampId: id, width: entry?.width ?? print.width, height: entry?.height ?? print.height });
      }}><option value="">Custo manual</option>{print.stampId && !stamps.some(stamp => stamp.id === print.stampId)
        && <option value={print.stampId}>Cadastro indisponível</option>}
        {stamps.map(stamp => <option key={stamp.id} value={stamp.id}>{stamp.name}</option>)}</Options>
      <label className="pw-field"><span>Local da estampa</span><input list="qb-print-positions" value={print.position}
        onChange={event => set({ position: event.target.value })} placeholder="Escolha ou digite" /></label>
      <Options label="Medida rápida (cm)" value={preset ? preset.join('x') : ''} onChange={value => {
        if (value) { const [width, height] = value.split('x').map(Number); set({ width, height }); }
      }}><option value="">Medida personalizada</option>{measures.map(measure => <option key={measure.join('x')} value={measure.join('x')}>{measure.join(' × ')}</option>)}</Options>
      <div className="qb-dimensions"><Input label="Largura (cm)" type="number" value={print.width}
        onChange={value => set({ width: numeric(value) })} />
        <Input label="Altura (cm)" type="number" value={print.height} onChange={value => set({ height: numeric(value) })} /></div>
    </div>
    <details className="qb-inline-details" open={!print.stampId || print.manualCost != null || undefined}>
      <summary>Informar custo manual{print.manualCost != null ? ` · ${money(print.manualCost)}` : ''}</summary>
      <Input label="Custo manual por estampa (R$)" type="number" value={print.manualCost}
        onChange={value => set({ manualCost: numeric(value) })} hint="Deixe vazio para usar o cálculo cadastrado." />
    </details>
  </div>;
}

function PieceEditor({ catalog, item, result, onChange }: {
  catalog: Catalog; item: ItemInput; result?: ItemResult; onChange: (item: ItemInput) => void;
}) {
  const [search, setSearch] = useState('');
  const products = catalog.entries.filter(entry => entry.active && entry.kind === 'product');
  const product = products.find(entry => entry.id === item.productId);
  const matches = products.filter(entry => entry.id === item.productId
    || normalize(`${entry.name} ${entry.supplier || ''} ${entry.code || ''}`).includes(normalize(search)));
  const lines = [...new Set(catalog.entries.filter(entry => entry.active && entry.kind === 'price'
    && entry.product === product?.name && entry.supplier === product?.supplier).map(entry => entry.line || ''))];
  const extras = catalog.entries.filter(entry => entry.active && entry.kind === 'extra');
  const set = (patch: Partial<ItemInput>) => onChange({ ...item, ...patch });
  const errors = result?.errors || [];
  const pendingCosts = result?.costPending || [];
  const warnings = result?.warnings || [];
  return <div className="qb-piece-editor">
    <div className="qb-product-fields">
      {products.length > 8 && <Input label="Buscar peça ou fornecedor" type="search" value={search} onChange={setSearch} placeholder="Nome, fornecedor ou código" />}
      <Options label="Produto / fornecedor" value={item.productId} onChange={id => {
        const next = products.find(entry => entry.id === id);
        const availableLines = [...new Set(catalog.entries.filter(entry => entry.active && entry.kind === 'price'
          && entry.product === next?.name && entry.supplier === next?.supplier).map(entry => entry.line || ''))];
        set({ productId: id, line: availableLines.length === 1 ? availableLines[0] : '',
          color: next?.colors?.length === 1 ? next.colors[0] : '', size: next?.sizes?.length === 1 ? next.sizes[0] : '',
          manualGarmentCost: null });
      }}><option value="">Escolha a peça</option>{item.productId && !product && <option value={item.productId}>Produto indisponível</option>}
        {matches.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {entry.supplier || 'Sem fornecedor'}{entry.code ? ` · ${entry.code}` : ''}</option>)}</Options>
      {(lines.length > 1 || !!item.line) && <Options label="Linha do fornecedor" value={item.line} onChange={line => set({ line })}>
        <option value="">{lines.includes('') ? 'Padrão' : 'Escolha a linha'}</option>
        {item.line && !lines.includes(item.line) && <option value={item.line}>{item.line} · indisponível</option>}
        {lines.filter(Boolean).map(line => <option key={line}>{line}</option>)}</Options>}
    </div>
    <div className="qb-variant-fields">
      {product?.colors?.length ? <Options label="Cor" value={item.color} onChange={color => set({ color })}><option value="">Escolha</option>
        {item.color && !product.colors.includes(item.color) && <option value={item.color}>{item.color} · indisponível</option>}
        {product.colors.map(color => <option key={color}>{color}</option>)}</Options>
        : <Input label="Cor" value={item.color} onChange={color => set({ color })} placeholder="Ex.: Preto" />}
      {product?.sizes?.length ? <Options label="Tamanho" value={item.size} onChange={size => set({ size })}><option value="">Escolha</option>
        {item.size && !product.sizes.includes(item.size) && <option value={item.size}>{item.size} · indisponível</option>}
        {product.sizes.map(size => <option key={size}>{size}</option>)}</Options>
        : <Input label="Tamanho" value={item.size} onChange={size => set({ size })} placeholder="Ex.: M" />}
      <Input label="Quantidade" type="number" min={1} max={100000} step="1" value={item.quantity || ''}
        onChange={value => set({ quantity: numeric(value) ?? 0 })} />
    </div>
    {product && (product.composition || product.weight || product.fit) && <p className="qb-product-meta">
      {[product.composition, product.weight, product.fit].filter(Boolean).join(' · ')}</p>}

    <div className="qb-section-heading"><h4>Estampas desta peça</h4><span>{item.prints.length ? `${item.prints.length} por peça` : 'Sem estampa'}</span></div>
    {item.prints.map((print, printIndex) => <PrintRow key={printIndex} print={print} catalog={catalog}
      index={printIndex} cost={result?.components[printIndex + 1]?.unitCost}
      onChange={next => set({ prints: item.prints.map((current, position) => position === printIndex ? next : current) })}
      onRemove={() => set({ prints: item.prints.filter((_, position) => position !== printIndex) })} />)}
    <button type="button" className="qb-add-print" disabled={item.prints.length >= 20} onClick={() => {
      const stamp = catalog.entries.find(entry => entry.active && entry.kind === 'stamp' && entry.method === 'dtf');
      set({ prints: [...item.prints, { stampId: stamp?.id || '', width: stamp?.width ?? null,
        height: stamp?.height ?? null, position: '', manualCost: null }] });
    }}><Plus size={16} /> Adicionar estampa</button>

    <div className="qb-price-strip">
      <div><small>Custo / peça</small><strong>{amount(result?.cost)}</strong></div>
      <div><small>Sugestão / peça</small><strong>{amount(result?.suggested)}</strong></div>
      <Input label="Preço de venda / peça (R$)" type="number" value={item.manualSalePrice}
        placeholder={result?.suggested != null ? result.suggested.toFixed(2) : 'Automático'}
        onChange={value => set({ manualSalePrice: numeric(value) })} hint="Vazio = preço sugerido" />
    </div>

    <details className="qb-details">
      <summary>Margem, taxa e custo da peça <ChevronDown size={16} /></summary>
      <div className="qb-two-fields"><Input label="Margem desejada (%)" type="number" value={item.margin == null ? null : round(item.margin * 100)}
        onChange={value => set({ margin: numeric(value) == null ? null : numeric(value)! / 100 })} />
        <Input label="Taxa de pagamento (%)" type="number" value={item.fee == null ? null : round(item.fee * 100)}
          onChange={value => set({ fee: numeric(value) == null ? null : numeric(value)! / 100 })} />
        <Input label="Custo manual da peça (R$)" type="number" value={item.manualGarmentCost}
          onChange={value => set({ manualGarmentCost: numeric(value) })} hint="Vazio = cotação do fornecedor" /></div>
      <p className="qb-help">A faixa do fornecedor considera a quantidade deste item. Preço sugerido = custo ÷ (1 − margem − taxa).</p>
    </details>
    <details className="qb-details">
      <summary>Insumos e adicionais <span>{item.extraIds.length} selecionado(s)</span><ChevronDown size={16} /></summary>
      {extras.length ? <div className="qb-extras">{extras.map(extra => <label key={extra.id}>
        <input type="checkbox" checked={item.extraIds.includes(extra.id)} onChange={event => set({
          extraIds: event.target.checked ? [...item.extraIds, extra.id] : item.extraIds.filter(id => id !== extra.id),
        })} /><span>{extra.name}<small>{money(extra.cost)} {extra.basis === 'quote' ? '/ pedido inteiro' : extra.basis === 'order' ? '/ lote deste item' : '/ peça'}</small></span>
      </label>)}</div> : <p className="qb-help">Cadastre embalagens, aplicação e outros custos em Cadastros.</p>}
      {item.extraIds.filter(id => !extras.some(extra => extra.id === id)).map(id => <p className="qb-help" key={id}>
        Adicional indisponível no cadastro. <button type="button" onClick={() => set({ extraIds: item.extraIds.filter(current => current !== id) })}>Remover adicional indisponível</button></p>)}
    </details>
    <details className="qb-details">
      <summary>Descrição para o cliente <ChevronDown size={16} /></summary>
      <Input label="Personalização / descrição" value={item.description} onChange={description => set({ description })}
        placeholder="Ex.: Logotipo da empresa na frente e nas costas" />
    </details>
    <details className="qb-details">
      <summary>Conferir composição do custo <ChevronDown size={16} /></summary>
      <div className="qb-cost-list">{result?.components.map((component, componentIndex) => <div key={componentIndex}>
        <span>{component.name}<small>{component.source}</small></span><strong>{amount(component.unitCost)}</strong>
      </div>)}</div>
      <p className="qb-help">Subtotal conhecido: {money(result?.knownSubtotal)} · Margem antes de descontos e frete: {result?.margin == null ? 'indisponível' : `${round(result.margin * 100)}%`}.</p>
    </details>
    {item.productId && (errors.length > 0 || pendingCosts.length > 0) && <div className="qb-pending" role="status">
      <strong>Complete este item</strong>{errors.map((error, errorIndex) => <p key={errorIndex}>{error}</p>)}
      {pendingCosts.map((cost, costIndex) => <p key={costIndex}>Custo pendente: {cost}.</p>)}
    </div>}
    {item.productId && warnings.length > 0 && <details className="qb-review"><summary>Conferir cadastros ({warnings.length})</summary>
      {warnings.map((warning, warningIndex) => <p key={warningIndex}>{warning}</p>)}</details>}
    {result?.margin != null && result.margin < 0 && <p className="qb-pending" role="status">O preço de venda não cobre o custo e a taxa de pagamento deste item.</p>}
    <p className="qb-item-total">{item.quantity || 0} peça(s) × {amount(result?.sale)}<strong>Total do item: {amount(result?.total)}</strong></p>
  </div>;
}

export default function QuoteBuilder({ catalog, quote, result, disabled, locked, onChange, actions, dtfDetails }: Props) {
  const [openItem, setOpenItem] = useState<string | null>(quote.items[0]?.id || null);
  const [removed, setRemoved] = useState<{ item: ItemInput; index: number } | null>(null);
  const pieces = quote.items.reduce((total, item) => total + item.quantity, 0);
  const completeCosts = quote.items.length > 0 && result.items.every(item => item.totalCost != null);
  const cost = completeCosts ? result.items.reduce((total, item) => total + item.totalCost!, 0) : null;
  const products = catalog.entries.filter(entry => entry.active && entry.kind === 'product');
  const updateItem = (item: ItemInput) => onChange({ ...quote, items: quote.items.map(current => current.id === item.id ? item : current) });
  const addItem = (template?: ItemInput) => {
    if (disabled || quote.items.length >= 60) return;
    const item: ItemInput = template ? { ...structuredClone(template), id: crypto.randomUUID() } : {
      id: crypto.randomUUID(), productId: '', line: '', color: '', size: '', quantity: 1, prints: [],
      extraIds: catalog.entries.filter(entry => entry.active && entry.kind === 'extra').map(entry => entry.id),
      margin: catalog.rules.margin, fee: catalog.rules.fee, manualGarmentCost: null, manualSalePrice: null, description: '',
    };
    onChange({ ...quote, items: [...quote.items, item] });
    setOpenItem(item.id);
    requestAnimationFrame(() => document.getElementById(`qb-item-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };
  return <div className="qb-workspace">
    <datalist id="qb-print-positions">{positions.map(position => <option key={position} value={position} />)}</datalist>
    <div className="qb-main">
      <section className="qb-panel" aria-label="Cliente e condições">
        <div className="qb-panel-heading"><div><span className="qb-eyebrow">1 · CLIENTE E ENTREGA</span><h2>Cliente e entrega</h2></div></div>
        <fieldset className="qb-editor-fields" disabled={disabled}>
          <Input label="Nome do projeto (interno)" maxLength={300} value={quote.title || ''} onChange={title => onChange({ ...quote, title })} placeholder="Ex.: Uniformes da barbearia" />
          <div className="qb-two-fields"><Input label="Cliente" value={quote.customer} onChange={customer => onChange({ ...quote, customer })}
            placeholder="Nome do cliente ou empresa" />
            <Input label="Contato" value={quote.contact} onChange={contact => onChange({ ...quote, contact })} placeholder="WhatsApp ou e-mail" />
            <Options label="Entrega" value={quote.shippingLabel} onChange={shippingLabel => {
              const freight = catalog.entries.find(entry => entry.active && entry.kind === 'freight' && entry.name === shippingLabel);
              onChange({ ...quote, shippingLabel, shipping: shippingLabel === 'Retirada' ? 0 : freight?.cost ?? null });
            }}><option value="">Escolha a entrega</option><option>Retirada</option><option>Frete manual</option>
              {quote.shippingLabel && !['Retirada', 'Frete manual'].includes(quote.shippingLabel)
                && !catalog.entries.some(entry => entry.active && entry.kind === 'freight' && entry.name === quote.shippingLabel)
                && <option>{quote.shippingLabel}</option>}
              {catalog.entries.filter(entry => entry.active && entry.kind === 'freight').map(entry => <option key={entry.id}>{entry.name}</option>)}</Options>
            <Input label="Frete (R$)" type="number" value={quote.shipping} onChange={value => onChange({ ...quote, shipping: numeric(value), shippingLabel: 'Frete manual' })} />
          </div>
          <details className="qb-details" open={locked || undefined}><summary>Pagamento, prazo e observações <ChevronDown size={16} /></summary>
            <div className="qb-two-fields"><Input label="Forma / condições de pagamento" value={quote.payment} onChange={payment => onChange({ ...quote, payment })} placeholder="Ex.: Pix na aprovação" />
              <Input label="Prazo de produção" value={quote.deadline} onChange={deadline => onChange({ ...quote, deadline })} />
              <Input label="Validade" type="date" value={quote.validUntil} onChange={validUntil => onChange({ ...quote, validUntil })} /></div>
            <label className="pw-field"><span>Observações para o cliente</span><textarea value={quote.notes}
              onChange={event => onChange({ ...quote, notes: event.target.value })} placeholder="Informações que devem aparecer na proposta" /></label>
          </details>
        </fieldset>
      </section>
      <section className="qb-panel" aria-label="Peças do orçamento">
        <div className="qb-panel-heading"><div><span className="qb-eyebrow">2 · MONTE OS ITENS</span><h2>Peças e estampas</h2>
          <p>Escolha a peça, personalize e confira o preço.</p></div><span className="qb-count">{pieces} peça(s)</span></div>
        {!products.length && <p className="qb-pending">Cadastre ao menos um produto em Cadastros para começar.</p>}
        {!quote.items.length && <div className="qb-empty"><Shirt size={36} strokeWidth={1.4} /><h3>Comece pela primeira peça</h3>
          <p>Produtos, cores, tamanhos e estampas ficam juntos no orçamento.</p>
          <button type="button" className="pw-primary" disabled={disabled || !products.length} onClick={() => addItem()}><Plus size={18} /> Adicionar primeira peça</button></div>}
        {quote.items.map((item, index) => {
          const calculation = result.items[index];
          const name = calculation?.product?.name || products.find(product => product.id === item.productId)?.name || 'Escolha a peça';
          const open = openItem === item.id;
          return <article id={`qb-item-${item.id}`} className={`qb-piece${open ? ' qb-piece-open' : ''}`} key={item.id}>
            <div className="qb-piece-heading"><button type="button" className="qb-piece-toggle" aria-expanded={open}
              aria-controls={`qb-editor-${item.id}`} onClick={() => setOpenItem(open ? null : item.id)}>
              <span className="qb-item-number">{String(index + 1).padStart(2, '0')}</span><span className="qb-piece-title"><strong>{name}</strong>
                <small>{[item.color, item.size, `${item.quantity || 0} peça(s)`, `${item.prints.length} estampa(s)`].filter(Boolean).join(' · ')}</small></span>
              <span className="qb-piece-price">{amount(calculation?.total)}</span><ChevronDown size={18} /></button>
              {!locked && <div className="qb-piece-tools"><button type="button" className="qb-icon" disabled={disabled || quote.items.length >= 60}
                title="Duplicar para mudar cor, tamanho ou produto" aria-label={`Duplicar item ${index + 1}`} onClick={() => addItem(item)}><Copy size={17} /></button>
                <button type="button" className="qb-icon" disabled={disabled} aria-label={`Remover item ${index + 1}`} onClick={() => {
                  setRemoved({ item: structuredClone(item), index });
                  onChange({ ...quote, items: quote.items.filter(current => current.id !== item.id) });
                  if (open) setOpenItem(quote.items[index + 1]?.id || quote.items[index - 1]?.id || null);
                }}><Trash2 size={17} /></button></div>}
            </div>
            {open && <fieldset id={`qb-editor-${item.id}`} className="qb-editor-fields" disabled={disabled}>
              <PieceEditor catalog={catalog} item={item} result={calculation} onChange={updateItem} />
            </fieldset>}
          </article>;
        })}
        {removed && !locked && <div className="qb-undo" role="status">Item removido.<button type="button" disabled={disabled || quote.items.length >= 60} onClick={() => {
          const items = [...quote.items]; items.splice(removed.index, 0, removed.item);
          onChange({ ...quote, items }); setOpenItem(removed.item.id); setRemoved(null);
        }}>Desfazer</button></div>}
        {!!quote.items.length && !locked && <div className="qb-add-item"><button type="button" disabled={disabled || !products.length || quote.items.length >= 60}
          onClick={() => addItem()}><Plus size={18} /> Adicionar outra peça</button><small>Para repetir uma peça e mudar a variação, use o botão de duplicar no item.</small></div>}
        {quote.items.length >= 60 && <p className="qb-help">Limite de 60 itens por orçamento.</p>}
      </section>

      {result.dtf?.hasDtf && <section className="qb-panel qb-dtf"><details><summary><span>Compra de DTF <small>Material por arte, metragem e encaixe</small></span><strong>{amount(result.dtf.purchaseCost)}</strong><ChevronDown size={18} /></summary>
        <fieldset className="qb-editor-fields" disabled={disabled}>{dtfDetails}</fieldset></details></section>}
    </div>

    <aside className="qb-summary" aria-label="Resumo do orçamento">
      <span className="qb-eyebrow">{locked ? 'PROPOSTA FINALIZADA' : 'RESUMO EM TEMPO REAL'}</span><h2>Seu orçamento</h2>
      <p className="qb-summary-count">{quote.items.length} item(ns) · {pieces} peça(s)</p>
      <div className="qb-summary-items">{quote.items.map((item, index) => <button key={item.id} type="button" onClick={() => {
        setOpenItem(item.id); requestAnimationFrame(() => document.getElementById(`qb-item-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }}><span>{item.quantity || 0}× {result.items[index]?.product?.name || 'Peça a selecionar'}<small>{[item.color, item.size].filter(Boolean).join(' · ')}</small></span>
        <strong>{amount(result.items[index]?.total)}</strong></button>)}</div>
      <dl className="qb-summary-values"><div><dt>Subtotal dos itens</dt><dd>{amount(result.subtotal)}</dd></div><div><dt>Frete</dt><dd>{amount(quote.shipping)}</dd></div></dl>
      <fieldset disabled={disabled} className="qb-editor-fields"><details className="qb-details" open={quote.discount !== 0 || quote.surcharge !== 0 || undefined}>
        <summary>Desconto e acréscimo <ChevronDown size={16} /></summary><div className="qb-two-fields">
          <Input label="Desconto total (R$)" type="number" value={quote.discount} onChange={value => onChange({ ...quote, discount: numeric(value) ?? 0 })} />
          <Input label="Acréscimos (R$)" type="number" value={quote.surcharge} onChange={value => onChange({ ...quote, surcharge: numeric(value) ?? 0 })} />
        </div></details></fieldset>
      {(quote.discount > 0 || quote.surcharge > 0) && <dl className="qb-summary-values">{quote.discount > 0 && <div><dt>Desconto</dt><dd>− {money(quote.discount)}</dd></div>}
        {quote.surcharge > 0 && <div><dt>Acréscimos</dt><dd>+ {money(quote.surcharge)}</dd></div>}</dl>}
      {!quote.customer.trim() && !locked && <p className="qb-help">Informe o cliente para finalizar a proposta e criar o pedido depois da aprovação.</p>}
      <div className="qb-grand-total"><span>Total para o cliente</span><strong>{amount(result.total)}</strong>
        {result.total == null && <small>Complete os itens e escolha a entrega.</small>}</div>
      {quote.items.length > 0 && result.errors.length > 0 && <details className="qb-review"><summary>Pendências para finalizar ({result.errors.length})</summary>
        {result.errors.map((error, index) => <p key={index}>{error}</p>)}</details>}
      <div className="qb-internal-cost"><span>Custos dos itens · interno</span><strong>{amount(cost)}</strong><small>Custos e fornecedores ficam na versão interna.</small></div>
    </aside>
    <section className="qb-panel qb-finalize" aria-label="Finalizar proposta"><div><span className="qb-eyebrow">3 · CONCLUA A PROPOSTA</span><h2>Salvar e gerar orçamento</h2><p>Confira os itens e gere a versão do cliente.</p></div><div className="qb-summary-actions">{actions}</div></section>
  </div>;
}
