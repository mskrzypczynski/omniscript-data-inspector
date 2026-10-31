'use strict';

import { signature, shortFrame, formatBytes, scriptHosts, hiddenHostCounts, hostIdentity, findHost } from '../../../src/core/shared/targets-model.js';

describe('signature', () => {
  it('is identical for the same hosts in the same order', () => {
    const hosts = [{ label: 'a', frame: 'x' }, { label: 'b', frame: 'x' }];
    expect(signature(hosts)).toBe(signature(hosts.slice()));
  });

  it('changes when a host is added, removed, or moves frame', () => {
    const before = [{ label: 'a', frame: 'x' }];
    const added = [{ label: 'a', frame: 'x' }, { label: 'b', frame: 'x' }];
    const movedFrame = [{ label: 'a', frame: 'y' }];
    expect(signature(before)).not.toBe(signature(added));
    expect(signature(before)).not.toBe(signature(movedFrame));
  });
});

describe('shortFrame', () => {
  it('takes the last path segment of the URL', () => {
    expect(shortFrame('https://example.com/app/checkout')).toBe('checkout');
  });

  it('falls back to the hostname when the path is empty', () => {
    expect(shortFrame('https://example.com/')).toBe('example.com');
  });

  it('clips a long segment and marks it with an ellipsis', () => {
    const long = 'a'.repeat(30);
    expect(shortFrame(`https://example.com/${long}`)).toBe('a'.repeat(22) + '…');
  });

  it('falls back to a raw slice for an unparsable URL rather than throwing', () => {
    expect(shortFrame('not a url')).toBe('not a url');
  });
});

describe('formatBytes', () => {
  it('formats zero and small counts in bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('switches to KB and MB at the right thresholds', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('scriptHosts', () => {
  const host = (label, key, dataLen, extra = {}) => ({ label, key, dataLen, defLen: 100, top: true, ...extra });

  it('lists one host per Type/SubType/Language, the one holding the most data', () => {
    const header = host('c-header', 'Sales/Quote/English', 10);
    const form = host('c-form', 'Sales/Quote/English', 900);
    const inFrame = host('c-root', 'Sales/Quote/English', 900, { frame: 'https://example.test/view' });
    expect(scriptHosts([header, form, inFrame])).toEqual([form]);
  });

  it('breaks a tie on the definition size, then keeps the first found', () => {
    const a = host('a', 'K/S/L', 5, { defLen: 10 });
    const b = host('b', 'K/S/L', 5, { defLen: 20 });
    const c = host('c', 'K/S/L', 5, { defLen: 20 });
    expect(scriptHosts([a, b, c])).toEqual([b]);
  });

  it('keeps different scripts and hosts without a key, and leaves nested hosts out', () => {
    const quote = host('c-quote', 'Sales/Quote/English', 5);
    const order = host('c-order', 'Sales/Order/English', 5);
    const unnamed = host('c-data', '', 5);
    const nested = host('c-step', 'Sales/Quote/English', 50, { top: false });
    expect(scriptHosts([quote, order, unnamed, nested])).toEqual([quote, order, unnamed]);
  });
});

describe('hostIdentity / findHost', () => {
  const a = { frame: '', key: 'Quote/New/English', label: 'c-os', top: true };
  const b = { frame: '', key: 'Case/Edit/English', label: 'c-os', top: true };
  const c1 = { frame: '', key: '', label: 'c-text', top: false };
  const c2 = { frame: '', key: '', label: 'c-text', top: false };

  it('tells same-label hosts apart by their script key', () => {
    const before = [a, b];
    const after = [{ ...a }, { ...b }];
    expect(findHost(after, hostIdentity(before, b))).toBe(1);
  });

  it('tells hosts sharing label and key apart by rank, even after an earlier host appears', () => {
    const before = [c1, c2];
    const after = [{ ...a }, { ...c1 }, { ...c2 }];
    expect(findHost(after, hostIdentity(before, c2))).toBe(2);
  });

  it('returns -1 when no host has that name any more', () => {
    expect(findHost([a], hostIdentity([b], b))).toBe(-1);
  });
});

describe('a key that could not be read', () => {
  it('still finds the same host, so a half-saved definition does not lose the selection', () => {
    const host = { frame: '', key: 'Quote/New/English', label: 'c-os' };
    expect(findHost([{ ...host, key: '' }], hostIdentity([host], host))).toBe(0);
  });
});

describe('hiddenHostCounts', () => {
  const host = (extra) => ({ label: 'c-x', key: '', frame: '', top: true, dataLen: 1, defLen: 1, ...extra });

  it('counts only nested hosts that are whole scripts as embedded scripts', () => {
    const hosts = [
      host({ label: 'c-main', key: 'A/x/E', script: true }),
      host({ label: 'c-inner', key: 'B/x/E', script: true, top: false }),
      host({ label: 'c-el1', script: false, top: false }),
      host({ label: 'c-el2', script: false, top: false })
    ];
    expect(hiddenHostCounts(hosts)).toEqual({ scripts: 1, others: 2 });
  });

  it('says no embedded scripts for a script of forty elements: they are element hosts', () => {
    const hosts = [host({ label: 'c-main', key: 'A/x/E', script: true })];
    for (let i = 0; i < 40; i++) hosts.push(host({ label: `c-el${i}`, script: false, top: false }));
    expect(hiddenHostCounts(hosts)).toEqual({ scripts: 0, others: 40 });
  });

  it('does not claim a nested host it could not classify, and counts repeats of a listed script as others', () => {
    const hosts = [
      host({ label: 'c-main', key: 'A/x/E', dataLen: 9, script: true }),
      host({ label: 'c-again', key: 'A/x/E', dataLen: 1, script: true }),
      host({ label: 'c-unknown', top: false })
    ];
    expect(hiddenHostCounts(hosts)).toEqual({ scripts: 0, others: 2 });
  });

  it('does not count a nested host that carries a listed script\'s own key: that is an element, not an embedded script', () => {
    const hosts = [
      host({ label: 'c-main', key: 'A/x/E', script: true }),
      host({ label: 'c-el1', key: 'A/x/E', script: true, top: false }),
      host({ label: 'c-el2', key: 'A/x/E', script: true, top: false }),
      host({ label: 'c-inner', key: 'B/x/E', script: true, top: false })
    ];
    expect(hiddenHostCounts(hosts)).toEqual({ scripts: 1, others: 2 });
  });

  it('is zero when nothing is left out', () => {
    expect(hiddenHostCounts([host({ key: 'A/x/E', script: true })])).toEqual({ scripts: 0, others: 0 });
    expect(hiddenHostCounts([])).toEqual({ scripts: 0, others: 0 });
  });
});
