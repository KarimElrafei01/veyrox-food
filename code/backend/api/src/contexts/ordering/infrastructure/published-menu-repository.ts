import { and, eq, withTenant, type Database, tables } from '@veyroxai/db';
import { toMinor, type LoyaltyTier, type PricingMenu } from '@veyroxai/domain';
import { singleFlight } from './single-flight.js';
import { jitteredTtlSeconds } from './cache-ttl.js';
import type { createReadPathBudget } from './read-path-budget.js';

export class PublishedMenuRepository {
  private readonly coalesceLoad = singleFlight<PricingMenu | null>();

  constructor(
    private readonly db: Database,
    private readonly cache: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
    },
    private readonly readBudget: ReturnType<typeof createReadPathBudget> = (fn) => fn(),
  ) {}

  async loadPricingMenu(tenantId: string, menuVersionId: string): Promise<PricingMenu | null> {
    const cacheKey = `menu:${tenantId}:${menuVersionId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as PricingMenu;
    // Coalesced: many requests racing a cache miss (cold cache, or a
    // republish invalidating the key) would otherwise each open a
    // transaction on the pool that order placement also depends on.
    return this.coalesceLoad(cacheKey, () =>
      // Capped so a read stampede can never claim every connection in the
      // shared pool — order placement is not routed through this budget.
      this.readBudget(() => this.rebuildPricingMenu(tenantId, menuVersionId, cacheKey)),
    );
  }

  private async rebuildPricingMenu(
    tenantId: string,
    menuVersionId: string,
    cacheKey: string,
  ): Promise<PricingMenu | null> {
    return withTenant(this.db, tenantId, async (tx) => {
      const where = and(
        eq(tables.menuVersionItems.tenantId, tenantId),
        eq(tables.menuVersionItems.menuVersionId, menuVersionId),
      );
      const [items, groups, options, attachments, liveItems, liveOptions] = await Promise.all([
        tx.select().from(tables.menuVersionItems).where(where),
        tx
          .select()
          .from(tables.menuVersionModifierGroups)
          .where(
            and(
              eq(tables.menuVersionModifierGroups.tenantId, tenantId),
              eq(tables.menuVersionModifierGroups.menuVersionId, menuVersionId),
            ),
          ),
        tx
          .select()
          .from(tables.menuVersionModifierOptions)
          .where(
            and(
              eq(tables.menuVersionModifierOptions.tenantId, tenantId),
              eq(tables.menuVersionModifierOptions.menuVersionId, menuVersionId),
            ),
          ),
        tx
          .select()
          .from(tables.menuVersionItemModifierGroups)
          .where(
            and(
              eq(tables.menuVersionItemModifierGroups.tenantId, tenantId),
              eq(tables.menuVersionItemModifierGroups.menuVersionId, menuVersionId),
            ),
          ),
        tx.select().from(tables.menuItems).where(eq(tables.menuItems.tenantId, tenantId)),
        tx
          .select()
          .from(tables.modifierOptions)
          .where(eq(tables.modifierOptions.tenantId, tenantId)),
      ]);
      if (items.length === 0) return null;
      const itemAvailable = new Map(liveItems.map((item) => [item.id, item.isAvailable]));
      const optionAvailable = new Map(liveOptions.map((option) => [option.id, option.isAvailable]));
      const menu = {
        items: items.map((item) => ({
          id: item.menuItemId,
          basePriceMinor: toMinor(item.basePriceMinor),
          modifierGroupIds: attachments
            .filter((attachment) => attachment.menuItemId === item.menuItemId)
            .map((attachment) => attachment.modifierGroupId),
          isAvailable: itemAvailable.get(item.menuItemId) ?? false,
          prepSeconds: item.prepSeconds,
        })),
        groups: groups.map((group) => ({
          id: group.modifierGroupId,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          optionIds: options
            .filter((option) => option.modifierGroupId === group.modifierGroupId)
            .map((option) => option.modifierOptionId),
        })),
        options: options.map((option) => ({
          id: option.modifierOptionId,
          priceDeltaMinor: toMinor(option.priceDeltaMinor),
          freeForTier: option.freeForTier as LoyaltyTier | null,
          isAvailable: optionAvailable.get(option.modifierOptionId) ?? false,
        })),
      };
      await this.cache.set(cacheKey, JSON.stringify(menu), 'EX', jitteredTtlSeconds(86_400, 3_600));
      return menu;
    });
  }
}
