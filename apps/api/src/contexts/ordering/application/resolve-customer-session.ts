import { SessionInvalid } from '../interface/session-token.js';
import type { CustomerSession } from '../interface/session-token.js';
import type { CustomerSessionRepository } from '../infrastructure/customer-session-repository.js';

export class ResolveCustomerSession {
  constructor(private readonly sessions: CustomerSessionRepository) {}

  async execute(
    session: CustomerSession,
    now: Date,
  ): Promise<{
    tenantId: string;
    tenantName: string;
    menuVersionId: string;
    expiresAt: Date;
    locale: string;
    customer: { displayName: string | null; tier: string; pointsBalance: number };
  }> {
    const loaded = await this.sessions.load(
      session.tenantId,
      session.customerId,
      session.menuVersionId,
    );
    if (!loaded || loaded.menuVersion.retainedUntil < now || loaded.customer.deletedAt)
      throw new SessionInvalid();
    return {
      tenantId: loaded.tenant.id,
      tenantName: loaded.tenant.name,
      menuVersionId: loaded.menuVersion.id,
      expiresAt: new Date(session.expiresAt * 1000),
      locale: session.locale,
      customer: {
        displayName: loaded.customer.displayName,
        tier: loaded.customer.tier,
        pointsBalance: loaded.customer.pointsCache,
      },
    };
  }
}
