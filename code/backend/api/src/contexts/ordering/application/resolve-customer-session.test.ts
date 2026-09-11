import { describe, expect, it, vi } from 'vitest';
import { ResolveCustomerSession, StoreClosed } from './resolve-customer-session.js';
import type { CustomerSessionRepository } from '../infrastructure/customer-session-repository.js';
import type { CustomerSession } from '../../identity/domain/index.js';

const NOON_SUNDAY = new Date('2026-09-06T12:00:00+02:00'); // Africa/Cairo, a Sunday

function repo(overrides: Partial<Awaited<ReturnType<CustomerSessionRepository['load']>>> = {}) {
  return {
    load: vi.fn(async () => ({
      tenant: {
        id: 't1',
        name: 'Brew & Baladi',
        defaultLocale: 'en',
        currency: 'EGP',
        timezone: 'Africa/Cairo',
      },
      customer: { displayName: 'Karim', tier: 'bronze', pointsCache: 40, deletedAt: null },
      menuVersion: { id: 'm1', retainedUntil: new Date('2027-01-01') },
      // Closed all day Sunday (weekday 0) — open Mon-Sat 08:00-23:00.
      hours: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        opens: '08:00',
        closes: '23:00',
        crossesMidnight: false,
      })),
      closures: [],
      abandonedOrderCount: 0,
      openOrder: null,
      orderingEnabled: true,
      orderingDisabledReason: 'platform_disabled' as const,
      ...overrides,
    })),
  } as unknown as CustomerSessionRepository;
}

const session: CustomerSession = {
  tenantId: 't1',
  customerId: 'c1',
  waId: '2010',
  menuVersionId: 'm1',
  tier: 'bronze',
  locale: 'en',
  issuedAt: 0,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};

describe('ResolveCustomerSession', () => {
  it('blocks entry with STORE_CLOSED by default, same as placement', async () => {
    const useCase = new ResolveCustomerSession(repo());
    await expect(useCase.execute(session, NOON_SUNDAY)).rejects.toBeInstanceOf(StoreClosed);
  });

  it('allowClosed lets a closed café still resolve — F1.1: "browsing is not blocked"', async () => {
    const useCase = new ResolveCustomerSession(repo());
    const result = await useCase.execute(session, NOON_SUNDAY, { allowClosed: true });
    expect(result.store.isOpen).toBe(false);
    expect(result.store.opensAt).not.toBeNull();
    // Sunday carries no hours row at all — closed all day, not just outside a window.
    expect(result.store.today).toBeNull();
    expect(result.store.tomorrow).toEqual({ opens: '08:00', closes: '23:00' });
  });

  it('reports real hours when open, with allowClosed a no-op', async () => {
    const useCase = new ResolveCustomerSession(repo());
    const monday10am = new Date('2026-09-07T10:00:00+02:00');
    const result = await useCase.execute(session, monday10am, { allowClosed: true });
    expect(result.store.isOpen).toBe(true);
    expect(result.store.opensAt).toBeNull();
    expect(result.store.today).toEqual({ opens: '08:00', closes: '23:00' });
  });
});
