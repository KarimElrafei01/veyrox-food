import { describe, expect, it } from 'vitest';
import { ApiError, unwrap } from './index.js';

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('unwrap', () => {
  it('returns the body on success', async () => {
    await expect(unwrap(res(200, { ok: true }))).resolves.toEqual({ ok: true });
  });

  it('throws a typed ApiError on a problem response', async () => {
    const problem = { title: 'Nope', status: 409, code: 'ITEM_UNAVAILABLE', traceId: 't1' };
    await expect(unwrap(res(409, problem))).rejects.toBeInstanceOf(ApiError);
  });
});
