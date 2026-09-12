import { describe, expect, it } from 'vitest';
import { singleFlight } from './single-flight.js';

describe('singleFlight', () => {
  it('runs the function once for concurrent calls with the same key', async () => {
    let calls = 0;
    const coalesce = singleFlight<number>();
    const run = () =>
      coalesce('a', async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      });
    const results = await Promise.all([run(), run(), run()]);
    expect(calls).toBe(1);
    expect(results).toEqual([42, 42, 42]);
  });

  it('runs the function again once the in-flight call has settled', async () => {
    let calls = 0;
    const coalesce = singleFlight<number>();
    await coalesce('a', async () => {
      calls += 1;
      return 1;
    });
    await coalesce('a', async () => {
      calls += 1;
      return 2;
    });
    expect(calls).toBe(2);
  });

  it('keeps different keys independent', async () => {
    let calls = 0;
    const coalesce = singleFlight<number>();
    await Promise.all([
      coalesce('a', async () => {
        calls += 1;
        return 1;
      }),
      coalesce('b', async () => {
        calls += 1;
        return 2;
      }),
    ]);
    expect(calls).toBe(2);
  });

  it('does not cache a rejection for later callers', async () => {
    let calls = 0;
    const coalesce = singleFlight<number>();
    await expect(
      coalesce('a', async () => {
        calls += 1;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await coalesce('a', async () => {
      calls += 1;
      return 1;
    });
    expect(calls).toBe(2);
  });
});
