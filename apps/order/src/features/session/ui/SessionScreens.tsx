import {
  Alert,
  Button,
  Card,
  EmptyState,
  Screen,
  Spinner,
  Stack,
  StatusDot,
  useT,
} from '@veyroxai/ui';
import { formatClock, formatCountdown } from '@veyroxai/i18n';
import { useEffect, useState } from 'react';
import styles from './SessionScreens.module.css';

function CenteredScreen({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Screen>
      <div className={styles.centered}>{children}</div>
    </Screen>
  );
}

export function LoadingScreen(): React.JSX.Element {
  const { t } = useT();
  return (
    <CenteredScreen>
      <Spinner size={32} label={t('entry.opening')} />
      <p className={styles.muted}>{t('entry.opening')}</p>
    </CenteredScreen>
  );
}

export function SessionExpiredScreen({ reopenUrl }: { reopenUrl: string }): React.JSX.Element {
  const { t } = useT();
  return (
    <CenteredScreen>
      <EmptyState
        icon="schedule"
        title={t('session.expiredTitle')}
        body={t('session.expiredBody')}
        action={
          <Stack gap="xs">
            <Button
              fullWidth
              size="lg"
              iconStart="chat"
              onClick={() => {
                window.location.assign(reopenUrl);
              }}
            >
              {t('session.reopen')}
            </Button>
            <p className={styles.hint}>{t('session.cartSaved')}</p>
          </Stack>
        }
      />
    </CenteredScreen>
  );
}

export function OrderingSuspendedScreen(): React.JSX.Element {
  const { t } = useT();
  return (
    <CenteredScreen>
      <EmptyState icon="storefront" title={t('suspended.title')} body={t('suspended.body')} />
      <Alert tone="info">{t('suspended.help')}</Alert>
    </CenteredScreen>
  );
}

export function GenericErrorScreen({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const { t } = useT();
  return (
    <CenteredScreen>
      <EmptyState
        icon="info"
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        action={
          <Button fullWidth size="lg" iconStart="restaurant-menu" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        }
      />
    </CenteredScreen>
  );
}

export function StoreClosedScreen({
  storeName,
  opensAt,
  timezone,
  onBrowse,
}: {
  storeName: string;
  opensAt: string | null;
  timezone: string;
  onBrowse?: () => void;
}): React.JSX.Element {
  const { t, locale } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const opensMs = opensAt ? new Date(opensAt).getTime() : null;

  return (
    <CenteredScreen>
      <Stack gap="md">
        <EmptyState
          icon="wb-twilight"
          title={t('store.closedTitle', { store: storeName })}
          body={t('store.closedSubtitle')}
        />
        {opensAt ? (
          <Card tone="raised" pad="md">
            <div className={styles.countdownRow}>
              <span className={styles.countdownLabel}>
                <StatusDot pulse />
                {t('store.opensIn')}
              </span>
              <span className={styles.countdown}>
                {opensMs ? formatCountdown(opensMs - now) : '--:--:--'}
              </span>
            </div>
            <p className={styles.muted}>
              {t('store.opensAt', { time: formatClock(opensAt, timezone, locale) })}
            </p>
          </Card>
        ) : null}
        {onBrowse ? (
          <Button
            variant="espresso"
            fullWidth
            size="lg"
            iconStart="restaurant-menu"
            onClick={onBrowse}
          >
            {t('store.browseOnly')}
          </Button>
        ) : null}
      </Stack>
    </CenteredScreen>
  );
}

export function OpenOrderBlockScreen({
  orderNumber,
  onView,
}: {
  orderNumber: string;
  onView: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <CenteredScreen>
      <Stack gap="md">
        <EmptyState
          icon="shopping-bag"
          title={t('openOrder.title')}
          body={t('openOrder.body', { number: orderNumber })}
        />
        <Alert tone="info">{t('openOrder.freshBrew')}</Alert>
        <Button fullWidth size="lg" iconEnd="arrow-forward" onClick={onView}>
          {t('openOrder.view', { number: orderNumber })}
        </Button>
      </Stack>
    </CenteredScreen>
  );
}
