import { describe, expect, it } from 'vitest';
import { redact } from './redaction.js';

describe('redact', () => {
  it('scrubs a phone number embedded in a string', () => {
    expect(redact('order for +20 100 123 4567 placed')).toBe('order for [redacted] placed');
  });

  it('scrubs PII-keyed values regardless of shape', () => {
    expect(redact({ phone_e164: '+201001234567', name: 'Layla' })).toEqual({
      phone_e164: '[redacted]',
      name: 'Layla',
    });
  });

  it('recurses into nested structures and arrays', () => {
    expect(redact({ customer: { msisdn: '01001234567' }, notes: ['call 01234567890'] })).toEqual({
      customer: { msisdn: '[redacted]' },
      notes: ['call [redacted]'],
    });
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(redact(a)).toEqual({ self: '[circular]' });
  });

  it('passes through non-PII primitives', () => {
    expect(redact(42)).toBe(42);
    expect(redact(null)).toBe(null);
  });
});
