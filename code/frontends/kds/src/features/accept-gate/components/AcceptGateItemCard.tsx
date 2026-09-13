import { Icon, useT } from '@veyroxai/ui';
import type { OrderTicket } from '@veyroxai/contracts';
import { nameOf } from '../../../shared/nameOf.js';
import styles from './AcceptGateItemCard.module.css';

type Item = OrderTicket['items'][number];

/** One item's full detail, per §2.1's item list. The Stitch source also shows
 *  a "target station" badge (GRILL STATION / FRYER 2) per item - the frontend
 *  doc calls that "cosmetic today, no station-routing logic exists in the
 *  domain model yet" and even so ties it to the item's category, which the
 *  `OrderTicket` contract doesn't carry at all (only nameSnapshot/modifiers/
 *  allergenNote - see backend doc §1). There is nothing to derive it from,
 *  so - same §0.3 rule as the board's line-pace pill - it's omitted rather
 *  than invented. */
export function AcceptGateItemCard({ item }: { item: Item }): React.JSX.Element {
  const { locale } = useT();
  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <span className={styles.qtyBadge}>{item.qty}×</span>
        <span className={styles.name}>{nameOf(item.nameSnapshot, locale)}</span>
      </div>
      {(item.modifiers.length > 0 || item.allergenNote) && (
        <div className={styles.chips}>
          {item.modifiers.map((modifier, index) =>
            modifier.isAllergenFlag ? (
              <span key={index} className={styles.allergenChip}>
                <Icon name="warning" size={14} />
                {nameOf(modifier.nameSnapshot, locale)}
              </span>
            ) : (
              <span key={index} className={styles.modifierChip}>
                {nameOf(modifier.nameSnapshot, locale)}
              </span>
            ),
          )}
          {item.allergenNote && (
            <span className={styles.allergenChip}>
              <Icon name="warning" size={14} />
              {item.allergenNote}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
