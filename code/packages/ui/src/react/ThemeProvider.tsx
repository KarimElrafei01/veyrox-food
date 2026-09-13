import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** 'kds-industrial' is dark-only and never switched at runtime (kds-industrial.css's
 *  own doc comment) - code/frontends/kds still uses ThemeProvider rather than
 *  hand-rolling a second way to set data-theme, it just never calls setTheme. */
export type ThemeName = 'brew-baladi' | 'kds-industrial';

const STORAGE_KEY = 'vx.theme';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  defaultTheme = 'brew-baladi',
  children,
}: {
  defaultTheme?: ThemeName;
  children: React.ReactNode;
}): React.JSX.Element {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as ThemeName) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* per-viewer convenience only */
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme: setThemeState }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}
