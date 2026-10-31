'use strict';

/* The call-type tags carry a colour each, so a list can be scanned by colour:
 * IP blue, DR green, RA and Apex violet. The failed-call red stays on the
 * name, never on the type tag. Names are invented. */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

describe('Calls: coloured type tags', () => {
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    await seedSettings({ logShowAll: true });
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

  it('keeps a failed call red on the Result and not on the type tag', () => {
    fire(auraNetworkEntry({ actionId: '1', errorInAction: 'boom' }));
    const row = rows()[0];
    expect(row.querySelector('.tag-ip').classList.contains('tag-error')).toBe(false);
    expect(row.querySelector('.pill:not(.is-code)').classList.contains('tag-error')).toBe(true);
  });

  it('gives DR a teal of its own, not the green of a success', () => {
    expect(css).toMatch(/\n\.tag-type-dr \{[^}]*var\(--teal-bg\)[^}]*var\(--teal-fg\)/);
    expect(css).not.toMatch(/\n\.tag-type-dr \{[^}]*--ok-/);
  });

  it('has a fill and a text colour for each in the light and the dark theme', () => {
    ['ip', 'dr', 'ra'].forEach((name) => expect(css).toMatch(new RegExp(`\\n\\.tag-type-${name} \\{[^}]*background[^}]*color`)));
    ['--violet-bg', '--violet-fg', '--teal-bg', '--teal-fg'].forEach((token) => expect(css.match(new RegExp(`${token}:`, 'g')).length).toBeGreaterThanOrEqual(3));
  });
});
