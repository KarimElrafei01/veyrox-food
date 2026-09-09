import { Badge, Button, Icon, Price, Stepper, useT } from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import type { ResolvedItem } from '../../../shared/menu-model.js';
import styles from './MenuItemCard.module.css';

function localized(map: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return (locale === 'ar-EG' && map['ar-EG']) || map.en;
}

interface MenuItemCardProps {
  item: ResolvedItem;
  locale: Locale;
  qtyInCart: number;
  onOpen: () => void;
  onQuickAdd: () => void;
  onStep: (qty: number) => void;
}

export function MenuItemCard({
  item,
  locale,
  qtyInCart,
  onOpen,
  onQuickAdd,
  onStep,
}: MenuItemCardProps): React.JSX.Element {
  const { t } = useT();
  const name = localized(item.name, locale);
  const secondary = locale === 'ar-EG' ? item.name.en : item.name['ar-EG'];
  const description = item.description ? localized(item.description, locale) : null;
  const hasModifiers = item.modifierGroupIds.length > 0;

  return (
    <article
      className={[styles.card, item.available ? '' : styles.off].filter(Boolean).join(' ')}
      aria-disabled={!item.available || undefined}
    >
      <button
        type="button"
        className={styles.main}
        onClick={item.available ? onOpen : undefined}
        disabled={!item.available}
      >
        <span className={styles.thumb}>
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" loading="lazy" />
          ) : (
            <Icon name="local-cafe" size={24} />
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          {secondary ? <span className={styles.secondary}>{secondary}</span> : null}
          {description ? <span className={styles.description}>{description}</span> : null}
        </span>
      </button>

      <div className={styles.footer}>
        <div className={styles.priceRow}>
          <Price minor={item.basePriceMinor} tone="accent" size="lg" />
          {!item.available ? (
            <Badge tone="neutral">
              {item.unavailableReason === 'eighty_sixed'
                ? t('menu.soldOut')
                : t('menu.unavailableToday')}
            </Badge>
          ) : null}
        </div>

        {item.available ? (
          qtyInCart > 0 && !hasModifiers ? (
            <Stepper
              value={qtyInCart}
              min={0}
              onChange={onStep}
              decreaseLabel={t('common.close')}
              increaseLabel={t('menu.add')}
              size="sm"
            />
          ) : (
            <Button
              variant="ghost"
              size="md"
              iconStart="add"
              onClick={hasModifiers ? onOpen : onQuickAdd}
            >
              {t('menu.add')}
            </Button>
          )
        ) : (
          <Button variant="ghost" size="md" iconStart="lock" disabled>
            {t('menu.add')}
          </Button>
        )}
      </div>
    </article>
  );
}
