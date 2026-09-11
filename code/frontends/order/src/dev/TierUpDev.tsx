import { useState } from 'react';
import { useT } from '@veyroxai/ui';
import { TierUpCelebration } from '../features/loyalty/ui/TierUpCelebration.js';
import { tierUpFixture } from './tier-up-fixture.js';

/** Standalone, deterministic entry point for design review: /dev/tier-up. */
export function TierUpDev(): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const { t } = useT();
  return open ? (
    <TierUpCelebration data={tierUpFixture} onDismiss={() => setOpen(false)} />
  ) : (
    <button type="button" onClick={() => setOpen(true)}>
      {t('loyalty.revealPromotion')}
    </button>
  );
}
