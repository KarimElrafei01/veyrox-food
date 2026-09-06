import styles from './Button.module.css';
import { Icon, type IconName } from '../../icons/Icon.js';
import { Spinner } from '../Spinner/Spinner.js';

type Variant = 'primary' | 'espresso' | 'outline' | 'ghost';
type Size = 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  iconStart?: IconName;
  iconEnd?: IconName;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  iconStart,
  iconEnd,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={[
        styles.button,
        styles[variant],
        styles[size],
        fullWidth ? styles.full : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : iconStart ? <Icon name={iconStart} size={20} /> : null}
      {children != null && <span className={styles.label}>{children}</span>}
      {!loading && iconEnd ? <Icon name={iconEnd} size={20} /> : null}
    </button>
  );
}
