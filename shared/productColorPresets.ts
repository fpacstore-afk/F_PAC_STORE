export interface ProductColorPreset {
  name: string;
  hex: string;
}

export const DEFAULT_PRODUCT_COLOR_PRESETS: ProductColorPreset[] = [
  { name: 'Preto', hex: '#000000' },
  { name: 'Off White', hex: '#FAF9F6' },
  { name: 'Branco', hex: '#FFFFFF' },
  { name: 'Verde Militar', hex: '#3F4238' },
  { name: 'Azul Marinho', hex: '#1B263B' },
  { name: 'Marrom Café', hex: '#4A3C31' },
  { name: 'Cinza Mescla', hex: '#CFDBD5' },
  { name: 'Bege', hex: '#E3D5CA' }
];

const colorKey = (name: string) => name.trim().normalize('NFC').toLowerCase();

export function validateProductColorPreset(color: ProductColorPreset): ProductColorPreset {
  const name = color.name.trim();
  if (!name) throw new Error('Informe o nome da cor.');
  if (!/^#[0-9a-f]{6}$/i.test(color.hex)) throw new Error('Informe um código HEX válido, como #000000.');
  return { name, hex: color.hex.toUpperCase() };
}

export function readProductColorPresets(data: { colors?: unknown } | undefined): ProductColorPreset[] {
  // Only a missing document uses the defaults. An intentionally empty list stays empty.
  if (!data) return DEFAULT_PRODUCT_COLOR_PRESETS.map(color => ({ ...color }));
  if (!Array.isArray(data.colors)) throw new Error('Não foi possível ler a seleção rápida de cores.');
  return data.colors.map(color => validateProductColorPreset(color));
}

export function changeProductColorPresets(
  colors: ProductColorPreset[],
  action: { type: 'add'; color: ProductColorPreset } | { type: 'remove'; name: string }
): ProductColorPreset[] {
  if (action.type === 'remove') return colors.filter(color => colorKey(color.name) !== colorKey(action.name));
  const color = validateProductColorPreset(action.color);
  return colors.some(existing => colorKey(existing.name) === colorKey(color.name))
    ? colors
    : [...colors, color];
}
