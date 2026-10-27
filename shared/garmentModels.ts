/** Physical identity shared by storefront, inventory, orders and Mockup Studio.
 * Collar mapping confirmed by the owner on 27/10/2026. No supplier cost is public. */
export const GARMENT_MODEL_REVISION = '2026-10-27.2';
export type GarmentFamily = 'traditional' | 'oversized' | 'regata';
export type GarmentChartRow = { size: string; length: string; width: string; sleeve: string; notes?: string };
const norm = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

/** Technical fields transcribed from the owner's ZIMM catalogue images (27/10).
 * Prices, quantities and historic quotes are intentionally not changed here. */
export function applyVerifiedGarmentSpecs(entry: any) {
  if (!entry || norm(entry.supplier) !== 'zimm') return entry;
  const specs: Record<string, any> = {
    'ZIM-004': { measurements: 'P 65×50 M16 | M 68×52 M18 | G 70×56 M18 | GG 72×58 M19', composition: 'Algodão e poliéster 30.1', weight: '250 g/m²', sizes: ['P','M','G','GG'], colors: ['Branco','Areia','Preto','Marrom','Off White','Verde'], shrinkage: '0%', collar: 'Gola de ribana canelada com largura de 3 cm' },
    'ZIM-009': { measurements: 'P 71×52 M24 | M 73×55 M25 | G 75×58 M26 | GG 77×61 M27', composition: 'Algodão e poliéster 30.1', weight: '250 g/m²', sizes: ['P','M','G','GG'], colors: ['Branco','Off White','Marinho','Preto','Marrom','Verde'], shrinkage: '0%', collar: 'Gola de ribana canelada com largura de 3 cm' },
    'ZIM-010': { measurements: 'P 65×53 | M 67×55 | G 69×57 | GG 71×59', composition: '100% algodão 30.1', weight: '160 g/m²', sizes: ['P','M','G','GG'], colors: ['Mescla','Areia','Marinho','Branco','Preto'] },
  };
  return specs[entry.id] ? { ...entry, ...specs[entry.id], technicalSource: 'Catálogo ZIMM enviado pelo proprietário em 27/10/2026' } : entry;
}

export function garmentFamily(product: any): GarmentFamily | null {
  const value = norm([product?.name, product?.baseModel, product?.category, product?.fit].filter(Boolean).join(' '));
  if (/regata/.test(value)) return 'regata';
  if (/cropped|boxy|feminin|plus size|polo|bermuda|short|moletom|infantil/.test(value)) return null;
  if (/oversized|oversaized|over sized/.test(value)) return 'oversized';
  return /tradicional|camiseta|camisa|suedine|regular|classic/.test(value) ? 'traditional' : null;
}

export function supplierSizeChart(entry: any): GarmentChartRow[] {
  entry = applyVerifiedGarmentSpecs(entry);
  const supplier = norm(entry?.supplier);
  if (!['zimm', 'tiggas'].includes(supplier)) return [];
  return (entry.sizes || []).flatMap((size: string) => {
    const escaped = String(size).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(entry.measurements || '').match(new RegExp('(?:^|\\|)\\s*'+escaped+'\\s+(\\d+(?:[.,]\\d+)?)\\s*[×x]\\s*(\\d+(?:[.,]\\d+)?)(?:\\s+M(\\d+(?:[.,]\\d+)?))?', 'i'));
    if (!match) return [];
    const [first, second, sleeve] = match.slice(1).map(value => Number(String(value || '').replace(',', '.')));
    if (![first, second].every(value => Number.isFinite(value) && value >= 5 && value <= 150)) return [];
    const [length, width] = supplier === 'zimm' ? [first, second] : [second, first];
    return [{ size, length: `${length} cm`, width: `${width} cm`, sleeve: sleeve > 0 && sleeve <= 100 ? `${sleeve} cm` : '' }];
  });
}

export function garmentProfile(entry: any) {
  entry = applyVerifiedGarmentSpecs(entry);
  const family = garmentFamily(entry), supplier = norm(entry?.supplier);
  if (!family || !['zimm', 'tiggas'].includes(supplier) || !entry?.id) return null;
  const neckline = family === 'regata' ? 'tank' : supplier === 'zimm' ? 'high_closed' : 'classic_open';
  const collar = family === 'regata' ? 'Decote de regata · sem mangas' : (supplier === 'zimm' ? 'Gola mais alta e fechada' : 'Gola mais baixa e aberta') + (entry.collar ? ` · ${entry.collar}` : '');
  const shortName = family === 'regata' ? 'Regata' : supplier === 'zimm' ? 'Gola alta' : 'Gola clássica';
  const material = String(family === 'regata' ? entry.composition || '' : entry.name || '').replace(/camiseta|camisa|oversized|tradicional/gi, '').trim();
  return {
    garmentModelId: String(entry.id), garmentModelName: [shortName, material].filter(Boolean).join(' · '),
    garmentFamily: family, neckline, collar, garmentModelRevision: GARMENT_MODEL_REVISION,
    sizeChartMode: 'specific', sizeChart: supplierSizeChart(entry), shrinkage: String(entry.shrinkage || ''),
    fabric: String(entry.composition || ''), gsm: String(entry.weight || ''), fit: family === 'regata' ? 'Regata' : String(entry.fit || (family === 'oversized' ? 'Oversized' : 'Tradicional')),
    specs: [entry.composition, entry.weight, collar, entry.shrinkage === '0%' ? 'Zero encolhimento conforme catálogo' : ''].filter(Boolean),
    sizes: Array.isArray(entry.sizes) ? entry.sizes : [],
  };
}

export function garmentProfiles(catalog: any) {
  return (catalog?.entries || []).filter((entry: any) => entry.kind === 'product' && entry.active).flatMap((entry: any) => {
    entry = applyVerifiedGarmentSpecs(entry);
    const profile = garmentProfile(entry);
    return profile ? [{ ...profile, supplierName: entry.supplier, sourceProductName: entry.name, sourceCode: entry.code || entry.id, sourceColors: entry.colors || [], sourceRestrictions: entry.restrictions || [] }] : [];
  });
}

export function garmentLabel(product: any) { return String(product?.garmentModelName || ''); }
export function garmentTitle(name: string, product: any) {
  const label = garmentLabel(product);
  return label && !norm(name).includes(norm(label)) ? `${name} — ${label}` : name;
}
export function sameGarmentModel(a: any, b: any) {
  return String(a?.garmentModelId || '') === String(b?.garmentModelId || '');
}
export function requiresGarmentClassification(product: any) {
  return Boolean(garmentFamily(product) && product?.modelSeparationRequired === true && !product?.garmentModelId);
}

/** Only a source entry ID explicitly assigned to this product can supply its table. */
export function applyGarmentProfile(product: any, profiles: any[]) {
  const profile = profiles.find(p => p.garmentModelId === product.garmentModelId);
  if (!profile) return requiresGarmentClassification(product) ? { ...product, sizeChartMode: 'specific', sizeChart: [], specs: [], fabric: '', gsm: '', collar: 'Modelo em conferência', modelClassificationPending: true } : product;
  const { supplierName, sourceProductName, sourceCode, sourceColors, sourceRestrictions, ...publicProfile } = profile;
  return { ...product, ...publicProfile, modelClassificationPending: false };
}
