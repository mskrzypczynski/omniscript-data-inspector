'use strict';

import { jest } from '@jest/globals';

describe('Session', () => {
  it('holds a loaded bundle, tells listeners on load and clear, and clears only once', async () => {
    jest.resetModules();
    const { Session } = await import('../../../src/ui/session.js');
    const seen = [];
    Session.onChange((bundle) => seen.push(bundle ? 'loaded' : 'cleared'));
    expect(Session.active()).toBe(false);
    Session.load({ generatedAt: 'x' }, 'bundle.json');
    expect(Session.active()).toBe(true);
    expect(Session.name()).toBe('bundle.json');
    Session.clear();
    Session.clear();
    expect(Session.active()).toBe(false);
    expect(seen).toEqual(['loaded', 'cleared']);
  });
});
