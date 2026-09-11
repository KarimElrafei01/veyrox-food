import { advanceOrderInDev, type KitchenAction } from '../datasource/devKitchenDatasource.js';

export function advanceOrder(
  orderId: string,
  tenantId: string,
  action: KitchenAction,
  advance: typeof advanceOrderInDev = advanceOrderInDev,
): Promise<boolean> {
  return advance(orderId, tenantId, action);
}
