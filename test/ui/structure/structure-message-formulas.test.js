'use strict';

/* Messages written as formulas (Set Errors, Messaging, properties) are shown as
 * what they come to, tagged "estimated ≈" on a card (≈ in a table cell of the
 * Properties tab), with the formula kept in a fold and the tooltip. */

import { jest } from '@jest/globals';
import { bootStructure, definition, clickRow, tick } from '../support/structure-page.js';

const FORMULA = "=IF(%LanguageCode%=='xx','Please accept the terms.','Please tick the box to continue.')";

const steps = () => [{
  name: 'Intro',
  elements: [
    { name: 'Age', type: 'Number' },
    {
      name: 'CheckConsent',
      type: 'Set Errors',
      propSetMap: {
        elementErrorMap: { Consent: FORMULA },
        show: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] }
      }
    },
    {
      name: 'Notice',
      type: 'Messaging',
      propSetMap: {
        validateExpression: { operator: 'AND', rules: [{ field: 'Intro:Age', condition: '<', data: 18 }] },
        messages: [{ value: true, type: 'Requirement', text: FORMULA, active: true }]
      }
    },
    { name: 'Greeting', type: 'Text Block', propSetMap: { text: '="Hello " & %Intro:Age%' } }
  ]
}];

const boot = ({ data, lang } = {}) => bootStructure({
  scripts: [{ id: 'main', def: definition({ steps: steps(), lang }), data: data || { Intro: { Age: 12 } } }]
});

const tab = (name) => [...document.querySelectorAll('#struct-detail .seg-btn')].find((button) => button.textContent.startsWith(name));
const body = () => document.querySelector('#struct-detail .detail-body');
/* The value box of the card row that holds a message. */
const messageBox = () => body().querySelector('.fc-row:has(.msg-formula) .fc-value');
const shownText = () => messageBox().firstChild.textContent;
const estimatedTag = () => messageBox().querySelector('.fc-tag');

describe('a Set Errors message that is a formula', () => {
  it('shows what it comes to as estimated, and keeps the formula in a fold and the tooltip', async () => {
    await boot({ data: { Intro: { Age: 12 }, LanguageCode: 'xx' } });
    clickRow('CheckConsent');
    tab('Validation').click();

    expect(messageBox().parentNode.querySelector('.fc-label').textContent).toBe('Consent');
    expect(shownText()).toBe('Please accept the terms.');
    expect(estimatedTag().textContent).toBe('estimated ≈');
    expect(estimatedTag().title).toContain(FORMULA);
    const fold = body().querySelector('details.msg-formula');
    expect(fold.querySelector('summary').textContent).toBe('Message formula');
    expect(fold.querySelector('code').textContent).toBe(FORMULA);
    expect(fold.open).toBe(false);
  });

  it('reads the script language when the data has none, and says so in the tooltip', async () => {
    await boot({ lang: 'xx_YY' });
    clickRow('CheckConsent');
    tab('Validation').click();
    expect(shownText()).toBe('Please accept the terms.');
    expect(estimatedTag().title).toContain("script's language");
  });

  it("says it cannot tell when there is no value, and shows the formula", async () => {
    await boot({ lang: 'Multi-Language' });
    clickRow('CheckConsent');
    tab('Validation').click();
    expect(messageBox().querySelector('.fc-unknown').textContent).toBe("can't tell: no value for %LanguageCode%");
    expect(body().querySelector('.msg-formula code').textContent).toBe(FORMULA);
  });

  it('follows the data, and keeps a fold the user opened through the redraw', async () => {
    jest.useFakeTimers();
    try {
      await boot({ data: { Intro: { Age: 12 }, LanguageCode: 'xx' } });
      clickRow('CheckConsent');
      tab('Validation').click();
      const fold = body().querySelector('details.msg-formula');
      fold.open = true;
      fold.dispatchEvent(new Event('toggle'));

      document.getElementById('main').jsonDataStr = JSON.stringify({ Intro: { Age: 13 }, LanguageCode: 'en' });
      jest.advanceTimersByTime(2000);
      await tick();
      expect(shownText()).toBe('Please tick the box to continue.');
      expect(body().querySelector('details.msg-formula').open).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('what may stop Next on the step', () => {
  it('shows the failing Set Errors card with the evaluated message', async () => {
    await boot({ lang: 'xx' });
    clickRow('Intro');
    tab('Validation').click();
    const card = body().querySelector('.fc-card[data-card="rule"]');
    expect(card.querySelector('.fc-el').textContent).toBe('CheckConsent');
    expect(card.querySelector('.fc-row').textContent).toContain('ConsentPlease accept the terms.estimated ≈');
    expect(card.querySelector('details.msg-formula')).not.toBeNull();
  });
});

describe('a Messaging text that is a formula', () => {
  it('shows the evaluated text on its message line', async () => {
    await boot({ data: { Intro: { Age: 12 }, LanguageCode: 'en' } });
    clickRow('Notice');
    tab('Validation').click();
    const shows = body().querySelector('.fc-row');
    expect(shows.querySelector('.fc-label').textContent).toBe('Shows');
    expect(shows.querySelector('.fc-value').firstChild.textContent).toBe('Please tick the box to continue.');
    expect(shows.querySelector('.fc-tag').textContent).toBe('estimated ≈');
  });
});

describe('a property that is a formula', () => {
  it('shows the evaluated text in the Properties tab, with the formula under it', async () => {
    await boot();
    await tick();
    clickRow('Greeting');
    tab('Properties').click();
    const cell = [...body().querySelectorAll('.prop-table tr')].find((row) => row.querySelector('th').textContent.startsWith('Text'));
    expect(cell.querySelector('.msg-estimate').textContent).toBe('≈ “Hello 12”');
    expect(cell.querySelector('.msg-formula code').textContent).toBe('="Hello " & %Intro:Age%');
  });
});
