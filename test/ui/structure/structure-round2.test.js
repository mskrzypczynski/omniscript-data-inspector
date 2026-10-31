'use strict';

/* Second fix round of the Structure tab: what a rule that cannot be judged
 * does to the list, the status bar and Visible only. Names are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, rowNames, clickRow, tick } from '../support/structure-page.js';
import { toggleView } from '../support/structure-menus.js';

const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name').textContent.startsWith(name));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('an element whose show rule cannot be judged', () => {
  async function bootUnjudged() {
    const def = definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Kind' },
      { name: 'Gated', type: 'Block', propSetMap: { show: { operator: 'AND', rules: [
        { field: 'Intro:Kind', condition: 'contains', data: 'x' }
      ] } }, elements: [{ name: 'Inner' }] }
    ] }] });
    def.children[0].children[0].eleArray.find((node) => node.name === 'Gated').bShow = false;
    await bootStructure({ scripts: [{ id: 'main', def, data: { Intro: { Kind: 'y' } } }] });
  }

  it('is not counted hidden, nor are the elements under it', async () => {
    await bootUnjudged();
    expect(document.getElementById('status-left').textContent).not.toContain('hidden');
  });

  it('is tagged as having a rule, not as hidden, and neither is what is under it', async () => {
    await bootUnjudged();
    expect(document.querySelectorAll('#struct-list .tag-hidden')).toHaveLength(0);
    expect(document.querySelectorAll('#struct-list .el-row.is-hidden')).toHaveLength(0);
    expect(rowOf('Gated').querySelector('.tag-cond')).not.toBeNull();
  });

  it('is still dropped by Visible only', async () => {
    await bootUnjudged();
    toggleView('Visible only');
    await tick();
    expect(rowNames().join('|')).not.toContain('Gated');
    expect(rowNames().join('|')).not.toContain('Inner');
  });
});

describe('Esc in the list', () => {
  const steps = () => [
    { name: 'Intro', elements: [{ name: 'Kind' }] },
    { name: 'Final', elements: [{ name: 'Done' }] }
  ];
  const press = (row, key) => row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const selectedRow = () => document.querySelector('#struct-list .el-row.is-selected');
  const title = () => document.querySelector('#struct-detail .detail-title');

  async function bootWithVisits() {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: {} }] });
    jest.advanceTimersByTime(4000);
    await tick();
  }

  it('says Follow current step has stopped', async () => {
    await bootWithVisits();
    const mark = document.getElementById('struct-follow-paused');
    expect(mark.textContent).toBe('');
    press(selectedRow(), 'Escape');
    expect(mark.textContent).toMatch(/paused/);
    expect(title()?.textContent || '').not.toBe('Intro');
  });
});

describe('the Validation tab, one card', () => {
  const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
    .find((button) => button.textContent.startsWith(label));
  const cards = () => [...document.querySelectorAll('#struct-detail .detail-body > .fc-card')];
  const rows = () => [...cards()[0].querySelectorAll('.fc-row, .fc-group')].map((row) => (row.classList.contains('fc-group')
    ? [row.textContent] : [row.querySelector('.fc-label').textContent, row.querySelector('.fc-value').textContent]));
  const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

  async function bootChecks() {
    await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: [{ name: 'Intro', elements: [
      { name: 'Age', type: 'Number' },
      { name: 'Notice', type: 'Messaging', propSetMap: {
        validateExpression: rule('Intro:Age', '>', 17),
        messages: [{ type: 'Requirement', text: 'Adults only', value: false, active: true }]
      } },
      { name: 'CheckAge', type: 'Set Errors', propSetMap: {
        elementErrorMap: { Age: 'Too young' }, show: rule('Intro:Age', '<', 18)
      } }
    ] }] }), data: { Intro: { Age: 12 } } }] });
  }

  it('shows a Messaging element as one card: what it shows, its kind, the condition and the rule as written', async () => {
    await bootChecks();
    clickRow('Notice');
    tabButton('Validation').click();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector('.fc-name').textContent).toBe('Validation');
    expect(rows()).toEqual([['Shows', 'Adults only'], ['Kind', 'Requirement, which blocks Next'], ['As written', 'Intro:Age > 17']]);
    expect(cards()[0].querySelector('.fc-cond')).not.toBeNull();
    expect(document.querySelector('#struct-detail details.raw-rule')).toBeNull();
    expect(document.querySelector('#struct-detail .definition-link')).toBeNull();
  });

  it('shows a Set Errors element as one card: the errors it sets, when it is checked, the condition and the rule as written', async () => {
    await bootChecks();
    clickRow('CheckAge');
    tabButton('Validation').click();
    expect(cards()).toHaveLength(1);
    expect(rows()).toEqual([
      ['Errors it sets'], ['Age', 'Too young'], ['Checked', 'When the user moves between steps'], ['As written', 'Intro:Age < 18']
    ]);
    expect(cards()[0].querySelector('.fc-row .fc-label.is-name .fc-link').textContent).toBe('Age');
    expect(cards()[0].querySelector('.fc-head .fc-tag').textContent).toBe('Fails');
  });
});

describe('the element list at rest', () => {
  it('leaves room for the pinned rows when a row is scrolled into view, without snapping', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    expect(css).toMatch(/#struct-list\s*\{[^}]*scroll-padding-top/);
    expect(css).not.toMatch(/scroll-snap/);
  });
});

describe('Conditional View in the Properties tab', () => {
  it('keeps a value and a field name whole, and stacks Field / Must be / Is now in a narrow pane', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.prop-table td > \.rule-table \.rule-cond,\s*\.prop-table td > \.rule-table \.rule-now\s*\{\s*white-space:\s*nowrap/);
    expect(css).toMatch(/\.prop-table td > \.rule-table \.rule-field\s*\{\s*overflow-wrap:\s*normal/);
    expect(css).toMatch(/@container \(max-width: 700px\)\s*\{[^@]*\.prop-table td > \.rule-table \.rule-leaf\s*\{\s*display:\s*grid/);
    expect(css).toContain('content: "Must be "');
  });
});
