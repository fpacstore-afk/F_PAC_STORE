import React, { useMemo, useState } from 'react';
import { Plus, Ruler, Trash2 } from 'lucide-react';
import { type Catalog, type PrintInput, dtfPrintCost, dtfPurchase, money, round } from '../../../shared/pricingWorkbench';
import DtfPackingPreview from './DtfPackingPreview';

type Row = { id: string; width: number | null; height: number | null; quantity: number };
const emptyRow = (): Row => ({ id: crypto.randomUUID(), width: null, height: null, quantity: 1 });
const numeric = (value: string) => value.trim() ? Number(value.replace(',', '.')) : null;
const amount = (value: number | null | undefined) => value == null ? 'Pendente' : money(value);

function NumberField({ label, value, onChange, integer = false, placeholder }: {
  label: string; value: number | null; onChange: (value: number | null) => void; integer?: boolean; placeholder?: string;
}) {
  return <label className="pw-field"><span>{label}</span><input type="number" inputMode={integer ? 'numeric' : 'decimal'}
    min={integer ? 1 : 0} step={integer ? 1 : 'any'} value={value ?? ''} placeholder={placeholder}
    onChange={event => onChange(numeric(event.target.value))} /></label>;
}

export default function StampSimulator({ catalog }: { catalog: Catalog }) {
  const dtfEntries = catalog.entries.filter(entry => entry.active && entry.kind === 'stamp' && entry.method === 'dtf');
  const [stampId, setStampId] = useState(dtfEntries[0]?.id || '');
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [manualMeters, setManualMeters] = useState<number | null>(null);
  const [margin, setMargin] = useState(catalog.rules.margin);
  const [fee, setFee] = useState(catalog.rules.fee);
  const [removed, setRemoved] = useState<{ row: Row; index: number } | null>(null);
  const prints = useMemo(() => rows.map(row => ({ quantity: row.quantity,
    prints: [{ stampId, width: row.width, height: row.height, position: 'Simulação', manualCost: null } as PrintInput] })), [rows, stampId]);
  const purchase = useMemo(() => dtfPurchase(prints, catalog, manualMeters), [prints, catalog, manualMeters]);
  const hasInput = rows.length > 0 && dtfEntries.some(entry => entry.id === stampId);
  const costs = prints.map(row => hasInput ? dtfPrintCost(row.prints[0], catalog.rules, purchase) : null);
  const suggested = costs.map(cost => cost != null && margin != null && margin >= 0 && fee != null && fee >= 0 && margin + fee < 1
    ? round(cost / (1 - margin - fee)) : null);
  const quantity = rows.reduce((total, row) => total + row.quantity, 0);
  const totalSuggested = suggested.every(value => value != null) && hasInput && rows.every(row => Number.isInteger(row.quantity) && row.quantity > 0)
    ? round(suggested.reduce((total, value, index) => total + value! * rows[index].quantity, 0)) : null;
  const update = (id: string, patch: Partial<Row>) => setRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  return <div className="dtf-simulator">
    <div className="qb-panel dtf-intro"><div><span className="qb-eyebrow">CONSULTA RÁPIDA</span><h2>Calculadora de estampas</h2>
      <p>Informe medidas e quantidades diferentes para estimar o encaixe e a compra de DTF.</p></div><Ruler size={30} strokeWidth={1.5} /></div>
    <div className="qb-workspace">
      <div className="qb-main"><section className="qb-panel">
        <div className="qb-panel-heading"><h3>Medidas do projeto</h3><span className="qb-count">{quantity} estampa(s)</span></div>
        {!!dtfEntries.length && <label className="pw-field"><span>Referência de DTF</span><select value={stampId} onChange={event => setStampId(event.target.value)}>
          <option value="">Selecione o DTF</option>{dtfEntries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
        {!hasInput && <p className="qb-pending">{dtfEntries.length ? 'Selecione uma referência de DTF e adicione uma medida.' : 'Cadastre uma estampa com cálculo DTF em Cadastros para usar os parâmetros da folha.'}</p>}
        {rows.map((row, index) => <div className="dtf-input-row" key={row.id} role="group" aria-label={`Medida ${index + 1}`}>
          <span className="qb-item-number">{String(index + 1).padStart(2, '0')}</span>
          <NumberField label="Largura (cm)" value={row.width} onChange={width => update(row.id, { width })} placeholder="30" />
          <NumberField label="Altura (cm)" value={row.height} onChange={height => update(row.id, { height })} placeholder="40" />
          <NumberField label="Quantidade" integer value={row.quantity || null} onChange={quantity => update(row.id, { quantity: quantity ?? 0 })} />
          <button type="button" className="qb-icon" aria-label={`Remover medida ${index + 1}`} onClick={() => {
            setRemoved({ row, index }); setRows(current => current.filter(value => value.id !== row.id));
          }}><Trash2 size={17} /></button>
        </div>)}
        {removed && <div className="qb-undo" role="status">Medida removida.<button type="button" disabled={rows.length >= 60} onClick={() => {
          setRows(current => { const next = [...current]; next.splice(removed.index, 0, removed.row); return next; }); setRemoved(null);
        }}>Desfazer</button></div>}
        <button type="button" className="qb-add-print" disabled={rows.length >= 60} onClick={() => setRows(current => [...current, emptyRow()])}><Plus size={17} /> Adicionar medida</button>
        <p className="qb-help">Exemplo: uma linha com 4 estampas de 30 × 40 cm e outra com 2 de 10 × 10 cm. Todas são encaixadas juntas.</p>
      </section>
      {purchase.packing && hasInput && <section className="qb-panel"><DtfPackingPreview purchase={purchase} /></section>}
      {hasInput && <section className="qb-panel"><h3>Custo de cada medida</h3><div className="pw-table"><table>
        <thead><tr><th>Estampa</th><th>Qtd.</th><th>Material / arte</th><th>DTF na precificação / arte</th><th>Preço sugerido / arte</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id}><td>{row.width ?? '—'} × {row.height ?? '—'} cm</td><td>{row.quantity || '—'}</td>
          <td>{amount(purchase.arts[index]?.unitMaterialCost)}</td><td>{amount(costs[index])}</td><td>{amount(suggested[index])}</td></tr>)}</tbody></table></div>
        <p className="qb-help">{purchase.costBasis === 'purchase' ? 'A precificação rateia a compra inteira entre as estampas.' : 'A precificação considera o material aplicado; a compra inteira aparece separada.'} O preço sugerido inclui a margem e a taxa abaixo. Aplicação, peça e outros serviços devem ser incluídos no orçamento.</p>
      </section>}
      </div>
      <aside className="qb-summary dtf-summary" aria-label="Estimativa de DTF"><span className="qb-eyebrow">ESTIMATIVA DO PROJETO</span><h2>Compra de DTF</h2>
        <div className="dtf-meter"><strong>{hasInput && purchase.estimatedMeters != null ? `${purchase.estimatedMeters} m` : 'Pendente'}</strong><span>Metragem estimada</span></div>
        <dl className="qb-summary-values"><div><dt>Metros para compra</dt><dd>{hasInput && purchase.purchaseMeters != null ? `${purchase.purchaseMeters} m` : 'Pendente'}</dd></div>
          <div><dt>Preço por metro</dt><dd>{amount(hasInput ? purchase.pricePerMeter : null)}</dd></div>
          <div><dt>Material das estampas</dt><dd>{amount(hasInput ? purchase.materialCost : null)}</dd></div></dl>
        <div className="qb-grand-total"><span>Valor a pagar pelo DTF</span><strong>{amount(hasInput ? purchase.purchaseCost : null)}</strong></div>
        <NumberField label="Ajustar compra (metros inteiros)" integer value={manualMeters} onChange={setManualMeters} placeholder="Usar estimativa" />
        <p className="qb-help">Opcional. Deixe vazio para usar a estimativa. A compra é arredondada para metros inteiros.</p>
        {manualMeters != null && <button type="button" onClick={() => setManualMeters(null)}>Voltar à metragem estimada</button>}
        {purchase.warnings.map((warning, index) => <p className="qb-pending" role="status" key={index}>{warning}</p>)}
        {hasInput && catalog.rules.dtfStatus !== 'Confirmado' && <p className="qb-pending">Situação do DTF: {catalog.rules.dtfStatus || 'não informada'}. Confira os valores antes de vender.</p>}
        <details className="qb-details"><summary>Margem e preço sugerido</summary><div className="qb-two-fields">
          <NumberField label="Margem (%)" value={margin == null ? null : round(margin * 100)} onChange={value => setMargin(value == null ? null : value / 100)} />
          <NumberField label="Taxa de pagamento (%)" value={fee == null ? null : round(fee * 100)} onChange={value => setFee(value == null ? null : value / 100)} /></div>
          <p>Venda sugerida do DTF: <strong>{amount(totalSuggested)}</strong></p>
          {totalSuggested == null && <p className="qb-help">Complete medidas, quantidades, margem e taxa. Margem + taxa deve ser menor que 100%.</p>}
        </details>
        <p className="qb-help">O encaixe considera retângulos, rotação e espaçamento. Artes com contornos que se encaixam podem consumir menos material. Confira a disposição real antes de comprar.</p>
      </aside>
    </div>
  </div>;
}
