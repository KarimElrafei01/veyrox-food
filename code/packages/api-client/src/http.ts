import type { ZodType } from 'zod';
import { ApiError, NetworkError, unwrap } from './errors.js';

export interface HttpClientOptions {
  baseUrl: string;
  /** Bearer token for the request (customer session token in F1). */
  getToken?: () => string | null;
  /** Extra static headers evaluated per request - the staff realm's
   *  `X-Staff-PIN-Token`, which rides alongside the device JWT bearer token
   *  rather than replacing it (05-api-and-integration-contracts.md §1). */
  getExtraHeaders?: () => Record<string, string>;
  /** BCP-47 tag for `Accept-Language`. */
  getLocale?: () => string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface HttpClient {
  get<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T>;
  /** A schema is optional; without one the raw parsed body is returned (e.g. a
   *  fire-and-forget call that ignores the response). */
  post<T>(
    path: string,
    opts: { body?: unknown; schema: ZodType<T>; idempotencyKey?: string },
  ): Promise<T>;
  post(path: string, opts: { body?: unknown; idempotencyKey?: string }): Promise<unknown>;
  put<T>(
    path: string,
    opts: { body?: unknown; schema: ZodType<T>; idempotencyKey?: string },
  ): Promise<T>;
  put(path: string, opts: { body?: unknown; idempotencyKey?: string }): Promise<unknown>;
}

/**
 * The one place the webview talks to `apps/api`. Attaches auth, language, and the
 * idempotency key; runs `unwrap` (→ `ApiError` on a problem response) then parses
 * the body with the caller's contract schema. A repo layer wraps one call each.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, getToken, getExtraHeaders, getLocale, fetchImpl = fetch } = options;

  function headers(extra?: Record<string, string>): HeadersInit {
    const h: Record<string, string> = {
      accept: 'application/json',
      ...getExtraHeaders?.(),
      ...extra,
    };
    const token = getToken?.();
    if (token) {
      h.authorization = `Bearer ${token}`;
    }
    const locale = getLocale?.();
    if (locale) {
      h['accept-language'] = locale;
    }
    return h;
  }

  async function send(path: string, init: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetchImpl(new URL(path, baseUrl).toString(), init);
    } catch (cause) {
      throw new NetworkError(cause);
    }
    return unwrap(res);
  }

  return {
    async get(path, schema, init) {
      const body = await send(path, { ...init, method: 'GET', headers: headers() });
      return schema.parse(body);
    },
    async post(
      path: string,
      {
        body,
        schema,
        idempotencyKey,
      }: { body?: unknown; schema?: ZodType; idempotencyKey?: string },
    ) {
      const raw = await send(path, {
        method: 'POST',
        headers: headers({
          'content-type': 'application/json',
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return schema ? schema.parse(raw) : raw;
    },
    async put(
      path: string,
      {
        body,
        schema,
        idempotencyKey,
      }: { body?: unknown; schema?: ZodType; idempotencyKey?: string },
    ) {
      const raw = await send(path, {
        method: 'PUT',
        headers: headers({
          'content-type': 'application/json',
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return schema ? schema.parse(raw) : raw;
    },
  };
}

export { ApiError, NetworkError };
