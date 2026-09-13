import { createHttpClient, type HttpClient } from '@veyroxai/api-client';

let deviceToken: string | null = null;
let pinToken: string | null = null;
let client: HttpClient | null = null;

/** Called once the staff session is known (and cleared when it 401s). */
export function setStaffTokens(next: { deviceToken: string; pinToken: string } | null): void {
  deviceToken = next?.deviceToken ?? null;
  pinToken = next?.pinToken ?? null;
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/';
}

/** The app's single HTTP client. Repos take a client argument defaulting to
 *  this, so tests inject a fake without touching module state. */
export function getApiClient(): HttpClient {
  client ??= createHttpClient({
    baseUrl: getApiBaseUrl(),
    getToken: () => deviceToken,
    getExtraHeaders: () => {
      const headers: Record<string, string> = {};
      if (pinToken) headers['x-staff-pin-token'] = pinToken;
      return headers;
    },
  });
  return client;
}
