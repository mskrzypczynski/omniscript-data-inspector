'use strict';

/* The Sizes list drilled into a node (a chevron on a row with values under it,
 * a trail above, Esc up one level, shared with the treemap) and its row count
 * (20 to begin with, Show 20 more, Show all). */

import fs from 'fs';

beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return this.classList.contains('sizes-map') ? 600 : 0; }
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true, get() { return this.classList.contains('sizes-map') ? 300 : 0; }
  });
});

afterEach(() => {
  delete globalThis.ResizeObserver;
  delete HTMLElement.prototype.clientWidth;
  delete HTMLElement.prototype.clientHeight;
  document.body.innerHTML = '';
});

describe('the Sizes list from the keyboard', () => {
  it('gives the chevron a pointer target of 20px across although it stays 14px wide', () => {
    const css = fs.readFileSync('panel.css', 'utf8');
    expect(css).toMatch(/\.size-drill\s*\{[^}]*position:\s*relative[^}]*width:\s*14px/);
    const pad = css.match(/\.size-drill:not\(\.is-gap\)::before\s*\{[^}]*inset:\s*(-?[\d.]+)px\s+(-?[\d.]+)px/);
    expect(14 - 2 * Number(pad[2])).toBeGreaterThanOrEqual(20);
  });

  it('keeps the focus ring on the row', () => {
    const css = fs.readFileSync('panel.css', 'utf8');
    expect(css).toMatch(/\.size-row:focus-visible\s*\{[^}]*outline:/);
    expect(css).toMatch(/\.size-rows\s*\{\s*display:\s*contents/);
  });
});

describe('Show in tree on a Sizes row', () => {
  /* jsdom has no :hover or :focus-visible: the rules that show and hide it are
   * pinned as text, the same as the Tree's row buttons. */
  it('is hidden by opacity without a transition, and shown by hover or keyboard focus on the row', () => {
    const css = fs.readFileSync('panel.css', 'utf8');
    const rule = css.match(/\.size-path \.size-reveal\s*\{([^}]*)\}/)[1];
    expect(rule).toMatch(/margin:[^;]*calc\(-1\.4em - 4px\)/); // takes no room, so showing it moves nothing
    expect(rule).toMatch(/opacity:\s*0/);
    expect(rule).toMatch(/pointer-events:\s*none/);
    expect(rule).not.toMatch(/visibility|transition/);
    expect(css).toMatch(/\.size-row:hover \.size-reveal,\s*\.size-row:focus-visible \.size-reveal,\s*\.size-row:has\(\.size-reveal:focus-visible\) \.size-reveal\s*\{\s*opacity:\s*1;\s*pointer-events:\s*auto/);
  });
});

describe('long paths in the Sizes list', () => {
  it('wrap instead of being cut off, in the bar-aligned grid', () => {
    const css = fs.readFileSync('panel.css', 'utf8');
    const rule = (selector) => css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))[1];
    expect(rule('.size-name')).toMatch(/white-space:\s*normal/);
    expect(rule('.size-name')).toMatch(/overflow-wrap:\s*break-word/);
    expect(rule('.size-name')).not.toMatch(/text-overflow/);
    expect(rule('.size-name')).toMatch(/min-height:\s*0/); // the base button rule's 22px would make every row taller
    expect(rule('.size-drill')).toMatch(/min-height:\s*0/);
    expect(rule('.size-path')).not.toMatch(/text-overflow|white-space:\s*nowrap/);
    expect(rule('.size-bar')).toMatch(/width:\s*100%/);
  });
});
