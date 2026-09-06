import { problemDetails, type ProblemDetails } from '@veyroxai/contracts';

/**
 * Typed client for `apps/api`. The real surface is generated from the OpenAPI
 * document (itself generated from the Zod contracts) once endpoints exist. For now
 * this carries just the shared error handling every call site will use.
 */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(`${problem.code}: ${problem.title}`);
    this.name = 'ApiError';
  }
}

export async function unwrap(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    return body;
  }
  const parsed = problemDetails.safeParse(body);
  throw new ApiError(
    parsed.success
      ? parsed.data
      : {
          type: 'about:blank',
          title: response.statusText || 'Request failed',
          status: response.status,
          code: 'UNKNOWN',
          traceId: response.headers.get('x-trace-id') ?? 'unknown',
        },
  );
}
