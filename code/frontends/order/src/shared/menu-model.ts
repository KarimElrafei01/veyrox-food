import type { MenuCategory, MenuItem, MenuModifierGroup } from '@veyroxai/contracts';

/**
 * The menu as the screens work with it: the immutable published menu merged with live
 * availability, computed once by `menu/usecases/loadMenu` so every feature agrees. Shared
 * because `menu` produces it and `item` (and later `cart`) consume it (ADR-0018).
 */
export interface ResolvedItem extends MenuItem {
  available: boolean;
  /** Reason it is off, when it is: an 86'd item, or every option of a required group 86'd. */
  unavailableReason: 'eighty_sixed' | 'required_group_empty' | null;
}

export interface ResolvedCategory extends Omit<MenuCategory, 'items'> {
  items: ResolvedItem[];
}

export interface ResolvedMenu {
  menuVersion: string;
  categories: ResolvedCategory[];
  groupsById: Map<string, MenuModifierGroup>;
  optionAvailable: (optionId: string) => boolean;
  staleAgainstVersion: boolean;
}
