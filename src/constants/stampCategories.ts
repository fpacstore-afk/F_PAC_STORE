export const STAMP_CATEGORIES = [
  '🖋️ Tipografia',
  '🦅 Logos & Branding',
  '🏀 Esportes',
  '🏎️ Automotivo',
  '🪖 Militar',
  '🏆 Exclusivas',
] as const;

export type StampCategory = typeof STAMP_CATEGORIES[number];

/**
 * Migration helper function: maps any legacy category string, or title/desc/tags content
 * to one of the 6 official F PAC stamp categories.
 */
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

  // 1. Tipografia (frases, textos, lettering, palavras, manifesto)
  if (
    catStr.includes('tipograf') ||
    catStr.includes('lettering') ||
    catStr.includes('text') ||
    combined.includes('manifesto') ||
    combined.includes('frase') ||
    combined.includes('lettering') ||
    combined.includes('order') ||
    combined.includes('anarchy') ||
    combined.includes('texto')
  ) {
    return '🖋️ Tipografia';
  }

  // 2. Logos & Branding (Logos F PAC, escudos, águia, fênix, globo, símbolos, emblemas)
  if (
    catStr.includes('logo') ||
    catStr.includes('brand') ||
    catStr.includes('emblem') ||
    catStr.includes('escudo') ||
    combined.includes('logo') ||
    combined.includes('branding') ||
    combined.includes('escudo') ||
    combined.includes('águia') ||
    combined.includes('aguia') ||
    combined.includes('fênix') ||
    combined.includes('fenix') ||
    combined.includes('globo') ||
    combined.includes('monograma') ||
    combined.includes('monogram') ||
    combined.includes('símbolo') ||
    combined.includes('simbolo') ||
    combined.includes('emblema')
  ) {
    return '🦅 Logos & Branding';
  }

  // 3. Esportes (Futebol, academy, halteres, copa, skate, esportes)
  if (
    catStr.includes('esporte') ||
    catStr.includes('sport') ||
    combined.includes('esporte') ||
    combined.includes('futebol') ||
    combined.includes('academy') ||
    combined.includes('haltere') ||
    combined.includes('copa') ||
    combined.includes('skate') ||
    combined.includes('gym') ||
    combined.includes('fitness')
  ) {
    return '🏀 Esportes';
  }

  // 4. Automotivo (Carros, corridas, performance, motores, superesportivos)
  if (
    catStr.includes('auto') ||
    catStr.includes('car') ||
    catStr.includes('motor') ||
    combined.includes('carro') ||
    combined.includes('corrida') ||
    combined.includes('performance') ||
    combined.includes('motor') ||
    combined.includes('superesportiv') ||
    combined.includes('racing') ||
    combined.includes('automotivo')
  ) {
    return '🏎️ Automotivo';
  }

  // 5. Militar (Táticos, camuflagem, guerra, sobrevivência, militar)
  if (
    catStr.includes('militar') ||
    catStr.includes('tatic') ||
    catStr.includes('camu') ||
    combined.includes('tático') ||
    combined.includes('tatico') ||
    combined.includes('camuflagem') ||
    combined.includes('guerra') ||
    combined.includes('sobrevivência') ||
    combined.includes('sobrevivencia') ||
    combined.includes('militar')
  ) {
    return '🪖 Militar';
  }

  // 6. Exclusivas (Edições limitadas, colaborações, coleções especiais, edições rádio, etc.)
  if (
    catStr.includes('exclusiv') ||
    catStr.includes('especial') ||
    catStr.includes('collab') ||
    catStr.includes('cyber') ||
    catStr.includes('vintage') ||
    catStr.includes('ilustração') ||
    catStr.includes('minimalista') ||
    combined.includes('edicao') ||
    combined.includes('edição') ||
    combined.includes('colaboracao') ||
    combined.includes('especial') ||
    combined.includes('skull') ||
    combined.includes('noise') ||
    combined.includes('acervo') ||
    combined.includes('radio')
  ) {
    return '🏆 Exclusivas';
  }

  // Default fallback
  return '🖋️ Tipografia';
}
