import { useId } from 'react';
import styles from './Field.module.css';

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  /** Render prop receives the id to wire to the control. */
  children: (id: string) => React.ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        <span>{label}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </label>
      {children(id)}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const { className, ...rest } = props;
  return <input className={[styles.input, className ?? ''].filter(Boolean).join(' ')} {...rest} />;
}
