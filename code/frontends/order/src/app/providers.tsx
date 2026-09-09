import { LocaleProvider, ThemeProvider } from '@veyroxai/ui';
import { SessionProvider } from '../shared/session-context.js';

export function Providers({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <SessionProvider>{children}</SessionProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
