import { describe, expect, it } from 'vitest';
import { renderPublishedMenu, type PublishedMenuData } from './render-published-menu.js';

const menu: PublishedMenuData = {
  menuVersion: 'version',
  publishedAt: new Date('2026-09-06T12:00:00.000Z'),
  categories: [
    { id: 'empty', sort: 1, nameEn: 'Empty', nameAr: null },
    { id: 'drinks', sort: 2, nameEn: 'Drinks', nameAr: 'مشروبات' },
  ],
  items: [
    {
      id: 'latte',
      categoryId: 'drinks',
      sort: 1,
      nameEn: 'Latte',
      nameAr: null,
      descriptionEn: null,
      descriptionAr: null,
      basePriceMinor: 6500,
      prepSeconds: 150,
      modifierGroupIds: ['milk'],
    },
  ],
  modifierGroups: [
    {
      id: 'milk',
      nameEn: 'Milk',
      nameAr: null,
      selection: 'single',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        {
          id: 'oat',
          nameEn: 'Oat',
          nameAr: null,
          priceDeltaMinor: 1500,
          freeForTier: 'silver',
          sort: 1,
        },
      ],
    },
  ],
};

describe('renderPublishedMenu', () => {
  it('is byte-identical and falls Arabic fields back to English', () => {
    const first = renderPublishedMenu(menu);
    const second = renderPublishedMenu(menu);
    expect(first).toEqual(second);
    expect(JSON.parse(first.body)).toMatchObject({
      categories: [
        { name: { en: 'Drinks', 'ar-EG': 'مشروبات' }, items: [{ name: { 'ar-EG': 'Latte' } }] },
      ],
    });
  });
});
