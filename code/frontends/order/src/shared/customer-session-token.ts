/**
 * Customer tokens are retained only long enough to restore the current webview
 * tab after an internal-route refresh. The API remains the authority that
 * verifies their signature, tenant binding, and expiry.
 */
const CUSTOMER_SESSION_TOKEN_KEY = 'vx.customer-session-token';
const MAX_CUSTOMER_SESSION_TOKEN_LENGTH = 2_048;

function isStorableToken(token: string | null): token is string {
  return token !== null && token.length > 0 && token.length <= MAX_CUSTOMER_SESSION_TOKEN_LENGTH;
}

export function readStoredCustomerSessionToken(): string | null {
  try {
    const token = sessionStorage.getItem(CUSTOMER_SESSION_TOKEN_KEY);
    if (isStorableToken(token)) {
      return token;
    }
    if (token !== null) {
      sessionStorage.removeItem(CUSTOMER_SESSION_TOKEN_KEY);
    }
  } catch {
    // Storage can be unavailable in private or restricted webviews; callers show
    // the normal reopen-session state rather than trusting an unverified token.
  }
  return null;
}

export function storeCustomerSessionToken(token: string): boolean {
  if (!isStorableToken(token)) {
    return false;
  }
  try {
    sessionStorage.setItem(CUSTOMER_SESSION_TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function clearStoredCustomerSessionToken(): void {
  try {
    sessionStorage.removeItem(CUSTOMER_SESSION_TOKEN_KEY);
  } catch {
    // The token cannot be recovered from a storage area the browser denies us.
  }
}
