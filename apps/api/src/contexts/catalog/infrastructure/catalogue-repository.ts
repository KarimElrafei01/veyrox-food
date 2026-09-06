import { and, asc, eq, isNull, withTenant, type Database, tables } from '@veyroxai/db';
import type { PublishedMenuData } from '../application/render-published-menu.js';

export class CatalogueRepository {
  constructor(private readonly db: Database) {}

  async loadPublishedMenu(menuVersionId: string): Promise<PublishedMenuData | null> {
    const [version] = await this.db
      .select()
      .from(tables.menuVersions)
      .where(eq(tables.menuVersions.id, menuVersionId));
    if (!version) return null;
    return withTenant(this.db, version.tenantId, async (tx) => {
      const [categories, items, groups, options, attachments] = await Promise.all([
        tx
          .select()
          .from(tables.menuVersionCategories)
          .where(
            and(
              eq(tables.menuVersionCategories.tenantId, version.tenantId),
              eq(tables.menuVersionCategories.menuVersionId, menuVersionId),
            ),
          )
          .orderBy(asc(tables.menuVersionCategories.sort)),
        tx
          .select()
          .from(tables.menuVersionItems)
          .where(
            and(
              eq(tables.menuVersionItems.tenantId, version.tenantId),
              eq(tables.menuVersionItems.menuVersionId, menuVersionId),
            ),
          )
          .orderBy(asc(tables.menuVersionItems.sort)),
        tx
          .select()
          .from(tables.menuVersionModifierGroups)
          .where(
            and(
              eq(tables.menuVersionModifierGroups.tenantId, version.tenantId),
              eq(tables.menuVersionModifierGroups.menuVersionId, menuVersionId),
            ),
          ),
        tx
          .select()
          .from(tables.menuVersionModifierOptions)
          .where(
            and(
              eq(tables.menuVersionModifierOptions.tenantId, version.tenantId),
              eq(tables.menuVersionModifierOptions.menuVersionId, menuVersionId),
            ),
          )
          .orderBy(asc(tables.menuVersionModifierOptions.sort)),
        tx
          .select()
          .from(tables.menuVersionItemModifierGroups)
          .where(
            and(
              eq(tables.menuVersionItemModifierGroups.tenantId, version.tenantId),
              eq(tables.menuVersionItemModifierGroups.menuVersionId, menuVersionId),
            ),
          )
          .orderBy(asc(tables.menuVersionItemModifierGroups.sort)),
      ]);
      return {
        menuVersion: version.id,
        publishedAt: version.publishedAt,
        categories: categories.map((category) => ({
          id: category.categoryId,
          sort: category.sort,
          nameEn: category.nameEn,
          nameAr: category.nameAr,
        })),
        items: items.map((item) => ({
          id: item.menuItemId,
          categoryId: item.categoryId,
          sort: item.sort,
          nameEn: item.nameEn,
          nameAr: item.nameAr,
          descriptionEn: item.descriptionEn,
          descriptionAr: item.descriptionAr,
          basePriceMinor: item.basePriceMinor,
          prepSeconds: item.prepSeconds,
          modifierGroupIds: attachments
            .filter((attachment) => attachment.menuItemId === item.menuItemId)
            .map((attachment) => attachment.modifierGroupId),
        })),
        modifierGroups: groups.map((group) => ({
          id: group.modifierGroupId,
          nameEn: group.nameEn,
          nameAr: group.nameAr,
          selection: group.selection,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          options: options
            .filter((option) => option.modifierGroupId === group.modifierGroupId)
            .map((option) => ({
              id: option.modifierOptionId,
              nameEn: option.nameEn,
              nameAr: option.nameAr,
              priceDeltaMinor: option.priceDeltaMinor,
              freeForTier: option.freeForTier,
              sort: option.sort,
            })),
        })),
      };
    });
  }

  async publish(tenantId: string, now: Date): Promise<string> {
    return withTenant(this.db, tenantId, async (tx) => {
      const [categories, items, prices, attachments, groups, options] = await Promise.all([
        tx.select().from(tables.menuCategories).where(eq(tables.menuCategories.tenantId, tenantId)),
        tx
          .select()
          .from(tables.menuItems)
          .where(and(eq(tables.menuItems.tenantId, tenantId), eq(tables.menuItems.active, true))),
        tx
          .select()
          .from(tables.menuItemPrices)
          .where(
            and(
              eq(tables.menuItemPrices.tenantId, tenantId),
              isNull(tables.menuItemPrices.validTo),
            ),
          ),
        tx
          .select()
          .from(tables.menuItemModifierGroups)
          .where(eq(tables.menuItemModifierGroups.tenantId, tenantId)),
        tx.select().from(tables.modifierGroups).where(eq(tables.modifierGroups.tenantId, tenantId)),
        tx
          .select()
          .from(tables.modifierOptions)
          .where(eq(tables.modifierOptions.tenantId, tenantId)),
      ]);
      const priceByItem = new Map(prices.map((price) => [price.menuItemId, price]));
      const publishedItems = items.filter((item) => priceByItem.has(item.id));
      const publishedItemIds = new Set(publishedItems.map((item) => item.id));
      const publishedAttachments = attachments.filter((attachment) =>
        publishedItemIds.has(attachment.menuItemId),
      );
      const publishedGroupIds = new Set(
        publishedAttachments.map((attachment) => attachment.groupId),
      );
      const [version] = await tx
        .insert(tables.menuVersions)
        .values({
          tenantId,
          publishedAt: now,
          retainedUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        })
        .returning({ id: tables.menuVersions.id });
      if (!version) throw new Error('Menu publication was not created.');
      const categoryIds = new Set(
        publishedItems.flatMap((item) => (item.categoryId ? [item.categoryId] : [])),
      );
      const publishedCategories = categories.filter((category) => categoryIds.has(category.id));
      if (publishedCategories.length)
        await tx
          .insert(tables.menuVersionCategories)
          .values(
            publishedCategories.map((category) => ({
              menuVersionId: version.id,
              categoryId: category.id,
              tenantId,
              nameEn: category.nameEn,
              nameAr: category.nameAr,
              sort: category.sort,
            })),
          );
      if (publishedItems.length)
        await tx
          .insert(tables.menuVersionItems)
          .values(
            publishedItems.map((item) => ({
              menuVersionId: version.id,
              menuItemId: item.id,
              tenantId,
              categoryId: item.categoryId,
              nameEn: item.nameEn,
              nameAr: item.nameAr,
              descriptionEn: item.descriptionEn,
              descriptionAr: item.descriptionAr,
              basePriceMinor: priceByItem.get(item.id)!.priceMinor,
              prepSeconds: item.basePrepSeconds,
              sort: item.sort,
            })),
          );
      const publishedGroups = groups.filter((group) => publishedGroupIds.has(group.id));
      if (publishedGroups.length)
        await tx
          .insert(tables.menuVersionModifierGroups)
          .values(
            publishedGroups.map((group) => ({
              menuVersionId: version.id,
              modifierGroupId: group.id,
              tenantId,
              nameEn: group.nameEn,
              nameAr: group.nameAr,
              selection: group.selection,
              minSelect: group.minSelect,
              maxSelect: group.maxSelect,
              required: group.required,
            })),
          );
      const publishedOptions = options.filter((option) => publishedGroupIds.has(option.groupId));
      if (publishedOptions.length)
        await tx
          .insert(tables.menuVersionModifierOptions)
          .values(
            publishedOptions.map((option, sort) => ({
              menuVersionId: version.id,
              modifierOptionId: option.id,
              tenantId,
              modifierGroupId: option.groupId,
              nameEn: option.nameEn,
              nameAr: option.nameAr,
              priceDeltaMinor: option.priceDeltaMinor,
              freeForTier: option.freeForTier,
              sort,
            })),
          );
      if (publishedAttachments.length)
        await tx
          .insert(tables.menuVersionItemModifierGroups)
          .values(
            publishedAttachments.map((attachment) => ({
              menuVersionId: version.id,
              menuItemId: attachment.menuItemId,
              modifierGroupId: attachment.groupId,
              tenantId,
              sort: attachment.sort,
            })),
          );
      return version.id;
    });
  }

  async loadAvailability(tenantId: string, menuVersionId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const [version] = await tx
        .select({ id: tables.menuVersions.id })
        .from(tables.menuVersions)
        .where(
          and(
            eq(tables.menuVersions.id, menuVersionId),
            eq(tables.menuVersions.tenantId, tenantId),
          ),
        );
      if (!version) return null;
      const [items, options] = await Promise.all([
        tx
          .select({ id: tables.menuItems.id })
          .from(tables.menuItems)
          .where(
            and(eq(tables.menuItems.tenantId, tenantId), eq(tables.menuItems.isAvailable, false)),
          ),
        tx
          .select({ id: tables.modifierOptions.id })
          .from(tables.modifierOptions)
          .where(
            and(
              eq(tables.modifierOptions.tenantId, tenantId),
              eq(tables.modifierOptions.isAvailable, false),
            ),
          ),
      ]);
      return {
        unavailableItemIds: items.map((item) => item.id),
        unavailableModifierOptionIds: options.map((option) => option.id),
      };
    });
  }
}
