import { fetchDevSessions, type DevSessionCafe } from '../datasource/devSessionsDatasource.js';

/** Cafés ordered with the default one first. `null` = dev login is not available. */
export async function loadDevSessions(
  fetch: typeof fetchDevSessions = fetchDevSessions,
): Promise<DevSessionCafe[] | null> {
  const result = await fetch();
  if (!result || result.cafes.length === 0) {
    return null;
  }
  return [...result.cafes].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}
