import { Alert, Button, Stack, useT } from '@veyroxai/ui';
import type { MessageKey } from '@veyroxai/i18n';

/**
 * The one look for an in-flow, retryable error (a failed quote, a dropped network, a
 * rejected placement). Terminal states — store closed, session expired, ordering
 * suspended, open-order block — stay full-screen `EmptyState`; those are the design.
 */
export function ErrorAlert({
  messageKey,
  onRetry,
}: {
  messageKey: MessageKey;
  onRetry?: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <Alert tone="danger" title={t('common.errorTitle')}>
      <Stack gap="xs">
        <span>{t(messageKey)}</span>
        {onRetry ? (
          <Button variant="outline" size="md" iconStart="restaurant-menu" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}
