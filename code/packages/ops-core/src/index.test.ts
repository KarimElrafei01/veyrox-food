import { describe, expect, it } from 'vitest';
import {
  connectStaffStream,
  clearStoredStaffSession,
  readStoredStaffSession,
  storeStaffSession,
} from './index.js';

describe('workspace wiring', () => {
  it('exports the SSE client and staff-session helpers', () => {
    expect(typeof connectStaffStream).toBe('function');
    expect(typeof readStoredStaffSession).toBe('function');
    expect(typeof storeStaffSession).toBe('function');
    expect(typeof clearStoredStaffSession).toBe('function');
  });
});
