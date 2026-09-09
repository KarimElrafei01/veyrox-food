import { createHmac, timingSafeEqual } from 'node:crypto';

/** Meta signatures cover raw bytes; parsing before this check changes the signed input. */
export function verifyMetaSignature(
  rawBody: Buffer,
  header: string | undefined,
  appSecret: string,
): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
