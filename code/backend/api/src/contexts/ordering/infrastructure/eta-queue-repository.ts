import { and, eq, inArray, withTenant, type Database, tables } from '@veyroxai/db';
import type { QueueTicket } from '@veyroxai/domain';
import { singleFlight } from './single-flight.js';
import { jitteredTtlSeconds } from './cache-ttl.js';
import type { createReadPathBudget } from './read-path-budget.js';

export interface EtaQueueState {
  activeStations: number;
  tickets: QueueTicket[];
  updatedAt: string;
}

export type EtaQueueEvent =
  | { type: 'accepted'; orderId: string; prepSeconds: number; tier: QueueTicket['tier'] }
  | { type: 'preparing'; orderId: string; startedAt: Date }
  | { type: 'removed'; orderId: string }
  | { type: 'stations'; activeStations: number };

export function applyEtaQueueEvent(
  state: EtaQueueState,
  event: EtaQueueEvent,
  now: Date,
): EtaQueueState {
  const tickets = [...state.tickets];
  if (event.type === 'accepted') {
    tickets.push({
      orderId: event.orderId,
      prepSeconds: event.prepSeconds,
      status: 'received',
      startedAt: null,
      tier: event.tier,
    });
  } else if (event.type === 'preparing') {
    const ticket = tickets.find((candidate) => candidate.orderId === event.orderId);
    if (ticket) {
      ticket.status = 'preparing';
      ticket.startedAt = event.startedAt;
    }
  } else if (event.type === 'removed') {
    const index = tickets.findIndex((candidate) => candidate.orderId === event.orderId);
    if (index >= 0) tickets.splice(index, 1);
  }
  return {
    activeStations:
      event.type === 'stations' ? Math.max(1, event.activeStations) : state.activeStations,
    tickets,
    updatedAt: now.toISOString(),
  };
}

export class EtaQueueRepository {
  private readonly coalesceRebuild = singleFlight<EtaQueueState>();

  constructor(
    private readonly db: Database,
    private readonly redis: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
      del(key: string): Promise<unknown>;
    },
    private readonly readBudget: ReturnType<typeof createReadPathBudget> = (fn) => fn(),
  ) {}

  /** Drops the cached snapshot so the next `load()` rebuilds from Postgres.
   *  Used where computing an incremental delta isn't worth the risk of getting
   *  it wrong - e.g. revert (§2.5), which can move a ticket in either direction
   *  and is rare enough that one extra rebuild is cheaper than a bespoke event
   *  variant for every reversible transition. */
  async invalidate(tenantId: string): Promise<void> {
    try {
      await this.redis.del(`queue:${tenantId}`);
    } catch {
      // Best-effort - a stale-for-up-to-5-minutes cache self-heals via TTL either way.
    }
  }

  async load(
    tenantId: string,
  ): Promise<{ state: EtaQueueState; source: 'redis' | 'postgres' | 'degraded' }> {
    try {
      const cached = await this.redis.get(`queue:${tenantId}`);
      if (cached) return { state: JSON.parse(cached) as EtaQueueState, source: 'redis' };
    } catch {
      // Redis is an optimization; quotes must remain available without it.
    }
    try {
      // Coalesced: a Redis TTL expiry under load means many requests miss at
      // once. Without this, each opened its own transaction on the pool that
      // order placement also depends on (a cache stampede starving checkout).
      const state = await this.coalesceRebuild(tenantId, async () => {
        // Capped so a read stampede can never claim every connection in the
        // shared pool — order placement is not routed through this budget.
        const rebuilt = await this.readBudget(() => this.rebuild(tenantId));
        try {
          await this.redis.set(
            `queue:${tenantId}`,
            JSON.stringify(rebuilt),
            'EX',
            jitteredTtlSeconds(300, 60),
          );
        } catch {
          // The Postgres result is still a correct queue snapshot.
        }
        return rebuilt;
      });
      return { state, source: 'postgres' };
    } catch {
      return {
        state: { activeStations: 1, tickets: [], updatedAt: new Date().toISOString() },
        source: 'degraded',
      };
    }
  }

  async replace(tenantId: string, state: EtaQueueState): Promise<void> {
    await this.redis.set(`queue:${tenantId}`, JSON.stringify(state), 'EX', 300);
  }

  private async rebuild(tenantId: string): Promise<EtaQueueState> {
    return withTenant(this.db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          orderId: tables.orders.id,
          status: tables.orders.status,
          acceptedAt: tables.orders.acceptedAt,
          prepSeconds: tables.menuItems.basePrepSeconds,
        })
        .from(tables.orders)
        .innerJoin(tables.orderItems, eq(tables.orderItems.orderId, tables.orders.id))
        .innerJoin(tables.menuItems, eq(tables.menuItems.id, tables.orderItems.menuItemId))
        .where(
          and(
            eq(tables.orders.tenantId, tenantId),
            inArray(tables.orders.status, ['received', 'preparing']),
          ),
        );
      const tickets = new Map<string, QueueTicket>();
      for (const row of rows) {
        const previous = tickets.get(row.orderId);
        tickets.set(row.orderId, {
          orderId: row.orderId,
          prepSeconds: Math.max(previous?.prepSeconds ?? 0, row.prepSeconds),
          status: row.status as QueueTicket['status'],
          startedAt: row.status === 'preparing' ? row.acceptedAt : null,
          tier: null,
        });
      }
      return {
        activeStations: 1,
        tickets: [...tickets.values()],
        updatedAt: new Date().toISOString(),
      };
    });
  }
}
