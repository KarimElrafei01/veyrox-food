import type { FastifyRequest } from 'fastify';
import {
  verifyStaffSession,
  StaffSessionExpired,
  StaffSessionInvalid,
  type StaffSession,
} from '../../identity/domain/index.js';

export { StaffSessionExpired, StaffSessionInvalid };

/** Shared by every staff/KDS controller (05-api-and-integration-contracts.md §1) -
 *  ADR-0023's verification-only slice ahead of the full S2-S5 realm. */
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
