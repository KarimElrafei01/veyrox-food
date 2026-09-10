import { Button, Icon, Price, useT } from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import type { MenuItem } from '@veyroxai/contracts';
import styles from './UpsellCard.module.css';

/**
 * The single add-on suggestion inside the cart (FR-2.12, design 2.3). A gentle inline
 * panel — not a modal, not a white Card — shown once per session. `useUpsell` decides
 * whether to render it at all; this component just presents it.
 */
export function UpsellCard({
  item,
  locale,
  onAdd,
  onDismiss,
}: {
  item: MenuItem;
  locale: Locale;
  onAdd: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useT();
  const name = (locale === 'ar-EG' && item.name['ar-EG']) || item.name.en;

  return (
    <aside className={styles.panel} aria-label={t('cart.freshPairing')}>
      <span className={styles.thumb}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" />
        ) : (
          <Icon name="restaurant-menu" size={22} />
        )}
      </span>

      <div className={styles.body}>
        <span className={styles.tag}>{t('cart.freshPairing')}</span>
        <span className={styles.name}>{name}</span>
        <span className={styles.price}>
          +&nbsp;
          <Price minor={item.basePriceMinor} tone="accent" size="sm" />
        </span>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" size="md" iconStart="add" onClick={onAdd}>
          {t('menu.add')}
        </Button>
        <button type="button" className={styles.dismiss} onClick={onDismiss}>
          {t('cart.noThanks')}
        </button>
      </div>
    </aside>
  );
}
