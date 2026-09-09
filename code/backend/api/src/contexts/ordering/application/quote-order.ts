import { priceCart, type CartLine, type LoyaltyTier, type PricedCart } from '@veyroxai/domain';
import { MenuVersionGone } from '@veyroxai/domain';
import type { PublishedMenuRepository } from '../infrastructure/published-menu-repository.js';

export class QuoteOrder {
  constructor(private readonly menus: PublishedMenuRepository) {}
  async execute(input: {
    tenantId: string;
    menuVersionId: string;
    tier: LoyaltyTier | null;
    items: readonly CartLine[];
  }): Promise<PricedCart & { etaItems: { prepSeconds: number }[] }> {
    const menu = await this.menus.loadPricingMenu(input.tenantId, input.menuVersionId);
    if (!menu) throw new MenuVersionGone('menu');
    const priced = priceCart(input.items, menu, input.tier);
    return {
      ...priced,
      etaItems: priced.lines.flatMap((line) => {
        const item = menu.items.find((candidate) => candidate.id === line.menuItemId);
        return Array.from({ length: line.qty }, () => ({ prepSeconds: item?.prepSeconds ?? 0 }));
      }),
    };
  }
}
