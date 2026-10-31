'use strict';

/* CSS-text tests: some of the tests below read panel.css as text and match its
 * rules. jsdom does not lay anything out, so a rule about layout, stacking or
 * the cascade can only be checked on the stylesheet itself. They break on
 * purpose when a selector is renamed or a rule is reordered; update the
 * pattern together with the rule. */

/* Structure readability: the head verdict, tools that only appear where they
 * apply, the list's markers and columns, filtering that keeps context. */

import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
/* The verdict: the head's chip, or on the tab that explains it the tooltip of its card's verdict tag. */
const whyText = () => {
  const chip = document.querySelector('#struct-detail .detail-head .detail-why');
  return chip ? chip.textContent : document.querySelector('#struct-detail .fc-card > .fc-head .fc-tag').title;
};
const treeButtons = () => [...document.querySelectorAll('#struct-detail .detail-tools .tree-btn')];
const shownTreeButtons = () => treeButtons().filter((button) => !button.hidden);
const boot = (steps, data = {}, extra = {}) => bootStructure({
  scripts: [{ id: 'main', def: definition({ steps, ...extra }), data }]
});

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the verdict line in the head', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Age', type: 'Number' },
    { name: 'CheckAge', type: 'Set Errors', propSetMap: {
      elementErrorMap: { Age: 'Must be an adult' },
      show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] }
    } }
  ] }];

  it('states the validation verdict for a Set Errors element, not its own visibility', async () => {
    await boot(steps(), { Intro: { Age: 12 } });
    clickRow('CheckAge');
    expect(whyText()).toBe('Condition is true now: the error is set and blocks Next');

    setData({ Intro: { Age: 30 } });
    await advance(PULSE_MS);
    /* Nothing to warn about: no chip in the head, the sentence is at the top of the Validation tab. */
    expect(document.querySelector('#struct-detail .detail-head .detail-why')).toBeNull();
    tabButton('Validation').click();
    expect(whyText()).toBe('Condition is false now: no error is set');
  });

  it('is said once on the tab that explains it, as the verdict in its card\'s header, and not as a chip beside it', async () => {
    await boot(steps(), { Intro: { Age: 12 } });
    clickRow('CheckAge');
    expect(document.querySelector('#struct-detail .seg-btn.is-on').textContent).toBe('Validation'); // its own tab: no chip
    tabButton('Properties').click();
    expect(document.querySelector('#struct-detail .detail-head .detail-chip')).not.toBeNull();
    tabButton('Validation').click();
    expect(document.querySelector('#struct-detail .detail-head .detail-chip')).toBeNull();
    const card = document.querySelector('#struct-detail .fc-card');
    expect(card.querySelector('.fc-name').textContent).toBe('Validation');
    const verdict = card.querySelector('.fc-head .fc-tag');
    expect(verdict.textContent).toBe('Fails');
    expect(verdict.title).toContain('Condition is true now');
    expect(card.textContent).not.toContain('Condition is true now');
  });
});

describe('tools that only appear where they apply', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Kind' },
    { name: 'Company', propSetMap: { label: 'Company', show: { operator: 'AND', rules: [
      { field: 'Intro:Kind', condition: '=', data: 'Business' }
    ] } } },
    { name: 'Fill', type: 'Set Values', propSetMap: { elementValueMap: { Kind: 'x' } } }
  ] }];

  it('shows Expand all and Collapse all on Current value and JSON, not on Properties or Visibility', async () => {
    await boot(steps(), { Intro: { Kind: 'Person', Company: { a: 1 } } });
    clickRow('Company');
    expect(shownTreeButtons()).toHaveLength(2); // Current value holds an object
    tabButton('Properties').click();
    expect(treeButtons()).toHaveLength(0);
    tabButton('Visibility').click();
    expect(shownTreeButtons()).toHaveLength(0);
    tabButton('JSON').click();
    expect(shownTreeButtons()).toHaveLength(2);
  });

  it('has no filter, no Expand all and no tools Copy on a rule tab: there is no tree to filter, and the card has its own Copy', async () => {
    await boot(steps(), { Intro: { Kind: 'Person' } });
    clickRow('Company');
    tabButton('Visibility').click();
    expect(treeButtons()).toHaveLength(0);
    expect(document.querySelector('#struct-detail .detail-tools input')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-tools .icon-btn[title="Copy this view as JSON. Honours Mask values."]')).toBeNull();
    expect(document.querySelectorAll('#struct-detail .fc-copy')).toHaveLength(1);
  });
});

describe('the list', () => {
  const steps = () => [
    { name: 'Intro', elements: [
      { name: 'Kind', propSetMap: { required: true } },
      { name: 'Box', type: 'Block', elements: [{ name: 'Inner' }, { name: 'Other' }] },
      { name: 'Call', type: 'DataRaptor Extract Action', propSetMap: { bundle: 'Lookup' } }
    ] },
    { name: 'Final', elements: [{ name: 'Done' }] }
  ];
  const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
    .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));
  const filter = async (text) => {
    const box = document.getElementById('struct-filter');
    box.value = text;
    box.dispatchEvent(new Event('input'));
    await advance(200);
  };

  it('says in one line when nothing matches, and Clear filter brings the list back', async () => {
    await boot(steps());
    await filter('zzz');
    const line = document.querySelector('#struct-list .struct-no-match');
    expect(line.textContent).toBe('No elements match “zzz”Clear filter');
    expect(document.querySelectorAll('#struct-list .el-row')).toHaveLength(0);

    document.getElementById('struct-clear-filter').click();
    expect(document.getElementById('struct-filter').value).toBe('');
    expect(document.querySelector('#struct-list .struct-no-match')).toBeNull();
    expect(rowOf('Kind')).toBeTruthy();
  });

  it('has no Type column: the exact type is in the tooltips', async () => {
    await boot(steps());
    expect(document.querySelector('#struct-list .el-type')).toBeNull();
    const heads = [...document.querySelectorAll('#struct-list .el-head > *')].map((n) => n.textContent);
    expect(heads).toEqual(['', '', 'Element', 'Marks', 'Valid']);
    expect(rowOf('Call').querySelector('.el-name').title).toContain('DataRaptor Extract Action');
    expect(rowOf('Call').querySelector('.el-icon').title).toContain('DataRaptor Extract Action');
  });

  it('puts the legend of the markers in the Marks column header tooltip, and leaves the Element header its own', async () => {
    await boot(steps());
    expect(document.querySelector('#struct-list .el-head .el-name').title).not.toContain('=');
    const title = document.querySelector('#struct-list .el-head .el-marks').title;
    ['tick = passes its rules now', 'cross = would stop Next now', 'dash = the panel cannot tell', '* = required', 'closed eye = hidden by its show rule',
      'diamond = has a show rule', 'arrows = calls', 'triangle = a custom label it uses is missing',
      'cube = overridden by a custom component', 'window = step', 'bolt = action', '<> = custom component', 'small dot = anything else']
      .forEach((line) => expect(title).toContain(line));
  });

  it('draws the twisty as a chevron icon that turns when the section is open', async () => {
    await boot(steps());
    const twisty = rowOf('Box').querySelector('.twisty');
    expect(twisty.querySelector('svg.ui-icon.ic-chevron-right')).not.toBeNull();
    expect(twisty.classList.contains('is-open')).toBe(true);
    twisty.click();
    expect(rowOf('Box').querySelector('.twisty').classList.contains('is-open')).toBe(false);
    expect(rowOf('Kind').querySelector('.twisty').classList.contains('is-leaf')).toBe(true);
    expect(rowOf('Kind').querySelector('.twisty svg')).toBeNull();
  });

  it('marks sections, and a folded one shows how many elements it holds', async () => {
    await boot(steps());
    expect(rowOf('Intro').classList.contains('is-section')).toBe(true);
    expect(rowOf('Kind').classList.contains('is-section')).toBe(false);
    expect(rowOf('Box').querySelector('.el-count')).toBeNull();
    rowOf('Box').querySelector('.twisty').click();
    expect(rowOf('Box').querySelector('.el-count').textContent).toBe('(2)');
    rowOf('Intro').querySelector('.twisty').click();
    expect(rowOf('Intro').querySelector('.el-count').textContent).toBe('(3)');
  });

  it('shows Required as a neutral * chip with the same role and name', async () => {
    await boot(steps());
    const tag = rowOf('Kind').querySelector('.tag-req');
    expect(tag.textContent).toBe('*');
    expect(tag.getAttribute('role')).toBe('img');
    expect(tag.getAttribute('aria-label')).toBe('Required');
  });

  it('keeps the steps above the matches of a filter, dimmed as context', async () => {
    await boot(steps());
    await filter('inner');
    const names = [...document.querySelectorAll('#struct-list .el-row .el-name')]
      .map((n) => n.textContent.replace(/ \(.*/, '')).filter((n) => n !== 'Element');
    expect(names).toEqual(['Intro', 'Box', 'Inner']);
    expect(rowOf('Intro').classList.contains('is-context')).toBe(true);
    expect(rowOf('Box').classList.contains('is-context')).toBe(true);
    expect(rowOf('Inner').classList.contains('is-context')).toBe(false);
    await filter('');
    expect(document.querySelectorAll('#struct-list .is-context')).toHaveLength(0);
  });

  it('says in the status bar how many elements rules hide', async () => {
    const hiding = steps();
    hiding[0].elements.push({ name: 'Gated', propSetMap: { show: { operator: 'AND', rules: [
      { field: 'Intro:Kind', condition: '=', data: 'x' }
    ] } } });
    await boot(hiding, { Intro: { Kind: 'y' } });
    expect(document.getElementById('status-left').textContent).toContain('1 hidden');
  });

  it('names the step and its place in the status bar, and keeps the property names for the tooltip', async () => {
    await boot([
      { name: 'Intro', label: 'Getting started', elements: [{ name: 'Kind' }] },
      { name: 'Plan', label: 'Plan Selection', elements: [{ name: 'Tier' }] }
    ], {}, { asIndex: 1 });
    const left = document.getElementById('status-left');
    expect(left.textContent).toBe('Plan Selection (step 2 of 2) · 4 elements');
    expect(left.title).toContain('jsonDef');
    expect(left.title).toContain('asIndex (1)');
    expect(document.getElementById('status-right').textContent).not.toMatch(/jsonDef|asIndex/);
  });

  it('does not count an element hidden only by the old bShow of a rule it cannot judge', async () => {
    const unjudged = steps();
    unjudged[0].elements.push({ name: 'Gated', propSetMap: { show: { operator: 'AND', rules: [
      { field: 'Intro:Kind', condition: 'contains', data: 'x' }
    ] } } });
    const def = definition({ steps: unjudged });
    const gated = def.children[0].children[0].eleArray.find((node) => node.name === 'Gated');
    gated.bShow = false;
    await bootStructure({ scripts: [{ id: 'main', def, data: { Intro: { Kind: 'y' } } }] });
    expect(document.getElementById('status-left').textContent).not.toContain('hidden');
  });

  it('says in the detail pane when the filter hides the selected element', async () => {
    await boot(steps());
    clickRow('Kind');
    expect(document.querySelector('#struct-detail .detail-filtered')).toBeNull();
    await filter('done');
    expect(document.querySelector('#struct-detail .detail-filtered').textContent)
      .toBe('Not in the list: the current filter hides it.');
    await filter('');
    expect(document.querySelector('#struct-detail .detail-filtered')).toBeNull();
  });

  it('does not say it for a step kept as context', async () => {
    await boot(steps());
    clickRow('Intro');
    await filter('inner');
    expect(document.querySelector('#struct-detail .detail-filtered')).toBeNull();
  });
});

describe('Follow current step after a hand pick', () => {
  const steps = () => [
    { name: 'Intro', elements: [{ name: 'Kind' }] },
    { name: 'Final', elements: [{ name: 'Done' }] }
  ];
  const label = () => document.getElementById('struct-follow').closest('label');
  const paused = () => label().classList.contains('is-paused');

  it('shows a pause by a dot and a tooltip, announces it, and never changes the label, until Current step is pressed', async () => {
    await boot(steps());
    expect(paused()).toBe(false); // Follow selected the current step itself
    expect(document.getElementById('struct-follow-paused').textContent).toBe('');
    clickRow('Kind');
    expect(paused()).toBe(true);
    expect(label().textContent.trim()).toBe('Follow current step'); // the width does not change, so nothing reflows
    const note = document.getElementById('struct-follow-paused');
    expect(note.textContent).toBe('Follow current step is paused while you browse');
    expect(note.getAttribute('role')).toBe('status');
    expect(label().contains(note)).toBe(false);
    expect(label().title).toMatch(/Paused while you browse.*Current step/);
    document.getElementById('struct-current').click();
    expect(paused()).toBe(false);
    expect(note.textContent).toBe('');
    expect(label().title).toMatch(/^Keep the step the script is on selected/);
    expect(label().title).not.toMatch(/Paused/);
  });

  it('goes away when the box is ticked again, and does not show while Follow is off', async () => {
    await boot(steps());
    clickRow('Kind');
    const box = document.getElementById('struct-follow');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(paused()).toBe(false);
    clickRow('Done');
    expect(paused()).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(paused()).toBe(false);
  });
});

describe('the detail tools', () => {
  const steps = () => [{ name: 'Intro', elements: [
    { name: 'Kind', propSetMap: { label: 'Kind' } }
  ] }];

  it('offers the filter box only where there is something to filter', async () => {
    await boot(steps(), { Intro: { Kind: 'Person' } });
    clickRow('Kind');
    expect(document.querySelector('#struct-detail .detail-find')).toBeNull(); // a scalar value
    tabButton('Properties').click();
    expect(document.querySelector('#struct-detail .detail-find')).not.toBeNull();
    tabButton('JSON').click();
    expect(document.querySelector('#struct-detail .detail-find')).not.toBeNull();
  });

  it('keeps the list header on top while the list scrolls, and readable on a selected row in the dark theme', () => {
    const css = readFileSync('panel.css', 'utf8');
    expect(css).toMatch(/\n\.list-head\s*\{[^}]*position:\s*sticky/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{[^}]*--sel-bg:/);
  });
});
