import styles from './ProgressTracker.module.css';
import { Icon, type IconName } from '../../icons/Icon.js';

export interface ProgressStep {
  key: string;
  label: string;
  icon: IconName;
}

interface ProgressTrackerProps {
  steps: ProgressStep[];
  /** Index of the current step. Earlier steps render done, later steps pending. */
  activeIndex: number;
}

export function ProgressTracker({ steps, activeIndex }: ProgressTrackerProps): React.JSX.Element {
  return (
    <ol className={styles.track}>
      {steps.map((step, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
        return (
          <li key={step.key} className={styles.step} data-state={state}>
            <span className={styles.node}>
              <Icon name={i < activeIndex ? 'check' : step.icon} size={16} />
            </span>
            <span className={styles.label}>{step.label}</span>
            {i < steps.length - 1 ? <span className={styles.bar} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
