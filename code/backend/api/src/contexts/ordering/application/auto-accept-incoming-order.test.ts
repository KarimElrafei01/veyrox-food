import { describe, expect, it, vi } from 'vitest';
import { AutoAcceptIncomingOrder } from './auto-accept-incoming-order.js';
import { ItemNoLongerAvailable } from '../infrastructure/kitchen-order-repository.js';
import type { AcceptOrder } from './accept-order.js';
import type { RejectOrder } from './reject-order.js';

const input = { tenantId: 't1', orderId: 'o1', idempotencyKey: 'key-1', now: new Date() };

function subject(options: { accept: AcceptOrder['execute']; reject?: RejectOrder['execute'] }) {
  const accept = { execute: options.accept } as unknown as AcceptOrder;
  const reject = { execute: options.reject ?? vi.fn() } as unknown as RejectOrder;
  return { autoAccept: new AutoAcceptIncomingOrder(accept, reject), accept, reject };
}

describe('AutoAcceptIncomingOrder', () => {
  it('accepts with a system actor and never touches reject on success', async () => {
    const acceptExecute = vi.fn(async () => ({ ticket: {} as never, replayed: false }));
    const { autoAccept, reject } = subject({ accept: acceptExecute });

    const outcome = await autoAccept.execute(input);

    expect(outcome).toEqual({ outcome: 'accepted' });
    expect(acceptExecute).toHaveBeenCalledWith({ ...input, actor: { type: 'system' } });
    expect(reject.execute).not.toHaveBeenCalled();
  });

  it('auto-rejects with item_unavailable, as a system actor, when accept finds an unavailable item', async () => {
    const acceptExecute = vi.fn(async () => {
      throw new ItemNoLongerAvailable([{ menuItemId: 'm1' }]);
    });
    const rejectExecute = vi.fn(async () => ({ ticket: {} as never, replayed: false }));
    const { autoAccept } = subject({ accept: acceptExecute, reject: rejectExecute });

    const outcome = await autoAccept.execute(input);

    expect(outcome).toEqual({ outcome: 'rejected', reasonCode: 'item_unavailable' });
    expect(rejectExecute).toHaveBeenCalledWith({
      tenantId: input.tenantId,
      orderId: input.orderId,
      reasonCode: 'item_unavailable',
      idempotencyKey: input.idempotencyKey,
      actor: { type: 'system' },
      now: input.now,
    });
  });

  it('leaves the order pending, reporting the reject error, when the auto-reject follow-up itself fails', async () => {
    const rejectError = new Error('db hiccup');
    const acceptExecute = vi.fn(async () => {
      throw new ItemNoLongerAvailable([{ menuItemId: 'm1' }]);
    });
    const rejectExecute = vi.fn(async () => {
      throw rejectError;
    });
    const { autoAccept } = subject({ accept: acceptExecute, reject: rejectExecute });

    const outcome = await autoAccept.execute(input);

    expect(outcome).toEqual({ outcome: 'left_pending', error: rejectError });
  });

  it('leaves the order pending on any other error, without guessing an auto-reject', async () => {
    const acceptError = new Error('transient failure, not an availability problem');
    const acceptExecute = vi.fn(async () => {
      throw acceptError;
    });
    const { autoAccept, reject } = subject({ accept: acceptExecute });

    const outcome = await autoAccept.execute(input);

    expect(outcome).toEqual({ outcome: 'left_pending', error: acceptError });
    expect(reject.execute).not.toHaveBeenCalled();
  });
});
