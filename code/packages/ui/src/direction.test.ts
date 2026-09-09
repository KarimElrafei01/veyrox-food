import { describe, expect, it } from 'vitest';
import { physicalSide } from './index.js';

describe('physicalSide', () => {
  it('maps start/end to left/right per direction', () => {
    expect(physicalSide('start', 'ltr')).toBe('left');
    expect(physicalSide('end', 'ltr')).toBe('right');
    expect(physicalSide('start', 'rtl')).toBe('right');
    expect(physicalSide('end', 'rtl')).toBe('left');
  });
});
