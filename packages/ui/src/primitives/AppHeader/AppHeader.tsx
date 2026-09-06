import styles from './AppHeader.module.css';
import { Icon } from '../../icons/Icon.js';
import { IconButton } from '../IconButton/IconButton.js';

interface AppHeaderProps {
  storeName: string;
  title: string;
  subtitle?: string;
  /** e.g. "Silver · 320 pts" */
  loyaltyLabel?: string;
  languageLabel: string;
  onToggleLanguage: () => void;
  onBack?: () => void;
  backLabel?: string;
  closeLabel: string;
  onClose?: () => void;
}

export function AppHeader({
  storeName,
  title,
  subtitle,
  loyaltyLabel,
  languageLabel,
  onToggleLanguage,
  onBack,
  backLabel,
  closeLabel,
  onClose,
}: AppHeaderProps): React.JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.row}>
        {onBack ? (
          <IconButton icon="arrow-back" label={backLabel ?? 'Back'} onClick={onBack} />
        ) : (
          <IconButton icon="close" label={closeLabel} onClick={onClose} />
        )}
        <span className={styles.store}>
          <Icon name="lock" size={13} />
          {storeName}
        </span>
        <button type="button" className={styles.lang} onClick={onToggleLanguage}>
          {languageLabel}
        </button>
      </div>
      <div className={styles.row}>
        <span className={styles.titleBlock}>
          <span className={styles.title}>{title}</span>
          {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
        </span>
        {loyaltyLabel ? (
          <span className={styles.loyalty}>
            <Icon name="loyalty" size={14} />
            {loyaltyLabel}
          </span>
        ) : null}
      </div>
    </header>
  );
}
