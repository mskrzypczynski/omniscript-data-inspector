'use strict';

/* The watch strip: its buttons are named for assistive technology, and adding
 * the first pin (or removing the last) does not move the tree on screen. */

import { readFileSync } from 'node:fs';

afterEach(() => { document.body.innerHTML = ''; });

/* jsdom has no layout, so the sizes are read from the stylesheet text. */
const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
const ruleOf = (selector) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
};

describe('watch strip size', () => {
  it('stops growing at a share of the panel and scrolls, keeping the + in reach', () => {
    const strip = ruleOf('.watch');
    expect(strip).toMatch(/max-height:\s*30vh/);
    expect(strip).toMatch(/overflow-y:\s*auto/);
    expect(ruleOf('.watch-add')).toMatch(/position:\s*sticky/);
  });

  it('gives the bell and the remove button a 24 x 24 hit area', () => {
    ['.watch-notify', '.watch-remove'].forEach((selector) => {
      expect(ruleOf(selector)).toMatch(/min-width:\s*24px/);
      expect(ruleOf(selector)).toMatch(/min-height:\s*24px/);
    });
  });
});

describe('watch strip chips at rest', () => {
  const rest = '.watch-item:not(:hover):not(:focus-within)';
  const body = (selector) => {
    const start = css.indexOf(`${rest} ${selector}`);
    return start < 0 ? '' : css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  };

  it('take no room for the x or a bell that is off until hovered or focused, and keep a bell that is on', () => {
    ['.watch-remove', '.watch-notify[aria-pressed="false"]'].forEach((selector) => {
      expect(body(selector)).toMatch(/(?<![-\w])width:\s*0/);
      // still in the tab order and the accessibility tree
      expect(body(selector)).not.toMatch(/display:\s*none|visibility:\s*hidden/);
    });
    const kept = body('.watch-notify[aria-pressed="true"]');
    expect(kept).not.toBe('');
    expect(kept).not.toMatch(/opacity:\s*0|(?<![-\w])width:\s*0/);
  });
});
