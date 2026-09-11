import { menuResponse, type MenuResponse } from '@veyroxai/contracts';
import { menuImageSource } from '../../../shared/menu-image.js';

const CACHE_NAME = 'veyrox-public-menu-v1';

function cacheAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window;
}

function requestFor(path: string): Request {
  return new Request(new URL(path, import.meta.env.VITE_API_BASE_URL ?? window.location.origin));
}

export async function readCachedMenu(menuLink: string): Promise<MenuResponse | null> {
  if (!cacheAvailable()) {
    return null;
  }

  try {
    const response = await caches.match(requestFor(menuLink));
    return response ? menuResponse.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

/** The menu version makes these cache entries immutable and safe to retain. */
export async function cacheMenu(menuLink: string, menu: MenuResponse): Promise<void> {
  if (!cacheAvailable()) {
    return;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      requestFor(menuLink),
      new Response(JSON.stringify(menu), { headers: { 'Content-Type': 'application/json' } }),
    );
    await Promise.allSettled(
      menu.categories
        .flatMap((category) => category.items)
        .flatMap((item) => (item.imageUrl ? [menuImageSource(item.imageUrl)] : []))
        .map(async (imageUrl) => {
          const request = new Request(imageUrl);
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response);
          }
        }),
    );
  } catch {
    // Caching is progressive enhancement; a private webview can still order online.
  }
}
