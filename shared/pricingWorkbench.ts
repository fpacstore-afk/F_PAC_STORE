import { garmentProfile, garmentTitle } from './garmentModels';
import { packDtf, type DtfRectangle } from './dtfPacking';
export type Kind = 'product' | 'price' | 'stamp' | 'extra' | 'supplier' | 'freight';
export type Source = { kind: 'sheet' | 'app'; sheet?: string; range?: string; url?: string; importedAt?: string };
export type Entry = {
  id: string; kind: Kind; name: string; active: boolean; status: string; source: Source;
  supplier?: string; product?: string; line?: string; code?: string; category?: string;
  composition?: string; weight?: string; fit?: string; colors?: string[]; sizes?: string[];
  measurements?: string; shrinkage?: string; notes?: string; date?: string;
  minQty?: number; cost?: number | null; width?: number | null; height?: number | null;
  method?: 'dtf' | 'fixed' | 'manual'; basis?: 'unit' | 'order' | 'quote'; color?: string; size?: string;
  restrictions?: { colors: string[]; sizes: string[] }[];
  defaultForOrders?: boolean;
};
export type Rules = {
  sheetWidth: number | null; sheetHeight: number | null; sheetCost: number | null; gap: number | null;
  dtfStatus: string; margin: number | null; fee: number | null; staleDays: number | null;
  productionTime: string; source: Source;
  dtfCostBasis?: 'purchase' | 'consumed';
  dtfTiers?: { minMeters: number; pricePerMeter: number }[];
};
export type Catalog = { entries: Entry[]; rules: Rules; sourceTitle?: string; sourceUrl?: string };
export type PrintInput = { stampId: string; width: number | null; height: number | null; position: string; manualCost: number | null };
export type ItemInput = {
  id: string; productId: string; line: string; color: string; size: string; quantity: number;
  prints: PrintInput[]; extraIds: string[]; margin: number | null; fee: number | null;
  manualGarmentCost: number | null; manualSalePrice: number | null; description: string;
};
export type QuoteInput = {
  title?: string;
  customer: string; contact: string; items: ItemInput[]; discount: number; surcharge: number;
  shipping: number | null; shippingLabel: string; payment: string; deadline: string; validUntil: string; notes: string;
  dtfPurchaseMeters?: number | null;
};
export type Component = { name: string; unitCost: number | null; source: string };
export const money = (n: number | null | undefined) => n == null ? 'Falta cadastrar' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const origin = (s?: Source) => s?.kind === 'sheet' ? `Planilha · ${s.sheet || ''} ${s.range || ''}` : 'Cadastro no aplicativo';
export const emptyCatalog = (): Catalog => ({ entries: [], rules: { sheetWidth: null, sheetHeight: null, sheetCost: null, gap: null, dtfStatus: 'Preencher', margin: null, fee: null, staleDays: null, productionTime: '', source: { kind: 'app' } } });

export function dtfCost(width: number | null, height: number | null, r: Rules) {
  if (![width, height, r.sheetWidth, r.sheetHeight, r.sheetCost, r.gap].every(known) || !width || !height || !r.sheetWidth || !r.sheetHeight) return null;
  // Same homogeneous grid and 90-degree rotation as the source spreadsheet.
  const count = Math.max(Math.floor((r.sheetWidth! + r.gap!) / (width + r.gap!)) * Math.floor((r.sheetHeight! + r.gap!) / (height + r.gap!)), Math.floor((r.sheetWidth! + r.gap!) / (height + r.gap!)) * Math.floor((r.sheetHeight! + r.gap!) / (width + r.gap!)));
  return count > 0 ? { count, unitCost: r.sheetCost! / count } : null;
}

export function dtfPurchase(items: Pick<ItemInput, 'quantity' | 'prints'>[], catalog: Catalog, manualMeters?: number | null) {
  const rectangles: DtfRectangle[] = [];
  const requestedArts: { name: string; position: string; width: number | null; height: number | null; quantity: number; fits: boolean }[] = [];
  let hasDtf = false, complete = true;
  const r = catalog.rules;
  for (const item of items) for (const print of item.prints) {
    if (known(print.manualCost) || !catalog.entries.some(e => e.id === print.stampId && e.kind === 'stamp' && e.active && e.method === 'dtf')) continue;
    hasDtf = true;
    const fit = dtfCost(print.width, print.height, r);
    const stamp = catalog.entries.find(e => e.id === print.stampId);
    requestedArts.push({ name: stamp?.name || 'Estampa', position: print.position, width: print.width, height: print.height, quantity: item.quantity, fits: !!fit });
    if (!fit || !Number.isInteger(item.quantity) || item.quantity < 1) { complete = false; continue; }
    rectangles.push({ width: print.width!, height: print.height!, quantity: item.quantity });
  }
  const packing = hasDtf && complete ? packDtf(rectangles,r.sheetWidth!,r.sheetHeight!,r.gap!) : null;
  const estimatedMeters = !hasDtf ? 0 : packing ? Math.ceil(packing.sheets * r.sheetHeight! / 100 - 1e-9) : null;
  const totalPrintArea = rectangles.reduce((sum,p) => sum + p.width*p.height*p.quantity,0);
  const manual = manualMeters != null;
  const validManual = Number.isInteger(manualMeters) && manualMeters! > 0 && manualMeters! <= 100000;
  const purchaseMeters = !hasDtf ? 0 : manual ? validManual ? manualMeters! : null : estimatedMeters;
  const baseRate = known(r.sheetCost) && known(r.sheetHeight) && r.sheetHeight > 0 ? r.sheetCost / (r.sheetHeight / 100) : null;
  const tier = hasDtf && purchaseMeters != null && purchaseMeters > 0 ? [...(r.dtfTiers || [])].filter(t => purchaseMeters >= t.minMeters).sort((a,b) => b.minMeters - a.minMeters)[0] : undefined;
  const pricePerMeter = baseRate == null || (hasDtf && purchaseMeters == null) ? null : tier?.pricePerMeter ?? baseRate;
  const sheetCost = pricePerMeter == null || !known(r.sheetHeight) ? null : pricePerMeter * r.sheetHeight / 100;
  const warnings: string[] = [];
  if (hasDtf && estimatedMeters == null) warnings.push(complete ? 'Não foi possível concluir o encaixe automático. Confira o layout com o fornecedor e informe a compra real.' : 'Complete medidas e quantidades; cada estampa precisa caber na folha DTF.');
  if (hasDtf && manual && !validManual) warnings.push('Informe uma compra de DTF em metros inteiros positivos.');
  if (hasDtf && manual && validManual && estimatedMeters != null && manualMeters! < estimatedMeters) warnings.push('A compra informada é menor que a estimativa. Confira o encaixe das artes ou as sobras disponíveis.');
  // The area-based material reference is independent of the whole-meter minimum
  // and of the configured margin cost basis. Keep full precision until display.
  const sheetArea = known(r.sheetWidth) && r.sheetWidth > 0 && known(r.sheetHeight) && r.sheetHeight > 0 ? r.sheetWidth * r.sheetHeight : null;
  const areaRate = sheetCost != null && sheetArea != null ? sheetCost / sheetArea : null;
  const arts = requestedArts.map(({ fits, ...art }) => {
    const unitMaterialCost = fits && areaRate != null ? art.width! * art.height! * areaRate : null;
    return { ...art, unitMaterialCost, totalMaterialCost: unitMaterialCost != null && Number.isInteger(art.quantity) && art.quantity > 0 ? unitMaterialCost * art.quantity : null };
  });
  const materialCost = arts.every(a => a.totalMaterialCost != null) ? arts.reduce((sum, a) => sum + a.totalMaterialCost!, 0) : null;
  return { hasDtf, estimatedMeters, purchaseMeters, pricePerMeter, sheetCost, totalPrintArea, arts, materialCost, costBasis: r.dtfCostBasis || 'consumed', packing, sheetWidth: r.sheetWidth, sheetHeight: r.sheetHeight, gap: r.gap, tierFromMeters: tier?.minMeters ?? null, manual, purchaseCost: purchaseMeters == null || pricePerMeter == null ? null : purchaseMeters * pricePerMeter, warnings };
}

export function dtfPrintCost(print: PrintInput, rules: Rules, purchase: ReturnType<typeof dtfPurchase>) {
  const fit = dtfCost(print.width,print.height,{...rules,sheetCost:purchase.sheetCost});
  if (!fit) return null;
  if (purchase.costBasis !== 'purchase') return print.width! * print.height! * (purchase.sheetCost! / (rules.sheetWidth! * rules.sheetHeight!));
  return purchase.purchaseCost != null && purchase.totalPrintArea > 0
    ? purchase.purchaseCost * (print.width! * print.height! / purchase.totalPrintArea) : null;
}

// Order-wide extras are shared only by the lines where the extra is selected.
// Legacy `order` entries retain their original per-line-lot meaning.
export function quoteExtraQuantities(items: ItemInput[], catalog: Catalog): Record<string, number> {
  const totals: Record<string, number> = Object.create(null);
  const ids = new Set(catalog.entries.filter(e => e.kind === 'extra' && e.basis === 'quote' && e.active).map(e => e.id));
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;
    for (const id of new Set(item.extraIds)) if (ids.has(id)) totals[id] = (totals[id] || 0) + item.quantity;
  }
  return totals;
}

export function calculateItem(item: ItemInput, catalog: Catalog, today = new Date().toISOString().slice(0, 10), quoteQuantities: Record<string, number> = {}, purchase = dtfPurchase([item], catalog)) {
  const errors: string[] = [], detailsPending: string[] = [], warnings: string[] = [], components: Component[] = [];
  const product = catalog.entries.find(e => e.id === item.productId && e.kind === 'product' && e.active);
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100000) errors.push('Informe uma quantidade inteira entre 1 e 100.000.');
  if (!product) errors.push('Selecione um produto ativo.');
  if (!item.color.trim() || !item.size.trim()) errors.push('Informe cor e tamanho.');
  if (product?.colors?.length && !product.colors.some(c => normalize(c) === normalize(item.color))) errors.push('Cor não cadastrada para este produto/fornecedor.');
  if (product?.sizes?.length && !product.sizes.some(s => normalize(s) === normalize(item.size))) errors.push('Tamanho não cadastrado para este produto/fornecedor.');
  for (const rule of product?.restrictions || []) if (rule.colors.some(c => normalize(c) === normalize(item.color)) && !rule.sizes.some(s => normalize(s) === normalize(item.size))) errors.push(`Esta cor está disponível somente em ${rule.sizes.join(', ')} na referência importada.`);
  if (product?.notes) warnings.push(product.notes);
  const review = (e: Entry) => {
    if (e.status !== 'Confirmado') warnings.push(`${e.name}: ${e.status || 'situação não informada'}.`);
    if (!e.date) warnings.push(`${e.name}: data da cotação não informada.`);
    else if (known(catalog.rules.staleDays) && Date.parse(today) - Date.parse(e.date) > catalog.rules.staleDays * 86400000) warnings.push(`${e.name}: cotação de ${e.date} precisa ser atualizada.`);
  };
  let price: Entry | undefined;
  if (known(item.manualGarmentCost)) {
    components.push({ name: 'Peça', unitCost: item.manualGarmentCost, source: 'Custo manual' });
  } else {
    const matches = catalog.entries.filter(e => e.active && e.kind === 'price' && product && e.product === product.name && e.supplier === product.supplier && (e.line || '') === item.line && (!e.color || normalize(e.color) === normalize(item.color)) && (!e.size || normalize(e.size) === normalize(item.size)) && (e.minQty || 1) <= item.quantity);
    const tier = Math.max(...matches.map(e => e.minQty || 1));
    const candidates = matches.filter(e => (e.minQty || 1) === tier);
    if (candidates.length === 1) price = candidates[0];
    else warnings.push(candidates.length ? 'Há cotações conflitantes nesta faixa. Revise o cadastro ou informe um custo manual.' : 'Não há cotação compatível com fornecedor, linha, cor, tamanho e quantidade.');
    if (price) review(price);
    components.push({ name: 'Peça', unitCost: known(price?.cost) ? price!.cost! : null, source: price ? `${origin(price.source)} · ${price.supplier} · ${price.minQty}+ peças` : 'Cotação ausente' });
  }
  item.prints.forEach((p, index) => {
    const stamp = catalog.entries.find(e => e.id === p.stampId && e.kind === 'stamp' && e.active);
    let cost: number | null = null, source = 'Regra não cadastrada';
    if (!p.position.trim()) detailsPending.push(`Informe a posição da estampa ${index + 1}.`);
    if (known(p.manualCost)) { cost = p.manualCost; source = 'Custo manual'; }
    else if (stamp) {
      source = origin(stamp.source);
      review(stamp);
      if (stamp.method === 'fixed') cost = known(stamp.cost) ? stamp.cost : null;
      if (stamp.method === 'dtf') {
        const fit = dtfCost(p.width, p.height, { ...catalog.rules, sheetCost: purchase.sheetCost });
        cost = dtfPrintCost(p,catalog.rules,purchase);
        source += cost != null ? purchase.costBasis === 'purchase'
          ? ` · ${p.width} × ${p.height} cm · rateio por área da compra inteira (${purchase.purchaseMeters} m · ${money(purchase.purchaseCost)})`
          : ` · material aplicado por área (${p.width} × ${p.height} cm) · compra conjunta ${purchase.purchaseMeters} m · ${money(purchase.pricePerMeter)}/m`
          : ' · confira medidas, parâmetros e metragem da compra';
        warnings.push(...purchase.warnings);
        if (catalog.rules.dtfStatus !== 'Confirmado') warnings.push(`Folha DTF: ${catalog.rules.dtfStatus}.`);
      }
    }
    components.push({ name: `Estampa ${index + 1}: ${stamp?.name || 'manual'} · ${p.position}`, unitCost: cost, source });
  });
  for (const id of item.extraIds) {
    const extra = catalog.entries.find(e => e.id === id && e.kind === 'extra' && e.active);
    if (extra) review(extra);
    const divisor = extra?.basis === 'quote' ? quoteQuantities[id] ?? item.quantity : extra?.basis === 'order' ? item.quantity : 1;
    components.push({ name: extra?.name || 'Adicional indisponível', unitCost: known(extra?.cost) && divisor > 0 ? extra!.cost! / divisor : null, source: extra ? `${origin(extra.source)}${extra.basis === 'quote' ? ` · uma vez por pedido, rateado em ${divisor} peças` : ''}` : 'Cadastro ausente' });
  }
  const knownSubtotal = components.reduce((sum, c) => sum + (c.unitCost ?? 0), 0);
  const cost = components.some(c => c.unitCost === null) || errors.length ? null : knownSubtotal;
  let suggested: number | null = null;
  if (cost != null && known(item.margin) && known(item.fee) && item.margin + item.fee < 1) suggested = round(cost / (1 - item.margin - item.fee));
  if (!known(item.margin) || !known(item.fee)) warnings.push('Margem ou taxa de pagamento ausente: preço sugerido indisponível.');
  else if (item.margin + item.fee >= 1) errors.push('A soma de margem e taxa precisa ser menor que 100%.');
  const sale = known(item.manualSalePrice) ? round(item.manualSalePrice) : suggested;
  const margin = cost != null && sale != null && sale > 0 && known(item.fee) ? (sale * (1 - item.fee) - cost) / sale : null;
  return { product, price, components, errors: [...errors,...detailsPending], costPending: components.filter(c => c.unitCost == null).map(c => c.name), warnings: [...new Set(warnings)], knownSubtotal, cost, totalCost: cost == null ? null : cost * item.quantity, suggested, sale, total: sale == null || errors.length ? null : round(sale * item.quantity), margin, saleSource: item.manualSalePrice != null ? 'Preço manual' : 'Regra de margem cadastrada' };
}

export function calculateQuote(input: QuoteInput, catalog: Catalog) {
  const quantities = quoteExtraQuantities(input.items, catalog);
  const dtf = dtfPurchase(input.items, catalog, input.dtfPurchaseMeters);
  const items = input.items.map(i => calculateItem(i, catalog, undefined, quantities, dtf));
  const errors = items.flatMap((i, n) => i.errors.map(e => `Item ${n + 1}: ${e}`));
  if (!items.length) errors.push('Adicione pelo menos um item.');
  if (input.dtfPurchaseMeters != null && (!Number.isInteger(input.dtfPurchaseMeters) || input.dtfPurchaseMeters < 1 || input.dtfPurchaseMeters > 100000)) errors.push('Informe metros inteiros positivos para a compra de DTF.');
  if (!known(input.discount) || !known(input.surcharge)) errors.push('Desconto e acréscimos não podem ser negativos.');
  const subtotal = items.some(i => i.total == null) ? null : round(items.reduce((s, i) => s + i.total!, 0));
  if (subtotal != null && input.discount > subtotal) errors.push('Desconto maior que o valor dos itens.');
  if (!known(input.shipping)) errors.push('Informe frete ou selecione retirada.');
  const total = subtotal == null || errors.length ? null : round(subtotal - input.discount + input.surcharge + input.shipping!);
  return { items, errors, subtotal, total, dtf };
}

export function validateCatalog(value: any): asserts value is Catalog {
  if (!value || !Array.isArray(value.entries) || value.entries.length > 2000 || !value.rules) throw new Error('Base de cadastros inválida.');
  const ids = new Set<string>(), keys = new Set<string>();
  for (const e of value.entries) {
    if (!e || !/^[a-zA-Z0-9_-]{1,100}$/.test(e.id) || ids.has(e.id) || !['product','price','stamp','extra','supplier','freight'].includes(e.kind) || typeof e.name !== 'string' || !e.name.trim() || typeof e.active !== 'boolean' || !e.source || !['app','sheet'].includes(e.source.kind)) throw new Error('Cadastro inválido ou identificador duplicado.');
    ids.add(e.id);
    for (const key of ['name','status','supplier','product','line','code','category','composition','weight','fit','measurements','shrinkage','notes','date','color','size']) if (e[key] != null && (typeof e[key] !== 'string' || e[key].length > 10000)) throw new Error('Texto de cadastro inválido.');
    if (typeof e.status !== 'string') throw new Error('Informe a situação do cadastro.');
    for (const key of ['colors','sizes']) if (e[key] != null && (!Array.isArray(e[key]) || e[key].length > 300 || e[key].some((s: any) => typeof s !== 'string' || !s.trim() || s.length > 150))) throw new Error('Lista de cores/tamanhos inválida.');
    if (e.restrictions != null && (!Array.isArray(e.restrictions) || e.restrictions.length > 100 || e.restrictions.some((r: any) => !r || !Array.isArray(r.colors) || !Array.isArray(r.sizes) || !r.colors.length || !r.sizes.length || [...r.colors,...r.sizes].some(s => typeof s !== 'string' || !s.trim())))) throw new Error('Preencha cores e tamanhos da restrição.');
    if (e.method != null && !['dtf','fixed','manual'].includes(e.method)) throw new Error('Regra de estampa inválida.');
    if (e.basis != null && !['unit','order','quote'].includes(e.basis)) throw new Error('Aplicação do custo inválida.');
    if (e.defaultForOrders != null && typeof e.defaultForOrders !== 'boolean') throw new Error('Padrão de insumo inválido.');
    if (e.kind === 'price' && (!e.product?.trim() || !e.supplier?.trim())) throw new Error('Cotação precisa de produto e fornecedor.');
    for (const key of ['cost','width','height','minQty']) if (e[key] != null && !known(e[key])) throw new Error(`Valor inválido em ${e.name}: ${key}.`);
    if (e.minQty != null && (!Number.isInteger(e.minQty) || e.minQty < 1)) throw new Error('Quantidade mínima inválida.');
    if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('Data da cotação inválida.');
    if (e.active) {
      const key = [e.kind, e.kind === 'price' ? e.product : e.name, e.supplier, e.kind === 'product' ? e.code : e.line, e.kind === 'price' ? e.minQty : '', e.color, e.size].map(v => normalize(String(v ?? ''))).join('|');
      if (keys.has(key)) throw new Error(`Cadastro ativo duplicado: ${e.name}. Desative o anterior ou edite-o.`);
      keys.add(key);
    }
  }
  for (const key of ['dtfStatus','productionTime']) if (typeof value.rules[key] !== 'string') throw new Error('Parâmetro de texto inválido.');
  for (const key of ['sheetWidth','sheetHeight','sheetCost','gap','margin','fee','staleDays']) if (value.rules[key] != null && !known(value.rules[key])) throw new Error(`Parâmetro inválido: ${key}.`);
  if (value.rules.dtfCostBasis != null && !['purchase','consumed'].includes(value.rules.dtfCostBasis)) throw new Error('Regra de rateio do DTF inválida.');
  if (value.rules.dtfTiers != null) {
    if (!Array.isArray(value.rules.dtfTiers) || value.rules.dtfTiers.length > 20) throw new Error('Faixas de DTF inválidas.');
    const starts = new Set<number>();
    for (const tier of value.rules.dtfTiers) {
      if (!tier || !Number.isInteger(tier.minMeters) || tier.minMeters < 1 || tier.minMeters > 100000 || !known(tier.pricePerMeter) || starts.has(tier.minMeters)) throw new Error('Informe metros inteiros, preço válido e início diferente para cada faixa de DTF.');
      starts.add(tier.minMeters);
    }
  }
  if ((value.rules.margin ?? 0) + (value.rules.fee ?? 0) >= 1) throw new Error('Margem e taxa somadas devem ser menores que 100%.');
}

export function validateQuote(value: any): asserts value is QuoteInput {
  if (value?.title != null && (typeof value.title !== 'string' || value.title.length > 300)) throw new Error('Nome do projeto inválido (máximo 300 caracteres).');
  if (!value || !Array.isArray(value.items) || value.items.length > 60) throw new Error('Orçamento inválido (máximo 60 itens).');
  for (const k of ['customer','contact','shippingLabel','payment','deadline','validUntil','notes']) if (typeof value[k] !== 'string' || value[k].length > 5000) throw new Error(`Campo inválido: ${k}.`);
  for (const k of ['discount','surcharge','shipping']) if (value[k] != null && !known(value[k])) throw new Error(`Valor inválido: ${k}.`);
  if (value.dtfPurchaseMeters != null && (!Number.isInteger(value.dtfPurchaseMeters) || value.dtfPurchaseMeters < 1 || value.dtfPurchaseMeters > 100000)) throw new Error('A compra de DTF deve ser informada em metros inteiros positivos.');
  if (!known(value.discount) || !known(value.surcharge)) throw new Error('Informe desconto e acréscimo (0 quando não houver).');
  if (new Set(value.items.map((i: any) => i?.id)).size !== value.items.length) throw new Error('Identificadores de itens duplicados.');
  for (const i of value.items) {
    if (!i || !Array.isArray(i.prints) || i.prints.length > 20 || !Array.isArray(i.extraIds) || i.extraIds.length > 100 || new Set(i.extraIds).size !== i.extraIds.length) throw new Error('Estampas/adicionais inválidos.');
    if (i.extraIds.some((id: any) => typeof id !== 'string')) throw new Error('Adicional inválido.');
    for (const k of ['id','productId','line','color','size','description']) if (typeof i[k] !== 'string' || i[k].length > 5000) throw new Error('Descrição do item inválida.');
    if (!Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 100000) throw new Error('Quantidade inválida.');
    for (const k of ['margin','fee','manualGarmentCost','manualSalePrice']) if (i[k] != null && !known(i[k])) throw new Error(`Valor inválido: ${k}.`);
    for (const p of i.prints) {
      if (!p || typeof p.position !== 'string' || typeof p.stampId !== 'string') throw new Error('Estampa inválida.');
      for (const k of ['width','height','manualCost']) if (p[k] != null && !known(p[k])) throw new Error('Custo/dimensão inválido.');
    }
  }
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Explicit customer projection: never interpolate catalog, supplier, cost or margin.
export function customerHtml(quote: QuoteInput, result: ReturnType<typeof calculateQuote>, id: string) {
  const text = escapeHtml;
  const rows = result.items.map((r, i) => `<tr><td>${text(garmentTitle(r.product?.name || '', garmentProfile(r.product)))}<br>${text(quote.items[i].color)} · ${text(quote.items[i].size)}<br>${text(quote.items[i].description)}<br>${quote.items[i].prints.map(p => `${text(p.position)}: ${text(p.width)} × ${text(p.height)} cm`).join('<br>')}</td><td>${quote.items[i].quantity}</td><td>${text(money(r.sale))}</td><td>${text(money(r.total))}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Orçamento F PAC ${text(id)}</title><style>body{font:15px Arial;color:#151515;max-width:900px;margin:40px auto;padding:20px}header{border-bottom:5px solid #eab308;padding-bottom:20px}h1{margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd}p{white-space:pre-wrap}strong{font-size:20px}@media print{body{margin:0;max-width:none}button{display:none}}</style><header><h1>F PAC STORE</h1><p>NÃO É SÓ ROUPA. É IDENTIDADE!</p></header><h2>Orçamento ${text(id)}</h2><p>${text(quote.customer)}<br>${text(quote.contact)}</p><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Itens: ${text(money(result.subtotal))}<br>Desconto: ${text(money(quote.discount))}<br>Acréscimos: ${text(money(quote.surcharge))}<br>Entrega (${text(quote.shippingLabel)}): ${text(money(quote.shipping))}</p><strong>Total: ${text(money(result.total))}</strong><p>Pagamento: ${text(quote.payment || 'A combinar')}<br>Prazo: ${text(quote.deadline || 'A confirmar')}<br>Validade: ${text(quote.validUntil || 'Não informada')}</p><p>${text(quote.notes)}</p></html>`;
}
