export type KitchenAction = 'accept' | 'preparing' | 'ready' | 'reject';

/**
 * POST /dev/orders/:orderId/advance — dev-only, present only when the API runs
 * with DEV_LOGIN=1. There's no KDS yet, so this is the only way to move a test
 * order past 'placed'. A raw fetch (no auth, no contract schema): this endpoint
 * is not part of the public contract and never ships to a real deployment.
 */
export async function advanceOrderInDev(
  orderId: string,
  tenantId: string,
  action: KitchenAction,
): Promise<boolean> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/';
  try {
    const res = await fetch(new URL(`/dev/orders/${encodeURIComponent(orderId)}/advance`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId, action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
