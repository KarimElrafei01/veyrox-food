import { createHash } from 'node:crypto';

export interface PublishedMenuData {
  menuVersion: string;
  publishedAt: Date;
  categories: readonly {
    id: string;
    sort: number;
    nameEn: string;
    nameAr: string | null;
  }[];
  items: readonly {
    id: string;
    categoryId: string | null;
    sort: number;
    nameEn: string;
    nameAr: string | null;
    descriptionEn: string | null;
    descriptionAr: string | null;
    basePriceMinor: number;
    prepSeconds: number;
    modifierGroupIds: readonly string[];
  }[];
  modifierGroups: readonly {
    id: string;
    nameEn: string;
    nameAr: string | null;
    selection: string;
    required: boolean;
    minSelect: number;
    maxSelect: number | null;
    options: readonly {
      id: string;
      nameEn: string;
      nameAr: string | null;
      priceDeltaMinor: number;
      freeForTier: string | null;
      sort: number;
    }[];
  }[];
}

function localeMap(en: string, ar: string | null): { en: string; 'ar-EG': string } {
  return { en, 'ar-EG': ar ?? en };
}

/** Stable sorting and fallback make this immutable response safe for a one-year cache. */
export function renderPublishedMenu(menu: PublishedMenuData): {
  body: string;
  etag: string;
} {
  const categories = [...menu.categories]
    .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id))
    .map((category) => {
      const items = menu.items
        .filter((item) => item.categoryId === category.id)
        .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id))
        .map((item) => ({
          id: item.id,
          sort: item.sort,
          name: localeMap(item.nameEn, item.nameAr),
          description: item.descriptionEn
            ? localeMap(item.descriptionEn, item.descriptionAr)
            : null,
          basePriceMinor: item.basePriceMinor,
          prepSeconds: item.prepSeconds,
          imageUrl: null,
          modifierGroupIds: [...item.modifierGroupIds],
        }));
      return items.length === 0
        ? null
        : {
            id: category.id,
            sort: category.sort,
            name: localeMap(category.nameEn, category.nameAr),
            items,
          };
    })
    .filter((category): category is NonNullable<typeof category> => category !== null);
  const modifierGroups = [...menu.modifierGroups]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((group) => ({
      id: group.id,
      name: localeMap(group.nameEn, group.nameAr),
      selection: group.selection,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: [...group.options]
        .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id))
        .map((option) => ({
          id: option.id,
          name: localeMap(option.nameEn, option.nameAr),
          priceDeltaMinor: option.priceDeltaMinor,
          freeForTier: option.freeForTier,
          sort: option.sort,
        })),
    }));
  const body = JSON.stringify({
    menuVersion: menu.menuVersion,
    publishedAt: menu.publishedAt.toISOString(),
    categories,
    modifierGroups,
  });
  return { body, etag: `"${createHash('sha256').update(body).digest('base64url')}"` };
}
