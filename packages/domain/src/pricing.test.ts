import { describe, expect, it } from 'vitest';
import { toMinor } from './money/minor.js';
import {
  InvalidQuantity,
  MenuVersionGone,
  ModifierGroupRequired,
  ModifierSelectionInvalid,
  priceCart,
  type PricingMenu,
} from './pricing.js';
import fc from 'fast-check';

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

  it('rejects invalid quantities, unknown items, detached options, and missing groups', () => {
    expect(() =>
      priceCart([{ menuItemId: 'latte', qty: 0, modifierOptionIds: [] }], menu, null),
    ).toThrow(InvalidQuantity);
    expect(() =>
      priceCart([{ menuItemId: 'missing', qty: 1, modifierOptionIds: [] }], menu, null),
    ).toThrow(MenuVersionGone);
    expect(() =>
      priceCart([{ menuItemId: 'latte', qty: 1, modifierOptionIds: ['missing'] }], menu, null),
    ).toThrow(ModifierSelectionInvalid);
    expect(() =>
      priceCart(
        [{ menuItemId: 'latte', qty: 1, modifierOptionIds: [] }],
        { ...menu, items: [{ ...menu.items[0]!, modifierGroupIds: ['missing-group'] }] },
        null,
      ),
    ).toThrow(MenuVersionGone);
  });

  it('keeps unavailable items out of totals and applies explicit discounts', () => {
    const result = priceCart(
      [{ menuItemId: 'latte', qty: 1, modifierOptionIds: ['whole'] }],
      { ...menu, items: [{ ...menu.items[0]!, isAvailable: false }] },
      'bronze',
      toMinor(500),
    );
    expect(result).toMatchObject({
      subtotalMinor: 0,
      totalMinor: -500,
      unavailable: [{ menuItemId: 'latte', reason: 'item_unavailable' }],
    });
  });

  it('is order-independent and sums line totals for arbitrary valid carts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 8 }),
        (quantities) => {
          const cart = quantities.map((qty) => ({
            menuItemId: 'latte',
            qty,
            modifierOptionIds: ['whole'],
          }));
          const forward = priceCart(cart, menu, 'bronze');
          const backward = priceCart([...cart].reverse(), menu, 'bronze');
          expect(forward.totalMinor).toBe(backward.totalMinor);
          expect(forward.totalMinor).toBe(9000 * quantities.reduce((sum, qty) => sum + qty, 0));
        },
      ),
    );
  });
});
