import type {
  AvailabilityResponse,
  MenuCategory,
  MenuItem,
  MenuModifierGroup,
  MenuResponse,
} from '@veyroxai/contracts';
import { fetchAvailability, fetchMenu } from '../repo/menuRepo.js';

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

interface Deps {
  fetchMenu: typeof fetchMenu;
  fetchAvailability: typeof fetchAvailability;
}

/**
 * Merge the immutable menu with live availability (F1.2 §1). An item is off if it
 * is directly 86'd, or if a *required* modifier group has no available option
 * left — that is computed here, once, so every screen agrees.
 */
export async function loadMenu(
  menuVersion: string,
  deps: Deps = { fetchMenu, fetchAvailability },
): Promise<ResolvedMenu> {
  const [menu, availability] = await Promise.all([
    deps.fetchMenu(menuVersion),
    deps.fetchAvailability().catch<AvailabilityResponse | null>(() => null),
  ]);
  return mergeMenu(menu, availability);
}

export function mergeMenu(
  menu: MenuResponse,
  availability: AvailabilityResponse | null,
): ResolvedMenu {
  const off = new Set(availability?.unavailableItemIds ?? []);
  const offOptions = new Set(availability?.unavailableModifierOptionIds ?? []);
  const groupsById = new Map(menu.modifierGroups.map((g) => [g.id, g]));

  const requiredGroupEmpty = (groupId: string): boolean => {
    const group = groupsById.get(groupId);
    if (!group || !group.required) {
      return false;
    }
    return group.options.every((o) => offOptions.has(o.id));
  };

  const categories: ResolvedCategory[] = menu.categories
    .map((cat) => ({
      ...cat,
      items: cat.items.map<ResolvedItem>((item) => {
        if (off.has(item.id)) {
          return { ...item, available: false, unavailableReason: 'eighty_sixed' };
        }
        if (item.modifierGroupIds.some(requiredGroupEmpty)) {
          return { ...item, available: false, unavailableReason: 'required_group_empty' };
        }
        return { ...item, available: true, unavailableReason: null };
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  return {
    menuVersion: menu.menuVersion,
    categories,
    groupsById,
    optionAvailable: (optionId) => !offOptions.has(optionId),
    staleAgainstVersion: availability != null && availability.menuVersion !== menu.menuVersion,
  };
}
