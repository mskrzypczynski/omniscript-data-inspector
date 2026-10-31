'use strict';

/* Set Values, Options, Formula, Merge fields and Additional input as fact cards of
 * the detail pane: the one frame, a header with Copy, no sentence inside, names as
 * links that select the element. Names and values are invented. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const OPTIONS = [{ name: 'GB', value: 'United Kingdom' }, { name: 'IE', value: 'Ireland' }];

const steps = () => [{ name: 'Intro', elements: [
  { name: 'First' }, { name: 'Last' }, { name: 'Full' },
  { name: 'Fill', type: 'Set Values', propSetMap: { elementValueMap: { Full: '%First% %Last%', Tag: 'fixed' } } },
  { name: 'Country', type: 'Select', propSetMap: { options: OPTIONS, label: 'Country' } },
  { name: 'Qty', type: 'Number' },
  { name: 'Total', type: 'Formula', propSetMap: { expression: '%Qty% * 2' } },
  { name: 'Hello', type: 'Text Block', propSetMap: { text: 'Hello %First% %Last%' } },
  { name: 'Plain', type: 'Text Block', propSetMap: { text: 'No fields' } },
  { name: 'Save', type: 'Integration Procedure Action', propSetMap: {
    integrationProcedureKey: 'Acme_Save', extraPayload: { Who: '%First%', Mode: 'full' }, remoteOptions: { chainable: true }
  } },
  { name: 'Bare', type: 'Integration Procedure Action', propSetMap: { integrationProcedureKey: 'Acme_Bare' } }
] }];

const DATA = { Intro: { First: 'Ada', Last: 'Byron', Full: 'Ada Lovelace', Country: 'IE', Qty: 4 } };

const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith(label));
const tabLabels = () => [...document.querySelectorAll('#struct-detail .seg-btn')].map((b) => b.textContent.trim());
const card = (id) => document.querySelector(`#struct-detail .fc-card[data-card="${id}"]`);
const bodyRows = (id) => [...card(id).querySelectorAll('tbody tr')].map((row) => [...row.children].map((cell) => cell.textContent));
/* A card of labelled rows: [label, value] per row, [heading] per sub-heading. */
const labelled = (id) => [...card(id).querySelectorAll('.fc-row, .fc-group')].map((row) => (row.classList.contains('fc-group')
  ? [row.textContent] : [row.querySelector('.fc-label').textContent, row.querySelector('.fc-value').textContent]));

let written;
async function open(name, data = DATA) {
  jest.resetModules();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: (text) => { written.push(text); return Promise.resolve(); } }
  });
  const page = await bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
  const jumps = [];
  page.Nav.on('data', (request) => jumps.push(request));
  clickRow(name);
  return { ...page, jumps };
}

describe('the Set Values card', () => {
  it('replaces the raw JSON: a table on the Set Values tab, the JSON behind Definition', async () => {
    await open('Fill');
    expect(tabLabels()).toEqual(expect.arrayContaining(['Set Values', 'JSON']));
    expect(card('set-values')).not.toBeNull();
    expect([...card('set-values').querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Target', 'Expression', 'Computed value', 'Current value']);
    expect(bodyRows('set-values')).toEqual([
      ['Full', '%First% %Last%', '"Ada Byron"', '"Ada Lovelace"differs'],
      ['Tag', 'fixed', '"fixed"', 'not in datadiffers']
    ]);
    const differs = card('set-values').querySelector('.fc-col-holds .fc-tag');
    expect(differs.textContent).toBe('differs');
    expect(differs.className).toContain('tag-warn');
    expect(card('set-values').querySelectorAll('.fc-unknown')[0].textContent).toBe('not in data');
    expect(document.querySelector('#struct-detail .fc-card[data-card="current-value"]')).toBeNull(); // the data holds nothing under Fill
    expect(card('set-values').textContent).not.toMatch(/What this element writes/);
    expect(card('set-values').querySelector('.fc-head').title).toMatch(/^What this element writes into the data/);
    expect(document.querySelector('#struct-detail details')).toBeNull();
    expect(document.querySelector('#struct-detail .tree-btn')).toBeNull();

    tabButton('JSON').click();
    expect(document.querySelector('#struct-detail .detail-body').textContent).toContain('propSetMap');
  });

  it('shows a target that is an element by its name, as a link that selects it', async () => {
    const { jumps } = await open('Fill');
    const link = card('set-values').querySelector('tbody .fc-link');
    expect(link.textContent).toBe('Full');
    expect(link.title).toBe('Select Full · Where the value is written');
    link.click();
    expect(jumps).toEqual([]);
    expect(document.querySelector('#struct-detail .detail-title').textContent).toBe('Full');
  });

  it('shows a Current value card first when the data holds something under its name', async () => {
    await open('Fill', { Intro: { ...DATA.Intro, Fill: 'x' } });
    const cards = [...document.querySelectorAll('#struct-detail .detail-body > .fc-card')].map((node) => node.dataset.card);
    expect(cards).toEqual(['current-value', 'set-values']);
  });

  it('follows the data: the row stops differing once the target holds the result', async () => {
    jest.useFakeTimers();
    try {
      await open('Fill');
      expect(card('set-values').querySelector('tbody tr').classList.contains('is-differs')).toBe(true);
      setData({ Intro: { ...DATA.Intro, Full: 'Ada Byron' } });
      jest.advanceTimersByTime(2000);
      await tick();
      expect(card('set-values').querySelector('tbody tr').classList.contains('is-differs')).toBe(false);
      expect(bodyRows('set-values')[0]).toEqual(['Full', '%First% %Last%', '"Ada Byron"', '"Ada Byron"']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('copies the table as text with a title on the button, and masks what the data holds when Mask values is on', async () => {
    await open('Fill');
    const copy = card('set-values').querySelector('.fc-copy');
    expect(copy.title).toBe('Copy the Set Values card as text. Honours Mask values.');
    expect(copy.getAttribute('data-help')).toBe('Set Values');
    copy.click();
    await tick();
    expect(written[0]).toContain('Full\t%First% %Last%\t"Ada Byron"\t"Ada Lovelace" · differs');

    const { Mask } = await import('../../../src/ui/mask-setting.js');
    Mask.mount(document.getElementById('mask-values'));
    const box = document.getElementById('mask-values');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    card('set-values').querySelector('.fc-copy').click();
    await tick();
    expect(written[1]).not.toContain('Ada');
    expect(written[1]).not.toContain('Lovelace');
    expect(written[1]).toContain('Full\t%First% %Last%\t"<string>"\t"<string>" · differs');
  });
});

describe('the Options tab', () => {
  it('lists the options with a tick on the one the data holds, after Current value', async () => {
    await open('Country');
    expect(tabLabels().slice(0, 3)).toEqual(['Current value', 'Options', 'Properties']);
    tabButton('Options').click();
    expect(bodyRows('options')).toEqual([['United Kingdom', 'GB', ''], ['Ireland', 'IE', '✓']]);
    expect(card('options').querySelectorAll('tbody tr.is-ok')).toHaveLength(1);
    expect(card('options').querySelector('.fc-copy').title).toBe('Copy the Options card as text. Honours Mask values.');
    expect(card('options').querySelector('.fc-head .fc-tag')).toBeNull();
    expect(document.querySelector('.options-chip')).toBeNull();
  });

  it('puts a chip in the head when the value is none of the options, which opens the tab', async () => {
    await open('Country', { Intro: { Country: 'XX' } });
    const chip = document.querySelector('#struct-detail .options-chip');
    expect(chip.textContent).toBe('No option matches “XX”');
    expect(chip.title).toContain('Open the Options tab');
    chip.click();
    expect(card('options')).not.toBeNull();
    const verdict = card('options').querySelector('.fc-head .fc-tag');
    expect(verdict.textContent).toBe('No match');
    expect(verdict.title).toMatch(/^None matches: the data holds “XX”/);
    expect(document.querySelector('#struct-detail .options-chip')).toBeNull();
    expect(card('options').querySelectorAll('tbody tr.is-ok')).toHaveLength(0);
  });

  it('replaces the type hint line of the head while the chip says the same, and the line is back on the Options tab', async () => {
    await open('Country', { Intro: { Country: 'XX' } });
    expect(document.querySelector('#struct-detail .options-chip')).not.toBeNull();
    expect(document.querySelector('#struct-detail .detail-typehint')).toBeNull();
    tabButton('Options').click();
    expect(document.querySelector('#struct-detail .options-chip')).toBeNull();
    expect(document.querySelector('#struct-detail .detail-typehint').textContent).toContain('not one of its options');
  });

  it('has no Options tab for an element that lists none, and no chip for an empty value', async () => {
    await open('Qty');
    expect(tabLabels()).not.toContain('Options');
    clickRow('Country');
    setData({ Intro: {} });
    expect(document.querySelector('.options-chip')).toBeNull();
  });
});

describe('the Formula card', () => {
  it('follows the Current value card with the expression, what it comes to and the elements it reads', async () => {
    const { jumps } = await open('Total');
    expect(labelled('formula')).toEqual([
      ['Expression', '%Qty% * 2'], ['Computed value', '8estimated ≈'], ['Elements it reads'], ['Qty', '4']
    ]);
    const cards = [...document.querySelectorAll('#struct-detail .detail-body > .fc-card')].map((node) => node.dataset.card);
    expect(cards).toEqual(['current-value', 'formula']);
    expect(card('current-value').querySelector('.fc-unknown').textContent).toBe('not in data');
    expect(card('current-value').querySelector('.fc-copy')).toBeNull(); // nothing to copy
    const link = card('formula').querySelector('.fc-label.is-name .fc-link');
    link.click();
    expect(jumps).toEqual([]);
    expect(document.querySelector('#struct-detail .detail-title').textContent).toBe('Qty');
  });

  it('marks the estimate with an outlined tag, and what it reads from the data when it cannot evaluate', async () => {
    await open('Total');
    const tag = card('formula').querySelector('.fc-value .fc-tag');
    expect(tag.textContent).toBe('estimated ≈');
    expect(tag.className).toBe('tag fc-tag');
  });

  it("keeps the Current value tab with can't tell while the data holds nothing", async () => {
    await open('Total', { Intro: {} });
    expect(tabLabels()).toContain('Current value');
    expect(labelled('formula')[1]).toEqual(['Computed value', "can't tell"]);
  });
});

describe('the Merge fields card', () => {
  it('sits at the top of the Properties tab of a Text Block, with the value of each field', async () => {
    const { jumps } = await open('Hello');
    expect(tabLabels()).not.toContain('Current value');
    expect(document.querySelector('#struct-detail .detail-body').firstElementChild).toBe(card('merge-fields'));
    expect(bodyRows('merge-fields')).toEqual([['First', '"Ada"'], ['Last', '"Byron"']]);
    card('merge-fields').querySelector('.fc-link').click();
    expect(jumps).toEqual([]);
    expect(document.querySelector('#struct-detail .detail-title').textContent).toBe('First');
  });

  it('is left out for a text that reads no field', async () => {
    await open('Plain');
    expect(card('merge-fields')).toBeNull();
  });
});

describe('the Additional input cards of the Calls tab', () => {
  it('list the extra input and the remote options under what the action sends', async () => {
    await open('Save');
    tabButton('Calls').click();
    expect(bodyRows('extra-input')).toEqual([['Who', '%First%', '"Ada"'], ['Mode', 'full', '"full"']]);
    expect(bodyRows('remote-options')).toEqual([['chainable', 'true', 'true']]);
    const body = document.querySelector('#struct-detail .detail-body');
    expect([...body.children].map((node) => node.className)).toEqual(
      expect.arrayContaining(['wiring-line', 'detail-card fc-card']));
    expect(body.querySelector('.wiring-line')).toBe(body.firstElementChild);
  });

  it('are left out for an action that sets none', async () => {
    await open('Bare');
    tabButton('Calls').click();
    expect(card('extra-input')).toBeNull();
    expect(card('remote-options')).toBeNull();
  });
});

describe('round 6 fixes in the cards', () => {
  it('draws the Options tick with words for a screen reader', async () => {
    await open('Country');
    tabButton('Options').click();
    const mark = card('options').querySelector('.fc-col-now [role="img"]');
    expect(mark.getAttribute('aria-label')).toBe('selected');
    expect(mark.textContent).toBe('✓');
  });

  it('shows what a formula comes to once while the data holds no value for it', async () => {
    await open('Total', { Intro: { Qty: 4 } });
    const body = document.querySelector('#struct-detail .detail-body');
    expect(body.textContent.match(/estimated ≈/g)).toHaveLength(1);
    expect(card('formula').textContent).toContain('8estimated ≈');
  });

  it('puts no sentence inside a card: what each one is goes in its header\'s tooltip', async () => {
    await open('Hello');
    tabButton('Properties').click();
    expect(card('merge-fields').querySelector('.elem-lede, .tab-lede')).toBeNull();
    expect(card('merge-fields').querySelector('.fc-head').title).toBe('The %merge% fields the text reads, with what the data holds for each now.');
  });
});
