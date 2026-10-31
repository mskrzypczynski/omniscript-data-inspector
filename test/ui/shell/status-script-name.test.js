'use strict';

/* The status bar's left side names the selected script on every tab, so two
 * scripts can be told apart whichever tab is on screen. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { stubInspectedPage, addScript, definition, tick } from '../support/structure-page.js';
import { mountPanelMarkup } from '../support/panel-fixture.js';
import { statusScriptName } from '../../../src/core/shared/script-identity.js';

const $ = (id) => document.getElementById(id);
const defOf = (type, subType) => definition({
  type, subType, steps: [{ name: 'Step1', elements: [{ name: 'Name', JSONPath: 'Step1:Name' }] }]
});

async function boot() {
  jest.resetModules();
  stubInspectedPage();
  global.chrome.devtools.network.onRequestFinished = { addListener: () => {} };
  mountPanelMarkup();
  addScript({ id: 's1', def: defOf('Account', 'Onboarding'), data: { Step1: { Name: 'Ada' } } });
  addScript({ id: 's2', def: defOf('Order', 'Place'), data: { Step1: { Name: 'Bob' } } });
  await import('../../../src/ui/app.js');
  await tick();
  await tick();
}

afterEach(() => {
  if (window.OmniPanel) window.OmniPanel.setVisible(false);
  delete window.OmniPanel;
  document.body.innerHTML = '';
  delete global.chrome;
});

describe('statusScriptName', () => {
  it('is the Type/SubType/Language key, else the label, and nothing for a file or no script', () => {
    expect(statusScriptName({ key: 'Account/Onboarding/English', label: 'div#s1' })).toBe('Account/Onboarding/English');
    expect(statusScriptName({ key: '', label: 'div#s1' })).toBe('div#s1');
    expect(statusScriptName({ session: true, key: 'a/b/c', label: 'x' })).toBe('');
    expect(statusScriptName(null)).toBe('');
  });
});

describe('the status bar names the script', () => {
  it('ends with the script on Data, Structure and Calls, after the tab\'s own text, and follows a change of script', async () => {
    await boot();
    const name = () => $('status-left').lastElementChild;
    const first = [...$('target').options][0];
    const firstName = first.textContent.split('  ')[0].trim();
    for (const tab of ['tab-data', 'tab-structure', 'tab-actions']) {
      $(tab).click();
      await tick();
      if (tab === 'tab-data') {
        // Data names the script itself, in bold, and first: its line is the script, then its size.
        expect($('status-left').textContent.startsWith(firstName)).toBe(true);
        expect($('status-left').querySelector('b').textContent).toBe(firstName);
        expect($('status-left').textContent.split(firstName).length - 1).toBe(1);
        continue;
      }
      expect($('status-left').textContent.endsWith(firstName)).toBe(true);
      expect($('status-left').textContent.startsWith(firstName)).toBe(false); // the counts come first
      expect(name().tagName).toBe('B');
      expect(name().classList.contains('status-script')).toBe(true);
    }

    const select = $('target');
    const other = [...select.options].find((option) => option.value !== first.value);
    select.value = other.value;
    select.dispatchEvent(new Event('change'));
    await tick();
    await tick();
    for (const tab of ['tab-actions', 'tab-structure', 'tab-data']) {
      $(tab).click();
      await tick();
      const otherName = other.textContent.split('  ')[0].trim();
      expect($('status-left').textContent[tab === 'tab-data' ? 'startsWith' : 'endsWith'](otherName)).toBe(true);
    }
  });

  it('gives the name a width of its own, cut with its own ellipsis, so the counts keep their room', () => {
    const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    const rule = css.match(/\.status \.status-script\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/max-width:\s*45vw/);
    expect(rule[1]).toMatch(/overflow:\s*hidden/);
    expect(rule[1]).toMatch(/text-overflow:\s*ellipsis/);
    // The left side keeps its room (counts and name) against a long right side.
    expect(css).toMatch(/#status-left\s*\{[^}]*flex:\s*0 0 auto[^}]*max-width:\s*62%/);
  });

  it('keeps the full text as the tooltip of the left side', async () => {
    await boot();
    $('tab-data').click();
    await tick();
    expect($('status-left').title).toContain($('status-left').lastElementChild.textContent);
    expect($('status-left').title).toContain($('status-left').firstElementChild.textContent);
    // ...and the facts the line leaves out: the element, the property and how many scripts were listed.
    expect($('status-left').title).toMatch(/Element .*, property jsonDataStr\.\n\d+ OmniScripts? listed\./);
  });

  it('does not say the name twice when a tab already does', async () => {
    await boot();
    $('tab-data').click();
    await tick();
    const text = $('status-left').textContent;
    const name = $('status-left').lastElementChild.textContent;
    expect(text.split(name).length - 1).toBe(1);
  });
});
