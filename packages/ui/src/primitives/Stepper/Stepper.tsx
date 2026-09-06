import styles from './Stepper.module.css';
import { Icon } from '../../icons/Icon.js';

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  /** Accessible names — pass localized strings. */
  decreaseLabel: string;
  increaseLabel: string;
  size?: 'sm' | 'md';
}

export function Stepper({
  value,
  min = 1,
  max = 20,
  onChange,
  decreaseLabel,
  increaseLabel,
  size = 'md',
}: StepperProps): React.JSX.Element {
  return (
    <div className={[styles.stepper, styles[size]].join(' ')} role="group">
      <button
        type="button"
        className={styles.btn}
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Icon name="remove" size={16} />
      </button>
      <span className={styles.value} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={[styles.btn, styles.plus].join(' ')}
        aria-label={increaseLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Icon name="add" size={16} />
      </button>
    </div>
  );
}
