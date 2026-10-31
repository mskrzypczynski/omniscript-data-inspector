'use strict';

/* Every control that says which help entry explains it (data-help) must name
 * an entry the help of this build shows: a control whose entry the Free build
 * leaves out would open an empty help. Checked on the markup after boot and
 * with the settings dialog open, for both builds. */

import { jest } from '@jest/globals';
import { mountPanelMarkup, stubChromeDevtools } from '../support/panel-fixture.js';

const $ = (id) => document.getElementById(id);

async function boot({ free = false } = {}) {
  jest.resetModules();
  mountPanelMarkup({ free });
  stubChromeDevtools();
  await import(free ? '../../../src/ui/app.js' : '../../../src/ui/app.js');
}

async function shownTitles() {
  const [{ DATA_HELP }, { STRUCTURE_HELP }, { ACTIONS_HELP }, { COMMON_HELP }] = await Promise.all([
    import('../../../src/ui/help/data.js'), import('../../../src/ui/help/structure.js'),
    import('../../../src/ui/help/actions.js'), import('../../../src/ui/help/common.js')
  ]);
  const titles = new Set(COMMON_HELP[1].map(([title]) => title));
  [DATA_HELP, STRUCTURE_HELP, ACTIONS_HELP].forEach((tab) => tab.sections.forEach(([, entries]) => entries.forEach(([title]) => titles.add(title))));
  return titles;
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

[true, false].forEach((free) => {
  describe(free ? 'the controls of the Free build' : 'the controls of panel.html as it is', () => {
    it('name a help entry that this build shows', async () => {
      await boot({ free });
      $('settings').click();
      const titles = await shownTitles();
      const targets = [...document.querySelectorAll('[data-help]')].map((node) => node.getAttribute('data-help'));
      expect(targets.length).toBeGreaterThan(20);
      const missing = [...new Set(targets)].filter((name) => !titles.has(name));
      expect(missing).toEqual([]);
    });
  });
});

describe('the wording of the Free build', () => {
  it('names no gated control in the title of a control it keeps', async () => {
    await boot({ free: true });
    const gatedWords = /Collapse done steps|Timeline|Compare definition|selected calls|watch list|Problems count|May stop Next/;
    const offenders = [...document.querySelectorAll('[title]')].filter((node) => gatedWords.test(node.getAttribute('title')));
    expect(offenders.map((node) => node.id || node.className)).toEqual([]);
    $('settings').click();
    const inDialog = [...document.querySelectorAll('#settings-overlay [title]')].filter((node) => gatedWords.test(node.getAttribute('title')));
    expect(inDialog.map((node) => node.id || node.className)).toEqual([]);
  });

  it('ends the panel tour at the gear', async () => {
    jest.resetModules();
    const { tourSteps } = await import('../../../src/core/shared/tour.js');
    expect(tourSteps(true).find((step) => step.id === 'help').text).toBe('The [[?]] button opens help. The gear, [[Settings]], opens settings.');
    expect(tourSteps(false).find((step) => step.id === 'help').text).toBe('The [[?]] button opens help. The gear, [[Settings]], opens settings and the debug bundle.');
    expect(tourSteps(true)).toHaveLength(4);
  });
});
