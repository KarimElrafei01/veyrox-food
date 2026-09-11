import { Icon, useT } from '@veyroxai/ui';
import styles from './ActiveOrderBanner.module.css';

type OpenOrderStatus = 'placed' | 'received' | 'preparing' | 'ready';

const STATUS_KEY: Record<
  OpenOrderStatus,
  'status.stepPlaced' | 'status.stepAccepted' | 'status.stepPreparing' | 'status.stepReady'
> = {
  placed: 'status.stepPlaced',
  received: 'status.stepAccepted',
  preparing: 'status.stepPreparing',
  ready: 'status.stepReady',
};

/** Stays reachable while browsing with an order already in progress (FR-2.23) —
 *  sticky rather than in-flow so scrolling the menu never hides the way back. */
export function ActiveOrderBanner({
  orderNumber,
  status,
  onClick,
}: {
  orderNumber: string;
  status: OpenOrderStatus;
  onClick: () => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <button type="button" className={styles.banner} onClick={onClick}>
      <span className={styles.icon}>
        <Icon name="shopping-bag" size={18} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{t('menu.activeOrderTitle')}</span>
        <span className={styles.detail}>
          {/* dir="ltr": "#A-27" must not let the bidi algorithm move the neutral
              "#" to the wrong side under an RTL page. */}
          <span dir="ltr">#{orderNumber}</span> · {t(STATUS_KEY[status])}
        </span>
      </span>
      <Icon name="arrow-forward" size={18} />
    </button>
  );
}
