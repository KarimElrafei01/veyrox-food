import type { TierUpCelebrationData } from '../features/loyalty/ui/TierUpCelebration.js';

/** Fixed visual-regression data for the standalone /dev/tier-up route. */
export const tierUpFixture: TierUpCelebrationData = {
  customerName: 'Ahmed',
  tier: 'silver',
  balance: 320,
  pointsEarned: 80,
  nextTierPoints: 600,
};
