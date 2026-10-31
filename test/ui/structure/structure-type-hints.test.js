'use strict';

/* The value type hint: an amber chip on the row, the same text in the row
 * tooltip and one line in the detail head. A hint: counted nowhere. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [{ name: 'Intro', elements: [
  { name: 'Qty', type: 'Number' },
  { name: 'Agree', type: 'Checkbox' },
  { name: 'Kind', type: 'Select', propSetMap: { options: [{ name: 'a', value: 'A' }] } },
  { name: 'Total', type: 'Formula', propSetMap: { expression: '"x" & 1' } },
  { name: 'Req', type: 'Number', propSetMap: { required: true } }
] }];

const rowOf = (name) => [...document.querySelectorAll('#struct-list .el-row')]
  .find((row) => row.querySelector('.el-name') && row.querySelector('.el-name').textContent.startsWith(name));
const chip = (name) => rowOf(name).querySelector('.tag-type');
const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

const boot = (data) => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('value type hints', () => {
  it('puts an amber chip with the text on a row whose value has the wrong shape', async () => {
    await boot({ Intro: { Qty: '12,5', Agree: 'true', Kind: 'zzz' } });
    const qty = chip('Qty');
    expect(qty.textContent).toBe('');
    expect(qty.querySelector('svg.ic-not-equal')).not.toBeNull();
    expect(qty.title).toBe('Number holds text “12,5”: a comma or space inside a number is a locale format, not a number');
    expect(qty.getAttribute('role')).toBe('img');
    expect(qty.getAttribute('aria-label')).toBe(`Value type hint: ${qty.title}`);
    expect(chip('Agree').title).toBe('Checkbox holds the text “true”, not a boolean');
    expect(chip('Kind').title).toBe('Select holds “zzz”, which is not one of its options (a)');
  });

  it('repeats the text in the row tooltip', async () => {
    await boot({ Intro: { Qty: 'abc' } });
    expect(rowOf('Qty').querySelector('.el-name').title).toBe('Qty — Number\nNumber holds text “abc”');
    expect(rowOf('Agree').querySelector('.el-name').title).toBe('Agree — Checkbox');
  });

  it('has no chip for a value of the right shape, an absent value, a formula or no data', async () => {
    await boot({ Intro: { Qty: 12, Agree: true, Kind: 'a' } });
    expect(document.querySelectorAll('.tag-type')).toHaveLength(0);
  });

  it('never judges an estimate', async () => {
    await boot({ Intro: {} });
    expect(rowOf('Total').querySelector('.el-value')).toBeNull();
    expect(chip('Total')).toBeNull();
  });

  it('says it once in the detail head', async () => {
    await boot({ Intro: { Qty: '12,5' } });
    clickRow('Qty');
    const lines = [...document.querySelectorAll('#struct-detail .detail-typehint')];
    expect(lines).toHaveLength(1);
    expect(lines[0].textContent).toBe('≠ Number holds text “12,5”: a comma or space inside a number is a locale format, not a number');
    clickRow('Agree');
    expect(document.querySelector('#struct-detail .detail-typehint')).toBeNull();
  });

  it('follows the data: appears, changes and goes in place, without rebuilding the list', async () => {
    await boot({ Intro: { Qty: 5 } });
    const row = rowOf('Qty');
    expect(chip('Qty')).toBeNull();

    setData({ Intro: { Qty: 'five' } });
    await advance(PULSE_MS);
    expect(rowOf('Qty')).toBe(row);
    expect(chip('Qty').title).toBe('Number holds text “five”');
    expect(row.querySelector('.el-name').title).toContain('Number holds text “five”');
    expect(row.querySelector('.tag-type').parentNode.className).toBe('el-marks'); // in the Marks cell, which stays before the Next cell

    setData({ Intro: { Qty: 'six' } });
    await advance(PULSE_MS);
    expect(row.querySelectorAll('.tag-type')).toHaveLength(1);
    expect(chip('Qty').title).toBe('Number holds text “six”');

    setData({ Intro: { Qty: 6 } });
    await advance(PULSE_MS);
    expect(chip('Qty')).toBeNull();
    expect(rowOf('Qty')).toBe(row);
  });

  it('updates the detail head when the data changes', async () => {
    await boot({ Intro: { Qty: 5 } });
    clickRow('Qty');
    expect(document.querySelector('#struct-detail .detail-typehint')).toBeNull();
    setData({ Intro: { Qty: 'five' } });
    await advance(PULSE_MS);
    expect(document.querySelector('#struct-detail .detail-typehint').textContent).toBe('≠ Number holds text “five”');
  });
});
