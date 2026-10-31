'use strict';

/* The Current value card of a step or block as Form | Tree | Raw, the switch and Copy
 * in the card's header. Names and values are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const steps = () => [{ name: 'Intro', elements: [
  { name: 'First', propSetMap: { label: 'First name' } },
  { name: 'Agree', type: 'Checkbox', propSetMap: { label: 'I agree' } },
  { name: 'Dependants', type: 'Edit Block', propSetMap: { label: 'Dependants' }, elements: [
    { name: 'DepName', propSetMap: { label: 'Dependant name' } }
  ] },
  { name: 'Alone' }
] }, { name: 'Next', elements: [{ name: 'Other' }] }];

const DATA = {
  Intro: {
    First: 'Ada', Agree: true, Stray: 7,
    Dependants: [{ DepName: 'Bea' }, { DepName: 'Cy' }]
  },
  Next: { Other: 'x' }
};

const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const switchButtons = () => [...document.querySelectorAll('#struct-detail .value-views .seg-btn')];
const pick = (view) => document.querySelector(`#struct-detail .value-views [data-view="${view}"]`).click();
/* [depth, "Label · Name", value] per row of the form: the element's name is dimmed after the label. */
const formRows = () => [...document.querySelectorAll('#struct-detail .form-row')].map((row) => {
  const label = row.querySelector('.form-label');
  const name = label.querySelector('.fc-elname');
  const value = row.querySelector('.form-field, .form-open, .fc-unknown');
  return [row.style.getPropertyValue('--depth'), `${label.firstChild.textContent}${name ? ` · ${name.textContent}` : ''}`, value.textContent];
});
const cardCopy = () => document.querySelector('#struct-detail .fc-card[data-card="current-value"] .fc-copy');
const toolTitles = () => [...document.querySelectorAll('#struct-detail .detail-tools button')].map((b) => b.title);

let written;
async function open(name) {
  jest.resetModules();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
  const page = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data: DATA }] });
  clickRow(name);
  return page;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the switch', () => {
  it('is Form | Tree | Raw in the header of the Current value card of a step, with Form on, a tooltip and a help entry on each', async () => {
    await open('Intro');
    expect(document.querySelector('#struct-detail .fc-card[data-card="current-value"] > .fc-head .value-views')).not.toBeNull();
    expect(switchButtons().map((b) => b.textContent)).toEqual(['Form', 'Tree', 'Raw']);
    expect(switchButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    switchButtons().forEach((b) => {
      expect(b.title.length).toBeGreaterThan(20);
      expect(b.tagName).toBe('BUTTON');
      expect(b.getAttribute('data-help')).toBe('Current value views');
    });
    expect(document.querySelector('#struct-detail .form-row, #struct-detail .detail-body .row')).not.toBeNull(); // the form
  });

  it('is on a block too, and not on a field', async () => {
    await open('Dependants');
    expect(switchButtons()).toHaveLength(3);
    clickRow('First');
    expect(switchButtons()).toHaveLength(0);
  });

  it('moves with the choice, and the chosen button keeps the focus', async () => {
    await open('Intro');
    pick('tree');
    expect(switchButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(document.activeElement).toBe(document.querySelector('#struct-detail [data-view="tree"]'));
    expect(document.querySelector('#struct-detail .detail-body .row')).not.toBeNull();
  });
});

describe('the Form view', () => {
  it('lists each key as a label, the element\'s name dimmed after it, and the value as plain text', async () => {
    await open('Intro');
    pick('form');
    expect(formRows()).toEqual([
      ['0', 'First name · First', 'Ada'], ['0', 'I agree · Agree', 'true'], ['0', 'Stray', '7'], ['0', 'Dependants', '2 items']
    ]);
    expect(document.querySelector('#struct-detail .form-row input')).toBeNull();
    const row = document.querySelector('#struct-detail .form-row');
    expect(row.getAttribute('aria-label')).toBe('First name (First)');
    expect(row.querySelector('.form-field').className).toBe('fc-mono form-field');
    expect(document.querySelector('#struct-detail .form-label').title).toBe('First · Text');
    expect([...document.querySelectorAll('#struct-detail .form-row')].map((line) => (line.querySelector('.fc-hint') || {}).textContent))
      .toEqual([undefined, 'true/false', 'number', undefined]);
  });

  it('opens a list in place and closes it again, and the rows of a block carry its elements\' labels', async () => {
    await open('Intro');
    pick('form');
    const toggle = () => document.querySelector('#struct-detail .form-open:not(:disabled)');
    toggle().click();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(formRows().slice(3)).toEqual([['0', 'Dependants', '2 items'], ['1', 'Row 1', '1 item'], ['1', 'Row 2', '1 item']]);
    expect(document.activeElement).toBe(toggle());

    const rows = [...document.querySelectorAll('#struct-detail .form-open')];
    rows[1].click();
    expect(formRows().slice(4)).toEqual([['1', 'Row 1', '1 item'], ['2', 'Dependant name · DepName', 'Bea'], ['1', 'Row 2', '1 item']]);
    toggle().click();
    expect(formRows()).toHaveLength(4);
  });

  it('keeps what was opened through a poll that changes the data, and shows the new value', async () => {
    await open('Intro');
    pick('form');
    document.querySelector('#struct-detail .form-open:not(:disabled)').click();
    setData({ ...DATA, Intro: { ...DATA.Intro, First: 'Grace' } });
    jest.advanceTimersByTime(2000);
    await tick();
    expect(formRows()[0]).toEqual(['0', 'First name · First', 'Grace']);
    expect(formRows()).toHaveLength(6);
  });

  it('is kept for the life of the tab: another step opens in it too', async () => {
    await open('Intro');
    pick('tree');
    clickRow('Next');
    expect(switchButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(document.querySelector('#struct-detail .detail-body .row')).not.toBeNull();
  });

  it('draws no Expand or Collapse and keeps the filter box; Copy is the card\'s, not the toolbar\'s', async () => {
    await open('Intro');
    pick('form');
    expect(document.querySelector('#struct-detail .tree-btn')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-find')).not.toBeNull();
    expect(document.querySelector('#struct-detail .detail-find').title || document.querySelector('#struct-detail .detail-find').placeholder).toBeTruthy();
    expect(toolTitles().some((title) => /^Copy/.test(title))).toBe(false);
    expect(cardCopy().title).toBe('Copy the value as JSON. Honours Mask values.');
    expect(cardCopy().getAttribute('data-help')).toBe('Current value views');
  });

  it('copies the value as JSON, masked when Mask values is on', async () => {
    await open('Intro');
    pick('form');
    const copy = cardCopy;
    copy().click();
    await tick();
    expect(JSON.parse(written[0])).toEqual(DATA.Intro);

    const { Mask } = await import('../../../src/ui/mask-setting.js');
    Mask.mount(document.getElementById('mask-values'));
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    copy().click();
    await tick();
    expect(written[1]).not.toContain('Ada');
    expect(JSON.parse(written[1]).First).toBe('<string>');
  });

  it('filters its rows by label or key, says N of M rows in the status bar, and lets go of it again', async () => {
    jest.advanceTimersByTime(0);
    await open('Intro');
    pick('form');
    const find = document.querySelector('#struct-detail .detail-find');
    find.value = 'AGREE'; // the key of "I agree"
    find.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    expect(formRows().map((row) => row[1])).toEqual(['I agree · Agree']);
    expect(document.getElementById('status-left').textContent).toContain('1 of 4 rows');

    document.querySelector('#struct-detail .form-open, #struct-detail .form-field'); // still drawn
    const again = document.querySelector('#struct-detail .detail-find');
    again.value = 'zzz';
    again.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('Nothing here matches "zzz"');

    const last = document.querySelector('#struct-detail .detail-find');
    last.value = '';
    last.dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(200);
    expect(formRows()).toHaveLength(4);
    expect(document.getElementById('status-left').textContent).not.toContain('rows');
  });

  it('keeps the place in the body through a poll that changes a value, and starts at the top for another step', async () => {
    await open('Intro');
    pick('form');
    // Each element has its own scroll position, as in a browser: a new body starts at 0.
    const tops = new WeakMap();
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true, get() { return tops.get(this) || 0; }, set(value) { tops.set(this, value); }
    });
    const body = () => document.querySelector('#struct-detail .detail-body');
    try {
      body().scrollTop = 120;
      setData({ ...DATA, Intro: { ...DATA.Intro, First: 'Grace' } });
      jest.advanceTimersByTime(2000);
      await tick();
      expect(formRows()[0]).toEqual(['0', 'First name · First', 'Grace']);
      expect(body().scrollTop).toBe(120);

      clickRow('Next');
      expect(body().scrollTop).toBe(0);
    } finally {
      delete HTMLElement.prototype.scrollTop;
    }
  });

  it('keeps an open row with its data when a row before it leaves, and forgets the groups of a step left behind', async () => {
    await open('Intro');
    pick('form');
    const withIds = (list) => setData({ ...DATA, Intro: { ...DATA.Intro, Dependants: list } });
    withIds([{ Id: 'r1', DepName: 'Bea' }, { Id: 'r2', DepName: 'Cy' }]);
    jest.advanceTimersByTime(2000);
    await tick();
    const buttons = () => [...document.querySelectorAll('#struct-detail .form-open:not(:disabled)')];
    buttons()[0].click(); // Dependants
    buttons()[2].click(); // Row 2, which is Cy
    expect(formRows().map((row) => row[1])).toContain('Dependant name · DepName');

    withIds([{ Id: 'r2', DepName: 'Cy' }]); // Bea leaves; Cy is now Row 1
    jest.advanceTimersByTime(2000);
    await tick();
    expect(formRows().slice(3)).toEqual([['0', 'Dependants', '1 item'], ['1', 'Row 1', '2 items'], ['2', 'Id', 'r2'], ['2', 'Dependant name · DepName', 'Cy']]);

    clickRow('Next');
    clickRow('Intro');
    expect(formRows()).toHaveLength(4); // what was opened on Intro was forgotten when it was left
  });
});

describe('the Raw view', () => {
  it('is the value as JSON text with a numbered line each, as many as the tree\'s lines', async () => {
    await open('Intro');
    pick('tree');
    document.querySelector('#struct-detail .tree-btn[title^="Expand"]').click();
    const treeLines = Math.max(...[...document.querySelectorAll('#struct-detail .row[data-line]')].map((row) => Number(row.dataset.line)));

    pick('raw');
    const lines = [...document.querySelectorAll('#struct-detail .raw-line')].map((line) => line.textContent);
    expect(lines.join('\n')).toBe(JSON.stringify(DATA.Intro, null, 2));
    expect(lines).toHaveLength(treeLines);
    expect(document.querySelector('#struct-detail pre.raw').classList.contains('is-numbered')).toBe(true);
    expect(document.querySelector('#struct-detail .tree-btn')).toBeNull();
  });

  it('copies the JSON, masked when Mask values is on', async () => {
    await open('Intro');
    pick('raw');
    const copy = cardCopy;
    copy().click();
    await tick();
    expect(JSON.parse(written[0])).toEqual(DATA.Intro);

    const { Mask } = await import('../../../src/ui/mask-setting.js');
    Mask.mount(document.getElementById('mask-values'));
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    copy().click();
    await tick();
    expect(written[1]).not.toContain('Ada');
    expect(JSON.parse(written[1]).First).toBe('<string>');
  });
});

describe('the Tree view', () => {
  it('is what Current value shows until another is picked, and comes back with Tree', async () => {
    await open('Intro');
    pick('raw');
    pick('tree');
    expect(document.querySelector('#struct-detail .fc-card[data-card="current-value"] .value-tree .row')).not.toBeNull();
    expect(document.querySelector('#struct-detail .tree-btn')).not.toBeNull();
  });
});

describe('the Current value card of a simple value', () => {
  it('is first on the tab: the value in mono with its type hint, Copy in the header, and no switch', async () => {
    await open('First');
    const card = document.querySelector('#struct-detail .detail-body > .fc-card');
    expect(card.dataset.card).toBe('current-value');
    expect(card.getAttribute('aria-label')).toBe('Current value');
    expect(card.querySelector('.fc-single .fc-mono').textContent).toBe('Ada');
    expect(card.querySelector('.fc-hint').textContent).toBe('text');
    expect(card.querySelector('.value-views')).toBeNull();
    card.querySelector('.fc-copy').click();
    await tick();
    expect(written[0]).toBe('"Ada"');
    clickRow('Agree');
    expect(document.querySelector('#struct-detail .fc-single').textContent).toBe('truetrue/false');
  });
});
