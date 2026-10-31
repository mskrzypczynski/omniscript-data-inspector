import { fnv1a32, payloadSignature } from '../../../src/core/data/payload-sig.js';
import { pollDelay } from '../../../src/core/data/poll-backoff.js';

describe('fnv1a32', () => {
  it('matches the published FNV-1a vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('hashes UTF-16 code units, so non-ASCII text is stable', () => {
    expect(fnv1a32('zażółć')).toBe(fnv1a32('zażółć'));
    expect(fnv1a32('zażółć')).not.toBe(fnv1a32('zazolc'));
  });
});

describe('payloadSignature', () => {
  it('carries the length so equal hashes of different sizes still differ', () => {
    expect(payloadSignature('{"a":1}')).toMatch(/^7:[0-9a-f]+$/);
    expect(payloadSignature('{"a":1}')).not.toBe(payloadSignature('{"a":2}'));
  });
});

describe('pollDelay', () => {
  it('stays at the base rate for a few unchanged reads, then stretches to the cap', () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(4)).toBe(1000);
    expect(pollDelay(5)).toBe(1500);
    expect(pollDelay(7)).toBe(2500);
    expect(pollDelay(100)).toBe(4000);
  });

  it('snaps back to the base rate when the streak resets', () => {
    expect(pollDelay(0)).toBe(1000);
  });
});
