import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  OrderingSuspended,
  StoreClosed,
  WhatsAppOrderingDisabled,
  type ResolveCustomerSession,
} from '../application/resolve-customer-session.js';
import {
  SessionExpired,
  SessionInvalid,
  verifyCustomerSession,
} from '../../identity/domain/index.js';

export async function customerSessionController(
  app: FastifyInstance,
  options: { resolver: ResolveCustomerSession; keys: readonly [string, ...string[]] },
): Promise<void> {
  app.get(
    '/public/session/:token',
    { schema: { params: z.object({ token: z.string().min(1) }) } },
    async (request, reply) => {
      const { token } = z.object({ token: z.string().min(1) }).parse(request.params);
      let session;
      try {
        session = verifyCustomerSession(token, options.keys, Math.floor(Date.now() / 1000));
      } catch (error) {
        return reply
          .status(401)
          .type('application/problem+json')
          .send({
            type: 'about:blank',
            title: 'Session unavailable',
            status: 401,
            code: error instanceof SessionExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
            traceId: request.id,
          });
      }
      try {
        const result = await options.resolver.execute(session, new Date());
        return {
          tenant: {
            id: result.tenantId,
            name: result.tenantName,
            defaultLocale: result.tenant.defaultLocale,
            supportedLocales: ['en', 'ar-EG'],
            currency: result.tenant.currency,
            timezone: result.tenant.timezone,
          },
          session: {
            menuVersion: result.menuVersionId,
            expiresAt: result.expiresAt.toISOString(),
            locale: result.locale,
          },
          customer: {
            displayName: result.customer.displayName,
            tier: result.customer.tier,
            pointsBalance: result.customer.pointsBalance,
            pointsToNextTier: result.customer.pointsToNextTier,
            perks: result.customer.perks,
          },
          store: {
            isOpen: result.store.isOpen,
            closesAt: result.store.closesAt?.toISOString() ?? null,
          },
          ordering: result.ordering,
          links: {
            menu: `/public/menu/${result.menuVersionId}`,
            availability: '/public/availability',
          },
          openOrder: result.openOrder,
          traceId: request.id,
        };
      } catch (error) {
        if (error instanceof StoreClosed) {
          return reply
            .status(409)
            .type('application/problem+json')
            .send({
              type: 'https://veyroxai.com/errors/store-closed',
              title: 'Store closed',
              status: 409,
              code: 'STORE_CLOSED',
              detail: 'The store is currently closed.',
              opensAt: error.opensAt?.toISOString() ?? null,
              traceId: request.id,
            });
        }
        if (error instanceof OrderingSuspended) {
          return reply.status(403).type('application/problem+json').send({
            type: 'https://veyroxai.com/errors/ordering-suspended',
            title: 'Ordering unavailable',
            status: 403,
            code: 'ORDERING_SUSPENDED',
            detail: 'Please order at the counter.',
            traceId: request.id,
          });
        }
        if (error instanceof WhatsAppOrderingDisabled) {
          return reply.status(403).type('application/problem+json').send({
            type: 'https://veyroxai.com/errors/whatsapp-ordering-disabled',
            title: 'Ordering unavailable',
            status: 403,
            code: 'WHATSAPP_ORDERING_DISABLED',
            detail: 'WhatsApp ordering is currently unavailable.',
            reason: error.reason,
            traceId: request.id,
          });
        }
        if (error instanceof SessionInvalid)
          return reply.status(401).type('application/problem+json').send({
            type: 'about:blank',
            title: 'Session unavailable',
            status: 401,
            code: 'SESSION_INVALID',
            traceId: request.id,
          });
        throw error;
      }
    },
  );
}
