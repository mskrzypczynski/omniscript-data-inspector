'use strict';

/* CSS-text tests: the narrow-width rules below are read from panel.css as text,
 * because jsdom lays nothing out. They break on purpose when a selector is
 * renamed; update the pattern together with the rule. */

/* Calls after the second review: what the narrow panel shows, the
 * pressed Record button, the call a menu is open for, the Copy menu and the
 * Advanced-only switches. */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { auraNetworkEntry } from '../support/aura-entry.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

/* The body of the first @media or @container block that starts with `head`. */
function blockOf(head) {
  const at = css.indexOf(head);
  if (at < 0) return null;
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(css.indexOf('{', at) + 1, i); }
  }
  return null;
}

describe('Calls: second review', () => {
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
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() }
    });
  });

  afterEach(() => { delete navigator.clipboard; });

  const fire = (entry) => listeners.onRequestFinished.forEach((listener) => listener(entry));
  const rows = () => [...document.querySelectorAll('#log-list .log-row:not(.log-head)')];
  const ipCall = (extra = {}) => fire(auraNetworkEntry({ actionId: '1', method: 'Order_Place', ...extra }));

  describe('the Result at every width', () => {
    const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css);

    it('is its glyph, in every layout of the list, not only the narrowest', () => {
      expect(rule('#log-list .log-row:not(.log-head) .pill')[1]).toMatch(/font-size:\s*0/);
      expect(rule('#log-list .log-row:not(.log-head) .pill.is-good::before')[1]).toMatch(/content:\s*"✓"/);
      expect(rule('#log-list .log-row:not(.log-head) .pill.is-bad::before')[1]).toMatch(/content:\s*"✕"/);
      expect(rule('#log-list .log-row:not(.log-head) .pill.is-neutral::before')[1]).toMatch(/content:\s*"–"/);
    });

    it('has a column of about 36 px in the wide layouts, and Took gains the room', () => {
      const wide = rule('#log-list .log-row')[1];
      expect(wide).toMatch(/minmax\(12ch, 1fr\) auto 96px 36px/);
      expect(blockOf('@container loglist (max-width: 759px)')).toMatch(/minmax\(12ch, 1fr\) auto 84px 36px/);
      expect(blockOf('@container loglist (max-width: 559px)')).toMatch(/minmax\(12ch, 1fr\) 84px 36px/);
    });
  });

  describe('at 480 px and under', () => {
    const narrow = blockOf('@container loglist (max-width: 480px)');
    const narrowDetail = blockOf('@media (max-width: 480px) {\n  /* The facts under');
    const detailNarrow = blockOf('@container (max-width: 480px) {\n  .log-detail .detail-actions .copy-menu-btn');

    it('drops the Started column and keeps the tags their width, the name taking the rest', () => {
      expect(narrow).toMatch(/#log-list \.log-row \.log-time\s*\{\s*display:\s*none/);
      // The tick, the type tag, the name (the rest), the time and the result glyph: five columns.
      expect(narrow).toMatch(/grid-template-columns:\s*var\(--log-check, 24px\) 40px minmax\(12ch, 1fr\) 76px 28px/);
    });

    it('keeps the Result column narrow: its glyph, with the word staying in the text', () => {
      expect(narrow).toMatch(/grid-template-columns:\s*var\(--log-check, 24px\) 40px minmax\(12ch, 1fr\) 76px 28px/);
      ipCall();
      expect(rows()[0].querySelector('.pill').textContent).toBe('Succeeded');
    });

    it('wraps the detail line, inside a fact too', () => {
      expect(narrowDetail).toMatch(/\.detail-meta\s*\{[^}]*overflow-wrap:\s*anywhere/);
      expect(narrowDetail).toMatch(/\.meta-part\s*\{[^}]*white-space:\s*normal/);
    });

    it('trades the icon trio for Show in Structure and a Copy menu', () => {
      expect(detailNarrow).toMatch(/\.copy-menu-btn\s*\{\s*display:\s*inline-flex/);
      expect(detailNarrow).toMatch(/\.copy-direct\s*\{\s*display:\s*none/);
      expect(detailNarrow).toMatch(/\.detail-structure > \.btn-label\s*\{[^}]*position:\s*static/);
      expect(css).toMatch(/\.detail-actions \.copy-menu-btn \{ display: none; \}/);
    });
  });

  describe('the row menu', () => {
    const open = (row) => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));

    it('marks the call it is open for, and lets go when it closes', async () => {
      ipCall();
      fire(auraNetworkEntry({ actionId: '2', method: 'Other_Call', startedDateTime: '2024-01-01T00:00:05Z' }));
      open(rows()[1]);
      expect(rows()[1].classList.contains('is-menu')).toBe(true);
      expect(rows()[0].classList.contains('is-menu')).toBe(false);
      // A call arriving while the menu is open redraws the list, and the mark stays.
      fire(auraNetworkEntry({ actionId: '3', method: 'Third_Call', startedDateTime: '2024-01-01T00:00:09Z' }));
      expect(rows()[1].classList.contains('is-menu')).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
      expect(document.querySelector('.ctx-menu')).toBeNull();
      expect(rows().some((row) => row.classList.contains('is-menu'))).toBe(false);
    });

    it('is styled as a row under attention, not as the open call', () => {
      expect(css).toMatch(/\.log-row\.is-menu:not\(\.is-selected\) \{[^}]*box-shadow/);
    });
  });

  describe('Record', () => {
    const record = () => document.getElementById('log-record');

    it('is a toggle named Recording: its label says the state, aria-pressed holds it, the name never changes', () => {
      expect(record().querySelector('.btn-label').textContent).toBe('Recording');
      expect(record().getAttribute('aria-label')).toBe('Recording');
      expect(record().getAttribute('aria-pressed')).toBe('true');
      expect(record().title).toBe('Capturing calls. Click to pause.');
      expect(css).not.toMatch(/#log-record[^{]*\{[^}]*box-shadow/);
      record().click();
      expect(record().querySelector('.btn-label').textContent).toBe('Paused');
      expect(record().getAttribute('aria-label')).toBe('Recording');
      expect(record().getAttribute('aria-pressed')).toBe('false');
      expect(record().title).toBe('Not capturing. Click to resume.');
    });
  });

  describe('failure without colour', () => {
    const rule = (selector) => new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm').exec(css);

    it('hatches a failed segment of the selection bar, besides its red underline', () => {
      expect(rule('.sel-seg.is-failed::before')[1]).toMatch(/repeating-linear-gradient\(135deg/);
      expect(rule('.sel-seg.is-failed::after')[1]).toMatch(/background:\s*var\(--err-fg\)/);
    });

    it('puts dark text on the red tab badge, not white', () => {
      expect(rule('.badge.is-bad')[1]).toMatch(/color:\s*var\(--bg\)/);
    });

    it('takes the colour of a slow time from the --slow-fg token', () => {
      expect(rule('.log-ms.is-slow')[1]).toMatch(/color:\s*var\(--slow-fg, #b06000\)/);
    });
  });

  describe('Export and Clear in a narrow toolbar', () => {
    it('moves only Export into the "…" menu and keeps Clear in view', () => {
      expect(document.getElementById('log-export').hasAttribute('data-overflow')).toBe(true);
      expect(document.getElementById('log-clear').hasAttribute('data-overflow')).toBe(false);
      expect(document.getElementById('log-record').hasAttribute('data-overflow')).toBe(false);
    });
  });
});
