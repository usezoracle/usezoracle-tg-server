import { describe, it, expect } from 'vitest';
import { decodeTransactionInput, detectBuyAndToken } from '../lib/txParsing.js';

describe('txParsing', () => {
  it('decodes unknown safely', () => {
    const res = decodeTransactionInput('0x');
    expect(res.method).toBe('unknown');
  });

  it('detects swap selector and heuristics', () => {
    const fake = '0x7ff36ab5' + '0'.repeat(64 * 5);
    const d = detectBuyAndToken(fake);
    expect(d.isSwap).toBe(true);
    expect(d.isBuy).toBe(true);
  });
});
