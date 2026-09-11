import { useEffect, useState } from 'react';
import { formatCountdown } from '@veyroxai/i18n';
import styles from './CountdownClock.module.css';

/**
 * Boxed HH:MM:SS, ticking every second (design 2.8's "Opens In" countdown). Shared
 * between the closed interstitial and the menu's persistent closed banner —
 * `shared/ui`, not a feature folder, since both features need it (ADR-0018).
 */
export function CountdownClock({ deadlineMs }: { deadlineMs: number }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const parts = formatCountdown(deadlineMs - now).split(':');
  return (
    // A countdown reads hours:minutes:seconds regardless of page direction —
    // flexbox otherwise mirrors this row under dir="rtl" and reverses the digits.
    <span className={styles.digits} dir="ltr">
      {parts.map((part, i) => (
        <span key={i} className={styles.group}>
          {i > 0 ? <span className={styles.colon}>:</span> : null}
          <span className={styles.box}>{part}</span>
        </span>
      ))}
    </span>
  );
}
