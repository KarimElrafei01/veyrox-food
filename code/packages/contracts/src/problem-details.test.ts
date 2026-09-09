import { describe, expect, it } from 'vitest';
import { idempotencyKeyHeader, problemDetails } from './problem-details.js';

describe('problemDetails', () => {
  it('parses a well-formed problem document and defaults type', () => {
    const parsed = problemDetails.parse({
      title: 'Item unavailable',
      status: 409,
      code: 'ITEM_UNAVAILABLE',
      traceId: 'abc123',
    });
    expect(parsed.type).toBe('about:blank');
    expect(parsed.code).toBe('ITEM_UNAVAILABLE');
  });

  it('requires a stable code', () => {
    expect(() => problemDetails.parse({ title: 't', status: 500, traceId: 'x' })).toThrow();
  });
});

describe('idempotencyKeyHeader', () => {
  it('requires a uuid', () => {
    expect(() => idempotencyKeyHeader.parse({ 'idempotency-key': 'not-a-uuid' })).toThrow();
    expect(
      idempotencyKeyHeader.parse({
        'idempotency-key': '00000000-0000-4000-8000-000000000000',
      }),
    ).toBeTruthy();
  });
});
