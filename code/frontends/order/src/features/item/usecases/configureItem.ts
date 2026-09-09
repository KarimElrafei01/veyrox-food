import type { MenuItem, MenuModifierGroup } from '@veyroxai/contracts';
import type { LoyaltyTier } from '@veyroxai/contracts';
import type { NewCartLine } from '../../../shared/cart-store.js';

const TIER_RANK: Record<LoyaltyTier, number> = { bronze: 0, silver: 1, gold: 2 };

export function isWaived(freeForTier: LoyaltyTier | null, tier: LoyaltyTier | null): boolean {
  return freeForTier != null && tier != null && TIER_RANK[tier] >= TIER_RANK[freeForTier];
}

export interface SelectionState {
  /** groupId → selected option ids */
  byGroup: Record<string, string[]>;
  note: string;
}

export interface GroupValidation {
  groupId: string;
  error: 'required' | 'min' | 'max' | null;
}

/** Local, optimistic price for the configurator bar. The server re-prices at
 *  quote and placement — this is only to keep the button responsive (F1.3 §4). */
export function estimateLineMinor(
  item: MenuItem,
  groups: MenuModifierGroup[],
  selection: SelectionState,
  tier: LoyaltyTier | null,
  qty: number,
): number {
  let modifierTotal = 0;
  for (const group of groups) {
    for (const optionId of selection.byGroup[group.id] ?? []) {
      const option = group.options.find((o) => o.id === optionId);
      if (option && !isWaived(option.freeForTier, tier)) {
        modifierTotal += option.priceDeltaMinor;
      }
    }
  }
  return (item.basePriceMinor + modifierTotal) * qty;
}

export function validateSelection(
  groups: MenuModifierGroup[],
  selection: SelectionState,
): GroupValidation[] {
  return groups.map((group) => {
    const chosen = selection.byGroup[group.id] ?? [];
    if (group.required && chosen.length === 0) {
      return { groupId: group.id, error: 'required' };
    }
    if (chosen.length < group.minSelect) {
      return { groupId: group.id, error: 'min' };
    }
    if (chosen.length > group.maxSelect) {
      return { groupId: group.id, error: 'max' };
    }
    return { groupId: group.id, error: null };
  });
}

export function buildCartLine(
  item: MenuItem,
  groups: MenuModifierGroup[],
  selection: SelectionState,
  qty: number,
  displayName: { en: string; ar?: string },
  summary: string,
): NewCartLine {
  const modifierOptionIds = groups.flatMap((g) => selection.byGroup[g.id] ?? []);
  return {
    menuItemId: item.id,
    qty,
    modifierOptionIds,
    nameEn: displayName.en,
    nameAr: displayName.ar,
    modifierSummary: summary,
    imageUrl: item.imageUrl,
    unitBasePriceMinor: item.basePriceMinor,
  };
}
