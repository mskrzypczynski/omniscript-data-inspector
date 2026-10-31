'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* Every toolbar reads the same way: primary buttons, the filter, toggles,
 * Expand / Collapse, then Copy / Save / Export. The filter is wide and the
 * property-name fields are not. */

import { readFileSync } from 'node:fs';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

beforeAll(() => {
  stubChromeDevtools();
  mountPanelMarkup();
});

describe('toolbar order', () => {
  it.each([['filter'], ['struct-filter'], ['log-filter']])('%s sits in the first bar, after the buttons and switches that drive the view', (id) => {
    const bar = document.getElementById(id).closest('.bar');
    expect(bar).toBe(bar.closest('.toolbar').firstElementChild);
    const before = [...bar.children].slice(0, [...bar.children].indexOf(document.getElementById(id)));
    /* The Data bar starts with its view switch: a group of buttons, the one thing that is not a button or a switch. */
    before.forEach((node) => expect(node.tagName === 'BUTTON' || node.querySelector('input[type="checkbox"]') || node.matches('.seg[role="group"]')).toBeTruthy());
  });
});

describe('toolbar widths', () => {
  const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
  const lastRule = (selector) => {
    const matches = [...css.matchAll(new RegExp(`${selector.replace(/[#,]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))];
    return matches[matches.length - 1][1];
  };

  it('gives the filters 140 to 520 px from a small basis, so they shrink before a bar wraps', () => {
    const rule = lastRule('#filter, #struct-filter, #log-filter');
    expect(rule).toMatch(/flex:\s*1 1 140px/);
    expect(rule).toMatch(/min-width:\s*min\(140px/);
    expect(rule).toMatch(/max-width:\s*520px/);
  });

  it('keeps the property fields of Settings to a modest width that gives way in a narrow panel', () => {
    const rule = lastRule('.settings-prop input');
    expect(rule).toMatch(/max-width:\s*170px/);
    expect(rule).toMatch(/min-width:\s*0/);
    // one caption width, so the two fields line up and the caption does not wrap
    expect(lastRule('.settings-prop .settings-choice-label')).toMatch(/flex:\s*0 0 10em/);
    expect(lastRule('.settings-prop')).toMatch(/flex-wrap:\s*nowrap/);
  });
});
