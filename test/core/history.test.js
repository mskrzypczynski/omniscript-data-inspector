'use strict';

import { pushSnapshot } from '../../src/core/history.js';

describe('pushSnapshot', () => {
  const t = (n) => new Date(n);

  it('appends new payloads and ignores a repeat of the newest', () => {
    let h = [];
    h = pushSnapshot(h, '{"a":1}', t(1));
    h = pushSnapshot(h, '{"a":1}', t(2));
    h = pushSnapshot(h, '{"a":2}', t(3));
    expect(h.map((x) => x.raw)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('does not mutate the array it is given', () => {
    const h = [];
    pushSnapshot(h, 'x', t(1));
    expect(h).toEqual([]);
  });

  it('drops the oldest beyond the count limit', () => {
    let h = [];
    for (let i = 0; i < 5; i++) h = pushSnapshot(h, `p${i}`, t(i), { maxCount: 3 });
    expect(h.map((x) => x.raw)).toEqual(['p2', 'p3', 'p4']);
  });

  it('drops the oldest beyond the size limit but always keeps the newest', () => {
    let h = [];
    h = pushSnapshot(h, 'aaaa', t(1), { maxChars: 10 });
    h = pushSnapshot(h, 'bbbb', t(2), { maxChars: 10 });
    h = pushSnapshot(h, 'cccc', t(3), { maxChars: 10 });
    expect(h.map((x) => x.raw)).toEqual(['bbbb', 'cccc']);
    expect(pushSnapshot([], 'x'.repeat(50), t(4), { maxChars: 10 })).toHaveLength(1);
  });

  it('ignores non-text input', () => {
    expect(pushSnapshot([], null, t(1))).toEqual([]);
  });
});
