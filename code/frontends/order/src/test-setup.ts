import { afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Each test starts from a clean per-viewer state — LocaleProvider/ThemeProvider
// and the cart store all read localStorage/sessionStorage.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  document.documentElement.removeAttribute('dir');
  document.documentElement.removeAttribute('lang');
});
