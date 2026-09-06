export * from './tenants.js';
export * from './catalog.js';
export * from './orders.js';
export * from './ledger.js';
export * from './events.js';

import * as tenants from './tenants.js';
import * as catalog from './catalog.js';
import * as orders from './orders.js';
import * as ledger from './ledger.js';
import * as events from './events.js';

/** Every table object, for tooling that must enumerate the schema (e.g. the
 *  cross-tenant leak suite — a new table cannot be added without being covered). */
export const schema = { ...tenants, ...catalog, ...orders, ...ledger, ...events };
