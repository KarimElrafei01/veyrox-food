import { addMinor, mulMinor, sumMinor, toMinor, ZERO_MINOR, type Minor } from './money/minor.js';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold';

export interface CartLine {
  menuItemId: string;
  qty: number;
  modifierOptionIds: readonly string[];
}

export interface MenuOption {
  id: string;
  priceDeltaMinor: Minor;
  freeForTier: LoyaltyTier | null;
  isAvailable: boolean;
}

export interface MenuModifierGroup {
  id: string;
  required: boolean;
  minSelect: number;
  maxSelect: number | null;
  optionIds: readonly string[];
}

export interface MenuItem {
  id: string;
  basePriceMinor: Minor;
  modifierGroupIds: readonly string[];
  isAvailable: boolean;
  prepSeconds?: number;
}

export interface PricingMenu {
  items: readonly MenuItem[];
  groups: readonly MenuModifierGroup[];
  options: readonly MenuOption[];
}

export interface PricedModifier {
  id: string;
  priceDeltaMinor: Minor;
  waivedByTier: boolean;
}

export interface PricedLine {
  menuItemId: string;
  qty: number;
  unitPriceMinor: Minor;
  modifierTotalMinor: Minor;
  lineTotalMinor: Minor;
  modifiers: readonly PricedModifier[];
}

export interface UnavailableLine {
  menuItemId: string;
  modifierOptionId?: string;
  reason: 'item_unavailable' | 'modifier_unavailable';
}

export interface PricedCart {
  lines: readonly PricedLine[];
  subtotalMinor: Minor;
  discountMinor: Minor;
  totalMinor: Minor;
  unavailable: readonly UnavailableLine[];
}

export class InvalidQuantity extends Error {
  constructor(readonly menuItemId: string) {
    super('Quantity must be between 1 and 20.');
    this.name = 'InvalidQuantity';
  }
}

export class ModifierGroupRequired extends Error {
  constructor(readonly groupId: string) {
    super('A required modifier group has no selection.');
    this.name = 'ModifierGroupRequired';
  }
}

export class ModifierSelectionInvalid extends Error {
  constructor(
    readonly groupId: string,
    readonly min: number,
    readonly max: number | null,
    readonly got: number,
  ) {
    super('Modifier selection is outside the group bounds.');
    this.name = 'ModifierSelectionInvalid';
  }
}

export class MenuVersionGone extends Error {
  constructor(readonly menuItemId: string) {
    super('The requested item is not in the pinned menu version.');
    this.name = 'MenuVersionGone';
  }
}

/** Gold inherits Silver perks, so waiver eligibility is rank-based rather than equality-based. */
function tierCanUse(tier: LoyaltyTier | null, required: LoyaltyTier | null): boolean {
  if (tier === null || required === null) return false;
  return (
    ['bronze', 'silver', 'gold'].indexOf(tier) >= ['bronze', 'silver', 'gold'].indexOf(required)
  );
}

function priceModifiers(
  selectedByGroup: ReadonlyMap<string, readonly MenuOption[]>,
  menuItemId: string,
  tier: LoyaltyTier | null,
): { modifiers: PricedModifier[]; unavailable: UnavailableLine[] } {
  const selected = [...selectedByGroup.values()].flat();
  const unavailable = selected
    .filter((option) => !option.isAvailable)
    .map((option) => ({
      menuItemId,
      modifierOptionId: option.id,
      reason: 'modifier_unavailable' as const,
    }));
  const modifiers = selected
    .filter((option) => option.isAvailable)
    .map((option) => ({
      id: option.id,
      priceDeltaMinor: option.priceDeltaMinor,
      waivedByTier: tierCanUse(tier, option.freeForTier),
    }));
  return { modifiers, unavailable };
}

/**
 * Prices a cart entirely from the session-pinned menu. It deliberately has no I/O so
 * quote and placement use this exact function and cannot drift.
 */
export function priceCart(
  cart: readonly CartLine[],
  menu: PricingMenu,
  tier: LoyaltyTier | null,
  discountMinor: Minor = ZERO_MINOR,
): PricedCart {
  const itemById = new Map(menu.items.map((item) => [item.id, item]));
  const groupById = new Map(menu.groups.map((group) => [group.id, group]));
  const optionById = new Map(menu.options.map((option) => [option.id, option]));
  const unavailable: UnavailableLine[] = [];
  const lines: PricedLine[] = [];

  for (const line of cart) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 20)
      throw new InvalidQuantity(line.menuItemId);
    const item = itemById.get(line.menuItemId);
    if (!item) throw new MenuVersionGone(line.menuItemId);
    if (!item.isAvailable) {
      unavailable.push({ menuItemId: item.id, reason: 'item_unavailable' });
      continue;
    }

    const selectedIds = [...new Set(line.modifierOptionIds)];
    const selectedByGroup = new Map<string, MenuOption[]>();
    for (const optionId of selectedIds) {
      const option = optionById.get(optionId);
      const group = menu.groups.find((candidate) => candidate.optionIds.includes(optionId));
      if (!option || !group || !item.modifierGroupIds.includes(group.id)) {
        throw new ModifierSelectionInvalid(group?.id ?? 'unknown', 0, null, selectedIds.length);
      }
      const selected = selectedByGroup.get(group.id) ?? [];
      selected.push(option);
      selectedByGroup.set(group.id, selected);
    }

    for (const groupId of item.modifierGroupIds) {
      const group = groupById.get(groupId);
      if (!group) throw new MenuVersionGone(item.id);
      const selected = selectedByGroup.get(groupId) ?? [];
      if (group.required && selected.length === 0) throw new ModifierGroupRequired(group.id);
      if (
        selected.length < group.minSelect ||
        (group.maxSelect !== null && selected.length > group.maxSelect)
      ) {
        throw new ModifierSelectionInvalid(
          group.id,
          group.minSelect,
          group.maxSelect,
          selected.length,
        );
      }
    }

    const pricedModifiers = priceModifiers(selectedByGroup, item.id, tier);
    unavailable.push(...pricedModifiers.unavailable);
    if (pricedModifiers.unavailable.length > 0) continue;

    const modifierTotalMinor = sumMinor(
      pricedModifiers.modifiers.map((modifier) =>
        modifier.waivedByTier ? ZERO_MINOR : modifier.priceDeltaMinor,
      ),
    );
    const lineTotalMinor = mulMinor(addMinor(item.basePriceMinor, modifierTotalMinor), line.qty);
    lines.push({
      menuItemId: item.id,
      qty: line.qty,
      unitPriceMinor: item.basePriceMinor,
      modifierTotalMinor,
      lineTotalMinor,
      modifiers: pricedModifiers.modifiers,
    });
  }

  const subtotalMinor = sumMinor(lines.map((line) => line.lineTotalMinor));
  return {
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor: toMinor(subtotalMinor - discountMinor),
    unavailable,
  };
}
