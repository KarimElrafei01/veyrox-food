import { SessionInvalid } from '../../identity/domain/index.js';
import type { CustomerSession } from '../../identity/domain/index.js';
import type { CustomerSessionRepository } from '../infrastructure/customer-session-repository.js';
import { isStoreOpen, nextStoreOpening, todayAndTomorrowHours } from '../domain/store-hours.js';
import { perksForTier, pointsToNextTier, type LoyaltyTier } from '@veyroxai/domain';

export class StoreClosed extends Error {
  constructor(readonly opensAt: Date | null) {
    super('The store is currently closed.');
    this.name = 'StoreClosed';
  }
}

export class OrderingSuspended extends Error {
  constructor() {
    super('WhatsApp ordering is suspended for this customer.');
    this.name = 'OrderingSuspended';
  }
}

export class WhatsAppOrderingDisabled extends Error {
  constructor(readonly reason: 'platform_disabled' | 'not_entitled' | 'owner_disabled') {
    super('WhatsApp ordering is disabled.');
    this.name = 'WhatsAppOrderingDisabled';
  }
}

export class ResolveCustomerSession {
  constructor(private readonly sessions: CustomerSessionRepository) {}

  async execute(
    session: CustomerSession,
    now: Date,
    options: { allowClosed?: boolean } = {},
  ): Promise<{
    tenantId: string;
    tenantName: string;
    tenant: { defaultLocale: string; currency: string; timezone: string };
    menuVersionId: string;
    expiresAt: Date;
    locale: string;
    openOrder: {
      orderId: string;
      orderNumber: string;
      status: 'placed' | 'received' | 'preparing' | 'ready';
    } | null;
    customer: {
      displayName: string | null;
      tier: LoyaltyTier;
      pointsBalance: number;
      pointsToNextTier: number | null;
      perks: readonly string[];
    };
    store: {
      isOpen: boolean;
      closesAt: Date | null;
      opensAt: Date | null;
      today: { opens: string; closes: string } | null;
      tomorrow: { opens: string; closes: string } | null;
    };
    ordering: {
      enabled: true;
      askTableNumber: boolean;
      minOrderValueMinor: number;
      payAt: 'counter';
    };
  }> {
    const loaded = await this.sessions.load(
      session.tenantId,
      session.customerId,
      session.menuVersionId,
    );
    if (!loaded || loaded.menuVersion.retainedUntil < now || loaded.customer.deletedAt)
      throw new SessionInvalid();
    if (loaded.orderingEnabled !== true)
      throw new WhatsAppOrderingDisabled(loaded.orderingDisabledReason);
    if (loaded.abandonedOrderCount >= 3) throw new OrderingSuspended();
    const open = isStoreOpen(loaded.hours, loaded.closures, now, loaded.tenant.timezone);
    const opensAt = open
      ? null
      : nextStoreOpening(loaded.hours, loaded.closures, now, loaded.tenant.timezone);
    // Entry (allowClosed) still shows the menu closed — F1.1's "a closed café can
    // still show its menu." Placement (the default) keeps the hard 409 gate.
    if (!open && !options.allowClosed) throw new StoreClosed(opensAt);
    const schedule = todayAndTomorrowHours(loaded.hours, now, loaded.tenant.timezone);
    return {
      tenantId: loaded.tenant.id,
      tenantName: loaded.tenant.name,
      tenant: {
        defaultLocale: loaded.tenant.defaultLocale,
        currency: loaded.tenant.currency,
        timezone: loaded.tenant.timezone,
      },
      menuVersionId: loaded.menuVersion.id,
      expiresAt: new Date(session.expiresAt * 1000),
      locale: session.locale,
      openOrder: loaded.openOrder,
      customer: {
        displayName: loaded.customer.displayName,
        tier: loaded.customer.tier as LoyaltyTier,
        pointsBalance: loaded.customer.pointsCache,
        pointsToNextTier: pointsToNextTier(loaded.customer.pointsCache),
        perks: perksForTier(loaded.customer.tier as LoyaltyTier),
      },
      store: {
        isOpen: open,
        closesAt: null,
        opensAt,
        today: schedule.today,
        tomorrow: schedule.tomorrow,
      },
      ordering: { enabled: true, askTableNumber: false, minOrderValueMinor: 0, payAt: 'counter' },
    };
  }
}
