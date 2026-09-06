import styles from './Badge.module.css';
import { Icon, type IconName } from '../../icons/Icon.js';

type Tone = 'neutral' | 'secondary' | 'success' | 'warning' | 'danger' | 'loyalty';

interface BadgeProps {
  tone?: Tone;
  icon?: IconName;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', icon, children }: BadgeProps): React.JSX.Element {
  return (
    <span className={[styles.badge, styles[tone]].join(' ')}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}
