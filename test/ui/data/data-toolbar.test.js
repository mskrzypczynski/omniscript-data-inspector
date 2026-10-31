'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* The Data toolbar: Refresh is the main button only while Auto-refresh is
 * off, Expand all and Collapse all work on the Tree only, and the top bar's
 * narrow-panel and Settings-button behaviour that goes with it. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { bootData, viewport } from '../support/data-page.js';
import { flashText } from '../../../src/ui/util.js';
import { decorateButton } from '../../../src/ui/icons.js';

afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });

const $ = (id) => document.getElementById(id);
const css = readFileSync('panel.css', 'utf8');
const host = { id: 'a', tag: 'c-os', data: { n: 0 } };

describe('Refresh', () => {
  it('is a plain button while Auto-refresh is on, and the primary one while it is off', async () => {
    await bootData({ hosts: [host] });
    expect($('live').checked).toBe(true);
    expect($('refresh').classList.contains('primary')).toBe(false);
    $('live').checked = false;
    $('live').dispatchEvent(new Event('change'));
    expect($('refresh').classList.contains('primary')).toBe(true);
    $('live').checked = true;
    $('live').dispatchEvent(new Event('change'));
    expect($('refresh').classList.contains('primary')).toBe(false);
  });

  it('says in its tooltip that it re-reads the data now, unlike the Structure tab\'s Refresh', async () => {
    await bootData({ hosts: [host] });
    expect($('refresh').title).toMatch(/^Re-read the data of the selected script now/);
    expect($('refresh').title).not.toBe(document.getElementById('struct-refresh').title);
  });

  it('keeps its text in a narrow toolbar', async () => {
    await bootData({ hosts: [host] });
    expect($('refresh').classList.contains('keep-label')).toBe(true);
    expect(css).toMatch(/\.toolbar \.icon-btn\.keep-label > \.btn-label\s*\{[^}]*position:\s*static/);
  });
});

describe('Expand all and Collapse all', () => {
  it('keep their place in the toolbar when the view changes', async () => {
    await bootData({ hosts: [host] });
    const order = () => [...$('expand').parentElement.children].map((node) => node.id);
    const before = order();
    $('view-raw').click();
    expect(order()).toEqual(before);
  });
});

describe('the Tree | Form | Sizes | Raw | Changes switch', () => {
  const seg = () => $('view-tree').parentElement;

  it('is never folded into the "…" menu', async () => {
    await bootData({ hosts: [host] });
    expect(seg().hasAttribute('data-overflow')).toBe(false);
    seg().querySelectorAll('button').forEach((button) => expect(button.hasAttribute('data-overflow')).toBe(false));
  });

  it('keeps every button in place by the same one-pixel overlap, Changes shown or not', () => {
    expect(css).toMatch(/#view-form, #view-sizes, #view-raw\s*\{\s*margin-left:\s*-1px/);
    expect(css).toMatch(/#view-raw:has\(\+ #view-changes\[hidden\]\)\s*\{\s*border-radius/);
  });

  it('keeps the words of the view names at every width, over the narrow-toolbar icon rule', () => {
    expect(css).toMatch(/\.toolbar \.seg-btn\.icon-btn > \.btn-label\s*\{[^}]*position:\s*static/);
    expect(css).toMatch(/\.toolbar \.seg-btn\.icon-btn:has\(> \.ui-icon\)\s*\{[^}]*padding-left:\s*8px/);
  });

  it('shares the row with the filter in a narrow toolbar', () => {
    expect(css).toMatch(/@container \(max-width: 480px\)\s*\{\s*#filter\s*\{[^}]*width:\s*150px/);
  });
});

describe('narrow panel', () => {
  it('keeps the tab names down to a very narrow panel', () => {
    expect(css).toMatch(/@container \(max-width: 299px\)\s*\{\s*\.tab \{[^}]*\}\s*\.tab-icon[^}]*\}\s*\.tab > \.tab-label/);
    expect(css).not.toMatch(/\.tabstrip \{ container-type: inline-size; \}\s*@container \(max-width: 480px\)/);
  });

  it('uses two arrows for Rescan, not the magnifier', async () => {
    const { icon } = await import('../../../src/ui/icons.js');
    const svg = icon('rescan');
    expect(svg.querySelectorAll('circle')).toHaveLength(0);
    expect(svg.querySelector('path').getAttribute('d')).toContain('M13 2.2v2.7');
    expect(readFileSync('src/ui/icons.js', 'utf8')).toMatch(/rescan: \[P\('M2\.8 7\.3/);
  });

  it('groups the Changes bar so Compare payloads never wraps alone', () => {
    expect(css).toMatch(/\.bar-group\s*\{[^}]*flex-wrap:\s*nowrap/);
  });
});

describe('a copy confirmation does not move its neighbours', () => {
  it('holds the width of the button while its label shows Copied, and lets go after', () => {
    jest.useFakeTimers();
    const button = document.createElement('button');
    button.textContent = 'Copy JSON';
    decorateButton(button, 'copy');
    button.getBoundingClientRect = () => ({ width: 96 });
    flashText(button, 'Copied');
    expect(button.querySelector('.btn-label').textContent).toBe('Copied');
    expect(button.style.minWidth).toBe('96px');
    flashText(button, 'Copied'); // flashing again keeps the first width and label
    jest.advanceTimersByTime(1300);
    expect(button.style.minWidth).toBe('');
    expect(button.querySelector('.btn-label').textContent).toBe('Copy JSON');
  });
});

describe('row buttons', () => {
  it('sit after the value, always laid out, shown on hover and keyboard focus only', () => {
    expect(css).toMatch(/\.row-tools\s*\{[^}]*display:\s*inline-flex[^}]*opacity:\s*0;[^}]*pointer-events:\s*none/);
    expect(css).toMatch(/\.row:hover > \.row-tools,\s*\.row:focus-visible > \.row-tools,\s*\.row:has\(> \.row-tools :focus-visible\) > \.row-tools\s*\{\s*opacity:\s*1;\s*pointer-events:\s*auto/);
    /* A row that was only clicked keeps focus (:focus-within) but is not "focus-visible". */
    expect(css).not.toMatch(/\.row[^{,]*:focus-within > \.row-tools/);
    expect(css).not.toMatch(/\.row-tools\s*\{[^}]*position:\s*absolute/);
    /* No room of their own, so showing them cannot wrap a line; sticky keeps them in the pane. */
    expect(css).toMatch(/\.row-tools\s*\{[^}]*position:\s*sticky[^}]*width:\s*0/);
  });

  it('are no taller than the row, so showing them never grows or shifts it', () => {
    const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))[1];
    const em = (text, property) => Number((text.match(new RegExp(`(?:^|[\\s;])${property}:\\s*([\\d.]+)em`)) || [])[1]);
    const row = Number(css.match(/\.viewport\s*\{[^}]*line-height:\s*([\d.]+);/)[1]);
    const button = rule('.row-copy');
    expect(em(button, 'height')).toBeLessThanOrEqual(row);
    expect(em(button, 'width')).toBeLessThanOrEqual(row);
    expect(em(rule('.row-tools'), 'height')).toBeLessThanOrEqual(row);
    /* the base rule for buttons has min-height: 22px, which would win over a height of 1.4em */
    expect(button).toMatch(/min-height:\s*0\b/);
  });

  it('can be reached with the keyboard: Tab from a focused row enters its buttons', async () => {
    await bootData({ hosts: [host] });
    const row = viewport().querySelector('.row[data-path="n"]');
    const buttons = [...row.querySelectorAll('.row-tools button')];
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((button) => { expect(button.disabled).toBe(false); });
    expect(row.getAttribute('role')).toBe('treeitem');
  });

  /* jsdom cannot compute :focus-visible or opacity, so what is pinned is the
   * mechanism: the buttons are hidden by opacity (never visibility, which would
   * stop them taking focus, and never a transition, which leaves the buttons of
   * rows the pointer has left on screen), and the Tab order roves with focus. */
  it('hide with opacity and no transition, so nothing trails behind the pointer', () => {
    const hidden = css.match(/\.row-tools\s*\{([^}]*)\}/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
    expect(hidden).toMatch(/opacity:\s*0;/);
    expect(hidden).toMatch(/pointer-events:\s*none/);
    expect(hidden).not.toMatch(/visibility/);
    expect(hidden).not.toMatch(/transition/);
  });

  it('keep only the focused row\'s buttons in the Tab order', async () => {
    await bootData({ hosts: [host] });
    const tabbable = () => [...viewport().querySelectorAll('.row-tools button')].filter((b) => b.tabIndex >= 0);
    const rows = [...viewport().querySelectorAll('.row[data-path]')];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const owner = (button) => button.closest('.row').dataset.path;
    // to begin with, the row that is the tree's one tab stop
    const stop = rows.find((row) => row.tabIndex === 0);
    expect(new Set(tabbable().map(owner))).toEqual(new Set([stop.dataset.path]));
    expect(tabbable().length).toBeGreaterThan(0);

    const other = rows.find((row) => row !== stop && row.querySelector('.row-tools button'));
    other.focus();
    expect(new Set(tabbable().map(owner))).toEqual(new Set([other.dataset.path]));
    // focus on one of its own buttons changes nothing
    other.querySelector('.row-tools button').focus();
    expect(new Set(tabbable().map(owner))).toEqual(new Set([other.dataset.path]));
    stop.focus();
    expect(new Set(tabbable().map(owner))).toEqual(new Set([stop.dataset.path]));
  });

  it('take clicks over about 20px, though the button stays smaller than the row', () => {
    /* A box around the button (not a bigger button, which would grow the row). */
    expect(css).toMatch(/\.row-copy\s*\{[^}]*position:\s*relative/);
    const pad = css.match(/\.row-copy::before\s*\{[^}]*inset:\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*;/);
    expect(pad).not.toBeNull();
    const [top, side, bottom] = pad.slice(1).map(Number);
    const button = 1.4 * 11; // 1.4em of the 11px tree text
    expect(button - top - bottom).toBeGreaterThanOrEqual(20);
    expect(button - 2 * side).toBeGreaterThanOrEqual(20);
    // and the buttons are spaced so those boxes do not overlap
    expect(Number(css.match(/\.row-tools\s*\{[^}]*gap:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(-2 * side);
  });

  it('are the last thing in the row, so they follow the value text', async () => {
    await bootData({ hosts: [host] });
    const row = viewport().querySelector('.row[data-path="n"]');
    expect(row.lastElementChild.classList.contains('row-tools')).toBe(true);
    expect(row.lastElementChild.previousElementSibling.classList.contains('v')).toBe(true);
  });
});
