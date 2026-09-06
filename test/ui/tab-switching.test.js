'use strict';

/* Integration test for the panel shell: clicking a tab shows its section and
 * hides the others. This is exactly the kind of decision Jest+jsdom now
 * makes practical to test directly, rather than only by hand in DevTools. */

import { stubChromeDevtools, mountPanelMarkup } from './support/panel-fixture.js';

function isVisible(id) {
  return !document.getElementById(id).hidden;
}

describe('tab switching', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../src/ui/app.js');
  });

  it('shows the Data tab on load, since that is the default in the markup', () => {
    expect(isVisible('view-data')).toBe(true);
    expect(isVisible('view-structure')).toBe(false);
    expect(isVisible('view-actions')).toBe(false);
  });

  it('switches to Structure when its tab is clicked', () => {
    document.getElementById('tab-structure').click();

    expect(isVisible('view-structure')).toBe(true);
    expect(isVisible('view-data')).toBe(false);
    expect(isVisible('view-actions')).toBe(false);
    expect(document.getElementById('tab-structure').classList.contains('is-on')).toBe(true);
    expect(document.getElementById('tab-structure').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('tab-data').classList.contains('is-on')).toBe(false);
  });

  it('switches to Remote actions when its tab is clicked', () => {
    document.getElementById('tab-actions').click();

    expect(isVisible('view-actions')).toBe(true);
    expect(isVisible('view-structure')).toBe(false);
    expect(document.getElementById('tab-actions').getAttribute('aria-selected')).toBe('true');
  });

  it('switches back to Data', () => {
    document.getElementById('tab-data').click();

    expect(isVisible('view-data')).toBe(true);
    expect(isVisible('view-actions')).toBe(false);
    expect(document.getElementById('tab-data').getAttribute('aria-selected')).toBe('true');
  });
});
