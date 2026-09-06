import { describe, expect, it } from 'vitest';
import { toMinor } from './money/minor.js';
import {
  ModifierGroupRequired,
  ModifierSelectionInvalid,
  priceCart,
  type PricingMenu,
} from './pricing.js';

const menu: PricingMenu = {
  items: [
    { id: 'latte', basePriceMinor: toMinor(9000), modifierGroupIds: ['milk'], isAvailable: true },
  ],
  groups: [{ id: 'milk', required: true, minSelect: 1, maxSelect: 1, optionIds: ['whole', 'oat'] }],
  options: [
    { id: 'whole', priceDeltaMinor: toMinor(0), freeForTier: null, isAvailable: true },
    { id: 'oat', priceDeltaMinor: toMinor(1500), freeForTier: 'silver', isAvailable: true },
  ],
};

describe('priceCart', () => {
  it('multiplies selected modifiers by quantity and gives Gold inherited perks', () => {
    const result = priceCart(
      [{ menuItemId: 'latte', qty: 2, modifierOptionIds: ['oat'] }],
      menu,
      'gold',
    );
    expect(result.lines[0]).toMatchObject({ modifierTotalMinor: 0, lineTotalMinor: 18000 });
    expect(result.lines[0]?.modifiers[0]).toEqual({
      id: 'oat',
      priceDeltaMinor: 1500,
      waivedByTier: true,
    });
  });

  it('deduplicates modifier ids so a customer cannot be charged twice', () => {
    const result = priceCart(
      [{ menuItemId: 'latte', qty: 1, modifierOptionIds: ['whole', 'whole'] }],
      menu,
      'bronze',
    );
    expect(result.totalMinor).toBe(9000);
  });

  it('reports unavailable modifiers as draft-cart corrections', () => {
    const unavailableMenu: PricingMenu = {
      ...menu,
      options: [{ ...menu.options[1]!, isAvailable: false }, menu.options[0]!],
    };
    const result = priceCart(
      [{ menuItemId: 'latte', qty: 1, modifierOptionIds: ['oat'] }],
      unavailableMenu,
      'bronze',
    );
    expect(result).toMatchObject({
      lines: [],
      totalMinor: 0,
      unavailable: [{ menuItemId: 'latte', modifierOptionId: 'oat' }],
    });
  });

  it('enforces required and bounded modifier selections', () => {
    expect(() =>
      priceCart([{ menuItemId: 'latte', qty: 1, modifierOptionIds: [] }], menu, null),
    ).toThrow(ModifierGroupRequired);
    expect(() =>
      priceCart([{ menuItemId: 'latte', qty: 1, modifierOptionIds: ['whole', 'oat'] }], menu, null),
    ).toThrow(ModifierSelectionInvalid);
  });
});
