import { useT } from '@veyroxai/ui';
import { Icon } from '@veyroxai/ui';
import type { OrderTicket } from '@veyroxai/contracts';
import styles from './ItemLine.module.css';
import { nameOf } from './nameOf.js';

type Item = OrderTicket['items'][number];

/** One order line + its modifiers (§1.2). Tapping toggles completion only -
 *  `stopPropagation` from the card's own advance-on-tap handler (§1.3). */
export function ItemLine({
  item,
  onToggle,
}: {
  item: Item;
  onToggle: (ticked: boolean) => void;
}): React.JSX.Element {
  const { locale } = useT();
  return (
    <div
      className={[styles.line, item.ticked ? styles.ticked : ''].filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(!item.ticked);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
          event.preventDefault();
          onToggle(!item.ticked);
        }
      }}
    >
      <div>
        <span className={styles.name}>
          {item.qty}× {nameOf(item.nameSnapshot, locale)}
        </span>
        {item.modifiers.length > 0 && (
          <ul className={styles.modifiers}>
            {item.modifiers.map((modifier, index) =>
              modifier.isAllergenFlag ? (
                <li key={index} className={styles.allergen}>
                  <Icon name="warning" size={14} />
                  {nameOf(modifier.nameSnapshot, locale)}
                </li>
              ) : (
                <li key={index} className={styles.modifier}>
                  {nameOf(modifier.nameSnapshot, locale)}
                </li>
              ),
            )}
          </ul>
        )}
        {item.allergenNote && (
          // §0.5: allergen content is never a soft outline/plain-text chip -
          // same inverted high-contrast treatment as a modifier's own
          // isAllergenFlag, so a missed allergy note can't blend into the
          // regular modifier list at a glance.
          <ul className={styles.modifiers}>
            <li className={styles.allergen}>
              <Icon name="warning" size={14} />
              {item.allergenNote}
            </li>
          </ul>
        )}
      </div>
      {item.ticked && <Icon name="check" size={16} />}
    </div>
  );
}
