import { describe, expect, it } from 'vitest';
import type { AvailabilityResponse, MenuResponse } from '@veyroxai/contracts';
import { mergeMenu } from './loadMenu.js';

const ITEM = '11000000-0000-4000-8000-000000000020';
const GROUP = '90000000-0000-4000-8000-000000000030';
const OPT_A = 'a0000000-0000-4000-8000-000000000040';
const OPT_B = 'a1000000-0000-4000-8000-000000000041';
const CAT = 'c1000000-0000-4000-8000-000000000010';

const menu: MenuResponse = {
  menuVersion: '8a2e0b22-0000-4000-8000-000000000002',
  publishedAt: '2026-09-01T09:00:00+03:00',
  categories: [
    {
      id: CAT,
      sort: 1,
      name: { en: 'Hot' },
      items: [
        {
          id: ITEM,
          sort: 1,
          name: { en: 'Latte' },
          description: null,
          basePriceMinor: 7000,
          prepSeconds: 150,
          imageUrl: null,
          modifierGroupIds: [GROUP],
        },
      ],
    },
  ],
  modifierGroups: [
    {
      id: GROUP,
      name: { en: 'Milk' },
      selection: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: OPT_A, name: { en: 'Whole' }, priceDeltaMinor: 0, freeForTier: null, sort: 1 },
        { id: OPT_B, name: { en: 'Oat' }, priceDeltaMinor: 1200, freeForTier: 'silver', sort: 2 },
      ],
    },
  ],
};

const avail = (over: Partial<AvailabilityResponse> = {}): AvailabilityResponse => ({
  menuVersion: menu.menuVersion,
  unavailableItemIds: [],
  unavailableModifierOptionIds: [],
  asOf: '2026-09-06T15:00:00+03:00',
  ...over,
});

describe('mergeMenu', () => {
  it('marks a directly 86ed item unavailable', () => {
    const merged = mergeMenu(menu, avail({ unavailableItemIds: [ITEM] }));
    expect(merged.categories[0]?.items[0]?.available).toBe(false);
    expect(merged.categories[0]?.items[0]?.unavailableReason).toBe('eighty_sixed');
  });

  it('marks an item off when every option of a required group is 86ed', () => {
    const merged = mergeMenu(menu, avail({ unavailableModifierOptionIds: [OPT_A, OPT_B] }));
    expect(merged.categories[0]?.items[0]?.unavailableReason).toBe('required_group_empty');
  });

  it('keeps the item available when only one required option is 86ed', () => {
    const merged = mergeMenu(menu, avail({ unavailableModifierOptionIds: [OPT_B] }));
    expect(merged.categories[0]?.items[0]?.available).toBe(true);
    expect(merged.optionAvailable(OPT_B)).toBe(false);
  });

  it('flags a stale availability version', () => {
    const merged = mergeMenu(menu, avail({ menuVersion: 'other-0000-0000-0000-000000000000' }));
    expect(merged.staleAgainstVersion).toBe(true);
  });
});
