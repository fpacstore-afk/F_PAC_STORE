export const STAMP_CATEGORIES = [
  'Frases',
  'Animais',
  'Urbanas',
  'Minimalistas',
  'Natureza',
  '🦅 Logos & Branding',
  '🏀 Esportes',
  '🏆 Exclusivas',
] as const;

export type StampCategory = typeof STAMP_CATEGORIES[number];

/** Normalize legacy names and metadata into the eight active storefront categories. */
export function normalizeStampCategory(
  category?: string,
  name: string = '',
  description: string = '',
  tags: string[] = []
): StampCategory {
  if (category && (STAMP_CATEGORIES as readonly string[]).includes(category)) {
    return category as StampCategory;
  }

  const catStr = (category || '').toLowerCase();
  const titleStr = name.toLowerCase();
  const descStr = description.toLowerCase();
  const tagsStr = tags.map(t => t.toLowerCase()).join(' ');
  const combined = `${catStr} ${titleStr} ${descStr} ${tagsStr}`;

  if (/frase|quote|lettering|texto|tipograf|manifesto|anarchy|order/.test(combined)) return 'Frases';
  if (/animal|lobo|le[aã]o|tigre|urso|c[aã]o|gato|pantera|raposa|tubar[aã]o|cobra|cavalo|águia|aguia/.test(combined)) return 'Animais';
  if (/urban|street|cidade|grafite|graffiti|concreto|metropole|metrópole/.test(combined)) return 'Urbanas';
  if (/minimal|minimalista|minimalist|clean|simples/.test(combined)) return 'Minimalistas';
  if (/nature|natureza|floresta|folha|flor|montanha|mar|oceano|planta|árvore|arvore/.test(combined)) return 'Natureza';

  if (/logo|brand|emblem|escudo|branding|monogram|símbolo|simbolo|emblema/.test(combined)) {
    return '🦅 Logos & Branding';
  }
  if (/esporte|sport|futebol|academy|haltere|copa|skate|gym|fitness/.test(combined)) return '🏀 Esportes';

  // Automotive, military and other one-off legacy themes no longer have a
  // separate category. Keep those records accessible under the broad collection.
  if (/auto|carro|motor|corrida|performance|racing|automotivo|militar|tatic|camu|guerra|sobreviv|exclusiv|especial|collab|cyber|vintage|ilustra|edicao|edição|colaboracao|skull|noise|acervo|radio/.test(combined)) {
    return '🏆 Exclusivas';
  }

  // Legacy category fallback: keep uncategorized artwork visible in the main text category.
  return 'Frases';
}
