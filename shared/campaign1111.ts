import { fromCents, toCents } from '../src/lib/money';

export const CAMPAIGN_1111_START = Date.parse('2026-11-11T00:00:00-03:00');
export const CAMPAIGN_1111_END = Date.parse('2026-11-12T00:00:00-03:00');
export const CAMPAIGN_1111_URL = '/catalog/all?campaign=1111';
export const CAMPAIGN_1111_COMBO_SAVING = 990;

export const CAMPAIGN_1111_PRICES = {
  traditionalSmall: 5990,
  traditionalLarge: 6990,
  oversizedSmall: 6990,
  oversizedLarge: 7990,
} as const;

// Published, own-brand products verified against the 11 November catalog.
const productPrices = new Map<string, number>([
  ['7Aykx8nxgXXTm8h9YSxW', CAMPAIGN_1111_PRICES.traditionalLarge],
  ['iS0l5tZ51ckM1pziN0Jy', CAMPAIGN_1111_PRICES.traditionalLarge],
  ['95iMSkEJstNemV7GAY9x', CAMPAIGN_1111_PRICES.oversizedSmall],
  ['GKyWDKjZxkhGTWuJdCge', CAMPAIGN_1111_PRICES.oversizedSmall],
  ['RiQZosIlY5EkmouB0vv4', CAMPAIGN_1111_PRICES.oversizedSmall],
  ['OyZYHOnbtQcZR7TKTTiq', CAMPAIGN_1111_PRICES.oversizedSmall],
  ['zkcXxGFC8ZeztiaBJJmp', CAMPAIGN_1111_PRICES.oversizedSmall],
  ['C4utBrpvXm9Tg5921MMY', CAMPAIGN_1111_PRICES.oversizedLarge],
  ['R17UkzBfnTGEZBqfvLUJ', CAMPAIGN_1111_PRICES.oversizedLarge],
  ['hIYhvAbZC4KaqyfBlEVe', CAMPAIGN_1111_PRICES.oversizedLarge],
  ['UwV2QHzyvAmx1ZircSWp', CAMPAIGN_1111_PRICES.oversizedLarge],
  ['C3TEBskjbJoeloieuwyy', CAMPAIGN_1111_PRICES.oversizedLarge],
]);

export function isCampaign1111Active(now = Date.now()) {
  return now >= CAMPAIGN_1111_START && now < CAMPAIGN_1111_END;
}

export function isCampaign1111Product(id?: string) {
  return productPrices.has(id ?? '');
}

export function campaign1111UnitPrice(id: string | undefined, regularPrice: number, now = Date.now()) {
  const offer = productPrices.get(id ?? '');
  return offer !== undefined && isCampaign1111Active(now)
    ? Math.min(regularPrice, fromCents(offer))
    : regularPrice;
}

export function campaign1111CartOffer(items: readonly {
  id: string;
  productId?: string;
  price: number;
  quantity: number;
  printConfigs?: readonly unknown[];
}[], now: number) {
  let quantity = 0;
  let individualSavings = 0;
  let offerSubtotal = 0;
  if (isCampaign1111Active(now)) {
    for (const item of items) {
      const id = item.productId || item.id;
      if (!isCampaign1111Product(id) || item.printConfigs?.length) continue;
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.price) || item.price <= 0) continue;
      const unitPrice = toCents(campaign1111UnitPrice(id, item.price, now));
      quantity += item.quantity;
      individualSavings += (toCents(item.price) - unitPrice) * item.quantity;
      offerSubtotal += unitPrice * item.quantity;
    }
  }
  const comboSavings = Math.min(
    Math.floor(quantity / 2) * CAMPAIGN_1111_COMBO_SAVING,
    Math.max(0, offerSubtotal - quantity * 10),
  );
  return { discount: fromCents(individualSavings + comboSavings), hasCombo: comboSavings > 0 };
}
