import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, unwrap } from './errors.js';
import { createHttpClient } from './http.js';

function res(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('unwrap', () => {
  it('returns the body on success', async () => {
    await expect(unwrap(res(200, { ok: true }))).resolves.toEqual({ ok: true });
  });

  it('throws a typed ApiError carrying code and body', async () => {
    const problem = { title: 'Nope', status: 409, code: 'ITEM_UNAVAILABLE', traceId: 't1' };
    const err = await unwrap(res(409, problem)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('ITEM_UNAVAILABLE');
    expect((err as ApiError).body).toEqual(problem);
  });
});

describe('createHttpClient', () => {
  const schema = z.object({ value: z.number() });

  it('attaches auth, language, and idempotency headers', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(res(200, { value: 1 })),
    );
    const client = createHttpClient({
      baseUrl: 'https://api.test/',
      getToken: () => 'tok',
      getLocale: () => 'ar-EG',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.post('/x', { body: { a: 1 }, schema, idempotencyKey: 'key-1' });
    const init = fetchImpl.mock.calls[0]?.[1] ?? {};
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    expect(headers['accept-language']).toBe('ar-EG');
    expect(headers['idempotency-key']).toBe('key-1');
  });

  it('parses the response with the caller schema', async () => {
    const client = createHttpClient({
      baseUrl: 'https://api.test/',
      fetchImpl: (async () => res(200, { value: 42 })) as unknown as typeof fetch,
    });
    await expect(client.get('/x', schema)).resolves.toEqual({ value: 42 });
  });
});
