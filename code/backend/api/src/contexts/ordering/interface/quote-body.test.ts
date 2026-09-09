import { describe, expect, it } from 'vitest';
import { toMinor } from '@veyroxai/domain';
import { assembleQuoteBody } from './quote-body.js';

const ID = '0192d425-9790-7dd9-8aa9-8cbd4c3844db';
const OTHER_ID = '0192d425-9790-7dd9-8aa9-8cbd4c3844dc';

describe('assembleQuoteBody', () => {
  it('preserves client line IDs for duplicate menu items and unavailable modifiers', () => {
    const quote = assembleQuoteBody(
      {
        lines: [
          {
            clientLineId: ID,
            menuItemId: OTHER_ID,
            qty: 1,
            unitPriceMinor: toMinor(9000),
            modifierTotalMinor: toMinor(0),
            lineTotalMinor: toMinor(9000),
            modifiers: [],
          },
        ],
        subtotalMinor: toMinor(9000),
        discountMinor: toMinor(0),
        totalMinor: toMinor(9000),
        unavailable: [
          {
            clientLineId: OTHER_ID,
            menuItemId: OTHER_ID,
            modifierOptionId: ID,
            reason: 'modifier_unavailable',
          },
        ],
        etaItems: [],
      },
      { state: { activeStations: 1, tickets: [], updatedAt: '' }, source: 'postgres' },
      null,
      new Date('2026-09-07T00:00:00.000Z'),
    );

    expect(quote.lines[0]).toMatchObject({ clientLineId: ID, menuItemId: OTHER_ID });
    expect(quote.unavailable[0]).toMatchObject({ clientLineId: OTHER_ID, menuItemId: OTHER_ID });
  });
});
