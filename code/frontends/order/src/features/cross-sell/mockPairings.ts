import type { MenuItem } from '@veyroxai/contracts';

/**
 * TODO(backend): delete this file and the fallback in `repo/pairingsRepo.ts` once
 * `GET /public/pairings` exists (FR-2.13 — order co-occurrence).
 */
export const MOCK_PAIRINGS: MenuItem[] = [
  {
    id: '0a5e0000-0000-4000-8000-000000000b01',
    sort: 0,
    name: { en: 'Tahina Sea-Salt Cookie', 'ar-EG': 'كوكيز بالطحينة والملح' },
    description: {
      en: 'Sourdough cookie swirled with sesame tahina and sea-salt flake.',
      'ar-EG': 'كوكيز عجين مخمر بالطحينة ورقائق ملح البحر.',
    },
    basePriceMinor: 4000,
    prepSeconds: 0,
    imageUrl: null,
    modifierGroupIds: [],
  },
  {
    id: '0a5e0000-0000-4000-8000-000000000b02',
    sort: 1,
    name: { en: 'Pistachio Baklava Bite', 'ar-EG': 'قطعة بقلاوة بالفستق' },
    description: {
      en: 'Layered filo with Sinai pistachios and honey-blossom glaze.',
      'ar-EG': 'طبقات فيلو بفستق سيناء وتزجيج زهر العسل.',
    },
    basePriceMinor: 3500,
    prepSeconds: 0,
    imageUrl: null,
    modifierGroupIds: [],
  },
  {
    id: '0a5e0000-0000-4000-8000-000000000b03',
    sort: 2,
    name: { en: 'Butter Croissant', 'ar-EG': 'كرواسون بالزبدة' },
    description: {
      en: 'Flaky cultured-butter pastry baked at 6:30 AM in Cairo.',
      'ar-EG': 'معجنات هشة بالزبدة تُخبز الساعة 6:30 صباحًا في القاهرة.',
    },
    basePriceMinor: 4500,
    prepSeconds: 0,
    imageUrl: null,
    modifierGroupIds: [],
  },
];
