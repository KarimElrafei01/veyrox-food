import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { mintDeviceJwt, mintPinActionToken } from '../../identity/domain/index.js';
import type { CatalogueRepository } from '../infrastructure/catalogue-repository.js';

const DEVICE_KEY = 'device-key';
const PIN_KEY = 'pin-key';

function headers() {
  const now = Math.floor(Date.now() / 1000);
  const deviceToken = mintDeviceJwt(
    { tenantId: 't1', deviceId: 'd1', deviceKind: 'kds', issuedAt: now, expiresAt: now + 3600 },
    DEVICE_KEY,
  );
  const pinToken = mintPinActionToken(
    { tenantId: 't1', deviceId: 'd1', staffId: 's1', issuedAt: now, expiresAt: now + 900 },
    PIN_KEY,
  );
  return { authorization: `Bearer ${deviceToken}`, 'x-staff-pin-token': pinToken };
}

function harness(loadStaffMenu?: CatalogueRepository['loadStaffMenu']) {
  const catalogue = {
    loadStaffMenu:
      loadStaffMenu ??
      vi.fn(async () => ({
        categories: [{ id: 'c1', nameEn: 'Mains', nameAr: null, sort: 0 }],
        items: [
          {
            id: 'i1',
            categoryId: 'c1',
            nameEn: 'Wagyu Burger',
            nameAr: null,
            basePriceMinor: 25000,
            imageObjectKey: null,
            isAvailable: false,
            sort: 0,
            modifierGroupIds: ['g1'],
          },
        ],
        modifierGroups: [
          {
            id: 'g1',
            nameEn: 'Extras',
            nameAr: null,
            selection: 'multi',
            required: false,
            options: [
              {
                id: 'o1',
                nameEn: 'Extra Cheese',
                nameAr: null,
                priceDeltaMinor: 500,
                isAvailable: true,
              },
            ],
          },
        ],
      })),
  } as unknown as CatalogueRepository;
  return buildApp({
    pingPostgres: async () => true,
    pingRedis: async () => true,
    staffMenu: { catalogue, deviceKeys: [DEVICE_KEY], pinKeys: [PIN_KEY] },
  }).then((app) => ({ app, catalogue }));
}

describe('GET /staff/menu', () => {
  it('rejects a request with no staff auth', async () => {
    const { app } = await harness();
    const response = await app.inject({ method: 'GET', url: '/staff/menu' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('returns the current live menu with isAvailable on items and options', async () => {
    const { app } = await harness();
    const response = await app.inject({ method: 'GET', url: '/staff/menu', headers: headers() });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items[0]).toMatchObject({
      id: 'i1',
      name: { en: 'Wagyu Burger' },
      isAvailable: false,
    });
    expect(body.modifierGroups[0].options[0]).toMatchObject({
      name: { en: 'Extra Cheese' },
      isAvailable: true,
    });
  });

  it('includes 86ed items - a barista must be able to find them to un-86 them', async () => {
    const { app, catalogue } = await harness();
    await app.inject({ method: 'GET', url: '/staff/menu', headers: headers() });
    expect(catalogue.loadStaffMenu).toHaveBeenCalledWith('t1');
  });
});
