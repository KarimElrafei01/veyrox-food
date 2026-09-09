import { type LoyaltyTier } from '@veyroxai/domain';
import type { Minor } from '@veyroxai/domain';

export interface LoyaltyAccrualStore {
  accrue(input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    totalMinor: Minor;
    tier: LoyaltyTier;
  }): Promise<{ points: number; previousTier: LoyaltyTier; nextTier: LoyaltyTier }>;
}

export function tierCelebrationKey(
  customerId: string,
  tier: LoyaltyTier,
  cairoDate: string,
): string {
  return `tier_celebration:${customerId}:${tier}:${cairoDate}`;
}

export function loyaltyCacheMatchesLedger(pointsCache: number, deltas: readonly number[]): boolean {
  return pointsCache === deltas.reduce((total, delta) => total + delta, 0);
}

/** Collection is the sole accrual point: a placed order is only a promise, not revenue. */
export async function accrueLoyalty(
  store: LoyaltyAccrualStore,
  input: {
    tenantId: string;
    customerId: string;
    orderId: string;
    totalMinor: Minor;
    tier: LoyaltyTier;
  },
): Promise<{ points: number; previousTier: LoyaltyTier; nextTier: LoyaltyTier }> {
  return store.accrue(input);
}
