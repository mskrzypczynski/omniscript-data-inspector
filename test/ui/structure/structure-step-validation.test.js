'use strict';

/* A step's Validation tab: what may stop the user pressing Next, as cards: the
 * required fields still empty, every validation rule of the step (failing ones
 * open, passing ones closed to their header line) and the custom components. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, selectedRowText, tick } from '../support/structure-page.js';

const PULSE_MS = 2000;

const steps = () => [
  {
    name: 'Intro',
    elements: [
      { name: 'Email', type: 'Email', propSetMap: { required: true } },
      { name: 'Age', type: 'Number' },
      {
        name: 'CheckAge',
        type: 'Set Errors',
        propSetMap: {
          elementErrorMap: { Age: 'Must be an adult' },
          show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] }
        }
      }
    ]
  },
  { name: 'Details', elements: [{ name: 'Notes' }] }
];

const tabButton = () => [...document.querySelectorAll('#struct-detail .seg-btn')]
  .find((button) => button.textContent.startsWith('Validation'));
const bodyText = () => document.querySelector('#struct-detail .detail-body').textContent;
const cardOf = (id) => [...document.querySelectorAll(`#struct-detail .fc-card[data-card="${id}"]`)];
const headLine = (card) => card.querySelector('.fc-head').textContent;
const sections = () => [...document.querySelectorAll('#struct-detail .fc-section')].map((node) => node.textContent);
const setData = (data) => { document.getElementById('main').jsonDataStr = JSON.stringify(data); };
const boot = (stepList, data) => bootStructure({
  scripts: [{ id: 'main', def: definition({ steps: stepList }), data }]
});

async function advance(ms) {
  jest.advanceTimersByTime(ms);
  await tick();
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('the Validation tab of a step', () => {
  it('shows the condition behind a failing rule, met or not once per row, red where it blocks', async () => {
    await boot(steps(), { Intro: { Email: 'a@b.c', Age: 12 } });
    tabButton().click();
    const rows = [...document.querySelectorAll('#struct-detail .fc-cond .fc-main')]
      .map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([['●', 'Age', '< 18', '12']]);
    expect(document.querySelector('#struct-detail .fc-cond .fc-read-text').textContent).toBe('●Age is 12, which is less than 18');
    expect(document.querySelector('#struct-detail .fc-cond .fc-main .whatif-cell')).toBeNull(); // what if is on the element's own tab
  });

  it('lists a passing rule as a closed card with its verdict and the condition that decides it', async () => {
    const passing = steps(); // Email stays required and empty, so the tab stays when both rules pass
    passing[0].elements.push({ name: 'Notify', type: 'Messaging', propSetMap: {
      validateExpression: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '>', data: 17 }] },
      messages: [{ type: 'Requirement', text: 'Adults only', value: false }, { type: 'Comment', text: 'Thanks', value: true }]
    } });
    await boot(passing, { Intro: { Age: 12 } });
    tabButton().click();
    const [setErrors, messaging] = cardOf('rule');
    expect(setErrors.classList.contains('is-open')).toBe(true);
    expect(messaging.classList.contains('is-open')).toBe(true);
    expect(headLine(messaging)).toContain('MessagingNotifyFails');
    setData({ Intro: { Age: 40 } });
    await advance(PULSE_MS);
    const [, after] = cardOf('rule');
    expect(after.classList.contains('is-closed')).toBe(true);
    expect(after.querySelector('.fc-head .tag-ok').textContent).toBe('Passes');
    expect(after.querySelector('.fc-why').textContent).toBe('Age is 40, which is more than 17');
    expect(sections()).toEqual(['Validation rules (2)']);
  });

  it('selects the element when its name is clicked', async () => {
    await boot(steps(), { Intro: { Email: '', Age: 30 } });
    tabButton().click();
    document.querySelector('#struct-detail .fc-card[data-card="required"] .fc-link').click();
    expect(selectedRowText()).toContain('Email');
    expect(document.querySelector('#struct-detail .detail-title').textContent).toContain('Email');
  });

  it('is left out when nothing can stop Next', async () => {
    await boot(steps(), { Intro: { Email: 'a@b.c', Age: 30 } });
    expect(tabButton()).toBeUndefined();
  });

  it('follows the data while the tab is open, falling back to another tab when it goes', async () => {
    await boot(steps(), { Intro: { Email: '', Age: 30 } });
    tabButton().click();
    expect(bodyText()).toContain('Email');

    setData({ Intro: { Email: 'a@b.c', Age: 30 } });
    await advance(PULSE_MS);

    expect(tabButton()).toBeUndefined();
    expect(document.querySelector('#struct-detail .seg-btn.is-on').textContent).toBe('Current value');
  });

  it('is not offered on a plain input', async () => {
    await boot(steps(), { Intro: { Email: '' } });
    clickRow('Email');
    expect(tabButton()).toBeUndefined();
  });

  it('lists the custom components of the step with their show-rule verdict and a note', async () => {
    const withWidget = steps();
    withWidget[0].elements.push(
      { name: 'Widget', type: 'Custom Lightning Web Component' },
      {
        name: 'Gated', type: 'Custom Lightning Web Component',
        propSetMap: { show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '>', data: 40 }] } }
      }
    );
    await boot(withWidget, { Intro: { Email: 'a@b.c', Age: 30 } });
    tabButton().click();
    expect(sections()).toContain('Custom components (2)');
    const [widget, gated] = cardOf('custom');
    expect(headLine(widget)).toBe('WidgetShownno condition, always shown');
    expect(widget.querySelector('.fc-toggle')).toBeNull();
    expect(widget.querySelector('.fc-body')).toBeNull();
    expect(gated.querySelector('.fc-head .fc-tag').textContent).toBe('Hidden');
    expect(gated.querySelector('.fc-head .fc-tag').title).toBe('Hidden: Intro:Age is 30, not greater than 40');
    expect(gated.classList.contains('is-open')).toBe(true);
    expect(gated.querySelector('.fc-cond .fc-main').textContent).toBe('○Age> 4030');
    expect(document.querySelector('#struct-detail .fc-note').textContent)
      .toBe('A custom component may carry its own required controls or Next/Previous buttons; those cannot be read from the definition.');
  });

  it('opens on JSON rather than a removed Next step tab', async () => {
    await boot(steps(), { Intro: { Email: '' } });
    const labels = [...document.querySelectorAll('#struct-detail .seg-btn')].map((button) => button.textContent);
    expect(labels.some((label) => label.startsWith('Next step'))).toBe(false);
  });
});
