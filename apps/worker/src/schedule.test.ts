import { describe, expect, it } from 'vitest';
import { assertCairoTz, CAIRO_TZ, repeatEvery } from './schedule.js';

describe('repeatEvery', () => {
  it('stamps every repeat rule with Cairo time', () => {
    expect(repeatEvery('0 22 * * *')).toEqual({ pattern: '0 22 * * *', tz: CAIRO_TZ });
  });
});

describe('assertCairoTz', () => {
  it('passes a Cairo-scheduled job', () => {
    expect(() => assertCairoTz(repeatEvery('0 22 * * *'))).not.toThrow();
  });

  it('rejects a job scheduled in another timezone', () => {
    expect(() => assertCairoTz({ pattern: '0 22 * * *', tz: 'UTC' })).toThrow();
  });
});
