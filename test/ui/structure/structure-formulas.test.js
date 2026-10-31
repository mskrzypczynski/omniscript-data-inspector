'use strict';

/* Formulas in the Structure tab: estimates are marked with ≈ and "estimated",
 * and never reach the red count. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));
/* The verdict: the head's chip, or on the tab that explains it the tooltip of its card's verdict tag. */
const whyText = () => {
  const chip = document.querySelector('#struct-detail .detail-head .detail-why');
  return chip ? chip.textContent : document.querySelector('#struct-detail .fc-card > .fc-head .fc-tag').title;
};
const headTags = () => [...document.querySelectorAll('#struct-detail .fc-card > .fc-head .fc-tag')].map((tag) => tag.textContent);
const leafRows = () => [...document.querySelectorAll('.fc-cond .fc-main')]
  .map((row) => [...row.children].map((cell) => cell.textContent));

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

const rules = (...list) => ({ group: { operator: 'AND', rules: list } });

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Qty', type: 'Number' },
  { name: 'Total', type: 'Formula', propSetMap: { expression: '%Qty% * 2' } },
  { name: 'Broken', type: 'Formula', propSetMap: { expression: 'FOO(%Qty%)' } },
  { name: 'Gate', propSetMap: { show: rules({ field: 'Intro:Qty', condition: '=', data: '=1 + 2' }) } },
  { name: 'Fill', type: 'Set Values', propSetMap: { elementValueMap: { Qty: '=%Qty% + 1' } } },
  { name: 'Warn', type: 'Set Errors', propSetMap: {
    elementErrorMap: { Qty: 'Too many' },
    show: rules({ field: 'Intro:Qty', condition: '>', data: '=1 + 1' })
  } }
] }];

const boot = (data) => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('a show rule with a formula', () => {
  it('marks the result column with ≈ and the headline with (estimated)', async () => {
    await boot({ Intro: { Qty: 3 } });
    clickRow('Gate');
    tabButton('Visibility').click();
    expect(leafRows()).toEqual([['≈●', 'Qty', '= ≈ 3', '3']]);
    expect(whyText()).toBe('Shown: its condition is true (estimated)');
    expect(headTags()).toEqual(['Shown', 'estimated ≈']);
    const mark = document.querySelector('.fc-main .fc-mark-glyph');
    expect(mark.getAttribute('aria-label')).toBe('met (estimated)');
    expect(mark.title).toMatch(/Estimated/);
    expect(document.querySelector('.fc-main .fc-col-must').title).toMatch(/Estimated/);
  });

  it('puts the estimate in the row tooltip too', async () => {
    await boot({ Intro: { Qty: 4 } });
    const title = rowOf('Gate').querySelector('.tag-cond').title;
    expect(title.split('\n')[1]).toBe('Hidden: Intro:Qty is 4, not ≈ 3 (estimated)');
  });
});

describe('a Formula element', () => {
  it('shows its estimate on the Formula card while the data holds nothing, and none in the list', async () => {
    await boot({ Intro: { Qty: 4 } });
    expect(rowOf('Total').querySelector('.el-value')).toBeNull();

    clickRow('Total');
    const computed = () => [...document.querySelectorAll('#struct-detail .fc-card[data-card="formula"] .fc-row')]
      .find((row) => row.querySelector('.fc-label').textContent === 'Computed value').querySelector('.fc-value').textContent;
    expect(computed()).toBe('8estimated ≈');
    expect(document.querySelector('#struct-detail .fc-card[data-card="current-value"] .fc-unknown').textContent).toBe('not in data');
    expect(document.querySelector('#struct-detail .tab-lede')).toBeNull();
  });

  it('follows the data in the Value tab', async () => {
    await boot({ Intro: { Qty: 4 } });
    clickRow('Total');
    setData({ Intro: { Qty: 5 } });
    await advance(PULSE_MS);
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('10estimated ≈');
  });

  it('says why a formula could not be evaluated, and shows no value', async () => {
    await boot({ Intro: { Qty: 4 } });
    clickRow('Broken');
    const body = document.querySelector('#struct-detail .detail-body').textContent;
    expect(body).toContain("can't tell");
    expect(body).not.toContain('≈');
  });
});

describe('Set Values with a formula', () => {
  it('shows ≈ with the estimate, the target now, and what the tooltip says', async () => {
    await boot({ Intro: { Qty: 4 } });
    clickRow('Fill');
    const row = document.querySelector('.fc-card[data-card="set-values"] tbody tr');
    expect([...row.children].map((cell) => cell.textContent)).toEqual(['Qty', '=%Qty% + 1', '5estimated ≈', '4differs']);
    expect(row.children[2].querySelector('.fc-tag').title).toMatch(/Estimated/);
    expect(row.children[3].querySelector('.fc-tag').title).toMatch(/estimate/);
  });
});

describe('what may stop Next', () => {
  it('does not count a Set Errors that holds only by an estimate, and lists it apart', async () => {
    await boot({ Intro: { Qty: 4 } });
    clickRow('Intro');
    expect(document.querySelector('.detail-stops')).toBeNull(); // nothing is counted, so nothing is said
    expect(document.querySelector('.el-badge')).toBeNull();

    tabButton('Validation').click();
    const card = document.querySelector('#struct-detail .fc-card[data-card="rule"]');
    expect(card.querySelector('.fc-el').textContent).toBe('Warn');
    const [verdict, estimated] = card.querySelectorAll('.fc-head .fc-tag');
    expect(verdict.textContent).toBe('Fails');
    expect(verdict.className).toContain('tag-warn'); // an estimate is never red
    expect(estimated.textContent).toBe('estimated ≈');
  });

  it('puts (estimated) on the head of the Set Errors element', async () => {
    await boot({ Intro: { Qty: 4 } });
    clickRow('Warn');
    expect(whyText()).toBe('Condition is true now: the error is set and blocks Next (estimated)');
  });
});
