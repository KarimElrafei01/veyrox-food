import type { FastifyRequest } from 'fastify';
import {
  verifyStaffSession,
  StaffSessionExpired,
  StaffSessionInvalid,
  type StaffSession,
} from '../../identity/domain/index.js';

export { StaffSessionExpired, StaffSessionInvalid };

/** Shared by every staff endpoint in this context (05-api-and-integration-
 *  contracts.md §1) - ADR-0023's verification-only slice ahead of the full
 *  S2-S5 realm. Deliberately duplicated from ordering/interface/staff-auth.ts
 *  rather than shared across contexts: cross-context imports may only reach
 *  identity/domain/index.js (ADR-0019, eslint's import-x/no-restricted-paths),
 *  and this thin header-parsing adapter touches FastifyRequest, which the
 *  domain layer's purity rule (no Fastify) forbids putting there instead. */
export function authenticateStaff(
  request: FastifyRequest,
  deviceKeys: readonly [string, ...string[]],
  pinKeys: readonly [string, ...string[]],
  nowEpochSeconds: number,
): StaffSession {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new StaffSessionInvalid();
  const pinToken = request.headers['x-staff-pin-token'];
  if (typeof pinToken !== 'string') throw new StaffSessionInvalid();
  return verifyStaffSession(authorization.slice(7), pinToken, deviceKeys, pinKeys, nowEpochSeconds);
}
