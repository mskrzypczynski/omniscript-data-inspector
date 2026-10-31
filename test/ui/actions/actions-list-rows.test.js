'use strict';

/* Calls list: every row is one line, so every row is as tall as the
 * next. A request that carried several actions says so in a small ×N tag, not in
 * words in the Took cell. jsdom lays nothing out, so the classes, texts and
 * tooltips are checked here and the heights by a Playwright probe; the CSS rules
 * are read as text. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup, seedSettings } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const ids = ['1', '2', '3', '4', '5', '6', '7'];

describe('Calls: rows of one line', () => {
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    await seedSettings({ logShowAll: true }); // All Apex calls is a setting
    const { decorateButtons } = await import('../../../src/ui/icons.js');
    decorateButtons();
    const { RemoteActions } = await import('../../../src/ui/actions-tab.js');
    RemoteActions.mount();
    RemoteActions.show();
  });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];

  it('puts the time of a shared request alone in the Took cell, and the note in a ×7 tag', () => {
    fire(auraNetworkEntry({ actionId: '1', extraActions: ids.slice(1), time: 1630 }));
    expect(rows()).toHaveLength(7);
    rows().forEach((row) => {
      const took = row.querySelector('.log-ms');
      expect(took.textContent).toBe('1,630 ms');
      expect(took.title).toContain('One request shared by 7 actions: the time is the whole request\'s');
      [...row.querySelectorAll('.log-tags .tag-batch')].forEach((tag) => {
        expect(tag.textContent).toBe('×7');
        expect(tag.title).toBe('One request shared by 7 actions: the time is the whole request\'s');
        expect(tag.className).toMatch(/tag-neutral/);
      });
      expect(row.querySelectorAll('.log-tags .tag-batch').length).toBeGreaterThan(0);
    });
  });

  it('gives a request of one no ×N tag', () => {
    fire(auraNetworkEntry({ actionId: '1', time: 40 }));
    expect(document.querySelector('.tag-batch')).toBeNull();
  });
});
