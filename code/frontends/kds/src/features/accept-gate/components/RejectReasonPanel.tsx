import { useT } from '@veyroxai/ui';
import type { MessageKey } from '@veyroxai/i18n';
import type { RejectOrderRequest } from '@veyroxai/contracts';
import { REJECT_REASONS } from '../usecases/rejectReasons.js';
import styles from './RejectReasonPanel.module.css';

const REASON_LABEL_KEYS: Record<RejectOrderRequest['reasonCode'], MessageKey> = {
  too_busy: 'kds.acceptGate.reasonTooBusy',
  item_unavailable: 'kds.acceptGate.reasonItemUnavailable',
  closing: 'kds.acceptGate.reasonClosing',
};

/** §2.2: a reason chip *is* the confirmation - tapping one fires the reject
 *  mutation immediately, no further dialog. */
export function RejectReasonPanel({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (reasonCode: RejectOrderRequest['reasonCode']) => void;
}): React.JSX.Element {
  const { t } = useT();
  return (
    <div className={styles.panel}>
      <span className={styles.prompt}>{t('kds.acceptGate.rejectReasonPrompt')}</span>
      <div className={styles.chips}>
        {REJECT_REASONS.map((reasonCode) => (
          <button
            key={reasonCode}
            type="button"
            className={styles.chip}
            disabled={disabled}
            onClick={() => onPick(reasonCode)}
          >
            {t(REASON_LABEL_KEYS[reasonCode])}
          </button>
        ))}
      </div>
    </div>
  );
}
