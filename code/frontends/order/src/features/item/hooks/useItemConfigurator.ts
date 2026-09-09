import { useMemo, useState } from 'react';
import type { LoyaltyTier, MenuModifierGroup } from '@veyroxai/contracts';
import type { ResolvedItem } from '../../menu/usecases/loadMenu.js';
import {
  buildCartLine,
  estimateLineMinor,
  validateSelection,
  type SelectionState,
} from '../usecases/configureItem.js';
import type { NewCartLine } from '../../../shared/cart-store.js';

interface InitialLine {
  byGroup: Record<string, string[]>;
  note: string;
  qty: number;
}

export function useItemConfigurator(
  item: ResolvedItem,
  groups: MenuModifierGroup[],
  tier: LoyaltyTier | null,
  initial?: InitialLine,
) {
  const [selection, setSelection] = useState<SelectionState>(() => ({
    byGroup: initial?.byGroup ?? defaultSelection(groups),
    note: initial?.note ?? '',
  }));
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [showErrors, setShowErrors] = useState(false);

  const validation = useMemo(() => validateSelection(groups, selection), [groups, selection]);
  const isValid = validation.every((v) => v.error === null);
  const estimateMinor = estimateLineMinor(item, groups, selection, tier, qty);

  function choose(group: MenuModifierGroup, optionId: string): void {
    setSelection((prev) => {
      const current = prev.byGroup[group.id] ?? [];
      let next: string[];
      if (group.selection === 'single') {
        next = [optionId];
      } else if (current.includes(optionId)) {
        next = current.filter((id) => id !== optionId);
      } else if (current.length >= group.maxSelect) {
        next = [...current.slice(1), optionId];
      } else {
        next = [...current, optionId];
      }
      return { ...prev, byGroup: { ...prev.byGroup, [group.id]: next } };
    });
  }

  function commit(displayName: { en: string; ar?: string }, summary: string): NewCartLine | null {
    if (!isValid) {
      setShowErrors(true);
      return null;
    }
    return buildCartLine(item, groups, selection, qty, displayName, summary);
  }

  return {
    selection,
    qty,
    setQty,
    choose,
    setNote: (note: string) => setSelection((p) => ({ ...p, note })),
    validation: showErrors ? validation : validation.map((v) => ({ ...v, error: null })),
    isValid,
    estimateMinor,
    commit,
  };
}

function defaultSelection(groups: MenuModifierGroup[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of groups) {
    // Pre-select the first option of a required single-select group, matching the
    // Stitch design (Size defaults to a choice, Milk defaults to Whole).
    if (group.required && group.selection === 'single' && group.options[0]) {
      out[group.id] = [group.options[0].id];
    }
  }
  return out;
}
