import styles from './Chip.module.css';

interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

export function Chip({ active = false, onClick, children }: ChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={[styles.chip, active ? styles.active : styles.inactive].join(' ')}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
