import { createHttpClient, type HttpClient } from '@veyroxai/api-client';

let token: string | null = null;
let locale = 'en';
let client: HttpClient | null = null;

/** Called by the session flow once a token is resolved (and cleared on expiry). */
export function setAuthToken(next: string | null): void {
  token = next;
}

export function setApiLocale(next: string): void {
  locale = next;
}

/** The app's single HTTP client. Repos take a client argument defaulting to this,
 *  so tests inject a fake without touching module state. */
export function getApiClient(): HttpClient {
  client ??= createHttpClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '/',
    getToken: () => token,
    getLocale: () => locale,
  });
  return client;
}
