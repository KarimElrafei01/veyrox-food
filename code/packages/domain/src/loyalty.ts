import type { LoyaltyTier } from './pricing.js';
import type { Minor } from './money/minor.js';

const MULTIPLIERS: Record<LoyaltyTier, number> = { bronze: 1, silver: 1.2, gold: 1.5 };

export function tierForPoints(points: number): LoyaltyTier {
  if (points >= 501) return 'gold';
  if (points >= 151) return 'silver';
  return 'bronze';
}

export function pointsToNextTier(points: number): number | null {
  if (points < 151) return 151 - points;
  if (points < 501) return 501 - points;
  return null;
}

export function perksForTier(tier: LoyaltyTier): readonly string[] {
  return tier === 'bronze'
    ? []
    : tier === 'silver'
      ? ['free_alt_milk']
      : ['free_alt_milk', 'priority_prep'];
}

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
