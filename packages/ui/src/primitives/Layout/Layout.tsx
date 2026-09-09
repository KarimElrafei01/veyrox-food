import styles from './Layout.module.css';

type Gap = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Vertical flow with a token gap. */
export function Stack({
  gap = 'md',
  className,
  children,
  ...rest
}: { gap?: Gap } & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={[styles.stack, className ?? ''].filter(Boolean).join(' ')}
      style={{ gap: `var(--vx-space-${gap})` }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Horizontal flow; wraps by default, RTL-safe. */
export function Inline({
  gap = 'xs',
  align = 'center',
  justify = 'start',
  wrap = false,
  className,
  children,
  ...rest
}: {
  gap?: Gap;
  align?: 'start' | 'center' | 'end' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
} & React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={[styles.inline, className ?? ''].filter(Boolean).join(' ')}
      style={{
        gap: `var(--vx-space-${gap})`,
        alignItems: align,
        justifyContent: justify === 'between' ? 'space-between' : `flex-${justify}`,
        flexWrap: wrap ? 'wrap' : 'nowrap',
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * The webview page frame: a 480px column centred on wide screens, a sticky header
 * slot, a scrolling body, and a sticky footer slot that respects the safe area.
 */
export function Screen({
  header,
  footer,
  children,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className={styles.screen}>
      <div className={styles.column}>
        {header ? <div className={styles.header}>{header}</div> : null}
        <main className={styles.body}>{children}</main>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

/** A pinned action row at the bottom of a Screen. */
export function StickyBar({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className={styles.stickyBar}>{children}</div>;
}
