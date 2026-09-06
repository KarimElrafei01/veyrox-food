import { describe, expect, it } from 'vitest';
import { toMinor, type PricingMenu } from '@veyroxai/domain';
import { QuoteOrder } from './quote-order.js';
import { PublishedMenuRepository } from '../infrastructure/published-menu-repository.js';

const menu: PricingMenu = {
  items: [{ id: 'latte', basePriceMinor: toMinor(9000), modifierGroupIds: [], isAvailable: true }],
  groups: [],
  options: [],
};

describe('QuoteOrder', () => {
  it('uses the same pure pricing calculation as placement will use', async () => {
    const repository = Object.create(PublishedMenuRepository.prototype) as PublishedMenuRepository;
    repository.loadPricingMenu = async () => menu;
    const quote = await new QuoteOrder(repository).execute({
      tenantId: 'tenant',
      menuVersionId: 'menu',
      tier: 'bronze',
      items: [{ menuItemId: 'latte', qty: 2, modifierOptionIds: [] }],
    });
    expect(quote.totalMinor).toBe(18000);
  });
});
