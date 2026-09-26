// Fabric references approved in the store's "Mockup para o Site" catalog.
const FABRIC_COLORS: Record<string, string> = {
  preto: '#1C1919', branco: '#FFFFFF', 'off white': '#F8F9F0',
  bege: '#DBC096', areia: '#BEA784', 'verde militar': '#29351D',
  marrom: '#644619', 'marrom cafe': '#644619', 'azul marinho': '#06213A',
};
export function getPrimeFabricColor(name: string, hex?: string) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-_]+/g, ' ').trim();
  return FABRIC_COLORS[key] || (/^#[\da-f]{6}$/i.test(hex || '') ? hex! : '#1C1919');
}

// Recolor the dark fabric's luminance range while preserving its folds and
// leaving the light studio background intact. White still retains shadows.
export function fabricColorTables(hex: string): string[] {
  const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  return channels.map(channel => Array.from({ length: 65 }, (_, index) => {
    const light = index / 64;
    const texture = Math.min(1.08, .42 + Math.sqrt(light) * 1.15);
    const dyed = Math.min(.965, channel * texture + light * .07);
    const background = Math.max(0, Math.min(1, (light - .48) / .25));
    return (dyed * (1 - background) + light * background).toFixed(4);
  }).join(' '));
}
