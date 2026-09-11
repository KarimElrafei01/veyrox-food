import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Icon,
  Price,
  Screen,
  Spinner,
  Stack,
  useT,
} from '@veyroxai/ui';
import { formatClock, formatMinutesRange, type Locale } from '@veyroxai/i18n';
import type { OrderStatusResponse } from '@veyroxai/contracts';
import type { PlacedOrderSnapshot } from '../../../shared/placed-order-snapshot.js';
import { menuImageSource } from '../../../shared/menu-image.js';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { minutesRemaining, rejectionKey, trackerIndex } from '../usecases/loadOrderStatus.js';
import styles from './OrderStatusScreen.module.css';

interface OrderStatusScreenProps {
  locale: Locale;
  state: 'loading' | 'ready' | 'error';
  notFound: boolean;
  order: OrderStatusResponse | null;
  storeName: string;
  pointsBalance: number;
  orderSnapshot: PlacedOrderSnapshot | null;
  onRetry: () => void;
  onBackToMenu: () => void;
}

const STEPS = [
  { key: 'placed', icon: 'check' },
  { key: 'accepted', icon: 'done-all' },
  { key: 'preparing', icon: 'skillet' },
  { key: 'ready', icon: 'shopping-bag' },
] as const;

export function OrderStatusScreen(props: OrderStatusScreenProps): React.JSX.Element {
  const { t } = useT();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const {
    locale,
    state,
    notFound,
    order,
    storeName,
    pointsBalance,
    orderSnapshot,
    onRetry,
    onBackToMenu,
  } = props;

  if (state === 'loading') return <Loading />;
  if (state === 'error' || !order)
    return <ErrorState notFound={notFound} onRetry={onRetry} onBackToMenu={onBackToMenu} />;

  const rejected = order.status === 'rejected';
  const eta = 'eta' in order ? order.eta : null;
  const pointsToEarn =
    'loyalty' in order ? order.loyalty.pointsToEarn : (orderSnapshot?.pointsToEarn ?? 0);

  return (
    <Screen header={<WebviewHeader title={t('order.title')} />}>
      <Stack gap="md">
        <div className={styles.hero}>
          <span className={styles.heroIcon}>
            <Icon name={rejected ? 'info' : 'check-circle'} size={32} />
            {!rejected ? <span className={styles.heroPing} aria-hidden /> : null}
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
              <span className={styles.code}>#{order.orderNumber}</span>
            </div>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden />
              {locale === 'ar-EG' && order.statusLabel['ar-EG']
                ? order.statusLabel['ar-EG']
                : order.statusLabel.en}
            </span>
          </div>
        </Card>

        {rejected ? (
          <Alert tone="warning" title={t('status.rejectedTitle')}>
            {t(rejectionKey(order.rejectionReason))}
          </Alert>
        ) : (
          <>
            {eta ? <EtaBanner eta={eta} locale={locale} /> : null}
            <Progress status={order.status} />
            {pointsToEarn > 0 ? (
              <LoyaltyReward pointsBalance={pointsBalance} pointsToEarn={pointsToEarn} />
            ) : null}
          </>
        )}

        <Card tone="raised" pad="md">
          <div className={styles.payRow}>
            <span className={styles.payTitle}>
              <Icon name="payments" size={20} />
              {t('status.payOnCollection')}
            </span>
            <Price minor={order.totalMinor} tone="default" size="lg" />
          </div>
          <p className={styles.payBody}>{t('status.payOnCollectionBody')}</p>
        </Card>

        {orderSnapshot ? (
          <OrderDetails
            locale={locale}
            snapshot={orderSnapshot}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((open) => !open)}
          />
        ) : null}
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

function Loading(): React.JSX.Element {
  const { t } = useT();
  return (
    <Screen header={<WebviewHeader title={t('order.title')} />}>
      <div className={styles.center}>
        <Spinner size={28} label={t('common.loading')} />
      </div>
    </Screen>
  );
}

function ErrorState({
  notFound,
  onRetry,
  onBackToMenu,
}: Pick<OrderStatusScreenProps, 'notFound' | 'onRetry' | 'onBackToMenu'>): React.JSX.Element {
  const { t } = useT();
  return (
    <Screen header={<WebviewHeader title={t('order.title')} />}>
      <EmptyState
        icon="info"
        title={t('common.errorTitle')}
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

function EtaBanner({
  eta,
  locale,
}: {
  eta: Extract<OrderStatusResponse, { eta: unknown }>['eta'];
  locale: Locale;
}): React.JSX.Element {
  const { t } = useT();
  const remaining = minutesRemaining(eta.promisedUpperAt);
  const range =
    eta.startsOnAccept || remaining == null
      ? formatMinutesRange(eta.lowerMinutes, eta.upperMinutes, locale)
      : formatMinutesRange(0, remaining, locale);
  const readyAt = eta.promisedUpperAt
    ? formatClock(eta.promisedUpperAt, 'Africa/Cairo', locale)
    : null;
  return (
    <section className={styles.etaBanner}>
      <span className={styles.etaIcon}>
        <Icon name="timer" size={24} />
      </span>
      <div>
        <span className={styles.etaLabel}>{t('status.estimatedReady')}</span>
        <p className={styles.etaValue}>
          {readyAt ? `~ ${readyAt}` : t('status.inMinutes', { range })}
          {readyAt ? <span>{t('status.inMinutes', { range })}</span> : null}
        </p>
      </div>
    </section>
  );
}

function Progress({ status }: { status: OrderStatusResponse['status'] }): React.JSX.Element {
  const { t } = useT();
  const activeIndex = trackerIndex(status);
  return (
    <Card tone="raised" pad="md">
      <div className={styles.progressHead}>
        <span>{t('status.progress')}</span>
        <span className={styles.updated}>{t('status.updatedNow')}</span>
      </div>
      <ol className={styles.track}>
        {STEPS.map((step, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          const label = t(
            `status.step${step.key[0]!.toUpperCase()}${step.key.slice(1)}` as
              | 'status.stepPlaced'
              | 'status.stepAccepted'
              | 'status.stepPreparing'
              | 'status.stepReady',
          );
          return (
            <li key={step.key} className={styles.step} data-state={state}>
              <span className={styles.stepNode}>
                <Icon
                  name={step.icon}
                  size={18}
                  className={
                    step.key === 'preparing' && state === 'active'
                      ? styles.preparingIcon
                      : undefined
                  }
                />
                {step.key === 'preparing' && state === 'active' ? (
                  <span className={styles.stepPing} aria-hidden />
                ) : null}
              </span>
              <span className={styles.stepLabel}>{label}</span>
              {index < STEPS.length - 1 ? <span className={styles.stepBar} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function LoyaltyReward({
  pointsBalance,
  pointsToEarn,
}: {
  pointsBalance: number;
  pointsToEarn: number;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <Card tone="flat" pad="sm">
      <div className={styles.loyalty}>
        <span className={styles.loyaltyIcon}>
          <Icon name="star" size={18} />
        </span>
        <div className={styles.loyaltyCopy}>
          <strong>{t('status.loyaltyTitle')}</strong>
          <span>{t('status.pointsOnCollection', { points: pointsToEarn })}</span>
        </div>
        <span className={styles.loyaltyTotal}>
          {t('status.pointsTotal', { points: pointsBalance })}
        </span>
      </div>
    </Card>
  );
}

function OrderDetails({
  locale,
  snapshot,
  open,
  onToggle,
}: {
  locale: Locale;
  snapshot: PlacedOrderSnapshot;
  open: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <Card tone="raised" pad="md">
      <button
        type="button"
        className={styles.detailsToggle}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.detailsTitle}>
          <Icon name="receipt-long" size={20} />
          {t('status.orderDetails')}
          <span className={styles.itemCount}>
            {t('status.items', { count: snapshot.lines.length })}
          </span>
        </span>
        <Icon name="chevron-down" size={22} className={open ? styles.chevronOpen : undefined} />
      </button>
      {open ? (
        <div className={styles.detailsContent}>
          {snapshot.lines.map((line, index) => {
            const name = locale === 'ar-EG' && line.nameAr ? line.nameAr : line.nameEn;
            return (
              <div className={styles.detailLine} key={`${line.nameEn}-${index}`}>
                <span className={styles.detailImage}>
                  {line.imageUrl ? (
                    <img src={menuImageSource(line.imageUrl)} alt="" />
                  ) : (
                    <Icon name="local-cafe" size={20} />
                  )}
                </span>
                <span className={styles.detailCopy}>
                  <strong>
                    {line.qty}× {name}
                  </strong>
                  {line.modifierSummary ? <span>{line.modifierSummary}</span> : null}
                </span>
                <Price minor={line.lineTotalMinor} size="sm" />
              </div>
            );
          })}
          <div className={styles.summary}>
            <div>
              <span>{t('status.subtotal')}</span>
              <Price minor={snapshot.subtotalMinor} size="sm" />
            </div>
            {snapshot.discountMinor > 0 ? (
              <div className={styles.discount}>
                <span>{t('status.discount')}</span>
                <span>
                  −<Price minor={snapshot.discountMinor} tone="accent" size="sm" />
                </span>
              </div>
            ) : null}
            <div className={styles.summaryTotal}>
              <strong>{t('status.totalDue')}</strong>
              <Price minor={snapshot.totalMinor} tone="accent" size="md" />
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
