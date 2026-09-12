import { describe, expect, it } from 'vitest';
import { createReadPathBudget } from './read-path-budget.js';

describe('createReadPathBudget', () => {
  it('never runs more than `limit` functions concurrently', async () => {
    const withBudget = createReadPathBudget(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      withBudget(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
      });
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
  });

  it('lets a queued call through once a slot frees up', async () => {
    const withBudget = createReadPathBudget(1);
    const order: number[] = [];
    const first = withBudget(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(1);
    });
    const second = withBudget(async () => {
      order.push(2);
    });
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it('frees the slot even when the function throws', async () => {
    const withBudget = createReadPathBudget(1);
    await expect(
      withBudget(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    let ran = false;
    await withBudget(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
