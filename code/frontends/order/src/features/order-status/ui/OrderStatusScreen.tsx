import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  Price,
  ProgressTracker,
  Screen,
  Spinner,
  Stack,
  StatusDot,
  useT,
  type ProgressStep,
} from '@veyroxai/ui';
import { formatMinutesRange, type Locale } from '@veyroxai/i18n';
import type { OrderStatusResponse } from '@veyroxai/contracts';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { minutesRemaining, rejectionKey, trackerIndex } from '../usecases/loadOrderStatus.js';
import styles from './OrderStatusScreen.module.css';

interface OrderStatusScreenProps {
  locale: Locale;
  state: 'loading' | 'ready' | 'error';
  notFound: boolean;
  order: OrderStatusResponse | null;
  storeName: string;
  onRetry: () => void;
  onBackToMenu: () => void;
}

export function OrderStatusScreen({
  locale,
  state,
  notFound,
  order,
  storeName,
  onRetry,
  onBackToMenu,
}: OrderStatusScreenProps): React.JSX.Element {
  const { t } = useT();

  const steps: ProgressStep[] = [
    { key: 'placed', label: t('status.stepPlaced'), icon: 'check' },
    { key: 'accepted', label: t('status.stepAccepted'), icon: 'check-circle' },
    { key: 'preparing', label: t('status.stepPreparing'), icon: 'local-cafe' },
    { key: 'ready', label: t('status.stepReady'), icon: 'shopping-bag' },
  ];

  if (state === 'loading') {
    return (
      <Screen header={<WebviewHeader title={t('order.title')} />}>
        <div className={styles.center}>
          <Spinner size={28} label={t('common.loading')} />
        </div>
      </Screen>
    );
  }

  if (state === 'error' || !order) {
    return (
      <Screen header={<WebviewHeader title={t('order.title')} />}>
        <EmptyState
          icon="info"
          title={notFound ? t('common.errorTitle') : t('common.errorTitle')}
          body={t('common.errorBody')}
          action={
            <Button fullWidth size="lg" onClick={notFound ? onBackToMenu : onRetry}>
              {notFound ? t('entry.browseMenu') : t('common.retry')}
            </Button>
          }
        />
      </Screen>
    );
  }

  const label =
    locale === 'ar-EG' && order.statusLabel['ar-EG']
      ? order.statusLabel['ar-EG']
      : order.statusLabel.en;

  const rejected = order.status === 'rejected';
  const eta = 'eta' in order ? order.eta : null;
  const remaining = eta ? minutesRemaining(eta.promisedUpperAt) : null;

  return (
    <Screen header={<WebviewHeader title={t('order.title')} />}>
      <Stack gap="md">
        <div className={styles.hero}>
          <span className={styles.heroIcon}>
            <Icon name={rejected ? 'info' : 'check-circle'} size={30} />
          </span>
          <h1 className={styles.heroTitle}>
            {rejected ? t('status.rejectedTitle') : t('status.confirmedTitle')}
          </h1>
          {!rejected ? (
            <p className={styles.heroSub}>{t('status.confirmedBody', { store: storeName })}</p>
          ) : null}
        </div>

        <Card tone="raised" pad="lg">
          <div className={styles.codeRow}>
            <div>
              <span className={styles.codeLabel}>{t('status.pickupCode')}</span>
              <span className={styles.code}>{order.orderNumber}</span>
            </div>
            <span className={styles.statusPill}>
              <StatusDot pulse={!rejected} />
              {label}
            </span>
          </div>
        </Card>

        {rejected ? (
          <Alert tone="warning" title={t('status.rejectedTitle')}>
            {t(rejectionKey(order.rejectionReason))}
          </Alert>
        ) : (
          <>
            {eta ? (
              <Card tone="raised" pad="md">
                <span className={styles.etaLabel}>{t('status.estimatedReady')}</span>
                <p className={styles.etaValue}>
                  {eta.startsOnAccept || remaining == null
                    ? t('status.inMinutes', {
                        range: formatMinutesRange(eta.lowerMinutes, eta.upperMinutes, locale),
                      })
                    : t('status.inMinutes', {
                        range: formatMinutesRange(0, remaining, locale),
                      })}
                </p>
              </Card>
            ) : null}

            <Card tone="raised" pad="md">
              <div className={styles.progressHead}>
                <span>{t('status.progress')}</span>
                <span className={styles.updated}>{t('status.updatedNow')}</span>
              </div>
              <ProgressTracker steps={steps} activeIndex={trackerIndex(order.status)} />
            </Card>
          </>
        )}

        <Card tone="raised" pad="md">
          <div className={styles.payRow}>
            <span className={styles.payTitle}>
              <Icon name="payments" size={18} />
              {t('status.payOnCollection')}
            </span>
            <Price minor={order.totalMinor} tone="default" size="lg" />
          </div>
          <p className={styles.payBody}>{t('status.payOnCollectionBody')}</p>
        </Card>

        {!rejected ? <Alert tone="info">{t('status.weWillMessage')}</Alert> : null}

        <Button
          variant="ghost"
          size="lg"
          fullWidth
          iconStart="restaurant-menu"
          onClick={onBackToMenu}
        >
          {t('entry.browseMenu')}
        </Button>
      </Stack>
    </Screen>
  );
}
