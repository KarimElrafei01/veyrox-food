import {
  Alert,
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Price,
  Screen,
  Spinner,
  Stack,
  StickyBar,
  useT,
} from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import { translate, type MessageKey } from '@veyroxai/i18n';
import type { QuotedLine, QuoteResponse } from '@veyroxai/contracts';
import { useState } from 'react';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import { ErrorAlert } from '../../../shared/ui/ErrorAlert.js';
import { useReadySession } from '../../../shared/session-context.js';
import { useCart, simpleCartLine, type CartLine } from '../../../shared/cart-store.js';
import { menuImageSource } from '../../../shared/menu-image.js';
import { useUpsell, markUpsellSeen } from '../hooks/useUpsell.js';
import { UpsellCard } from './UpsellCard.js';
import styles from './CartScreen.module.css';

interface CartScreenProps {
  locale: Locale;
  quote: QuoteResponse | null;
  quotedByLine: Map<string, QuotedLine>;
  loading: boolean;
  errorCode: string | null;
  reconciled: boolean;
  /** Lines kept but needing a modifier re-pick (an option went 86 — FR-2.7). */
  reconfigureLineIds: string[];
  onEditLine: (line: CartLine) => void;
  onCheckout: () => void;
  onBack: () => void;
}

export function CartScreen({
  locale,
  quote,
  quotedByLine,
  loading,
  errorCode,
  reconciled,
  reconfigureLineIds,
  onEditLine,
  onCheckout,
  onBack,
}: CartScreenProps): React.JSX.Element {
  const { t } = useT();
  const session = useReadySession();
  const cart = useCart();
  const upsell = useUpsell();
  const [upsellHidden, setUpsellHidden] = useState(false);
  const needsReconfigure = new Set(reconfigureLineIds);

  if (cart.count === 0) {
    return (
      <Screen header={<WebviewHeader title={t('cart.title')} onBack={onBack} />}>
        <Alert tone="info" title={t('cart.empty')}>
          {t('cart.emptyBody')}
        </Alert>
      </Screen>
    );
  }

  const total = quote?.totalMinor ?? null;
  const canCheckout =
    session.store.isOpen &&
    quote != null &&
    quote.unavailable.length === 0 &&
    needsReconfigure.size === 0;

  return (
    <Screen
      header={<WebviewHeader title={t('cart.title')} onBack={onBack} />}
      footer={
        <StickyBar>
          <Button
            variant="espresso"
            size="lg"
            fullWidth
            spread
            disabled={!canCheckout}
            onClick={onCheckout}
          >
            <span className={styles.ctaText}>{t('cart.reviewOrder')}</span>
            <span className={styles.ctaRight}>
              {total != null ? <Price minor={total} tone="inherit" /> : <Spinner size={16} />}
              <Icon name="arrow-forward" size={18} />
            </span>
          </Button>
        </StickyBar>
      }
    >
      <Stack gap="sm">
        {reconciled ? (
          <Alert tone="warning" title={t('cart.unavailableTitle')}>
            {t('cart.unavailableBody')}
          </Alert>
        ) : null}
        {needsReconfigure.size > 0 ? (
          <Alert tone="warning" title={t('cart.reconfigureTitle')}>
            {t('cart.reconfigureBody')}
          </Alert>
        ) : null}
        {errorCode && !loading ? (
          <ErrorAlert messageKey={`error.${errorCode}` as MessageKey} />
        ) : null}

        {cart.lines.map((line) => (
          <CartLineRow
            key={line.lineId}
            line={line}
            locale={locale}
            needsReconfigure={needsReconfigure.has(line.lineId)}
            lineTotalMinor={quotedByLine.get(line.lineId)?.lineTotalMinor ?? null}
            onRemove={() => cart.removeLine(line.lineId)}
            onStep={(qty) => cart.setQty(line.lineId, qty)}
            onEdit={() => onEditLine(line)}
          />
        ))}

        {upsell && !upsellHidden ? (
          <UpsellCard
            item={upsell}
            locale={locale}
            onAdd={() => {
              cart.addLine(simpleCartLine(upsell));
              markUpsellSeen();
              setUpsellHidden(true);
            }}
            onDismiss={() => {
              markUpsellSeen();
              setUpsellHidden(true);
            }}
          />
        ) : null}

        {session.customer.tier != null && quote != null ? (
          <LoyaltyCallout
            locale={locale}
            pointsToEarn={quote.loyalty.pointsToEarn}
            pointsToNextTier={session.customer.pointsToNextTier}
          />
        ) : null}

        <OrderSummary locale={locale} quote={quote} loading={loading} />
      </Stack>
    </Screen>
  );
}

function CartLineRow({
  line,
  locale,
  lineTotalMinor,
  needsReconfigure,
  onRemove,
  onStep,
  onEdit,
}: {
  line: CartLine;
  locale: Locale;
  lineTotalMinor: number | null;
  needsReconfigure: boolean;
  onRemove: () => void;
  onStep: (qty: number) => void;
  onEdit: () => void;
}): React.JSX.Element {
  const { t } = useT();
  const name = locale === 'ar-EG' && line.nameAr ? line.nameAr : line.nameEn;
  return (
    <Card tone="raised" pad="md">
      <div className={styles.row}>
        <span className={styles.thumb}>
          {line.imageUrl ? (
            <img src={menuImageSource(line.imageUrl)} alt="" />
          ) : (
            <Icon name="local-cafe" size={20} />
          )}
        </span>
        <div className={styles.rowBody}>
          <div className={styles.rowTop}>
            <button type="button" className={styles.name} onClick={onEdit}>
              {name}
            </button>
            <IconButton
              icon="close"
              label={t('cart.remove', { name })}
              onClick={onRemove}
              size={16}
            />
          </div>
          {line.modifierSummary ? <p className={styles.mods}>{line.modifierSummary}</p> : null}
          {needsReconfigure ? (
            <button type="button" className={styles.reconfigure} onClick={onEdit}>
              <Icon name="info" size={14} />
              {t('cart.reconfigureLine')}
            </button>
          ) : null}
          <div className={styles.rowBottom}>
            {lineTotalMinor != null ? <Price minor={lineTotalMinor} tone="accent" /> : null}
            <div className={styles.stepper}>
              <IconButton
                icon="remove"
                label={t('common.close')}
                size={14}
                tone="surface"
                onClick={() => onStep(line.qty - 1)}
              />
              <span className={styles.qty}>{line.qty}</span>
              <IconButton
                icon="add"
                label={t('menu.add')}
                size={14}
                tone="surface"
                onClick={() => onStep(line.qty + 1)}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LoyaltyCallout({
  locale,
  pointsToEarn,
  pointsToNextTier,
}: {
  locale: Locale;
  pointsToEarn: number;
  pointsToNextTier: number | null;
}): React.JSX.Element {
  return (
    <Card tone="flat" pad="sm">
      <div className={styles.loyalty}>
        <Badge tone="secondary" icon="star">
          {translate(locale, 'loyalty.earnOnCollection', { points: pointsToEarn })}
        </Badge>
        {pointsToNextTier != null ? (
          <span className={styles.loyaltyHint}>
            {translate(locale, 'loyalty.toNextTier', {
              points: pointsToNextTier,
              tier: translate(locale, 'loyalty.tier.gold'),
            })}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function OrderSummary({
  locale,
  quote,
  loading,
}: {
  locale: Locale;
  quote: QuoteResponse | null;
  loading: boolean;
}): React.JSX.Element {
  const { t } = useT();
  const waivedMinor =
    quote?.lines.reduce(
      (sum, l) =>
        sum + l.modifiers.filter((m) => m.waivedByTier).reduce((s, m) => s + m.priceDeltaMinor, 0),
      0,
    ) ?? 0;

  return (
    <Card tone="raised" pad="md">
      <h3 className={styles.summaryTitle}>{t('cart.summary')}</h3>
      <div className={styles.summaryRow}>
        <span>{t('cart.subtotal')}</span>
        {quote ? (
          <Price minor={quote.subtotalMinor} tone="default" size="md" />
        ) : (
          <Spinner size={14} />
        )}
      </div>
      {waivedMinor > 0 ? (
        <div className={styles.summaryRow}>
          <span className={styles.perk}>
            <Icon name="verified" size={14} />
            {translate(locale, 'cart.tierPerk', { tier: translate(locale, 'loyalty.tier.silver') })}
          </span>
          <span className={styles.perkValue}>
            −<Price minor={waivedMinor} tone="accent" size="sm" />
          </span>
        </div>
      ) : null}
      <div className={styles.divider} />
      <div className={styles.summaryTotal}>
        <span>{t('cart.total')}</span>
        {quote ? (
          <Price minor={quote.totalMinor} tone="accent" size="lg" />
        ) : loading ? (
          <Spinner size={16} />
        ) : null}
      </div>
      <div className={styles.payNote}>
        <Icon name="storefront" size={16} />
        {t('cart.payAtCounter')}
      </div>
    </Card>
  );
}
