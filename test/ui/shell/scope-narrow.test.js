'use strict';

/* The top bar and the tab strip in a narrow panel. jsdom lays nothing out, so
 * the rules are read from panel.css as text (they break on purpose when a
 * selector is renamed) and the markup they rely on is checked in the DOM. The
 * pixels are checked by the Playwright renders at 340, 400 and 480 px. */

import { readFileSync } from 'node:fs';
import { mountPanelMarkup } from '../support/panel-fixture.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

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

beforeEach(() => mountPanelMarkup());
afterEach(() => { document.body.innerHTML = ''; });

describe('top bar below 420 px', () => {
  it('has a break between Rescan and Mask, so the picker gets a row with Rescan', () => {
    const bar = document.querySelector('.scope');
    const kids = [...bar.children];
    const at = kids.findIndex((node) => node.classList.contains('scope-break'));
    expect(at).toBeGreaterThan(kids.indexOf(document.getElementById('rescan')));
    expect(at).toBeLessThan(kids.findIndex((node) => node.classList.contains('mask-switch')));
    expect(bar.querySelector('.scope-break').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the break only in the narrow bar, as wide as the bar and no taller than a line', () => {
    expect(css).toMatch(/\.scope > \.scope-break\s*\{[^}]*display:\s*none;[^}]*flex:\s*1 0 100%;[^}]*height:\s*0/);
    const narrow = blockOf('@container (max-width: 420px) {\n  .scope > .scope-break');
    expect(narrow).toMatch(/\.scope > \.scope-break\s*\{\s*display:\s*block/);
    expect(narrow).toMatch(/#target\s*\{[^}]*min-width:\s*120px/);
  });
});

describe('tab strip at 340 px', () => {
  it('keeps a word on every tab, the same at every width, and only under 300 px are the tabs icons', () => {
    const label = document.querySelector('#tab-actions .tab-label');
    expect(label.dataset.short).toBeUndefined();
    expect(label.textContent).toBe('Calls');
    expect(css).toMatch(/@container \(max-width: 299px\)\s*\{\s*\.tab \{/);
    expect(css).not.toMatch(/@container \(max-width: 340px\)\s*\{\s*\.tab \{/);
  });
});
