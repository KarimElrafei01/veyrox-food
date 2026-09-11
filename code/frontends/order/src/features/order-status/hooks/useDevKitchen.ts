import { useCallback, useState } from 'react';
import { advanceOrder } from '../repo/devKitchenRepo.js';
import type { KitchenAction } from '../datasource/devKitchenDatasource.js';

/** Fires a simulated kitchen action, then hands back to the caller to refresh. */
export function useDevKitchen(
  orderId: string,
  tenantId: string,
): { pending: KitchenAction | null; run: (action: KitchenAction) => Promise<boolean> } {
  const [pending, setPending] = useState<KitchenAction | null>(null);

  const run = useCallback(
    async (action: KitchenAction) => {
      setPending(action);
      try {
        return await advanceOrder(orderId, tenantId, action);
      } finally {
        setPending(null);
      }
    },
    [orderId, tenantId],
  );

  return { pending, run };
}
