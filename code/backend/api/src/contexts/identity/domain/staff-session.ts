import { createHmac, timingSafeEqual } from 'node:crypto';

export type DeviceKind = 'kds' | 'till' | 'both';

export interface DeviceSession {
  tenantId: string;
  deviceId: string;
  deviceKind: DeviceKind;
  issuedAt: number;
  expiresAt: number;
}

export interface PinActionSession {
  tenantId: string;
  deviceId: string;
  staffId: string;
  issuedAt: number;
  expiresAt: number;
}

export interface StaffSession {
  tenantId: string;
  deviceId: string;
  deviceKind: DeviceKind;
  staffId: string;
}

export class SessionExpired extends Error {
  constructor() {
    super('The staff session has expired.');
    this.name = 'SessionExpired';
  }
}

export class SessionInvalid extends Error {
  constructor() {
    super('The staff session is invalid.');
    this.name = 'SessionInvalid';
  }
}

interface DevicePayload {
  t: string;
  d: string;
  k: DeviceKind;
  iat: number;
  exp: number;
}

interface PinPayload {
  t: string;
  d: string;
  s: string;
  iat: number;
  exp: number;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signature(payload: string, key: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

function verifySignature(
  payload: string,
  encodedSignature: string,
  keys: readonly string[],
): boolean {
  let given: Buffer;
  try {
    given = Buffer.from(encodedSignature, 'base64url');
  } catch {
    return false;
  }
  return keys.some((key) => {
    const expected = signature(payload, key);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** ADR-0023: verification-only ahead of the full S2-S5 realm. Never the customer
 *  session's keys — a leaked key for one realm must not mint a token for another. */
export function mintDeviceJwt(session: DeviceSession, key: string): string {
  const payload = base64url(
    JSON.stringify({
      t: session.tenantId,
      d: session.deviceId,
      k: session.deviceKind,
      iat: session.issuedAt,
      exp: session.expiresAt,
    } satisfies DevicePayload),
  );
  return `veyrox.device.v1.${payload}.${base64url(signature(payload, key))}`;
}

export function verifyDeviceJwt(
  token: string,
  keys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): DeviceSession {
  const [prefix, realm, version, payload, encodedSignature, ...rest] = token.split('.');
  if (
    prefix !== 'veyrox' ||
    realm !== 'device' ||
    version !== 'v1' ||
    !payload ||
    !encodedSignature ||
    rest.length > 0
  )
    throw new SessionInvalid();

  let decoded: DevicePayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DevicePayload;
  } catch {
    throw new SessionInvalid();
  }
  if (
    typeof decoded.t !== 'string' ||
    typeof decoded.d !== 'string' ||
    (decoded.k !== 'kds' && decoded.k !== 'till' && decoded.k !== 'both') ||
    !Number.isInteger(decoded.iat) ||
    !Number.isInteger(decoded.exp)
  )
    throw new SessionInvalid();

  if (!verifySignature(payload, encodedSignature, keys)) throw new SessionInvalid();
  if (nowEpochSeconds >= decoded.exp) throw new SessionExpired();
  return {
    tenantId: decoded.t,
    deviceId: decoded.d,
    deviceKind: decoded.k,
    issuedAt: decoded.iat,
    expiresAt: decoded.exp,
  };
}

/** Short-lived: proves a barista entered their PIN recently on this device.
 *  PIN storage/hashing and the /staff/pin/verify endpoint that mints this are S2-S5's. */
export function mintPinActionToken(session: PinActionSession, key: string): string {
  const payload = base64url(
    JSON.stringify({
      t: session.tenantId,
      d: session.deviceId,
      s: session.staffId,
      iat: session.issuedAt,
      exp: session.expiresAt,
    } satisfies PinPayload),
  );
  return `veyrox.pin.v1.${payload}.${base64url(signature(payload, key))}`;
}

export function verifyPinActionToken(
  token: string,
  keys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): PinActionSession {
  const [prefix, realm, version, payload, encodedSignature, ...rest] = token.split('.');
  if (
    prefix !== 'veyrox' ||
    realm !== 'pin' ||
    version !== 'v1' ||
    !payload ||
    !encodedSignature ||
    rest.length > 0
  )
    throw new SessionInvalid();

  let decoded: PinPayload;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PinPayload;
  } catch {
    throw new SessionInvalid();
  }
  if (
    typeof decoded.t !== 'string' ||
    typeof decoded.d !== 'string' ||
    typeof decoded.s !== 'string' ||
    !Number.isInteger(decoded.iat) ||
    !Number.isInteger(decoded.exp)
  )
    throw new SessionInvalid();

  if (!verifySignature(payload, encodedSignature, keys)) throw new SessionInvalid();
  if (nowEpochSeconds >= decoded.exp) throw new SessionExpired();
  return {
    tenantId: decoded.t,
    deviceId: decoded.d,
    staffId: decoded.s,
    issuedAt: decoded.iat,
    expiresAt: decoded.exp,
  };
}

/** The one function every KDS controller calls (ADR-0023 §2). Requires both tokens to
 *  agree on tenantId/deviceId - a PIN token minted on one device must not authorize a
 *  request presenting a different device's JWT. */
export function verifyStaffSession(
  deviceJwtToken: string,
  pinActionToken: string,
  deviceKeys: readonly [string, ...string[]],
  pinKeys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): StaffSession {
  const device = verifyDeviceJwt(deviceJwtToken, deviceKeys, nowEpochSeconds);
  const pin = verifyPinActionToken(pinActionToken, pinKeys, nowEpochSeconds);
  if (device.tenantId !== pin.tenantId || device.deviceId !== pin.deviceId)
    throw new SessionInvalid();
  return {
    tenantId: device.tenantId,
    deviceId: device.deviceId,
    deviceKind: device.deviceKind,
    staffId: pin.staffId,
  };
}
