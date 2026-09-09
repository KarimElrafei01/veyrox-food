import { expect, it } from 'vitest';
import type { HttpClient } from '@veyroxai/api-client';
import { updateLocalePreference } from './sessionRepo.js';

it('sends the monotonic locale payload with an idempotency key', async () => {
  let request: { body?: unknown; idempotencyKey?: string } | undefined;
  const client = {
    post: async (_path: string, options: { body?: unknown; idempotencyKey?: string }) => {
      request = options;
      return { locale: 'ar-EG', sequence: 7 };
    },
  } as unknown as HttpClient;

  await expect(updateLocalePreference('ar-EG', 7, client)).resolves.toBe(7);
  expect(request).toMatchObject({ body: { locale: 'ar-EG', sequence: 7 } });
  expect(request?.idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
