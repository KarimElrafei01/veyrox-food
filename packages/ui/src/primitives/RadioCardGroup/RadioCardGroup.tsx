import styles from './RadioCardGroup.module.css';

export interface RadioCardOption {
  value: string;
  label: string;
  description?: string;
  /** Right-aligned adornment (price delta, "Base", a badge). */
  trailing?: React.ReactNode;
  disabled?: boolean;
}

interface RadioCardGroupProps {
  name: string;
  legend: string;
  hint?: string;
  error?: string;
  options: RadioCardOption[];
  value: string | null;
  onChange: (value: string) => void;
  layout?: 'stack' | 'grid';
}

export function RadioCardGroup({
  name,
  legend,
  hint,
  error,
  options,
  value,
  onChange,
  layout = 'stack',
}: RadioCardGroupProps): React.JSX.Element {
  return (
    <fieldset className={styles.group}>
      <div className={styles.header}>
        <legend className={styles.legend}>{legend}</legend>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={layout === 'grid' ? styles.grid : styles.stack}>
        {options.map((opt) => (
          <label
            key={opt.value}
            className={[styles.option, opt.disabled ? styles.disabled : '']
              .filter(Boolean)
              .join(' ')}
            data-selected={value === opt.value || undefined}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              className={styles.input}
            />
            <span className={styles.body}>
              <span className={styles.label}>{opt.label}</span>
              {opt.description ? (
                <span className={styles.description}>{opt.description}</span>
              ) : null}
            </span>
            {opt.trailing != null && <span className={styles.trailing}>{opt.trailing}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
