export const STAMP_CATEGORIES = [
  'Tipografia',
  'Minimalista',
  'Logos & Branding',
  'Esporte',
  'Exclusiva',
] as const;

export type StampCategory = typeof STAMP_CATEGORIES[number];

/** Normalize legacy names and metadata into the five active storefront categories. */
export function normalizeStampCategory(
  category?: string,
  name: string = '',
  description: string = '',
  tags: string[] = []
): StampCategory {
  const rawCategory = (category || '').trim();
  if (rawCategory && (STAMP_CATEGORIES as readonly string[]).includes(rawCategory)) {
    return rawCategory as StampCategory;
  }

  const catStr = rawCategory.toLowerCase();
  const titleStr = name.toLowerCase();
  const descStr = description.toLowerCase();
  const tagsStr = tags.map(t => t.toLowerCase()).join(' ');
  const combined = `${catStr} ${titleStr} ${descStr} ${tagsStr}`;

  // Preserve the intent of existing explicit categories while standardizing their labels.
  if (/frase|quote|lettering|texto|tipograf/.test(catStr)) return 'Tipografia';
  if (/minimal/.test(catStr)) return 'Minimalista';
  if (/logo|brand|emblem|escudo|monogram|símbolo|simbolo|emblema/.test(catStr)) return 'Logos & Branding';
  if (/esporte|sport/.test(catStr)) return 'Esporte';
  if (/exclusiv|especial|collab/.test(catStr)) return 'Exclusiva';

  // Retired themes remain in the catalog under Exclusiva; no artwork is deleted.
  if (/animal|urban|nature|automot|militar|tatic/.test(catStr)) return 'Exclusiva';

  if (/frase|quote|lettering|texto|tipograf|manifesto|anarchy|order/.test(combined)) return 'Tipografia';
  if (/minimal|minimalista|minimalist|clean|simples/.test(combined)) return 'Minimalista';
  if (/logo|brand|emblem|escudo|branding|monogram|símbolo|simbolo|emblema/.test(combined)) return 'Logos & Branding';
  if (/esporte|sport|futebol|academy|haltere|copa|skate|gym|fitness/.test(combined)) return 'Esporte';

  // Specific legacy artwork themes have no separate category anymore.
  if (/animal|lobo|le[aã]o|tigre|urso|c[aã]o|gato|pantera|raposa|tubar[aã]o|cobra|cavalo|águia|aguia|urban|street|cidade|grafite|graffiti|concreto|metropole|metrópole|nature|natureza|floresta|folha|flor|montanha|mar|oceano|planta|árvore|arvore|auto|carro|motor|corrida|performance|racing|automotivo|militar|tatic|camu|guerra|sobreviv|exclusiv|especial|collab|cyber|vintage|ilustra|edicao|edição|colaboracao|skull|noise|acervo|radio/.test(combined)) {
    return 'Exclusiva';
  }

  // Unknown or uncategorized artwork stays available in the typography collection.
  return 'Tipografia';
}
