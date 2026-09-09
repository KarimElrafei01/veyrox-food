import { eq, type Database, tables } from '@veyroxai/db';
import type { InboundEventStore } from '../interface/whatsapp-webhook-controller.js';

export class InboundEventRepository implements InboundEventStore {
  constructor(private readonly db: Database) {}

  async insertIfAbsent(input: { providerMessageId: string; payload: unknown }): Promise<boolean> {
    const inserted = await this.db
      .insert(tables.inboundEvents)
      .values({
        rail: 'official',
        providerMessageId: input.providerMessageId,
        payload: input.payload,
      })
      .onConflictDoNothing()
      .returning({ id: tables.inboundEvents.id });
    return inserted.length === 1;
  }

  async findUnprocessed(providerMessageId: string) {
    const [event] = await this.db
      .select()
      .from(tables.inboundEvents)
      .where(eq(tables.inboundEvents.providerMessageId, providerMessageId));
    return event ?? null;
  }
}
