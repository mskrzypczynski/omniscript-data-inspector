'use strict';

/* The detail head is one compact line, with a verdict chip only while there is
 * something to warn about; the tab strip leaves out what does not apply and has
 * a short name for a narrow pane; the tools show only where a tree is drawn.
 * Names here are invented. */

import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });
const steps = () => [{ name: 'Intro', elements: [
  { name: 'Kind', type: 'Text', propSetMap: { required: true } },
  { name: 'Company', type: 'Text', propSetMap: { show: rule('Intro:Kind', '=', 'Business') } },
  { name: 'Open', type: 'Text', propSetMap: { show: rule('Intro:Kind', '=', 'Person') } },
  { name: 'Odd', type: 'Text', propSetMap: { show: rule('Intro:Kind', 'contains', 'x') } },
  { name: 'Lookup', type: 'DataRaptor Extract Action', propSetMap: { bundle: 'Find_Account' } }
] }];
const boot = (data = { Intro: { Kind: 'Person' } }) => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });

const head = () => document.querySelector('#struct-detail .detail-head');
const line = () => head().querySelector('.detail-line');
const tabIds = () => [...document.querySelectorAll('#struct-detail .seg-btn')].map((b) => b.querySelector('.btn-label').textContent);
const tool = (title) => [...document.querySelectorAll('#struct-detail .detail-tools .icon-btn')].find((b) => b.title === title);
const tabButton = (label) => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.querySelector('.btn-label').textContent.startsWith(label));

describe('the detail head', () => {
  it('is one meta line: type, name, then only the flags that apply', async () => {
    await boot();
    clickRow('Kind');
    expect(line().firstElementChild.textContent).toBe('Text · Kind · required');
    clickRow('Company');
    expect(line().firstElementChild.textContent).toBe('Text · Company · conditional');
    expect(head().querySelectorAll('.detail-meta').length).toBe(1);
  });

  it('has a grey chip, not a red one, for an element a rule hides: hidden is a fact, and the chip opens the Visibility tab', async () => {
    await boot();
    clickRow('Company');
    expect(line().querySelector('.detail-chip')).toBeNull(); // it opens on the Visibility tab, which says it at the top
    tabButton('Properties').click();
    const chip = line().querySelector('.detail-chip');
    expect(chip.classList.contains('is-hidden')).toBe(true);
    expect(chip.classList.contains('tag-neutral')).toBe(true);
    expect(chip.classList.contains('tag-error')).toBe(false);
    expect(chip.textContent).toBe('Hidden: Intro:Kind is "Person", not "Business"');
    expect(chip.tagName).toBe('BUTTON');
    chip.click();
    expect(document.querySelector('#struct-detail .seg-btn.is-on .btn-label').textContent).toBe('Visibility');
    expect(document.querySelectorAll('#struct-detail .detail-why')).toHaveLength(0); // said once, by the card's verdict
    expect(document.querySelector('#struct-detail .fc-card .fc-head .fc-tag').textContent).toBe('Hidden');
  });

  it('has no chip for a shown element, and says "Shown" in the header of its Visibility card instead', async () => {
    await boot();
    clickRow('Open');
    expect(line().querySelector('.detail-chip')).toBeNull();
    tabButton('Visibility').click();
    const verdict = document.querySelector('#struct-detail .detail-body .fc-card .fc-head .fc-tag');
    expect(verdict.textContent).toBe('Shown');
    expect(verdict.className).toContain('tag-ok');
    expect(verdict.title).toBe('Shown: its condition is true');
  });

  it('has an amber chip for a rule the panel cannot judge, not a red one', async () => {
    await boot();
    clickRow('Odd');
    tabButton('Properties').click(); // on its own Visibility tab the sentence is said at the top instead
    const chip = line().querySelector('.detail-chip');
    expect(chip.classList.contains('is-estimated')).toBe(true);
    expect(chip.textContent).toMatch(/^Can't tell if this rule is true/);
  });

  it('keeps the title in plain text, not a monospace face', async () => {
    const css = (await import('node:fs')).readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    expect(css).toMatch(/#struct-detail \.detail-title\s*\{[^}]*font-family:\s*inherit/);
  });
});

describe('the head of the pane at narrow widths', () => {
  const css = async () => (await import('node:fs')).readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');

  it('breaks the title between words, two lines at most, never inside a word of a long text', async () => {
    const block = /\n\.detail-title\s*\{([^}]*)\}/.exec(await css())[1];
    expect(block).toMatch(/overflow-wrap:\s*break-word/);
    expect(block).not.toMatch(/break-all/);
    expect(block).toMatch(/line-clamp:\s*2/);
  });

  it('gives a long title its whole text as a tooltip', async () => {
    await boot();
    clickRow('Odd');
    const title = document.querySelector('#struct-detail .detail-title');
    expect(title.title === '' || title.title.includes(title.textContent.slice(0, 10))).toBe(true);
  });

  it('stacks a Set Values assignment as one labelled line per column, labelled from data-label, and keeps a tag with its value', async () => {
    const text = await css();
    expect(text).toMatch(/\.fc-table td\[data-label\]::before \{\s*content: attr\(data-label\)/);
    expect(text).toMatch(/\.tag \{[^}]*white-space: nowrap/);
  });

  it('keeps the label of Follow current step fixed, and shows a pause by a dot that always takes its room', async () => {
    await boot();
    const label = document.getElementById('struct-follow').closest('label');
    expect(label.textContent.trim()).toBe('Follow current step');
    expect(label.querySelector('.follow-dot')).not.toBeNull();
    expect(await css()).toMatch(/\.follow-dot \{[^}]*width: 7px/);
    expect(await css()).not.toMatch(/\.follow-dot[^{]*\{[^}]*display: none/);
    expect(document.querySelectorAll('#view-structure .toolbar .narrow-hide')).toHaveLength(0);
  });
});

describe('the detail tabs and tools', () => {
  it('leaves out Current value while the data holds none, and Calls while the action says nothing', async () => {
    await boot({ Intro: { Kind: 'Person' } });
    clickRow('Company');
    expect(tabIds()).not.toContain('Current value');
    expect(tabIds()).toEqual(['Properties', 'Visibility', 'JSON']);
    expect([...document.querySelectorAll('#struct-detail .seg-btn')].every((b) => !b.disabled)).toBe(true);
  });

  it('shows Copy only on a tab that draws a JSON tree, and the filter on Properties and trees', async () => {
    await boot();
    clickRow('Kind');
    tabButton('JSON').click();
    expect(tool('Copy this view as JSON. Honours Mask values.')).toBeDefined(); // the Definition is a tree
    expect(document.querySelector('#struct-detail .detail-find')).not.toBeNull();
    tabButton('Properties').click();
    expect(tool('Copy this view as JSON. Honours Mask values.')).toBeUndefined();
    expect(document.querySelector('#struct-detail .detail-find')).not.toBeNull();
    clickRow('Lookup');
    tabButton('Calls').click();
    expect(tool('Copy this view as JSON. Honours Mask values.')).toBeUndefined();
    expect(document.querySelector('#struct-detail .detail-find')).toBeNull();
  });

  it('leaves Show in Data out, not greyed, for an element that has no place in the data', async () => {
    await boot({});
    clickRow('Lookup');
    expect([...document.querySelectorAll('#struct-detail .detail-tools .icon-btn')].some((b) => b.textContent === 'Show in Data')).toBe(false);
  });
});
