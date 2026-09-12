import { beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapStaffSessionFromUrl,
  clearStoredStaffSession,
  readStoredStaffSession,
  storeStaffSession,
} from './staff-session.js';

beforeEach(() => {
  localStorage.clear();
});

describe('staff session storage', () => {
  it('returns null when nothing is stored', () => {
    expect(readStoredStaffSession()).toBeNull();
  });

  it('round-trips a stored session', () => {
    storeStaffSession({ deviceToken: 'dt', pinToken: 'pt' });
    expect(readStoredStaffSession()).toEqual({ deviceToken: 'dt', pinToken: 'pt' });
  });

  it('treats a partial session (only one token stored) as no session', () => {
    localStorage.setItem('vx.staff.device-token', 'dt');
    expect(readStoredStaffSession()).toBeNull();
  });

  it('clears both tokens', () => {
    storeStaffSession({ deviceToken: 'dt', pinToken: 'pt' });
    clearStoredStaffSession();
    expect(readStoredStaffSession()).toBeNull();
  });
});

describe('bootstrapStaffSessionFromUrl', () => {
  it('stores both tokens from ?device=&pin= and strips them from the URL', () => {
    window.history.replaceState(null, '', '/board?device=dt&pin=pt&foo=bar');
    bootstrapStaffSessionFromUrl(window.location);

    expect(readStoredStaffSession()).toEqual({ deviceToken: 'dt', pinToken: 'pt' });
    expect(window.location.search).toBe('?foo=bar');
  });

  it('does nothing when neither param is present', () => {
    window.history.replaceState(null, '', '/board');
    bootstrapStaffSessionFromUrl(window.location);
    expect(readStoredStaffSession()).toBeNull();
  });

  it('updating just the pin keeps the previously stored device token', () => {
    storeStaffSession({ deviceToken: 'dt', pinToken: 'old-pin' });
    window.history.replaceState(null, '', '/board?pin=new-pin');
    bootstrapStaffSessionFromUrl(window.location);
    expect(readStoredStaffSession()).toEqual({ deviceToken: 'dt', pinToken: 'new-pin' });
  });
});
