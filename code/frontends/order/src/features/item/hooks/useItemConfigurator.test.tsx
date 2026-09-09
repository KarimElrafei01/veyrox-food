import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MenuModifierGroup } from '@veyroxai/contracts';
import type { ResolvedItem } from '../../../shared/menu-model.js';
import { useItemConfigurator } from './useItemConfigurator.js';

const item: ResolvedItem = {
  id: 'i1',
  sort: 1,
  name: { en: 'Latte' },
  description: null,
  basePriceMinor: 7000,
  prepSeconds: 150,
  imageUrl: null,
  modifierGroupIds: ['extras'],
  available: true,
  unavailableReason: null,
};

const extras: MenuModifierGroup = {
  id: 'extras',
  name: { en: 'Extras' },
  selection: 'multi',
  required: false,
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'shot', name: { en: 'Extra shot' }, priceDeltaMinor: 1000, freeForTier: null, sort: 1 },
    { id: 'cinnamon', name: { en: 'Cinnamon' }, priceDeltaMinor: 0, freeForTier: null, sort: 2 },
    { id: 'vanilla', name: { en: 'Vanilla' }, priceDeltaMinor: 500, freeForTier: null, sort: 3 },
  ],
};

describe('useItemConfigurator — multi-select', () => {
  it('accumulates multiple selections and prices them', () => {
    const { result } = renderHook(() => useItemConfigurator(item, [extras], 'bronze'));

    act(() => result.current.choose(extras, 'shot'));
    act(() => result.current.choose(extras, 'cinnamon'));
    expect(result.current.selection.byGroup.extras).toEqual(['shot', 'cinnamon']);
    // base 7000 + shot 1000 + cinnamon 0
    expect(result.current.estimateMinor).toBe(8000);

    // toggling an already-selected option removes it
    act(() => result.current.choose(extras, 'shot'));
    expect(result.current.selection.byGroup.extras).toEqual(['cinnamon']);
  });

  it('rotates the oldest choice out once maxSelect is reached', () => {
    const { result } = renderHook(() => useItemConfigurator(item, [extras], 'bronze'));
    act(() => result.current.choose(extras, 'shot'));
    act(() => result.current.choose(extras, 'cinnamon'));
    act(() => result.current.choose(extras, 'vanilla')); // over max (2) → drops 'shot'
    expect(result.current.selection.byGroup.extras).toEqual(['cinnamon', 'vanilla']);
    expect(result.current.isValid).toBe(true);
  });
});
