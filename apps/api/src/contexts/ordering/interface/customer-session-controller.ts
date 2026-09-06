import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ResolveCustomerSession } from '../application/resolve-customer-session.js';
import { SessionExpired, verifyCustomerSession } from './session-token.js';

export async function customerSessionController(
  app: FastifyInstance,
  options: { resolver: ResolveCustomerSession; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.get(
    '/public/session/:token',
    { schema: { params: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      try {
        const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
        const session = verifyCustomerSession(token, options.keys, Math.floor(Date.now() / 1000));
        const result = await options.resolver.execute(session, new Date());
        return {
          tenant: { id: result.tenantId, name: result.tenantName },
          session: {
            menuVersion: result.menuVersionId,
            expiresAt: result.expiresAt.toISOString(),
            locale: result.locale,
          },
          customer: {
            displayName: result.customer.displayName,
            tier: result.customer.tier,
            pointsBalance: result.customer.pointsBalance,
          },
          links: {
            menu: `/public/menu/${result.menuVersionId}`,
            availability: '/public/availability',
          },
          traceId: request.id,
        };
      } catch (error) {
        const code = error instanceof SessionExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID';
        return reply
          .status(401)
          .type('application/problem+json')
          .send({
            type: 'about:blank',
            title: 'Session unavailable',
            status: 401,
            code,
            traceId: request.id,
          });
      }
    },
  );
}
