import { problemDetails, type ProblemDetails } from '@veyroxai/contracts';

/**
 * A non-2xx response. `code` is the stable machine string clients switch on
 * (`05-api-and-integration-contracts.md` §1); `body` is the raw parsed payload so
 * a usecase can read endpoint-specific fields (a fresh quote on `PRICE_CHANGED`,
 * the existing order on `OPEN_ORDER_LIMIT`).
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly traceId: string;
  readonly problem: ProblemDetails | null;
  readonly body: unknown;

  constructor(status: number, body: unknown, problem: ProblemDetails | null) {
    const code =
      problem?.code ??
      (body && typeof body === 'object' && 'code' in body ? String(body.code) : 'UNKNOWN');
    super(`${code} (${status})`);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.traceId = problem?.traceId ?? 'unknown';
    this.problem = problem;
    this.body = body;
  }
}

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export async function unwrap(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return body;
  }
  const parsed = problemDetails.safeParse(body);
  throw new ApiError(response.status, body, parsed.success ? parsed.data : null);
}
