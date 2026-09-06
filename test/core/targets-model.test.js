'use strict';

import { signature, shortFrame, formatBytes } from '../../src/core/targets-model.js';

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
