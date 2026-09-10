import type { MenuItem } from '@veyroxai/contracts';

/**
 * TODO(backend): delete this file and the fallback in `repo/upsellRepo.ts` once
 * `GET /public/upsell` exists (FR-2.12 — a café-flagged add-on).
 */
export const MOCK_UPSELL: MenuItem = {
  id: '0a5e0000-0000-4000-8000-000000000a11',
  sort: 0,
  name: { en: 'Butter Croissant', 'ar-EG': 'كرواسون بالزبدة' },
  description: {
    en: 'Flaky cultured-butter pastry, baked this morning.',
    'ar-EG': 'معجنات هشة بالزبدة، مخبوزة هذا الصباح.',
  },
  basePriceMinor: 4500,
  prepSeconds: 0,
  imageUrl: null,
  modifierGroupIds: [],
};
