import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { renderPublishedMenu } from '../application/render-published-menu.js';
import type { CatalogueRepository } from '../infrastructure/catalogue-repository.js';
import {
  SessionExpired,
  SessionInvalid,
  verifyCustomerSession,
} from '../../identity/domain/index.js';

interface AvailabilityCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
}

/** Called by the catalog availability mutation after its transaction commits. */
export async function invalidateAvailability(
  cache: { del(key: string): Promise<unknown> },
  tenantId: string,
): Promise<void> {
  await cache.del(`avail:${tenantId}`);
}

export async function publicCatalogueController(
  app: FastifyInstance,
  options: {
    catalogue: CatalogueRepository;
    availabilityCache: AvailabilityCache;
    sessionKeys: readonly [string, ...string[]];
  },
): Promise<void> {
  app.get(
    '/public/menu/:menuVersion',
    { schema: { params: z.object({ menuVersion: z.uuid() }) } },
    async (request, reply) => {
      const { menuVersion } = z.object({ menuVersion: z.uuid() }).parse(request.params);
      const menu = await options.catalogue.loadPublishedMenu(menuVersion);
      if (!menu)
        return reply.status(409).type('application/problem+json').send({
          type: 'https://veyroxai.com/errors/menu-version-gone',
          title: 'Menu unavailable',
          status: 409,
          code: 'MENU_VERSION_GONE',
          traceId: request.id,
        });
      const rendered = renderPublishedMenu(menu);
      if (request.headers['if-none-match'] === rendered.etag)
        return reply.status(304).header('ETag', rendered.etag).send();
      return reply
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .header('ETag', rendered.etag)
        .type('application/json')
        .send(rendered.body);
    },
  );

  app.get('/public/availability', async (request, reply) => {
    const token = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : null;
    if (!token)
      return reply.status(401).type('application/problem+json').send({
        type: 'https://veyroxai.com/errors/session-invalid',
        title: 'Session unavailable',
        status: 401,
        code: 'SESSION_INVALID',
        traceId: request.id,
      });
    let session;
    try {
      session = verifyCustomerSession(token, options.sessionKeys, Math.floor(Date.now() / 1000));
    } catch (error) {
      return reply.status(401).send({
        code: error instanceof SessionExpired ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
        traceId: request.id,
      });
    }
    try {
      const cacheKey = `avail:${session.tenantId}`;
      const cached = await options.availabilityCache.get(cacheKey);
      const availability = cached
        ? (JSON.parse(cached) as {
            unavailableItemIds: string[];
            unavailableModifierOptionIds: string[];
          })
        : await options.catalogue.loadAvailability(session.tenantId, session.menuVersionId);
      if (!availability)
        return reply.status(409).send({ code: 'MENU_VERSION_GONE', traceId: request.id });
      if (!cached)
        await options.availabilityCache.set(cacheKey, JSON.stringify(availability), 'EX', 30);
      return reply.header('Cache-Control', 'public, max-age=5, stale-while-revalidate=30').send({
        menuVersion: session.menuVersionId,
        ...availability,
        asOf: new Date().toISOString(),
        traceId: request.id,
      });
    } catch (error) {
      if (error instanceof SessionInvalid)
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      throw error;
    }
  });
}
