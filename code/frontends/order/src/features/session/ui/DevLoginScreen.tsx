import { Badge, Button, Card, Screen, Stack } from '@veyroxai/ui';
import type { DevSessionCafe } from '../datasource/devSessionsDatasource.js';
import { PREVIEW_STATES } from './DevPreview.js';

const PREVIEW_LABEL: Record<(typeof PREVIEW_STATES)[number], string> = {
  closed: 'Store closed',
  suspended: 'Ordering suspended',
  expired: 'Session expired',
  'open-order': 'Open-order block',
};

/**
 * Dev-only entry screen (shown instead of the generic error when the API exposes
 * `GET /dev/sessions`). Pick a café + customer to open the webview without a
 * WhatsApp token. Not translated — it never reaches a real customer.
 */
export function DevLoginScreen({
  cafes,
  onPick,
}: {
  cafes: DevSessionCafe[];
  onPick: (token: string) => void;
}): React.JSX.Element {
  return (
    <Screen>
      <div style={{ padding: 'var(--vx-space-md)', maxWidth: '30rem', marginInline: 'auto' }}>
        <Stack gap="md">
          <Stack gap="2xs">
            <span>
              <Badge tone="warning">DEV</Badge>
            </span>
            <h1 style={{ margin: 0 }}>Open a test session</h1>
            <p style={{ margin: 0, color: 'var(--vx-on-surface-variant)' }}>
              Skips the WhatsApp token — opens the webview as a real customer from the dev database.
            </p>
          </Stack>

          {cafes.map((cafe) => (
            <Card key={cafe.tenantId} tone="raised" pad="md">
              <Stack gap="sm">
                <strong>{cafe.isDefault ? `${cafe.name} · default` : cafe.name}</strong>
                {cafe.users.length === 0 ? (
                  <span style={{ color: 'var(--vx-on-surface-variant)' }}>
                    No customers seeded — run `pnpm --filter @veyroxai/api fixture`.
                  </span>
                ) : (
                  cafe.users.map((user) => (
                    <Button
                      key={user.customerId}
                      variant="outline"
                      fullWidth
                      onClick={() => onPick(user.token)}
                    >
                      {user.name} · {user.tier}
                    </Button>
                  ))
                )}
              </Stack>
            </Card>
          ))}

          <Card tone="flat" pad="md">
            <Stack gap="sm">
              <strong>Preview a terminal state</strong>
              {PREVIEW_STATES.map((state) => (
                <Button
                  key={state}
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    try {
                      sessionStorage.setItem('vx.dev', '1');
                    } catch {
                      /* private mode */
                    }
                    window.location.assign(`/preview/${state}`);
                  }}
                >
                  {PREVIEW_LABEL[state]}
                </Button>
              ))}
            </Stack>
          </Card>
        </Stack>
      </div>
    </Screen>
  );
}
