import { useT } from '@veyroxai/ui';
import type { ColumnKey } from '../usecases/boardState.js';
import styles from './ColumnHeader.module.css';

const DOT_COLOR: Record<ColumnKey, string> = {
  new: 'var(--vx-age-amber)',
  received: 'var(--vx-age-green)',
  preparing: 'var(--vx-age-red)',
  ready: 'var(--vx-age-green)',
};

const LABEL_KEY: Record<
  ColumnKey,
  'kds.column.new' | 'kds.column.received' | 'kds.column.preparing' | 'kds.column.ready'
> = {
  new: 'kds.column.new',
  received: 'kds.column.received',
  preparing: 'kds.column.preparing',
  ready: 'kds.column.ready',
};

export function ColumnHeader({
  column,
  count,
}: {
  column: ColumnKey;
  count: number;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        <span className={styles.dot} style={{ background: DOT_COLOR[column] }} aria-hidden />
        <h2 className={styles.title}>{t(LABEL_KEY[column])}</h2>
      </div>
      <span className={styles.count}>{count}</span>
    </div>
  );
}
