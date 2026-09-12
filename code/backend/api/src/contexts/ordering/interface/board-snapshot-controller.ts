import type { FastifyInstance } from 'fastify';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { LoadBoardSnapshot } from '../application/load-board-snapshot.js';

export async function boardSnapshotController(
  app: FastifyInstance,
  options: {
    board: LoadBoardSnapshot;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  },
): Promise<void> {
  app.get('/staff/board', async (request, reply) => {
    try {
      const staff = authenticateStaff(
        request,
        options.deviceKeys,
        options.pinKeys,
        Math.floor(Date.now() / 1000),
      );
      const snapshot = await options.board.execute({ tenantId: staff.tenantId, now: new Date() });
      return reply.status(200).send({ ...snapshot, traceId: request.id });
    } catch (error) {
      if (error instanceof StaffSessionExpired)
        return reply.status(401).send({ code: 'SESSION_EXPIRED', traceId: request.id });
      if (error instanceof StaffSessionInvalid)
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      throw error;
    }
  });
}
