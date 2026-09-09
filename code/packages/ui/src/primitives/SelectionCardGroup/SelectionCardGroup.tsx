import styles from './SelectionCardGroup.module.css';

export interface SelectionCardOption {
  value: string;
  label: string;
  description?: string;
  /** Right-aligned adornment (price delta, "Base", a badge). */
  trailing?: React.ReactNode;
  disabled?: boolean;
}

interface SelectionCardGroupProps {
  name: string;
  legend: string;
  /** `single` renders radios and enforces one choice; `multi` renders checkboxes. */
  mode: 'single' | 'multi';
  hint?: string;
  error?: string;
  options: SelectionCardOption[];
  /** Selected option ids — always an array, one entry for `single`. */
  value: string[];
  /** Called with the toggled option id. The caller applies the min/max rule. */
  onToggle: (value: string) => void;
  layout?: 'stack' | 'grid';
}

export function SelectionCardGroup({
  name,
  legend,
  mode,
  hint,
  error,
  options,
  value,
  onToggle,
  layout = 'stack',
}: SelectionCardGroupProps): React.JSX.Element {
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
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={[styles.option, opt.disabled ? styles.disabled : '']
                .filter(Boolean)
                .join(' ')}
              data-selected={selected || undefined}
            >
              <input
                type={mode === 'single' ? 'radio' : 'checkbox'}
                name={name}
                value={opt.value}
                checked={selected}
                disabled={opt.disabled}
                onChange={() => onToggle(opt.value)}
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
          );
        })}
      </div>
    </fieldset>
  );
}
