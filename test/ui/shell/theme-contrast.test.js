'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

import { readFileSync } from 'node:fs';

/* Selected rows, primary buttons and the active pill of every tab are drawn
 * from the --sel-* tokens. The dark theme's accent is a light blue, so white
 * text on it was about 2:1: the dark theme needs its own fill. */

const css = readFileSync('panel.css', 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* The value of --sel-bg inside the first rule whose selector contains `selector`. */
function selBgIn(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  const body = css.slice(open, css.indexOf('}', open));
  return /--sel-bg:\s*(#[0-9a-f]{6})/i.exec(body)[1];
}

describe('selection colours', () => {
  it('gives white text at least 4.5:1 in the light theme', () => {
    expect(contrast(selBgIn(':root {'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('gives white text at least 4.5:1 in both ways the dark theme is applied', () => {
    expect(contrast(selBgIn(':root:not([data-theme="light"]) {'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(selBgIn(':root[data-theme="dark"] {'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('draws selected rows, primary buttons, the active pill and the on state from the token', () => {
    ['.list-row.is-selected', 'button.primary', '.seg-btn.is-on', '.icon-btn.is-on'].forEach((selector) => {
      const start = css.indexOf(`${selector} {`);
      expect(start).toBeGreaterThan(-1);
      expect(css.slice(start, css.indexOf('}', start))).toContain('var(--sel-bg)');
    });
  });

  it('keeps chips on a selected row readable instead of grey-on-white', () => {
    expect(css).toMatch(/\.list-row\.is-selected \.tag\s*\{[^}]*var\(--sel-chip\)[^}]*var\(--sel-fg\)/);
  });
});

describe('dark theme tokens', () => {
  /* Every custom property declared in the rule that starts with `selector`. */
  function tokens(selector) {
    const start = css.indexOf(selector);
    const open = css.indexOf('{', start);
    const body = css.slice(open + 1, css.indexOf('}', open));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  }

  it('lists the same tokens whether the system or DevTools chose dark', () => {
    const byDevTools = tokens(':root[data-theme="dark"] {');
    expect(Object.keys(byDevTools).length).toBeGreaterThan(20);
    expect(tokens(':root:not([data-theme="light"]) {')).toEqual(byDevTools);
  });
});

describe('sticky list headers', () => {
  it('declares the header after the row, so the row\'s position cannot make it scroll away', () => {
    const head = css.indexOf('\n.list-head {');
    expect(head).toBeGreaterThan(css.indexOf('\n.list-row {'));
    expect(css.slice(head, css.indexOf('}', head))).toMatch(/position:\s*sticky/);
  });
});

describe('text and mark tokens', () => {
  /* The value of `token` in the rule that starts with `selector`. */
  function tokenIn(selector, token) {
    const start = css.indexOf(selector);
    const open = css.indexOf('{', start);
    const body = css.slice(open + 1, css.indexOf('}', open));
    return new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)[1];
  }

  const LIGHT = ':root {';
  const DARK = [':root:not([data-theme="light"]) {', ':root[data-theme="dark"] {'];
  const bgOf = (selector, name) => tokenIn(selector, name);

  it('draws the light --flash-bar at 3:1 or more on white, as a non-text mark needs', () => {
    expect(contrast(tokenIn(LIGHT, '--flash-bar'), '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  it('keeps every dark --flash-bar at 3:1 or more on the dark background', () => {
    DARK.forEach((selector) => expect(contrast(tokenIn(selector, '--flash-bar'), bgOf(selector, '--bg'))).toBeGreaterThanOrEqual(3));
  });

  it('gives null, link and slow-call text 4.5:1 on the background and on the alternate one, in every theme', () => {
    [LIGHT, ...DARK].forEach((selector) => {
      ['--null', '--link', '--slow-fg'].forEach((name) => {
        const colour = tokenIn(selector, name);
        expect(contrast(colour, bgOf(selector, '--bg'))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colour, bgOf(selector, '--bg-alt'))).toBeGreaterThanOrEqual(4.5);
      });
    });
  });

});

describe('side-by-side compare signs', () => {
  it('puts + − ~ in the number gutter of added, removed and changed rows, with a spoken equivalent', () => {
    [['added', '+', 'Added'], ['removed', '−', 'Removed'], ['changed', '~', 'Changed']].forEach(([kind, sign, spoken]) => {
      const rule = new RegExp(`\\.cmp-panes:not\\(\\.is-unified\\) \\.cmp-row\\.is-${kind} \\.cmp-n::before \\{[^}]*content: "${sign.replace("+", "\\+")}" / "${spoken}"`);
      expect(css).toMatch(rule);
    });
  });
});
