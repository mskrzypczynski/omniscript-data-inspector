'use strict';

/* The detail pane never opens on JSON: an element opens on Current value,
 * Validation (the step the script is on), Visibility (an element with a rule)
 * or Properties, and JSON only when it was picked by hand. */

import { bootStructure, definition, clickRow } from '../support/structure-page.js';

const rule = { operator: 'AND', rules: [{ field: 'Intro:Kind', condition: '=', data: 'Business' }] };

const steps = () => [
  {
    name: 'Intro',
    elements: [
      { name: 'Kind', type: 'Text' },
      { name: 'Notice', type: 'Text Block', propSetMap: { text: 'Hello', show: rule } },
      { name: 'Plain', type: 'Text Block', propSetMap: { text: 'Static text' } },
      { name: 'Email', type: 'Email', propSetMap: { required: true } }
    ]
  },
  { name: 'Later', elements: [{ name: 'Other' }] }
];

const boot = (data = { Intro: { Kind: 'Person' } }) => bootStructure({ scripts: [{ id: 'main', def: definition({ steps: steps() }), data }] });
const activeTab = () => document.querySelector('#struct-detail .seg-btn.is-on .btn-label').textContent;
const tab = (name) => [...document.querySelectorAll('#struct-detail .seg-btn')].find((button) => button.textContent.startsWith(name));

describe('the tab a pick opens on', () => {
  it('is Current value for a field that has a value', async () => {
    await boot();
    clickRow('Kind');
    expect(activeTab()).toBe('Current value');
  });

  it('is Visibility for a Text Block with a show rule', async () => {
    await boot();
    clickRow('Notice');
    expect(activeTab()).toBe('Visibility');
  });

  it('is Properties for an element with nothing else to say', async () => {
    await boot();
    clickRow('Plain');
    expect(activeTab()).toBe('Properties');
  });

  it('is never JSON: a hand pick of it does not carry to the next element', async () => {
    await boot();
    clickRow('Kind');
    tab('JSON').click();
    expect(activeTab()).toBe('JSON');
    clickRow('Notice');
    expect(activeTab()).toBe('Visibility');
    clickRow('Kind');
    expect(activeTab()).toBe('Current value');
  });

  it('keeps JSON while the same element stays selected, since it was picked by hand', async () => {
    await boot();
    clickRow('Notice');
    tab('JSON').click();
    expect(activeTab()).toBe('JSON');
  });
});

describe('a hand-picked tab', () => {
  it('stays picked through an element that lacks it', async () => {
    await boot({ Intro: { Kind: 'Person', Notice: 'Hello' } });
    clickRow('Notice');
    expect(activeTab()).toBe('Current value');
    tab('Visibility').click();
    expect(activeTab()).toBe('Visibility');

    clickRow('Plain'); // no rule, nothing uses it: no Visibility tab
    expect(activeTab()).toBe('Properties');
    clickRow('Notice');
    expect(activeTab()).toBe('Visibility');
  });

  it('is replaced only by a new pick', async () => {
    await boot({ Intro: { Kind: 'Person', Notice: 'Hello' } });
    clickRow('Notice');
    tab('Visibility').click();
    clickRow('Plain');
    tab('JSON').click();
    clickRow('Notice'); // JSON is for the element it was picked on; the Visibility pick was replaced
    expect(activeTab()).toBe('Current value');
  });
});
