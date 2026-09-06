/**
 * Phone numbers are never logged (CLAUDE.md — Non-negotiables, NFR-35). Redaction
 * happens here, at emit, so it cannot be forgotten at a call site. Lookups elsewhere
 * use the keyed `phone_hash`, never the raw number.
 *
 * This runs on every log payload. It is deliberately conservative: it would rather
 * redact a harmless string that looks like a phone number than let one through.
 */

const REDACTED = '[redacted]';

// E.164 and common local Egyptian formats: +20..., 0020..., 01x xxxx xxxx.
const PHONE_LIKE = /(\+?\d[\d\s-]{7,}\d)/g;

// Keys whose values are PII regardless of shape. Compared after stripping every
// non-letter, so `phone_e164`, `phoneE164` and `phone-e164` all match `phonee`.
const PII_KEYS = new Set([
  'phone',
  'phonee',
  'phonenumber',
  'msisdn',
  'waid',
  'email',
  'password',
  'pin',
  'pinhash',
  'token',
  'authorization',
  'totpsecret',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z]/g, '');
}

function redactString(value: string): string {
  return value.replace(PHONE_LIKE, REDACTED);
}

export function redact(input: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof input === 'string') {
    return redactString(input);
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (seen.has(input)) {
    return '[circular]';
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => redact(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = PII_KEYS.has(normalizeKey(key)) ? REDACTED : redact(value, seen);
  }
  return out;
}
