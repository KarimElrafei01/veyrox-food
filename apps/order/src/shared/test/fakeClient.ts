import type { HttpClient } from '@veyroxai/api-client';

type Handler = (path: string, body?: unknown) => unknown;

/**
 * A fake HttpClient for hook/usecase tests (backend calls use real fetch in
 * production — ADR-0018 pass). Register per-path responses; a handler may throw
 * an ApiError to exercise the error branches.
 */
export function fakeClient(routes: {
  get?: Record<string, Handler>;
  post?: Record<string, Handler>;
}): HttpClient {
  return {
    async get(path, schema) {
      const handler = routes.get?.[path];
      if (!handler) {
        throw new Error(`fakeClient: no GET handler for ${path}`);
      }
      return schema.parse(handler(path));
    },
    async post(path, { body, schema }) {
      const handler = routes.post?.[path];
      if (!handler) {
        throw new Error(`fakeClient: no POST handler for ${path}`);
      }
      return schema.parse(handler(path, body));
    },
  };
}
