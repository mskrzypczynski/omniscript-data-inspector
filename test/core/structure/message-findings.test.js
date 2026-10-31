'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { computeVisibility } from '../../../src/core/structure/visibility.js';
import { stepStoppers } from '../../../src/core/structure/step-validation.js';

const el = (name, type, propSetMap = {}) => ({ name, type, propSetMap });
const rule = (field, condition, data) => ({ operator: 'AND', rules: [{ field, condition, data }] });

const FORMULA = "=IF(%LanguageCode%=='xx','Please accept the terms.','Please tick the box to continue.')";

function stoppers(elementsOfStep, data, options) {
  const elements = flatten({
    children: [{ name: 'Intro', type: 'Step', propSetMap: {}, children: [{ eleArray: elementsOfStep }] }]
  }, null);
  const step = elements.find((element) => element.name === 'Intro');
  return stepStoppers(elements, step.key, data, computeVisibility(elements, data), options).items;
}

const consentCheck = () => [
  el('Age', 'Number'),
  el('CheckConsent', 'Set Errors', { elementErrorMap: { Consent: FORMULA }, show: rule('Intro:Age', '<', 18) })
];

describe('what may stop Next, for a message written as a formula', () => {
  it('shows the text a Set Errors formula comes to, as an estimate, with the formula kept', () => {
    const [item] = stoppers(consentCheck(), { Intro: { Age: 12 }, LanguageCode: 'xx' });
    expect(item.shownReason).toBe('Set Errors will fire on Consent: estimated “Please accept the terms.”');
    expect(item.formula.raw).toBe(FORMULA);
    expect(item.formula.note).toContain('Estimated');
  });

  it('keeps what the message comes to out of `reason`, which leaves the panel', () => {
    const [item] = stoppers(consentCheck(), { Intro: { Age: 12 }, LanguageCode: 'xx' });
    expect(item.reason).toBe('Set Errors will fire on Consent: (formula)');
    expect(item.reason).not.toContain('terms');
    const [messaging] = stoppers([
      el('Age', 'Number'),
      el('Notice', 'Messaging', {
        validateExpression: rule('Intro:Age', '<', 18),
        messages: [{ value: true, type: 'Requirement', text: '="Hello " & %Intro:Name%', active: true }]
      })
    ], { Intro: { Age: 3, Name: 'Ada Lovelace' } });
    expect(messaging.reason).toBe('Requirement message is active: (formula)');
    expect(messaging.shownReason).toContain('Ada Lovelace');
    expect(messaging.reason).not.toContain('Ada');
  });

  it("reads the script's language when the data has none, and says so", () => {
    const [item] = stoppers(consentCheck(), { Intro: { Age: 12 } }, { language: 'xx' });
    expect(item.shownReason).toContain('estimated “Please accept the terms.”');
    expect(item.formula.note).toContain("script's language");
  });

  it("cannot tell without a language, and shows the formula", () => {
    const [item] = stoppers(consentCheck(), { Intro: { Age: 12 } });
    expect(item.shownReason).toBe(`Set Errors will fire on Consent: can't tell: no value for %LanguageCode% (${FORMULA})`);
    expect(item.reason).toBe('Set Errors will fire on Consent: (formula)');
  });

  it('still counts the error: only the wording is an estimate', () => {
    expect(stoppers(consentCheck(), { Intro: { Age: 12 } })).toHaveLength(1);
  });

  it('leaves a plain message as it was, with no formula', () => {
    const [item] = stoppers([
      el('Age', 'Number'),
      el('Check', 'Set Errors', { elementErrorMap: { Age: 'Must be an adult' }, show: rule('Intro:Age', '<', 18) })
    ], { Intro: { Age: 3 } });
    expect(item.reason).toBe('Set Errors will fire on Age: “Must be an adult”');
    expect(item).not.toHaveProperty('formula');
  });

  it('shows an active Messaging text the same way', () => {
    const [item] = stoppers([
      el('Age', 'Number'),
      el('Notice', 'Messaging', {
        validateExpression: rule('Intro:Age', '<', 18),
        messages: [{ value: true, type: 'Requirement', text: FORMULA, active: true }]
      })
    ], { Intro: { Age: 3 }, LanguageCode: 'en' });
    expect(item.shownReason).toBe('Requirement message is active: estimated “Please tick the box to continue.”');
    expect(item.formula.raw).toBe(FORMULA);
  });
});
