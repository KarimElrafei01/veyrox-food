import styles from './Spinner.module.css';

export function Spinner({
  size = 20,
  label,
}: {
  size?: number;
  label?: string;
}): React.JSX.Element {
  return (
    <span
      className={styles.spinner}
      style={{ inlineSize: size, blockSize: size }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
