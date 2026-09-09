import { expect, it } from 'vitest';
import { OPS_CORE_PLACEHOLDER } from './index.js';

it('is wired into the workspace', () => {
  expect(OPS_CORE_PLACEHOLDER).toBe(true);
});
