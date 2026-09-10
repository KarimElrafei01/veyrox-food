import { useState } from 'react';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Field,
  Icon,
  Price,
  Screen,
  Stack,
  StickyBar,
  TextInput,
  useT,
} from '@veyroxai/ui';
import {
  formatMinutesRange,
  formatMoney,
  translate,
  type Locale,
  type MessageKey,
} from '@veyroxai/i18n';
import type { QuotedLine, QuoteResponse } from '@veyroxai/contracts';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { ErrorAlert } from '../../../shared/ui/ErrorAlert.js';
import { useReadySession } from '../../../shared/session-context.js';
import { useCart } from '../../../shared/cart-store.js';
import type { PlaceOutcome } from '../usecases/placeOrder.js';
import styles from './CheckoutScreen.module.css';

interface CheckoutScreenProps {
  locale: Locale;
  quote: QuoteResponse;
  quotedByLine: Map<string, QuotedLine>;
  askTableNumber: boolean;
  placing: boolean;
  outcome: PlaceOutcome | null;
  onBack: () => void;
  onEditCart: () => void;
  onPlace: (note: string | null, expectedTotalMinor: number, tableLabel: string | null) => void;
  onDismissPriceChange: () => void;
}

export function CheckoutScreen({
  locale,
  quote,
  quotedByLine,
  askTableNumber,
  placing,
  outcome,
  onBack,
  onEditCart,
  onPlace,
  onDismissPriceChange,
}: CheckoutScreenProps): React.JSX.Element {
  const { t } = useT();
  const session = useReadySession();
  const cart = useCart();
  const [note, setNote] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const table = askTableNumber && tableLabel.trim() ? tableLabel.trim() : null;
  const place = (expectedTotalMinor: number) =>
    onPlace(note.trim() || null, expectedTotalMinor, table);

  const priceChanged = outcome?.kind === 'price_changed' ? outcome : null;
  const activeQuote = priceChanged?.quote ?? quote;
  const errorCode =
    outcome &&
    outcome.kind !== 'placed' &&
    outcome.kind !== 'price_changed' &&
    outcome.kind !== 'open_order'
      ? mapErrorKey(outcome)
      : null;

  return (
    <Screen
      header={<WebviewHeader title={t('checkout.title')} onBack={onBack} />}
      footer={
        <StickyBar>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            spread
            loading={placing}
            iconStart="near-me"
            onClick={() => place(activeQuote.totalMinor)}
          >
            <span className={styles.ctaText}>
              {placing ? t('checkout.placing') : t('checkout.placeOrder')}
            </span>
            <Price minor={activeQuote.totalMinor} />
          </Button>
          <p className={styles.confirmNote}>
            <Icon name="chat" size={14} />
            {t('status.weWillMessage')}
          </p>
        </StickyBar>
      }
    >
      <Stack gap="md">
        <Badge tone="neutral">{t('checkout.step')}</Badge>

        <Card tone="raised" pad="md">
          <div className={styles.etaRow}>
            <span className={styles.etaIcon}>
              <Icon name="timer" size={22} />
            </span>
            <div>
              <p className={styles.etaTitle}>
                {t('checkout.readyOnAccept', {
                  range: formatMinutesRange(
                    activeQuote.eta.lowerMinutes,
                    activeQuote.eta.upperMinutes,
                    locale,
                  ),
                })}
              </p>
              <p className={styles.etaSub}>{session.tenant.name}</p>
            </div>
          </div>
        </Card>

        <Card tone="raised" pad="md">
          <div className={styles.orderHead}>
            <span>{t('checkout.yourOrder')}</span>
            <button type="button" className={styles.editLink} onClick={onEditCart}>
              {t('checkout.editCart')}
            </button>
          </div>
          <Stack gap="xs">
            {cart.lines.map((line) => {
              const name = locale === 'ar-EG' && line.nameAr ? line.nameAr : line.nameEn;
              const lineTotal = quotedByLine.get(line.lineId)?.lineTotalMinor;
              return (
                <div key={line.lineId} className={styles.lineRow}>
                  <div className={styles.lineText}>
                    <span className={styles.lineName}>
                      {line.qty}× {name}
                    </span>
                    {line.modifierSummary ? (
                      <span className={styles.lineMods}>{line.modifierSummary}</span>
                    ) : null}
                  </div>
                  {lineTotal != null ? <Price minor={lineTotal} size="md" /> : null}
                </div>
              );
            })}
          </Stack>
          <div className={styles.totalRow}>
            <span>{t('cart.total')}</span>
            <Price minor={activeQuote.totalMinor} tone="accent" size="lg" />
          </div>
        </Card>

        <Card tone="flat" pad="md">
          <div className={styles.pay}>
            <span className={styles.payIcon}>
              <Icon name="payments" size={20} />
            </span>
            <div>
              <p className={styles.payTitle}>{t('checkout.payTitle')}</p>
              <p className={styles.paySub}>{t('checkout.payBody')}</p>
            </div>
          </div>
        </Card>

        {askTableNumber ? (
          <Field label={t('checkout.tableNumber')} hint={t('common.optional')}>
            {(id) => (
              <TextInput
                id={id}
                maxLength={16}
                inputMode="numeric"
                placeholder={t('checkout.tableNumberPlaceholder')}
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
              />
            )}
          </Field>
        ) : null}

        <Field label={t('checkout.note')} hint={t('common.optional')}>
          {(id) => (
            <TextInput
              id={id}
              maxLength={140}
              placeholder={t('checkout.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>

        {activeQuote.loyalty.pointsToEarn > 0 ? (
          <Card tone="flat" pad="sm">
            <span className={styles.points}>
              <Icon name="star" size={16} />
              {t('checkout.earnPoints', { points: activeQuote.loyalty.pointsToEarn })}
            </span>
          </Card>
        ) : null}

        {errorCode ? (
          <ErrorAlert
            messageKey={errorCode}
            onRetry={outcome?.kind === 'network' ? () => place(activeQuote.totalMinor) : undefined}
          />
        ) : null}
      </Stack>

      <BottomSheet
        open={priceChanged != null}
        title={t('checkout.priceChangedTitle')}
        closeLabel={t('common.close')}
        onClose={onDismissPriceChange}
        footer={
          priceChanged ? (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => place(priceChanged.quote.totalMinor)}
            >
              {translate(locale, 'checkout.priceChangedConfirm', {
                total: fmt(priceChanged.quote.totalMinor, locale),
              })}
            </Button>
          ) : undefined
        }
      >
        {priceChanged ? (
          <p className={styles.sheetBody}>
            {translate(locale, 'checkout.priceChangedBody', {
              total: fmt(priceChanged.quote.totalMinor, locale),
            })}
          </p>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function fmt(minor: number, locale: Locale): string {
  return formatMoney(minor, locale);
}

function mapErrorKey(outcome: PlaceOutcome): MessageKey {
  switch (outcome.kind) {
    case 'item_unavailable':
      return 'error.ITEM_UNAVAILABLE';
    case 'store_closed':
      return 'error.STORE_CLOSED';
    case 'suspended':
      return 'error.ORDERING_SUSPENDED';
    case 'min_order':
      return 'error.MIN_ORDER_VALUE';
    case 'session_expired':
      return 'error.SESSION_EXPIRED';
    case 'menu_gone':
      return 'error.MENU_VERSION_GONE';
    case 'needs_review':
      return 'error.ITEM_UNAVAILABLE';
    case 'network':
      return 'error.network';
    default:
      return 'error.unknown';
  }
}
