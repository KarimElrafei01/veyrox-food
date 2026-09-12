/**
 * Dev-only staff session storage, shared by kds + till. Scope-corrected in
 * F2 frontend-implementation.md (2026-09-12): the real device-enrollment +
 * PIN-entry realm (S2-S5) doesn't exist yet, and ADR-0023 covers only
 * verification. Until then, both tokens arrive via `pnpm --filter
 * @veyroxai/api tokens` and are bootstrapped into this device once via a URL
 * (`?device=...&pin=...`), mirroring how F1's customer webview bootstraps a
 * session from its own `/s/:token` path segment.
 *
 * Stored in localStorage, not sessionStorage: a KDS/Till tablet is a shared,
 * semi-permanent station, not a per-tab customer session - it should survive
 * a reload or the browser restarting, unlike a customer's single-visit tab.
 */
export interface StaffSession {
  deviceToken: string;
  pinToken: string;
}

const DEVICE_TOKEN_KEY = 'vx.staff.device-token';
const PIN_TOKEN_KEY = 'vx.staff.pin-token';
const MAX_TOKEN_LENGTH = 4_096;

function isStorable(token: string | null): token is string {
  return token !== null && token.length > 0 && token.length <= MAX_TOKEN_LENGTH;
}

/**
 * Call once at app startup, before reading the stored session. If the current
 * URL carries `?device=...&pin=...` (the CLI script's suggested paste target),
 * persists both and strips them from the address bar - a device token must
 * never sit in browser history or get shared by copying the URL.
 */
export function bootstrapStaffSessionFromUrl(location: { href: string; search: string }): void {
  const params = new URLSearchParams(location.search);
  const device = params.get('device');
  const pin = params.get('pin');
  if (!device && !pin) return;
  if (device)
    storeStaffSession({ deviceToken: device, pinToken: pin ?? readStoredPinToken() ?? '' });
  else if (pin) storeStaffSession({ deviceToken: readStoredDeviceToken() ?? '', pinToken: pin });

  params.delete('device');
  params.delete('pin');
  const url = new URL(location.href);
  url.search = params.toString();
  window.history.replaceState(null, '', url.toString());
}

function readStoredDeviceToken(): string | null {
  try {
    const token = localStorage.getItem(DEVICE_TOKEN_KEY);
    return isStorable(token) ? token : null;
  } catch {
    return null;
  }
}

function readStoredPinToken(): string | null {
  try {
    const token = localStorage.getItem(PIN_TOKEN_KEY);
    return isStorable(token) ? token : null;
  } catch {
    return null;
  }
}

export function readStoredStaffSession(): StaffSession | null {
  const deviceToken = readStoredDeviceToken();
  const pinToken = readStoredPinToken();
  if (!deviceToken || !pinToken) return null;
  return { deviceToken, pinToken };
}

export function storeStaffSession(session: StaffSession): void {
  try {
    if (isStorable(session.deviceToken))
      localStorage.setItem(DEVICE_TOKEN_KEY, session.deviceToken);
    if (isStorable(session.pinToken)) localStorage.setItem(PIN_TOKEN_KEY, session.pinToken);
  } catch {
    // Storage can be unavailable in a locked-down kiosk browser; the caller's
    // normal "no session" screen covers this the same as never having one.
  }
}

export function clearStoredStaffSession(): void {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
    localStorage.removeItem(PIN_TOKEN_KEY);
  } catch {
    // Unrecoverable in a storage area the browser denies us.
  }
}
