import styles from './Feedback.module.css';
import { Icon, type IconName } from '../../icons/Icon.js';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE_ICON: Record<Tone, IconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'info',
  danger: 'info',
};

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={[styles.alert, styles[tone]].join(' ')} role="status">
      <Icon name={TONE_ICON[tone]} size={18} />
      <span className={styles.alertBody}>
        {title ? <strong>{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  titleSecondary,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  /** The other language's headline, shown under the title (design 2.7–2.9). */
  titleSecondary?: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={28} />
      </span>
      <h2 className={styles.emptyTitle}>{title}</h2>
      {titleSecondary ? (
        <p className={styles.emptyTitleSecondary} dir="auto">
          {titleSecondary}
        </p>
      ) : null}
      {body ? <p className={styles.emptyBody}>{body}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 'var(--vx-radius)',
}: {
  height?: number | string;
  width?: number | string;
  radius?: string;
}): React.JSX.Element {
  return (
    <span
      className={styles.skeleton}
      style={{ blockSize: height, inlineSize: width, borderRadius: radius }}
      aria-hidden
    />
  );
}

export function StatusDot({ pulse = false }: { pulse?: boolean }): React.JSX.Element {
  return (
    <span
      className={[styles.dot, pulse ? styles.pulse : ''].filter(Boolean).join(' ')}
      aria-hidden
    />
  );
}
