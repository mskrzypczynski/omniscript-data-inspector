'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* The Calls tab after the UX review: a quiet default list, the
 * controls that were only keys, a failed call that opens on its reason. The
 * decisions themselves are tested in test/core/. */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
/* The declarations of the last rule whose selector is exactly `selector`: the
 * UX round's block comes after the older rules it overrides. */
function ruleOf(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [...css.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'gm'))];
  return hits.length ? hits[hits.length - 1][1] : null;
}

describe('Calls: UX round', () => {
  let RemoteActions;
  let listeners;

  beforeEach(async () => {
    jest.resetModules();
    listeners = stubChromeDevtools();
    mountPanelMarkup();
    const { decorateButtons } = await import('../../../src/ui/icons.js');
    decorateButtons();
    ({ RemoteActions } = await import('../../../src/ui/actions-tab.js'));
    RemoteActions.mount();
    RemoteActions.show();
  });

  afterEach(() => { delete navigator.clipboard; });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const detail = () => document.getElementById('log-detail');
  const tab = (name) => [...detail().querySelectorAll('.seg-btn')].find((b) => b.textContent === name);
  const at = (second) => `2024-01-01T00:00:0${second}Z`;
  const contextMenu = (row) => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    return [...document.querySelectorAll('.ctx-menu .ctx-item')];
  };
  const item = (items, label) => items.find((entry) => entry.textContent === label);

  describe('tab badge', () => {
    it('is not visible on a fresh panel', () => {
      const badge = document.getElementById('actions-count');
      expect(badge.hidden).toBe(true);
      expect(badge.textContent).toBe('');
      // .badge sets display, which beats the hidden attribute unless this rule is there.
      expect(ruleOf('.badge[hidden]')).toMatch(/display:\s*none/);
    });

    it('shows with the first call and hides again when the list is cleared', () => {
      fire(auraNetworkEntry());
      expect(document.getElementById('actions-count').hidden).toBe(false);
      document.getElementById('log-clear').click();
      expect(document.getElementById('actions-count').hidden).toBe(true);
    });
  });

  describe('a failed call', () => {
    const LONG = 'Line one of the message\nLine two names the failing field Contact.Email\nLine three';

    it('opens on Output, a good one on Input', () => {
      fire(auraNetworkEntry({ actionId: '1', startedDateTime: at(0) }));
      fire(auraNetworkEntry({ actionId: '2', errorInAction: LONG, startedDateTime: at(1) }));
      rows()[1].click();
      expect(tab('Output').getAttribute('aria-pressed')).toBe('true');
      rows()[0].click();
      expect(tab('Input').getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps a tab the user picked while moving between calls', () => {
      fire(auraNetworkEntry({ actionId: '1', startedDateTime: at(0) }));
      fire(auraNetworkEntry({ actionId: '2', errorInAction: LONG, startedDateTime: at(1) }));
      rows()[0].click();
      tab('Input').click();
      rows()[1].click();
      expect(tab('Input').getAttribute('aria-pressed')).toBe('true');
    });

    it('says what went wrong in the meta line, not SUCCESS', () => {
      fire(auraNetworkEntry({ errorInAction: LONG }));
      rows()[0].click();
      const meta = detail().querySelector('.detail-meta').textContent;
      expect(meta).toContain('HTTP 200 · Failed');
      expect(meta).not.toContain('SUCCESS');
    });

    it('clamps the banner to three lines, and lets the open one grow', () => {
      expect(ruleOf('.detail-error-text')).toMatch(/-webkit-line-clamp:\s*3/);
      expect(ruleOf('.detail-error.is-open .detail-error-text')).toMatch(/display:\s*block/);
    });
  });

  describe('the meta line', () => {
    it('keeps every fact in a span that does not break', () => {
      fire(auraNetworkEntry());
      rows()[0].click();
      const parts = [...detail().querySelectorAll('.detail-meta .meta-part')].map((part) => part.textContent);
      expect(parts).toContain('HTTP 200');
      expect(ruleOf('.detail-meta .meta-part')).toMatch(/white-space:\s*nowrap/);
    });
  });

  describe('the row menu', () => {
    it('copies the name and the input', async () => {
      const copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (text) => { copied.push(text); return Promise.resolve(); } }
      });
      fire(auraNetworkEntry({ method: 'Account_Fetch', input: '{"AccountId":"001"}' }));
      item(contextMenu(rows()[0]), 'Copy name').click();
      item(contextMenu(rows()[0]), 'Copy input').click();
      await Promise.resolve();
      expect(copied[0]).toBe('Account_Fetch');
      expect(JSON.parse(copied[1])).toEqual({ AccountId: '001' });
    });
  });

  describe('recording', () => {
    const record = () => document.getElementById('log-record');

    it('reads Recording with a red dot while recording, pressed, and keeps the state in its tooltip and the status bar', () => {
      expect(record().querySelector('.btn-label').textContent).toBe('Recording');
      expect(record().getAttribute('aria-pressed')).toBe('true');
      expect(record().getAttribute('aria-label')).toBe('Recording');
      expect(record().querySelector('.ui-icon').classList.contains('ic-dot')).toBe(true);
      expect(record().title).toBe('Capturing calls. Click to pause.');
      expect(document.getElementById('status-right').textContent).toMatch(/^Recording/);
      expect(document.getElementById('status-right').textContent).not.toMatch(/preserving log|clears on reload/);
    });

    it('reads Paused with a pause icon when off, and the empty list says so', () => {
      record().click();
      expect(record().querySelector('.btn-label').textContent).toBe('Paused');
      expect(record().title).toBe('Not capturing. Click to resume.');
      expect(record().getAttribute('aria-pressed')).toBe('false');
      expect(record().getAttribute('aria-label')).toBe('Recording');
      expect(record().querySelector('.ui-icon').classList.contains('ic-pause')).toBe(true);
      expect(record().querySelectorAll('.ui-icon')).toHaveLength(1);
      expect(document.getElementById('status-right').textContent).toMatch(/^Paused/);
      expect(document.getElementById('log-notes').textContent).toContain('Recording is paused');
      expect(document.getElementById('log-notes').textContent).toContain('Click Paused');
      record().click();
      expect(record().querySelector('.btn-label').textContent).toBe('Recording');
      expect(record().querySelector('.ui-icon').classList.contains('ic-dot')).toBe(true);
      expect(document.getElementById('log-notes').textContent).toContain('No calls captured yet');
    });

    it('stops capturing while paused', () => {
      record().click();
      fire(auraNetworkEntry());
      expect(rows()).toHaveLength(0);
    });

    it('keeps its label at every width', () => {
      expect(ruleOf('#log-record > .btn-label')).toMatch(/position:\s*static/);
    });
  });

  describe('a quiet list', () => {
    it('shows no HTTP code pill: the Result is its glyph, and its tooltip has the word and the HTTP status', () => {
      fire(auraNetworkEntry({ actionId: '1', startedDateTime: at(0) }));
      fire(auraNetworkEntry({ actionId: '2', status: 500, content: '', startedDateTime: at(1) }));
      expect(document.querySelector('#log-list .pill.is-code')).toBeNull();
      expect(rows()[0].querySelector('.pill').title).toMatch(/^Succeeded\n/);
      expect(rows()[0].querySelector('.pill').title).toContain('HTTP 200');
      expect(rows()[1].querySelector('.pill').title).toContain('HTTP 500');
      expect(rows()[1].querySelector('.pill').title.split('HTTP 500')).toHaveLength(2); // said once
      expect(rows()[1].querySelectorAll('.log-result .pill')).toHaveLength(1);
    });

    it('names the tags in the Call header tooltip', () => {
      fire(auraNetworkEntry());
      const action = [...document.querySelectorAll('#log-list .log-head > span')].find((cell) => cell.textContent === 'Call');
      expect(action.title).toContain('DR Data Mapper (DataRaptor) · IP Integration Procedure · RA Remote Action');
      expect(action.title).toContain('chainable / queueable chain / no cache');
    });
  });

  describe('the toolbar', () => {
    it('uses the circle-with-a-slash icon for Clear, as Clear marks does', () => {
      const icon = document.getElementById('log-clear').querySelector('.ui-icon');
      expect(icon.getAttribute('class')).toContain('ic-clear');
      expect(icon.getAttribute('class')).not.toContain('ic-clear-list');
    });
  });

  describe('toasts', () => {
    afterEach(() => jest.useRealTimers());

    it('stay longer for a longer text', async () => {
      jest.useFakeTimers();
      const { toast } = await import('../../../src/ui/toast.js');
      toast('Short');
      jest.advanceTimersByTime(1700);
      expect(document.querySelector('.toast')).toBeNull();

      toast('A long sentence that needs a few more seconds to read through properly.');
      jest.advanceTimersByTime(3000);
      expect(document.querySelector('.toast')).not.toBeNull();
      jest.advanceTimersByTime(2000);
      expect(document.querySelector('.toast')).toBeNull();
    });
  });
});

