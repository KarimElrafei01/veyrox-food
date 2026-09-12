import type { FastifyInstance } from 'fastify';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { CatalogueRepository } from '../infrastructure/catalogue-repository.js';

function localeMapOf(en: string, ar: string | null): { en: string; 'ar-EG'?: string } {
  return ar ? { en, 'ar-EG': ar } : { en };
}

export async function staffMenuController(
  app: FastifyInstance,
  options: {
    catalogue: CatalogueRepository;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  },
): Promise<void> {
  app.get('/staff/menu', async (request, reply) => {
    try {
      const staff = authenticateStaff(
        request,
        options.deviceKeys,
        options.pinKeys,
        Math.floor(Date.now() / 1000),
      );
      const menu = await options.catalogue.loadStaffMenu(staff.tenantId);

      return reply.status(200).send({
        categories: menu.categories.map((category) => ({
          id: category.id,
          name: localeMapOf(category.nameEn, category.nameAr),
          sort: category.sort,
        })),
        items: menu.items.map((item) => ({
          id: item.id,
          categoryId: item.categoryId,
          sort: item.sort,
          name: localeMapOf(item.nameEn, item.nameAr),
          basePriceMinor: item.basePriceMinor,
          imageObjectKey: item.imageObjectKey,
          isAvailable: item.isAvailable,
          modifierGroupIds: item.modifierGroupIds,
        })),
        modifierGroups: menu.modifierGroups.map((group) => ({
          id: group.id,
          name: localeMapOf(group.nameEn, group.nameAr),
          selection: group.selection,
          required: group.required,
          options: group.options.map((option) => ({
            id: option.id,
            name: localeMapOf(option.nameEn, option.nameAr),
            priceDeltaMinor: option.priceDeltaMinor,
            isAvailable: option.isAvailable,
          })),
        })),
        traceId: request.id,
      });
    } catch (error) {
      if (error instanceof StaffSessionExpired)
        return reply.status(401).send({ code: 'SESSION_EXPIRED', traceId: request.id });
      if (error instanceof StaffSessionInvalid)
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      throw error;
    }
  });
}
