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
  /** Push children apart (label at the start, a trailing price/chevron at the end). */
  spread?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading = false,
  iconStart,
  iconEnd,
  spread = false,
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
        spread ? styles.spread : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : iconStart ? <Icon name={iconStart} size={20} /> : null}
      {children != null && (spread ? children : <span className={styles.label}>{children}</span>)}
      {!loading && iconEnd ? <Icon name={iconEnd} size={20} /> : null}
    </button>
  );
}
