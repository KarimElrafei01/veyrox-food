import type { FastifyInstance } from 'fastify';
import { setActiveStationsRequest } from '@veyroxai/contracts';
import { authenticateStaff, StaffSessionExpired, StaffSessionInvalid } from './staff-auth.js';
import type { SetActiveStations } from '../application/set-active-stations.js';

export async function setActiveStationsController(
  app: FastifyInstance,
  options: {
    setActiveStations: SetActiveStations;
    deviceKeys: readonly [string, ...string[]];
    pinKeys: readonly [string, ...string[]];
  },
): Promise<void> {
  app.put(
    '/staff/kitchen-state/stations',
    { schema: { body: setActiveStationsRequest } },
    async (request, reply) => {
      try {
        const staff = authenticateStaff(
          request,
          options.deviceKeys,
          options.pinKeys,
          Math.floor(Date.now() / 1000),
        );
        const { activeStations } = setActiveStationsRequest.parse(request.body);

        const result = await options.setActiveStations.execute({
          tenantId: staff.tenantId,
          activeStations,
          staffId: staff.staffId,
          now: new Date(),
        });

        return reply.status(200).send({
          activeStations: result.activeStations,
          updatedAt: result.updatedAt.toISOString(),
          traceId: request.id,
        });
      } catch (error) {
        if (error instanceof StaffSessionExpired)
          return reply.status(401).send({ code: 'SESSION_EXPIRED', traceId: request.id });
        if (error instanceof StaffSessionInvalid)
          return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
        throw error;
      }
    },
  );
}
