import { createHmac, timingSafeEqual } from 'node:crypto';

export interface CustomerSession {
  tenantId: string;
  customerId: string;
  waId: string;
  menuVersionId: string;
  tier: 'bronze' | 'silver' | 'gold';
  locale: 'en' | 'ar-EG';
  issuedAt: number;
  expiresAt: number;
}

export class SessionExpired extends Error {
  constructor() {
    super('The customer session has expired.');
    this.name = 'SessionExpired';
  }
}

export class SessionInvalid extends Error {
  constructor() {
    super('The customer session is invalid.');
    this.name = 'SessionInvalid';
  }
}

interface TokenPayload {
  t: string;
  c: string;
  w: string;
  m: string;
  r: 'bronze' | 'silver' | 'gold';
  l: 'en' | 'ar-EG';
  iat: number;
  exp: number;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signature(payload: string, key: string): Buffer {
  return createHmac('sha256', key).update(payload).digest();
}

/** Sessions are stateless: the signed pin prevents a menu publish changing a live cart. */
export function mintCustomerSession(session: CustomerSession, key: string): string {
  const payload = base64url(
    JSON.stringify({
      t: session.tenantId,
      c: session.customerId,
      w: session.waId,
      m: session.menuVersionId,
      r: session.tier,
      l: session.locale,
      iat: session.issuedAt,
      exp: session.expiresAt,
    } satisfies TokenPayload),
  );
  return `veyrox.v1.${payload}.${base64url(signature(payload, key))}`;
}

export function verifyCustomerSession(
  token: string,
  keys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): CustomerSession {
  const [prefix, version, payload, encodedSignature, ...rest] = token.split('.');
  if (prefix !== 'veyrox' || version !== 'v1' || !payload || !encodedSignature || rest.length > 0)
    throw new SessionInvalid();

  let given: Buffer;
  let decoded: TokenPayload;
  try {
    given = Buffer.from(encodedSignature, 'base64url');
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    throw new SessionInvalid();
  }
  if (
    typeof decoded.t !== 'string' ||
    typeof decoded.c !== 'string' ||
    typeof decoded.w !== 'string' ||
    typeof decoded.m !== 'string' ||
    (decoded.r !== 'bronze' && decoded.r !== 'silver' && decoded.r !== 'gold') ||
    (decoded.l !== 'en' && decoded.l !== 'ar-EG') ||
    !Number.isInteger(decoded.iat) ||
    !Number.isInteger(decoded.exp)
  )
    throw new SessionInvalid();

  const valid = keys.some((key) => {
    const expected = signature(payload, key);
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
  if (!valid) throw new SessionInvalid();
  if (nowEpochSeconds >= decoded.exp) throw new SessionExpired();
  return {
    tenantId: decoded.t,
    customerId: decoded.c,
    waId: decoded.w,
    menuVersionId: decoded.m,
    tier: decoded.r,
    locale: decoded.l,
    issuedAt: decoded.iat,
    expiresAt: decoded.exp,
  };
}
