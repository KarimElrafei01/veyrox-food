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
  StatusDot,
  useT,
} from '@veyroxai/ui';
import { translate, type Locale, type MessageKey } from '@veyroxai/i18n';
import type { LoyaltyTier, OrderStatusResponse } from '@veyroxai/contracts';
import { CountdownClock } from '../../../shared/ui/CountdownClock.js';
import { formatHoursRange } from '../usecases/formatHours.js';
import { MOCK_OPEN_ORDER_EXTRAS } from '../mockOpenOrderExtras.js';
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
  today,
  tomorrow,
  tier,
  pointsBalance,
  whatsappUrl,
  onBrowse,
}: {
  storeName: string;
  opensAt: string | null;
  /** @deprecated unused — kept accepted so an in-flight caller elsewhere in the
   *  app doesn't fail to typecheck mid-refactor. Remove once nothing passes it. */
  timezone?: string;
  today?: { opens: string; closes: string } | null;
  tomorrow?: { opens: string; closes: string } | null;
  tier?: LoyaltyTier | null;
  pointsBalance?: number;
  whatsappUrl?: string;
  onBrowse?: () => void;
}): React.JSX.Element {
  const { t, locale } = useT();
  const opensMs = opensAt ? new Date(opensAt).getTime() : null;
  const opensAtLabel = opensAt
    ? new Intl.DateTimeFormat(locale === 'ar-EG' ? 'ar-EG' : 'en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Africa/Cairo',
      }).format(new Date(opensAt))
    : null;

  return (
    <Screen>
      <div className={styles.terminal}>
        {/* Hero — F1 design 2.8. The circular illustration is a placeholder: the
            Stitch source uses a bespoke AI illustration we don't have an asset for. */}
        <section className={styles.closedHero}>
          <span className={styles.modePill}>
            <Icon name="wb-twilight" size={16} />
            {t('store.restingMode')}
          </span>
          <span className={styles.storeArt} data-placeholder="store-closed-art" aria-hidden="true">
            <Icon name="local-cafe" size={38} />
          </span>
          <h1 className={styles.terminalTitle}>{t('store.closedTitle', { store: storeName })}</h1>
          <p className={styles.terminalSecondary}>
            {otherLang(locale, 'store.closedTitle', { store: storeName })}
          </p>
          <Card tone="flat" pad="sm" className={styles.restingCard}>
            <span className={styles.noticeIcon}>
              <Icon name="wb-twilight" size={20} />
            </span>
            <span className={styles.restingText}>
              <strong>{t('store.restingTitle')}</strong>
              <span className={styles.muted}>
                {opensAtLabel
                  ? t('store.restingBody', { time: opensAtLabel })
                  : t('store.closedSubtitle')}
              </span>
            </span>
          </Card>
        </section>

        {opensMs ? (
          <Card tone="raised" pad="md">
            <div className={styles.countdownRow}>
              <span className={styles.countdownLabel}>
                <StatusDot pulse />
                {t('store.opensIn')}
              </span>
              <CountdownClock deadlineMs={opensMs} />
            </div>
          </Card>
        ) : null}

        <Card tone="raised" pad="md">
          <div className={styles.hoursHead}>
            <span className={styles.detailsHead}>
              <Icon name="schedule" size={18} />
              {t('store.hoursAndLocation')}
            </span>
            <span className={styles.tzChip}>{t('store.timezoneLabel')}</span>
          </div>
          <div className={styles.hoursRows}>
            <div className={[styles.hoursRow, styles.hoursRowToday].join(' ')}>
              <span className={styles.hoursDay}>
                <span className={[styles.dayDot, styles.dayDotToday].join(' ')} />
                {t('store.today')}
              </span>
              <span>{formatHoursRange(today ?? null, locale) ?? t('store.closedAllDay')}</span>
            </div>
            <div className={styles.hoursRow}>
              <span className={styles.hoursDay}>
                <span className={styles.dayDot} />
                <span className={styles.muted}>{t('store.tomorrow')}</span>
              </span>
              <span className={styles.muted}>
                {formatHoursRange(tomorrow ?? null, locale) ?? t('store.closedAllDay')}
              </span>
            </div>
          </div>
          {/* No branch/address field exists on tenants yet — flagged placeholder,
              not a fabricated address. */}
          <div className={styles.branchRow}>
            <Icon name="location-on" size={18} />
            <span
              className={styles.muted}
              data-placeholder="branch-address"
              aria-label="Branch address unavailable"
            >
              {t('store.addressUnavailable')}
            </span>
          </div>
        </Card>

        <div className={styles.browseNotice}>
          <Icon name="visibility" size={20} />
          <p>{t('store.browseNotice')}</p>
        </div>

        <div className={styles.actionStack}>
          {onBrowse ? (
            <Button
              variant="espresso"
              fullWidth
              size="lg"
              iconStart="restaurant-menu"
              onClick={onBrowse}
            >
              {t('store.previewMenu')}
            </Button>
          ) : null}
          {whatsappUrl ? (
            <a className={styles.whatsappLink} href={whatsappUrl}>
              <Icon name="chat" size={20} />
              {t('store.messageWhatsApp')}
            </a>
          ) : null}
        </div>

        {tier ? (
          <div className={styles.loyaltyTeaser}>
            <span className={styles.loyaltyTeaserLeft}>
              <Icon name="star" size={18} />
              {t('store.pointsSaved', {
                points: pointsBalance ?? 0,
                tier: t(`loyalty.tier.${tier}` as MessageKey),
              })}
            </span>
            <strong>{t('store.earnNextOrder')}</strong>
          </div>
        ) : null}
      </div>
    </Screen>
  );
}

/** Minutes since `placedAt`, never negative — mirrors order-status's own convention. */
function minutesSince(placedAt: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(placedAt).getTime()) / 60_000));
}

export function OpenOrderBlockScreen({
  orderNumber,
  order,
  whatsappUrl,
  onView,
}: {
  orderNumber: string;
  /** Real order-status data when available — status label, ETA, total. `null`
   *  while it's loading or if the fetch failed; the screen still works with just
   *  `orderNumber` in that case. */
  order?: OrderStatusResponse | null;
  whatsappUrl?: string;
  onView: () => void;
}): React.JSX.Element {
  const { t, locale } = useT();
  const mock = MOCK_OPEN_ORDER_EXTRAS;
  const eta = order && 'eta' in order ? order.eta : null;
  const placedMinutesAgo = order ? minutesSince(order.placedAt, Date.now()) : null;
  const totalMinor = order?.totalMinor ?? mock.items.reduce((sum, i) => sum + i.priceMinor, 0);

  return (
    <Screen>
      <div className={styles.terminal}>
        <section className={styles.openHero}>
          <span className={styles.orderIconRing}>
            <span className={styles.orderIcon}>
              <Icon name="shopping-bag" size={28} />
            </span>
            <span className={styles.orderIconBadge}>
              <Icon name="timer" size={13} />
            </span>
          </span>
          <h1 className={styles.terminalTitle}>{t('openOrder.title')}</h1>
          <p className={styles.terminalSecondary}>{otherLang(locale, 'openOrder.title')}</p>
        </section>

        <div className={styles.freshBrewBanner}>
          <span className={styles.freshBrewIcon}>
            <Icon name="info" size={18} />
          </span>
          <div>
            <p className={styles.freshBrewTitle}>
              {t('openOrder.freshBrewTitle')} · {otherLang(locale, 'openOrder.freshBrewTitle')}
            </p>
            <p className={styles.muted}>{t('openOrder.freshBrew')}</p>
          </div>
        </div>

        <Card tone="raised" pad="lg" className={styles.spotlightCard}>
          <div className={styles.ticketHead}>
            <div>
              <span className={styles.ticketLabel}>{t('openOrder.activeTicket')}</span>
              {/* dir="ltr": "#A-27" must not let the bidi algorithm move the
                  neutral "#" to the wrong side under an RTL page. */}
              <strong className={styles.ticketNumber} dir="ltr">
                #{orderNumber}
              </strong>
            </div>
            <div
              className={styles.branchInfo}
              data-placeholder="branch"
              aria-label="Branch unavailable"
            >
              <span className={styles.muted}>{mock.branchName}</span>
              <span className={styles.branchAddress}>
                <Icon name="location-on" size={14} />
                {mock.branchAddress}
              </span>
            </div>
          </div>

          <div className={styles.liveStatusBar}>
            <span className={styles.liveStatusLeft}>
              <StatusDot pulse />
              <span>
                <strong className={styles.liveStatusTitle}>
                  {t('openOrder.preparingBy', { name: mock.baristaName })}
                </strong>
                <span className={styles.muted}>
                  {placedMinutesAgo != null
                    ? `${t('openOrder.placedAgo', { mins: placedMinutesAgo })} · `
                    : ''}
                  {mock.extractionNote}
                </span>
              </span>
            </span>
            {eta && !eta.startsOnAccept ? (
              <span className={styles.etaBlock}>
                <span className={styles.muted}>{t('openOrder.eta')}</span>
                <strong>~{eta.upperMinutes} min</strong>
              </span>
            ) : null}
          </div>

          <div
            className={styles.itemPeek}
            data-placeholder="open-order-items"
            aria-label="Item details are illustrative"
          >
            {mock.items.map((item) => (
              <div key={item.nameEn} className={styles.itemRow}>
                <span className={styles.itemThumb} aria-hidden="true">
                  <Icon name="local-cafe" size={20} />
                </span>
                <div className={styles.itemInfo}>
                  <div className={styles.itemTop}>
                    <span>
                      {item.qty}x {item.nameEn}
                    </span>
                    <Price minor={item.priceMinor} tone="default" size="sm" />
                  </div>
                  <span className={styles.muted}>{item.detailEn}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.payRow}>
            <span className={styles.payLabel}>
              <Icon name="payments" size={18} />
              {t('openOrder.payOnPickup')}
            </span>
            <Price minor={totalMinor} tone="default" size="lg" />
          </div>
        </Card>

        <Card tone="flat" pad="md">
          <p className={styles.terminalBody}>{t('openOrder.body', { number: orderNumber })}</p>
          <p className={[styles.terminalBody, styles.muted].join(' ')} dir="rtl">
            {otherLang(locale, 'openOrder.body', { number: orderNumber })}
          </p>
        </Card>

        <div className={styles.actionStack}>
          <Button variant="primary" fullWidth size="lg" iconEnd="arrow-forward" onClick={onView}>
            {t('openOrder.view', { number: orderNumber })}
          </Button>
          {whatsappUrl ? (
            <a className={styles.whatsappLink} href={whatsappUrl}>
              <Icon name="chat" size={20} />
              {t('openOrder.chatBarista')}
            </a>
          ) : null}
        </div>

        <div className={styles.footerCard} data-placeholder="branch-hours-footer">
          <Icon name="schedule" size={16} />
          <span>
            <span className={styles.footerTitle}>{mock.hoursFooter}</span>
            <span className={styles.muted}>{mock.walkFooter}</span>
          </span>
        </div>
      </div>
    </Screen>
  );
}
