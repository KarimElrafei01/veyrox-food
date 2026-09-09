import { useCallback, useSyncExternalStore } from 'react';

export type RouteName =
  'entry' | 'menu' | 'item' | 'cart' | 'checkout' | 'status' | 'dev' | 'notFound';

export interface Route {
  name: RouteName;
  params: Record<string, string>;
  path: string;
}

const PATTERNS: { name: RouteName; re: RegExp; keys: string[] }[] = [
  { name: 'entry', re: /^\/(?:s\/([^/]+))?$/, keys: ['token'] },
  { name: 'menu', re: /^\/menu$/, keys: [] },
  { name: 'item', re: /^\/item\/([^/]+)$/, keys: ['itemId'] },
  { name: 'cart', re: /^\/cart$/, keys: [] },
  { name: 'checkout', re: /^\/checkout$/, keys: [] },
  { name: 'status', re: /^\/o\/([^/]+)$/, keys: ['orderId'] },
  { name: 'dev', re: /^\/dev$/, keys: [] },
];

export function matchRoute(pathname: string): Route {
  for (const { name, re, keys } of PATTERNS) {
    const m = re.exec(pathname);
    if (m) {
      const params: Record<string, string> = {};
      keys.forEach((key, i) => {
        const v = m[i + 1];
        if (v) {
          params[key] = decodeURIComponent(v);
        }
      });
      return { name, params, path: pathname };
    }
  }
  return { name: 'notFound', params: {}, path: pathname };
}

// — history store —

const listeners = new Set<() => void>();
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  window.addEventListener('popstate', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('popstate', fn);
  };
}
function emit(): void {
  listeners.forEach((fn) => fn());
}
function snapshot(): string {
  return window.location.pathname;
}

export function useRoute(): Route & {
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  back: () => void;
} {
  const pathname = useSyncExternalStore(subscribe, snapshot, () => '/');

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      window.history.replaceState(null, '', to);
    } else {
      window.history.pushState(null, '', to);
    }
    emit();
  }, []);

  const back = useCallback(() => window.history.back(), []);

  return { ...matchRoute(pathname), navigate, back };
}
