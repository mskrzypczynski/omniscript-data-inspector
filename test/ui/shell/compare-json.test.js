'use strict';

/* Compare JSON, the button at the end of the tab strip and Settings, Tools: a dialog with two boxes, Before
 * and After, that sets what is pasted side by side. Nothing is sent or stored;
 * what was pasted is there again when the dialog opens again. */

import { readFileSync } from 'node:fs';

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('Compare JSON: status in the header of each box', () => {
  it('marks an invalid box with a bar on its left edge, not a full border', () => {
    const rule = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8').match(/\.cj-text\[aria-invalid="true"\][^{]*\{[^}]*\}/)[0];
    expect(rule).toMatch(/border-left: 3px solid var\(--err-fg\)/);
    expect(rule).not.toMatch(/border-color/);
  });
});

