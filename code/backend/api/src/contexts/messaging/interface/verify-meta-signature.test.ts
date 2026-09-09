import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from './verify-meta-signature.js';

describe('verifyMetaSignature', () => {
  it('accepts only the signature of the original raw bytes', () => {
    const body = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, signature, 'secret')).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{ "entry": [] }'), signature, 'secret')).toBe(false);
  });
});
