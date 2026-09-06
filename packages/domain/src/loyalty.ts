import type { LoyaltyTier } from './pricing.js';
import type { Minor } from './money/minor.js';

const MULTIPLIERS: Record<LoyaltyTier, number> = { bronze: 1, silver: 1.2, gold: 1.5 };

/** Points are previewed at quote time but only accrued when staff records collection. */
export function previewPoints(
  totalMinor: Minor,
  tier: LoyaltyTier | null,
): {
  pointsToEarn: number;
  multiplier: number;
} {
  if (tier === null) return { pointsToEarn: 0, multiplier: 0 };
  const multiplier = MULTIPLIERS[tier];
  return { pointsToEarn: Math.floor(Math.floor(totalMinor / 1000) * multiplier), multiplier };
}
