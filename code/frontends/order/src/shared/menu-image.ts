/**
 * Menu responses may carry an API-relative R2 proxy path. Resolve it once at
 * the client boundary so an image does not disappear after navigation.
 */
export function menuImageSource(imageUrl: string): string {
  if (/^https?:\/\//.test(imageUrl)) {
    return imageUrl;
  }

  return new URL(imageUrl, import.meta.env.VITE_API_BASE_URL ?? window.location.origin).toString();
}
