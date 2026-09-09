/**
 * A fixed corner button, shown only after a session was opened from the dev
 * picker (a `sessionStorage` flag set by `DevLoginScreen`'s onPick). Clears the
 * flag and returns to the picker so you can switch café/customer.
 */
export function isDevSession(): boolean {
  try {
    return sessionStorage.getItem('vx.dev') === '1';
  } catch {
    return false;
  }
}

export function DevSwitcher(): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.removeItem('vx.dev');
        } catch {
          /* private mode */
        }
        window.location.assign('/');
      }}
      style={{
        position: 'fixed',
        insetBlockEnd: 'var(--vx-space-sm)',
        insetInlineEnd: 'var(--vx-space-sm)',
        zIndex: 9999,
        padding: 'var(--vx-space-2xs) var(--vx-space-sm)',
        borderRadius: '999px',
        border: '1px solid var(--vx-outline)',
        background: 'var(--vx-surface)',
        color: 'var(--vx-on-surface-variant)',
        font: 'inherit',
        fontSize: 'var(--vx-text-label-sm)',
      }}
    >
      DEV · switch user
    </button>
  );
}
