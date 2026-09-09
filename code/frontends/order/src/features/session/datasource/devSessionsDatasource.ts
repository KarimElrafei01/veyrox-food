export interface DevSessionUser {
  customerId: string;
  name: string;
  tier: 'bronze' | 'silver' | 'gold';
  token: string;
}

export interface DevSessionCafe {
  tenantId: string;
  name: string;
  slug: string;
  isDefault: boolean;
  users: DevSessionUser[];
}

/**
 * GET /dev/sessions — dev-only, present only when the API runs with DEV_LOGIN=1.
 * A raw fetch (no auth, no contract schema): this endpoint is not part of the
 * public contract and never ships to a real deployment.
 */
export async function fetchDevSessions(): Promise<{ cafes: DevSessionCafe[] } | null> {
  const base = import.meta.env.VITE_API_BASE_URL ?? '/';
  try {
    const res = await fetch(new URL('/dev/sessions', base).toString());
    if (!res.ok) {
      return null; // 404 when DEV_LOGIN is off — the normal case
    }
    return (await res.json()) as { cafes: DevSessionCafe[] };
  } catch {
    return null;
  }
}
