'use strict';

import { scriptIdentity, sameScript, keepsSelection } from '../../../src/core/shared/script-identity.js';

const host = (over = {}) => ({ frame: '', key: 'a/b/c', label: 'c-script#one', index: 3, ...over });

describe('scriptIdentity', () => {
  it('keeps frame, key and label only', () => {
    expect(scriptIdentity(host({ index: 9, dataLen: 5 }))).toEqual({ frame: '', key: 'a/b/c', label: 'c-script#one' });
  });
  it('is null without a host', () => {
    expect(scriptIdentity(null)).toBeNull();
  });
});

describe('sameScript', () => {
  it('ignores the host index', () => {
    expect(sameScript(scriptIdentity(host()), scriptIdentity(host({ index: 7 })))).toBe(true);
  });
  it.each([['frame', 'https://x/y'], ['key', 'd/e/f'], ['label', 'other']])('differs by %s', (field, value) => {
    expect(sameScript(scriptIdentity(host()), scriptIdentity(host({ [field]: value })))).toBe(false);
  });
  it('is false when either side is missing', () => {
    expect(sameScript(null, scriptIdentity(host()))).toBe(false);
    expect(sameScript(scriptIdentity(host()), null)).toBe(false);
  });
});

describe('keepsSelection', () => {
  const same = scriptIdentity(host());
  it('keeps for hosts of the same script', () => {
    expect(keepsSelection('hosts', same, scriptIdentity(host({ index: 4 })))).toBe(true);
  });
  it('resets for hosts of another script', () => {
    expect(keepsSelection('hosts', same, scriptIdentity(host({ label: 'z' })))).toBe(false);
  });
  it.each(['selection', 'props', 'navigated'])('resets on %s even for the same script', (reason) => {
    expect(keepsSelection(reason, same, same)).toBe(false);
  });
});
