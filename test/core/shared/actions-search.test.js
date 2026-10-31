'use strict';

import {
  parseQuery, hasQuery, stepAt, payloadText, payloadSnippet, matchesQuery, slowFilterMs, withoutSlow
} from '../../../src/core/shared/actions-search.js';

describe('parseQuery', () => {
  it('splits plain words from the three prefixes', () => {
    expect(parseQuery('Fetch in:OrderId url:aura step:Review')).toEqual({
      text: 'fetch', inPayload: 'orderid', url: 'aura', step: 'review', repeats: false, slow: null
    });
  });

  it('takes a quoted value with spaces', () => {
    expect(parseQuery('step:"Order Review" x').step).toBe('order review');
    expect(parseQuery('step:"Order Review" x').text).toBe('x');
  });

  it('ignores a prefix with nothing after it yet', () => {
    expect(parseQuery('in:')).toEqual({ text: '', inPayload: '', url: '', step: '', repeats: false, slow: null });
    expect(hasQuery(parseQuery('in:'))).toBe(false);
    expect(hasQuery(parseQuery('in:x'))).toBe(true);
  });

  it('does not take a prefix from the middle of a word', () => {
    expect(parseQuery('login:abc').text).toBe('login:abc');
    expect(parseQuery('').text).toBe('');
    expect(parseQuery(undefined).text).toBe('');
  });
});

describe('stepAt', () => {
  const visits = [
    { key: 'a', name: 'A', from: 100, to: 200 },
    { key: 'b', name: 'B', from: 200, to: 300 },
    { key: 'a', name: 'A', from: 300, to: null }
  ];

  it('finds the visit running at a time', () => {
    expect(stepAt(visits, 150).key).toBe('a');
    expect(stepAt(visits, 250).key).toBe('b');
    expect(stepAt(visits, 9999)).toBe(visits[2]);
  });

  it('puts a boundary in the later visit', () => {
    expect(stepAt(visits, 200).key).toBe('b');
    expect(stepAt(visits, 300)).toBe(visits[2]);
  });

  it('is null before the first visit, without visits or for an unknown time', () => {
    expect(stepAt(visits, 99)).toBeNull();
    expect(stepAt([], 5)).toBeNull();
    expect(stepAt(undefined, 5)).toBeNull();
    expect(stepAt(visits, NaN)).toBeNull();
  });
});

describe('payload search', () => {
  const entry = () => ({
    name: 'Acc_Fetch', signature: 'svc.Acc_Fetch', url: 'https://x/aura',
    time: new Date(150), action: { input: { Request: { OrderId: '801abc' } }, options: { chainable: true } },
    output: { items: [{ Name: 'Widget' }] }
  });

  it('holds keys and values of input, options and output', () => {
    const { lower } = payloadText(entry());
    ['orderid', '801abc', 'chainable', 'widget'].forEach((word) => expect(lower).toContain(word));
  });

  it('is built once per call', () => {
    const call = entry();
    expect(payloadText(call)).toBe(payloadText(call));
    expect(payloadText(call, true)).not.toBe(payloadText(call));
  });

  it('hides values, not keys, while masked', () => {
    const { lower } = payloadText(entry(), true);
    expect(lower).toContain('orderid');
    expect(lower).not.toContain('801abc');
  });

  it('shows a snippet around the hit', () => {
    expect(payloadSnippet(entry(), '801')).toMatch(/^…?.*"OrderId":"801abc".*$/);
    expect(payloadSnippet(entry(), 'nothing')).toBe('');
    expect(payloadSnippet(entry(), '')).toBe('');
  });

  it('marks where the snippet was cut', () => {
    const long = { ...entry(), output: { text: `${'a'.repeat(80)}NEEDLE${'b'.repeat(80)}` } };
    const snippet = payloadSnippet(long, 'needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('NEEDLE');
  });

  it('does not show a masked value in a snippet', () => {
    expect(payloadSnippet(entry(), '801', true)).toBe('');
  });
});

describe('matchesQuery', () => {
  const call = { name: 'Acc_Fetch', signature: 'svc.Acc_Fetch', url: 'https://x/aura', time: new Date(150), action: { input: {} }, output: {} };

  it('requires every part', () => {
    const visits = [{ key: 's', name: 'Review', from: 100, to: null }];
    expect(matchesQuery(call, parseQuery('fetch url:aura step:review'), { visits })).toBe(true);
    expect(matchesQuery(call, parseQuery('fetch url:nope'), { visits })).toBe(false);
  });

  it('matches everything for an empty query', () => {
    expect(matchesQuery(call, parseQuery(''))).toBe(true);
  });
});

describe('the slow: prefix', () => {
  it('is 0 alone (the threshold from Settings) or the milliseconds typed', () => {
    expect(parseQuery('slow:').slow).toBe(0);
    expect(parseQuery('slow:800').slow).toBe(800);
    expect(parseQuery('slow:800ms').slow).toBe(800);
    expect(parseQuery('Fetch slow:1500 in:x')).toMatchObject({ text: 'fetch', slow: 1500, inPayload: 'x' });
    expect(parseQuery('Fetch').slow).toBeNull();
  });

  it('is left as text when what follows is not a number, or sits inside a word', () => {
    expect(parseQuery('slow:abc')).toMatchObject({ text: 'slow:abc', slow: null });
    expect(parseQuery('nonslow:5').text).toBe('nonslow:5');
  });

  it('counts as a query', () => {
    expect(hasQuery(parseQuery('slow:'))).toBe(true);
    expect(hasQuery(parseQuery('slow:0'))).toBe(true);
  });

  it('resolves to the typed ms, else the setting, else 2000', () => {
    expect(slowFilterMs(parseQuery('slow:800'), 500)).toBe(800);
    expect(slowFilterMs(parseQuery('slow:'), 500)).toBe(500);
    expect(slowFilterMs(parseQuery('slow:'), 0)).toBe(2000);
    expect(slowFilterMs(parseQuery('slow:'), undefined)).toBe(2000);
    expect(slowFilterMs(parseQuery('x'), 500)).toBeNull();
  });

  it('keeps the calls that took at least that long, and combines with other words', () => {
    const call = (name, duration) => ({ id: 1, name, signature: name, duration, time: new Date(0) });
    expect(matchesQuery(call('Order', 900), parseQuery('slow:800'))).toBe(true);
    expect(matchesQuery(call('Order', 799), parseQuery('slow:800'))).toBe(false);
    expect(matchesQuery(call('Order', 900), parseQuery('slow:800 other'))).toBe(false);
    expect(matchesQuery(call('Order', 600), parseQuery('slow:'), { slowMs: 500 })).toBe(true);
    expect(matchesQuery(call('Order', 600), parseQuery('slow:'))).toBe(false); // default 2000
    expect(matchesQuery({ ...call('Order', 0), duration: null }, parseQuery('slow:100'))).toBe(false);
  });

  it('is cut out of the text the status bar quotes', () => {
    expect(withoutSlow('slow:800 Foo')).toBe('Foo');
    expect(withoutSlow('slow:')).toBe('');
    expect(withoutSlow(undefined)).toBe('');
  });
});
