import { describe, expect, it } from 'vitest';
import {
  availabilityResponse,
  menuResponse,
  orderStatusResponse,
  quoteResponse,
  sessionResolveResponse,
} from './customer-ordering-responses.js';

// Fixtures follow the JSON examples in docs/features/F1-customer-ordering/, with real hex UUIDs.
const TENANT = '3f1c0a11-0000-4000-8000-000000000001';
const MENU_V = '8a2e0b22-0000-4000-8000-000000000002';
const CAT = 'c1000000-0000-4000-8000-000000000010';
const ITEM = '11000000-0000-4000-8000-000000000020';
const GROUP = '90000000-0000-4000-8000-000000000030';
const OAT = 'a0000000-0000-4000-8000-000000000040';
const LARGE = 'b0000000-0000-4000-8000-000000000041';

describe('sessionResolveResponse', () => {
  it('parses the F1.1 §3 example', () => {
    const parsed = sessionResolveResponse.parse({
      tenant: {
        id: TENANT,
        name: 'Brew & Baladi',
        defaultLocale: 'en',
        supportedLocales: ['en', 'ar-EG'],
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      },
      session: { menuVersion: MENU_V, expiresAt: '2026-09-06T15:45:00+03:00', locale: 'en' },
      customer: {
        displayName: 'Karim',
        tier: 'silver',
        pointsBalance: 312,
        pointsToNextTier: 189,
        perks: ['free_alt_milk'],
      },
      store: { isOpen: true, closesAt: '2026-09-07T01:00:00+03:00' },
      ordering: { enabled: true, askTableNumber: false, minOrderValueMinor: 0, payAt: 'counter' },
      links: { menu: '/public/menu/8a2e', availability: '/public/availability' },
      openOrder: null,
      traceId: '0af7651916cd43dd',
    });
    expect(parsed.customer.tier).toBe('silver');
  });

  it('parses a response from a backend older than the openOrder field', () => {
    const parsed = sessionResolveResponse.parse({
      tenant: {
        id: TENANT,
        name: 'Brew & Baladi',
        defaultLocale: 'en',
        supportedLocales: ['en', 'ar-EG'],
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      },
      session: { menuVersion: MENU_V, expiresAt: '2026-09-06T15:45:00+03:00', locale: 'en' },
      customer: {
        displayName: 'Karim',
        tier: 'silver',
        pointsBalance: 312,
        pointsToNextTier: 189,
        perks: ['free_alt_milk'],
      },
      store: { isOpen: true, closesAt: '2026-09-07T01:00:00+03:00' },
      ordering: { enabled: true, askTableNumber: false, minOrderValueMinor: 0, payAt: 'counter' },
      links: { menu: '/public/menu/8a2e', availability: '/public/availability' },
      // openOrder omitted deliberately — frontend/backend deploy independently here.
      traceId: '0af7651916cd43dd',
    });
    expect(parsed.openOrder).toBeUndefined();
  });

  it('parses the browse-only shape — closed, with a schedule and no wall-clock promise', () => {
    const parsed = sessionResolveResponse.parse({
      tenant: {
        id: TENANT,
        name: 'Brew & Baladi',
        defaultLocale: 'en',
        supportedLocales: ['en', 'ar-EG'],
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      },
      session: { menuVersion: MENU_V, expiresAt: '2026-09-06T15:45:00+03:00', locale: 'en' },
      customer: {
        displayName: 'Karim',
        tier: 'silver',
        pointsBalance: 312,
        pointsToNextTier: 189,
        perks: ['free_alt_milk'],
      },
      store: {
        isOpen: false,
        closesAt: null,
        opensAt: '2026-09-07T07:00:00+03:00',
        today: null,
        tomorrow: { opens: '08:00', closes: '23:00' },
      },
      ordering: { enabled: true, askTableNumber: false, minOrderValueMinor: 0, payAt: 'counter' },
      links: { menu: '/public/menu/8a2e', availability: '/public/availability' },
      openOrder: null,
      traceId: '0af7651916cd43dd',
    });
    expect(parsed.store.isOpen).toBe(false);
    expect(parsed.store.today).toBeNull();
    expect(parsed.store.tomorrow).toEqual({ opens: '08:00', closes: '23:00' });
  });
});

describe('menuResponse + availabilityResponse', () => {
  it('parses the F1.2 §2 examples', () => {
    const menu = menuResponse.parse({
      menuVersion: MENU_V,
      publishedAt: '2026-09-01T09:12:00+03:00',
      categories: [
        {
          id: CAT,
          sort: 1,
          name: { en: 'Espresso', 'ar-EG': 'إسبريسو' },
          items: [
            {
              id: ITEM,
              sort: 1,
              name: { en: 'Latte', 'ar-EG': 'لاتيه' },
              description: { en: 'Double shot, steamed milk' },
              basePriceMinor: 9000,
              prepSeconds: 150,
              imageUrl: null,
              modifierGroupIds: [GROUP],
            },
          ],
        },
      ],
      modifierGroups: [
        {
          id: GROUP,
          name: { en: 'Milk', 'ar-EG': 'لبن' },
          selection: 'single',
          required: true,
          minSelect: 1,
          maxSelect: 1,
          options: [
            {
              id: OAT,
              name: { en: 'Oat', 'ar-EG': 'شوفان' },
              priceDeltaMinor: 1500,
              freeForTier: 'silver',
              sort: 2,
            },
          ],
        },
      ],
    });
    expect(menu.categories[0]?.items[0]?.basePriceMinor).toBe(9000);

    const avail = availabilityResponse.parse({
      menuVersion: MENU_V,
      unavailableItemIds: [],
      unavailableModifierOptionIds: [OAT],
      asOf: '2026-09-06T15:31:04+03:00',
    });
    expect(avail.unavailableModifierOptionIds).toHaveLength(1);
  });
});

describe('quoteResponse', () => {
  it('keeps a waived modifier delta visible', () => {
    const q = quoteResponse.parse({
      lines: [
        {
          clientLineId: '0192d425-9790-7dd9-8aa9-8cbd4c3844dc',
          menuItemId: ITEM,
          qty: 2,
          unitPriceMinor: 9000,
          modifierTotalMinor: 2500,
          lineTotalMinor: 23000,
          modifiers: [
            { id: LARGE, priceDeltaMinor: 2500, waivedByTier: false },
            { id: OAT, priceDeltaMinor: 1500, waivedByTier: true },
          ],
        },
      ],
      subtotalMinor: 23000,
      discountMinor: 0,
      totalMinor: 23000,
      eta: { lowerMinutes: 8, upperMinutes: 12, queueDepth: 3 },
      loyalty: { pointsToEarn: 33, tier: 'silver', multiplier: 1.2 },
      unavailable: [],
      payAt: 'counter',
      traceId: '0af7651916cd43dd',
    });
    expect(q.lines[0]?.modifiers[1]?.waivedByTier).toBe(true);
  });
});

describe('orderStatusResponse', () => {
  it('discriminates on status', () => {
    const rejected = orderStatusResponse.parse({
      orderId: 'o_9f2',
      orderNumber: 'A-047',
      statusLabel: { en: 'Could not be prepared', 'ar-EG': 'تعذّر التحضير' },
      totalMinor: 27500,
      payAt: 'counter',
      placedAt: '2026-09-06T15:31:12+03:00',
      traceId: 't1',
      status: 'rejected',
      rejectionReason: 'item_unavailable',
      rejectedAt: '2026-09-06T15:33:10+03:00',
    });
    expect(rejected.status).toBe('rejected');
  });
});
