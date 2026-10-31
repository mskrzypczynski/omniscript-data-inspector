'use strict';

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';
import { GATES } from '../../../src/core/shared/features.js';

/* The Free build is the same code booted through src/ui/app.js, with the
 * Free markup of panel.html and nothing registered. Each tab adds its own
 * Free checks (test/ui/<tab>/free-*.test.js); this one proves the Free panel
 * boots with every gate closed. */

async function boot({ free = false } = {}) {
  jest.resetModules();
  mountPanelMarkup({ free });
  stubChromeDevtools();
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
  return (await import('../../../src/ui/features.js')).Features;
}

describe('the Free build', () => {
  it('boots with every gate closed', async () => {
    const Features = await boot({ free: true });
    expect(Features.registered()).toEqual([]);
    GATES.forEach(({ name }) => expect(Features.has(name)).toBe(false));
    expect(document.getElementById('view-data')).not.toBeNull();
    expect(document.documentElement.dataset.build).toBe('free');
  });
});

