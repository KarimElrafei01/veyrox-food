import { describe, expect, it } from 'vitest';
import type { MenuItem, MenuModifierGroup } from '@veyroxai/contracts';
import { estimateLineMinor, isWaived, validateSelection } from './configureItem.js';

const item: MenuItem = {
  id: 'i1',
  sort: 1,
  name: { en: 'Latte' },
  description: null,
  basePriceMinor: 7000,
  prepSeconds: 150,
  imageUrl: null,
  modifierGroupIds: ['size', 'milk'],
};

const groups: MenuModifierGroup[] = [
  {
    id: 'size',
    name: { en: 'Size' },
    selection: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: 'reg', name: { en: 'Regular' }, priceDeltaMinor: 0, freeForTier: null, sort: 1 },
      { id: 'lg', name: { en: 'Large' }, priceDeltaMinor: 1500, freeForTier: null, sort: 2 },
    ],
  },
  {
    id: 'milk',
    name: { en: 'Milk' },
    selection: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    options: [
      { id: 'whole', name: { en: 'Whole' }, priceDeltaMinor: 0, freeForTier: null, sort: 1 },
      { id: 'oat', name: { en: 'Oat' }, priceDeltaMinor: 1200, freeForTier: 'silver', sort: 2 },
    ],
  },
];

describe('isWaived — ranked, not equality', () => {
  it('waives silver perk for silver and gold', () => {
    expect(isWaived('silver', 'silver')).toBe(true);
    expect(isWaived('silver', 'gold')).toBe(true);
    expect(isWaived('silver', 'bronze')).toBe(false);
    expect(isWaived('silver', null)).toBe(false);
  });
});

describe('estimateLineMinor', () => {
  it('multiplies by quantity last, after waiving', () => {
    // (base 7000 + large 1500 + oat 1200 waived → 0) * 2
    const total = estimateLineMinor(
      item,
      groups,
      { byGroup: { size: ['lg'], milk: ['oat'] }, note: '' },
      'silver',
      2,
    );
    expect(total).toBe((7000 + 1500) * 2);
  });

  it('charges the oat delta for a bronze customer', () => {
    const total = estimateLineMinor(
      item,
      groups,
      { byGroup: { size: ['reg'], milk: ['oat'] }, note: '' },
      'bronze',
      1,
    );
    expect(total).toBe(7000 + 1200);
  });
});

describe('validateSelection', () => {
  it('flags a required group with no selection', () => {
    const errors = validateSelection(groups, { byGroup: { size: ['reg'] }, note: '' });
    expect(errors.find((e) => e.groupId === 'milk')?.error).toBe('required');
    expect(errors.find((e) => e.groupId === 'size')?.error).toBeNull();
  });
});
