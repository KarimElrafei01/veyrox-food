import { formatMoney } from '@veyroxai/i18n';
import { useT } from '../../react/LocaleProvider.js';
import styles from './Price.module.css';

interface PriceProps {
  minor: number;
  compact?: boolean;
  tone?: 'default' | 'accent' | 'muted' | 'inherit';
  size?: 'sm' | 'md' | 'lg';
  strikethrough?: boolean;
}

export function Price({
  minor,
  compact = true,
  tone = 'default',
  size = 'md',
  strikethrough = false,
}: PriceProps): React.JSX.Element {
  const { locale } = useT();
  return (
    <span
      className={[styles.price, styles[tone], styles[size], strikethrough ? styles.strike : '']
        .filter(Boolean)
        .join(' ')}
    >
      {formatMoney(minor, locale, { compact })}
    </span>
  );
}
