import { describe, expect, it } from 'vitest';
import {
  mintDeviceJwt,
  mintPinActionToken,
  SessionExpired,
  SessionInvalid,
  verifyDeviceJwt,
  verifyPinActionToken,
  verifyStaffSession,
} from './staff-session.js';

const device = {
  tenantId: 'tenant-1',
  deviceId: 'device-1',
  deviceKind: 'kds' as const,
  issuedAt: 1_000,
  expiresAt: 8_000_000, // ~90 days out, per ADR-0022's figure
};

const pin = {
  tenantId: 'tenant-1',
  deviceId: 'device-1',
  staffId: 'staff-1',
  issuedAt: 1_000,
  expiresAt: 1_900,
};

describe('device JWT', () => {
  it('round-trips and accepts a previous rotation key', () => {
    const token = mintDeviceJwt(device, 'previous');
    expect(verifyDeviceJwt(token, ['current', 'previous'], 1_100)).toEqual(device);
  });

  it('rejects tampering and the exact expiry boundary', () => {
    const token = mintDeviceJwt(device, 'current');
    expect(() => verifyDeviceJwt(`${token}x`, ['current'], 1_100)).toThrow(SessionInvalid);
    expect(() => verifyDeviceJwt(token, ['current'], device.expiresAt)).toThrow(SessionExpired);
  });

  it('never verifies against a pin-token-shaped payload (realms never overlap)', () => {
    const pinToken = mintPinActionToken(pin, 'shared-key');
    expect(() => verifyDeviceJwt(pinToken, ['shared-key'], 1_100)).toThrow(SessionInvalid);
  });
});

describe('PIN action token', () => {
  it('round-trips and expires quickly', () => {
    const token = mintPinActionToken(pin, 'current');
    expect(verifyPinActionToken(token, ['current'], 1_899)).toEqual(pin);
    expect(() => verifyPinActionToken(token, ['current'], 1_900)).toThrow(SessionExpired);
  });
});

describe('verifyStaffSession', () => {
  it('combines both tokens once they agree on tenant and device', () => {
    const deviceToken = mintDeviceJwt(device, 'device-key');
    const pinToken = mintPinActionToken(pin, 'pin-key');
    expect(verifyStaffSession(deviceToken, pinToken, ['device-key'], ['pin-key'], 1_100)).toEqual({
      tenantId: 'tenant-1',
      deviceId: 'device-1',
      deviceKind: 'kds',
      staffId: 'staff-1',
    });
  });

  it('rejects a PIN token minted for a different device (stolen-token cross-use)', () => {
    const deviceToken = mintDeviceJwt(device, 'device-key');
    const pinForOtherDevice = mintPinActionToken({ ...pin, deviceId: 'device-2' }, 'pin-key');
    expect(() =>
      verifyStaffSession(deviceToken, pinForOtherDevice, ['device-key'], ['pin-key'], 1_100),
    ).toThrow(SessionInvalid);
  });

  it('rejects a PIN token minted for a different tenant', () => {
    const deviceToken = mintDeviceJwt(device, 'device-key');
    const pinForOtherTenant = mintPinActionToken({ ...pin, tenantId: 'tenant-2' }, 'pin-key');
    expect(() =>
      verifyStaffSession(deviceToken, pinForOtherTenant, ['device-key'], ['pin-key'], 1_100),
    ).toThrow(SessionInvalid);
  });
});
