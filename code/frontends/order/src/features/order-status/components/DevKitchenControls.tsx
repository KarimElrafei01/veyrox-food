import { useState } from 'react';
import { useDevKitchen } from '../hooks/useDevKitchen.js';
import type { KitchenAction } from '../datasource/devKitchenDatasource.js';

const ACTIONS: { action: KitchenAction; label: string }[] = [
  { action: 'accept', label: 'Accept' },
  { action: 'preparing', label: 'Start preparing' },
  { action: 'ready', label: 'Mark ready' },
  { action: 'reject', label: 'Reject' },
];

/**
 * Dev-only. There's no KDS yet, so this is the only way to move a hand-placed
 * test order past 'placed' — mirrors DevSwitcher.tsx's own "never shown to a
 * real customer" styling (fixed corner panel, plain English, no i18n).
 */
export function DevKitchenControls({
  orderId,
  tenantId,
  status,
  onAdvanced,
}: {
  orderId: string;
  tenantId: string;
  status: string;
  onAdvanced: () => void;
}): React.JSX.Element {
  const { pending, run } = useDevKitchen(orderId, tenantId);
  const [failed, setFailed] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        insetBlockEnd: 'var(--vx-space-sm)',
        insetInlineStart: 'var(--vx-space-sm)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--vx-space-2xs)',
        padding: 'var(--vx-space-2xs)',
        borderRadius: 'var(--vx-radius-md)',
        border: '1px solid var(--vx-outline)',
        background: 'var(--vx-surface)',
        fontSize: 'var(--vx-text-label-sm)',
      }}
    >
      <span style={{ color: 'var(--vx-on-surface-variant)', padding: '0 var(--vx-space-2xs)' }}>
        DEV · simulate kitchen ({status})
      </span>
      <div style={{ display: 'flex', gap: 'var(--vx-space-2xs)', flexWrap: 'wrap' }}>
        {ACTIONS.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => {
              setFailed(false);
              void run(action).then((ok) => (ok ? onAdvanced() : setFailed(true)));
            }}
            style={{
              padding: '0.125rem var(--vx-space-2xs)',
              borderRadius: '999px',
              border: '1px solid var(--vx-outline)',
              background: pending === action ? 'var(--vx-outline-variant)' : 'var(--vx-surface)',
              color: 'var(--vx-on-surface)',
              font: 'inherit',
            }}
          >
            {pending === action ? '…' : label}
          </button>
        ))}
      </div>
      {failed ? <span style={{ color: 'var(--vx-error)' }}>Simulated action failed.</span> : null}
    </div>
  );
}
