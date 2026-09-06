import { describe, expect, it } from 'vitest';
import {
  mintCustomerSession,
  SessionExpired,
  SessionInvalid,
  verifyCustomerSession,
} from './session-token.js';

const session = {
  tenantId: 'tenant',
  customerId: 'customer',
  waId: 'opaque-wa-id',
  menuVersionId: 'menu',
  locale: 'en' as const,
  issuedAt: 1_000,
  expiresAt: 1_900,
};

describe('customer session token', () => {
  it('round-trips and accepts a previous rotation key', () => {
    const token = mintCustomerSession(session, 'previous');
    expect(verifyCustomerSession(token, ['current', 'previous'], 1_899)).toEqual(session);
  });

  it('rejects tampering and the exact expiry boundary', () => {
    const token = mintCustomerSession(session, 'current');
    expect(() => verifyCustomerSession(`${token}x`, ['current'], 1_100)).toThrow(SessionInvalid);
    expect(() => verifyCustomerSession(token, ['current'], 1_900)).toThrow(SessionExpired);
  });
});
