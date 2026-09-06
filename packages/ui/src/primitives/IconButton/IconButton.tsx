import styles from './IconButton.module.css';
import { Icon, type IconName } from '../../icons/Icon.js';

interface IconButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label'
> {
  icon: IconName;
  label: string;
  tone?: 'default' | 'surface';
  size?: number;
}

export function IconButton({
  icon,
  label,
  tone = 'default',
  size = 20,
  className,
  type = 'button',
  ...rest
}: IconButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      aria-label={label}
      className={[styles.iconButton, styles[tone], className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}
