import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  Screen,
  Spinner,
  Stack,
  StatusDot,
  useT,
} from '@veyroxai/ui';
import {
  formatClock,
  formatCountdown,
  translate,
  type Locale,
  type MessageKey,
} from '@veyroxai/i18n';
import { useEffect, useState } from 'react';
import styles from './SessionScreens.module.css';

/** The other language's copy for a headline, so terminal screens read bilingually (design 2.7–2.9). */
function otherLang(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  return translate(locale === 'ar-EG' ? 'en' : 'ar-EG', key, params);
}

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
  const { t, locale } = useT();
  return (
    <CenteredScreen>
      <EmptyState
        icon="schedule"
        title={t('session.expiredTitle')}
        titleSecondary={otherLang(locale, 'session.expiredTitle')}
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
  const { t, locale } = useT();
  return (
    <CenteredScreen>
      <EmptyState
        icon="storefront"
        title={t('suspended.title')}
        titleSecondary={otherLang(locale, 'suspended.title')}
        body={t('suspended.body')}
      />
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
    <Screen>
      <div className={styles.terminal}>
        <section className={styles.closedHero}>
          <span className={styles.modePill}>
            <Icon name="wb-twilight" size={16} />
            {t('store.closedSubtitle')}
          </span>
          <span className={styles.storeArt} data-placeholder="store-closed-art" aria-hidden="true">
            <Icon name="local-cafe" size={38} />
          </span>
          <h1 className={styles.terminalTitle}>{t('store.closedTitle', { store: storeName })}</h1>
          <p className={styles.terminalSecondary}>
            {otherLang(locale, 'store.closedTitle', { store: storeName })}
          </p>
          <Card tone="raised" pad="md">
            <div className={styles.noticeRow}>
              <span className={styles.noticeIcon}>
                <Icon name="wb-twilight" size={20} />
              </span>
              <span>{t('store.closedSubtitle')}</span>
            </div>
          </Card>
        </section>
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
        <Card tone="raised" pad="md">
          <div className={styles.detailsHead}>
            <Icon name="schedule" size={20} />
            <span>{t('store.opensIn')}</span>
          </div>
          <span
            className={styles.placeholderLine}
            data-placeholder="branch-hours"
            aria-label="Branch hours unavailable"
          />
          <span
            className={styles.placeholderLine}
            data-placeholder="branch-location"
            aria-label="Branch location unavailable"
          />
        </Card>
        <Alert tone="info">{t('store.browseOnly')}</Alert>
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
      </div>
    </Screen>
  );
}

export function OpenOrderBlockScreen({
  orderNumber,
  onView,
}: {
  orderNumber: string;
  onView: () => void;
}): React.JSX.Element {
  const { t, locale } = useT();
  return (
    <Screen>
      <div className={styles.terminal}>
        <section className={styles.openHero}>
          <span className={styles.orderIcon}>
            <Icon name="shopping-bag" size={30} />
          </span>
          <h1 className={styles.terminalTitle}>{t('openOrder.title')}</h1>
          <p className={styles.terminalSecondary}>{otherLang(locale, 'openOrder.title')}</p>
        </section>
        <Alert tone="info">{t('openOrder.freshBrew')}</Alert>
        <Card tone="raised" pad="lg">
          <div className={styles.ticketHead}>
            <div>
              <span className={styles.ticketLabel}>{t('status.pickupCode')}</span>
              <strong className={styles.ticketNumber}>{orderNumber}</strong>
            </div>
            <span
              className={styles.placeholderChip}
              data-placeholder="branch"
              aria-label="Branch unavailable"
            />
          </div>
          <div
            className={styles.ticketPlaceholder}
            data-placeholder="open-order-summary"
            aria-label="Order summary unavailable"
          />
        </Card>
        <Card tone="flat" pad="md">
          <p className={styles.terminalBody}>{t('openOrder.body', { number: orderNumber })}</p>
        </Card>
        <Button variant="primary" fullWidth size="lg" iconEnd="arrow-forward" onClick={onView}>
          {t('openOrder.view', { number: orderNumber })}
        </Button>
      </div>
    </Screen>
  );
}
