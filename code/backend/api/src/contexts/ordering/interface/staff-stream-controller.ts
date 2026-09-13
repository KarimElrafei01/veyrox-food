import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  verifyDeviceJwt,
  StaffSessionExpired,
  StaffSessionInvalid,
} from '../../identity/domain/index.js';
import type { StreamBoardEvents } from '../application/stream-board.js';

// A native browser EventSource cannot send custom headers (no Authorization,
// no X-Staff-PIN-Token), which is exactly why 05-api-and-integration-contracts.md
// §3 documents this one endpoint as authenticating on "(device JWT)" alone,
// unlike every other staff endpoint's device+PIN pair - a passive board view
// is device-level, not action-level, so it doesn't need a fresh PIN token that
// would awkwardly expire mid-stream. The token still has to travel somehow, so
// it rides the query string, the same pattern the customer realm's own
// GET /public/session/:token already establishes for the identical reason.
const query = z.object({ deviceToken: z.string(), lastEventId: z.string().optional() });

export async function staffStreamController(
  app: FastifyInstance,
  options: {
    stream: StreamBoardEvents;
    deviceKeys: readonly [string, ...string[]];
    /** Same policy @fastify/cors is configured with (app.ts) - `true` reflects
     *  any origin, or an explicit allow-list. Needed here specifically because
     *  reply.hijack() (below) hands the raw response to us before Fastify's
     *  own onSend hooks - including @fastify/cors's - ever run, so a
     *  cross-origin EventSource (every real deployment: ops.veyroxai.com
     *  calling api.veyroxai.com, ADR-0009) would otherwise be silently
     *  CORS-blocked on this one route only. */
    corsOrigin: true | readonly string[];
  },
): Promise<void> {
  app.get('/staff/stream', { schema: { querystring: query } }, async (request, reply) => {
    const { deviceToken, lastEventId: queryLastEventId } = request.query as z.infer<typeof query>;

    let device;
    try {
      device = verifyDeviceJwt(deviceToken, options.deviceKeys, Math.floor(Date.now() / 1000));
    } catch (error) {
      if (error instanceof StaffSessionExpired)
        return reply.status(401).send({ code: 'SESSION_EXPIRED', traceId: request.id });
      if (error instanceof StaffSessionInvalid)
        return reply.status(401).send({ code: 'SESSION_INVALID', traceId: request.id });
      throw error;
    }

    // ADR-0005 requirement 3: text/event-stream, no proxy buffering, flush per
    // event. reply.hijack() hands the raw response to us - Fastify will not
    // attempt to send its own reply once we do.
    reply.hijack();
    const requestOrigin = request.headers.origin;
    const allowOrigin =
      options.corsOrigin === true
        ? (requestOrigin ?? '*')
        : requestOrigin && options.corsOrigin.includes(requestOrigin)
          ? requestOrigin
          : null;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // No credentials on this request (token rides the query string, not a
      // cookie), so echoing the origin - or `*` when reflecting any - is safe.
      ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    });
    reply.raw.write(': connected\n\n');

    // The browser's EventSource sends this header automatically on reconnect
    // (unrelated to the auth workaround above - it's a standard header the
    // platform itself manages). The query param is a fallback for the very
    // first connection or a non-browser client.
    const headerLastEventId = request.headers['last-event-id'];
    const lastEventId =
      (typeof headerLastEventId === 'string' ? headerLastEventId : null) ??
      queryLastEventId ??
      null;

    const unsubscribe = await options.stream.connect({
      tenantId: device.tenantId,
      lastEventId,
      now: new Date(),
      subscriber: { write: (chunk) => reply.raw.write(chunk) },
    });

    request.raw.on('close', unsubscribe);
  });
}
