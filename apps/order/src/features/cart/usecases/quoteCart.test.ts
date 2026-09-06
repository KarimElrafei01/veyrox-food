import { describe, expect, it } from 'vitest';
import type { QuoteResponse } from '@veyroxai/contracts';
import type { CartLine } from '../../../shared/cart-store.js';
import { quotedLineFor, reconcileQuote } from './quoteCart.js';

const LATTE = '11000000-0000-4000-8000-000000000020';
const line = (over: Partial<CartLine>): CartLine => ({
  lineId: 'l0',
  menuItemId: LATTE,
  qty: 1,
  modifierOptionIds: [],
  nameEn: 'Latte',
  unitBasePriceMinor: 7000,
  ...over,
});

const emptyQuote = (over: Partial<QuoteResponse> = {}): QuoteResponse => ({
  lines: [],
  subtotalMinor: 0,
  discountMinor: 0,
  totalMinor: 0,
  eta: { lowerMinutes: 5, upperMinutes: 9 },
  loyalty: { pointsToEarn: 0, tier: null },
  unavailable: [],
  payAt: 'counter',
  traceId: 't',
  ...over,
});

describe('quotedLineFor', () => {
  it('matches two same-item lines by clientLineId, not menuItemId', () => {
    const a = line({ lineId: 'a', modifierOptionIds: ['oat'] });
    const b = line({ lineId: 'b', modifierOptionIds: ['whole'] });
    const quote = emptyQuote({
      lines: [
        {
          clientLineId: 'b',
          menuItemId: LATTE,
          qty: 1,
          unitPriceMinor: 7000,
          modifierTotalMinor: 0,
          lineTotalMinor: 7000,
          modifiers: [],
        },
        {
          clientLineId: 'a',
          menuItemId: LATTE,
          qty: 1,
          unitPriceMinor: 7000,
          modifierTotalMinor: 1200,
          lineTotalMinor: 8200,
          modifiers: [],
        },
      ],
    });
    expect(quotedLineFor(quote, a, [a, b])?.lineTotalMinor).toBe(8200);
    expect(quotedLineFor(quote, b, [a, b])?.lineTotalMinor).toBe(7000);
  });

  it('falls back to positional alignment among available lines when the id is not echoed', () => {
    const a = line({ lineId: 'a' });
    const b = line({ lineId: 'b', menuItemId: 'cookie' });
    const c = line({ lineId: 'c' });
    const quote = emptyQuote({
      unavailable: [{ clientLineId: 'b', menuItemId: 'cookie', reason: 'item_unavailable' }],
      lines: [
        {
          menuItemId: LATTE,
          qty: 1,
          unitPriceMinor: 7000,
          modifierTotalMinor: 0,
          lineTotalMinor: 7000,
          modifiers: [],
        },
        {
          menuItemId: LATTE,
          qty: 1,
          unitPriceMinor: 7000,
          modifierTotalMinor: 0,
          lineTotalMinor: 9999,
          modifiers: [],
        },
      ],
    });
    // available order is [a, c]; c → second quote line
    expect(quotedLineFor(quote, c, [a, b, c])?.lineTotalMinor).toBe(9999);
  });
});

describe('reconcileQuote', () => {
  it('removes a line whose drink is unavailable', () => {
    const l = line({ lineId: 'x' });
    const quote = emptyQuote({
      unavailable: [{ clientLineId: 'x', menuItemId: LATTE, reason: 'item_unavailable' }],
    });
    expect(reconcileQuote([l], quote)).toEqual({
      removeLineIds: ['x'],
      reconfigureLineIds: [],
    });
  });

  it('keeps a line whose modifier is unavailable, flagging it to reconfigure', () => {
    const l = line({ lineId: 'x', modifierOptionIds: ['oat'] });
    const quote = emptyQuote({
      unavailable: [
        {
          clientLineId: 'x',
          menuItemId: LATTE,
          modifierOptionId: 'oat',
          reason: 'modifier_unavailable',
        },
      ],
    });
    expect(reconcileQuote([l], quote)).toEqual({
      removeLineIds: [],
      reconfigureLineIds: ['x'],
    });
  });
});
