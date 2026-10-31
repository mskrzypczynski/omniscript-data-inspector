'use strict';

/* The fact cards of the detail pane: one frame for every fact (a bordered box,
 * a header with the name, the verdict, tags and Copy, labelled rows or a table),
 * no sentence inside a card, names as links that select the element, and a
 * narrow layout that puts each label above its value. */

import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

const rule = { operator: 'AND', rules: [
  { field: 'Intro:Kind', condition: '=', data: 'Business' },
  { field: 'Intro:Missing', condition: '=', data: 'x' }
] };

const steps = () => [{
  name: 'Intro',
  elements: [{ name: 'Kind' }, { name: 'Company', propSetMap: { show: rule } }, { name: 'Other' }]
}];

const boot = () => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: { Intro: { Kind: 'Person' } } }] });
const cards = () => [...document.querySelectorAll('#struct-detail .detail-body > .fc-card')];
const head = (card) => card.querySelector(':scope > .fc-head');

let written = '';
beforeEach(() => {
  jest.useFakeTimers();
  written = '';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: (text) => { written = text; return Promise.resolve(); } }, configurable: true });
});
afterEach(() => jest.useRealTimers());

describe('the Visibility card', () => {
  it('is one card, a region named after it, with the verdict as a tag in its header and Copy at the right', async () => {
    await boot();
    clickRow('Company');
    expect(cards()).toHaveLength(1);
    const card = cards()[0];
    expect(card.tagName).toBe('SECTION');
    expect(card.getAttribute('aria-label')).toBe('Visibility');
    expect(head(card).querySelector('.fc-name').textContent).toBe('Visibility');
    const verdict = head(card).querySelector('.fc-tag');
    expect(verdict.textContent).toBe('Hidden');
    expect(verdict.className).toContain('tag-neutral');
    expect(verdict.title).toMatch(/^Hidden: 2 of 2 conditions fail/);
    expect(head(card).querySelector('.fc-copy').title).toBe('Copy the Visibility card as text. Honours Mask values.');
    expect(head(card).title).toMatch(/^Whether the element is shown/);
  });

  it('shows an element named in a condition by its name, as a link that selects it', async () => {
    await boot();
    clickRow('Company');
    const link = cards()[0].querySelector('.fc-col-field .fc-link');
    expect(link.textContent).toBe('Kind');
    expect(link.title).toBe('Select Kind · Intro:Kind');
    link.click();
    expect(document.querySelector('#struct-detail .detail-title').textContent).toBe('Kind');
    clickRow('Company');
    expect(cards()[0].querySelectorAll('.fc-main .fc-col-field')[1].querySelector('.fc-link')).toBeNull(); // Missing is no element
  });

  it('copies the card as text, masking what the data holds while Mask values is on', async () => {
    await boot();
    clickRow('Company');
    cards()[0].querySelector('.fc-copy').click();
    await tick();
    expect(written.split('\n')).toEqual([
      'Visibility · Company · Hidden',
      'As written\tIntro:Kind = "Business" AND Intro:Missing = "x"',
      'All of these must be true; 2 of 2 are not',
      '  ✗ Intro:Kind = "Business" · is now "Person" · Kind is "Person", not "Business"',
      '  ✗ Intro:Missing = "x" · is now not in data · Missing is not in the data, not "x"'
    ]);
    const { Mask } = await import('../../../src/ui/mask-setting.js');
    Mask.mount(document.getElementById('mask-values'));
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    clickRow('Company');
    cards()[0].querySelector('.fc-copy').click();
    await tick();
    expect(written).not.toContain('Person');
    expect(written).toContain('is now "<string>"');
  });
});

describe('the frame in a narrow pane', () => {
  it('gives every row a label and a value box, and every table cell the name of its column', async () => {
    await boot();
    clickRow('Company');
    const row = cards()[0].querySelector('.fc-row');
    expect([...row.children].map((child) => child.className)).toEqual(['fc-label', 'fc-value']);
    const cells = [...cards()[0].querySelectorAll('.fc-main td[data-label]')].map((cell) => cell.dataset.label);
    expect(cells.slice(0, 3)).toEqual(['Field', 'Must be', 'Is now']);
  });

  it('puts the label above the value and stacks a table under 480 px, with one rule for every card', () => {
    const narrow = css.slice(css.indexOf('@container (max-width: 480px) {\n  .fc-rows'));
    expect(narrow).toMatch(/\.fc-row \{ grid-template-columns: minmax\(0, 1fr\);/);
    expect(narrow).toMatch(/\.fc-table td\[data-label\]::before \{\s*content: attr\(data-label\);/);
    expect(css).not.toMatch(/\.elem-table|\.detail-card-rule|\.rule-outline/);
  });
});

describe('a card that folds', () => {
  const stepDef = () => definition({ steps: [{
    name: 'Intro',
    elements: [
      { name: 'Age', type: 'Number' },
      { name: 'Adult', type: 'Messaging', propSetMap: {
        validateExpression: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '>', data: 17 }] },
        messages: [{ type: 'Requirement', text: 'Adults only', value: false, active: true }]
      } },
      { name: 'Small', type: 'Messaging', propSetMap: {
        validateExpression: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 200 }] },
        messages: [{ type: 'Requirement', text: 'Too old', value: false, active: true }]
      } }
    ]
  }] });
  const bootStep = () => bootStructure({ scripts: [{ id: 'main', def: stepDef(), data: { Intro: { Age: 5 } } }] });
  const ruleCards = () => [...document.querySelectorAll('#struct-detail .fc-card[data-card="rule"]')];
  const toggle = (card) => card.querySelector('.fc-toggle');

  const openStep = async () => {
    await bootStep();
    clickRow('Intro');
    [...document.querySelectorAll('#struct-detail .seg-btn')].find((button) => /^Validation/.test(button.textContent)).click();
  };

  it('is open while it fails and closed to its header line while it passes', async () => {
    await openStep();
    const [failing, passing] = ruleCards();
    expect(toggle(failing).getAttribute('aria-expanded')).toBe('true');
    expect(failing.querySelector('.fc-body').hidden).toBe(false);
    expect(toggle(passing).getAttribute('aria-expanded')).toBe('false');
    expect(passing.querySelector('.fc-body').hidden).toBe(true);
    expect(passing.classList.contains('is-closed')).toBe(true);
    expect(passing.querySelector('.fc-why').textContent).toBe('Age is 5, which is less than 200');
    expect(toggle(passing).getAttribute('aria-label')).toBe('Open Messaging Small');
  });

  it('opens and closes in place on its header, and stays as it was left through a redraw', async () => {
    await openStep();
    const passing = ruleCards()[1];
    passing.querySelector('.fc-name').click();
    expect(passing.querySelector('.fc-body').hidden).toBe(false);
    expect(ruleCards()[1]).toBe(passing); // nothing was rebuilt
    clickRow('Age');
    clickRow('Intro');
    expect(toggle(ruleCards()[1]).getAttribute('aria-expanded')).toBe('true');
    toggle(ruleCards()[1]).click();
    expect(ruleCards()[1].querySelector('.fc-body').hidden).toBe(true);
  });

  it('keeps the focus on its toggle through a poll that redraws the pane', async () => {
    await openStep();
    const before = toggle(ruleCards()[1]);
    before.focus();
    document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Age: 6 } });
    jest.advanceTimersByTime(2000);
    await tick();
    expect(toggle(ruleCards()[1])).not.toBe(before);
    expect(document.activeElement).toBe(toggle(ruleCards()[1]));
  });
});
