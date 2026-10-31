'use strict';

import {
  TAGS, VERDICTS, readFromDataTag, differsTag, verdictTag, messagingVerdict, setErrorsVerdict, visibilityVerdict,
  valueHint, currentValueFact, formRowHint, shortName, mustBe, isNow, conditionReading, conditionMark, conditionDot, groupReading,
  decidingCondition, messageKind, messageLabel, checkedWhen, conditionLines, cardText
} from '../../../src/core/structure/fact-words.js';

/* A leaf of visibility.js ruleTree(), as the cards read it. */
const leaf = (over) => ({
  kind: 'rule', ok: false, field: 'Intro:HasCard', condition: '=', expected: 'true', actual: 'false', actualValue: false, ...over
});
const group = (operator, children) => ({
  kind: 'group', operator, ok: operator === 'OR' ? children.some((c) => c.ok) : children.every((c) => c.ok),
  children, total: children.length,
  fails: children.filter((c) => c.ok === false).length, holds: children.filter((c) => c.ok === true).length
});
const read = (rule) => { const r = conditionReading(rule); return `${r.name}${r.rest}`; };

describe('tags', () => {
  it('are a word and a tone each: estimated outlined, read from the data grey, differs amber', () => {
    expect(TAGS.estimated).toMatchObject({ text: 'estimated ≈', tone: 'outline' });
    expect(TAGS.readFromData).toMatchObject({ text: 'read from the data', tone: 'neutral' });
    expect(TAGS.differs).toMatchObject({ text: 'differs', tone: 'warn' });
  });

  it('say why a value was read from the data, and what differs from an estimate', () => {
    expect(readFromDataTag('Unknown function AGE', 'Age').title)
      .toBe('The panel cannot evaluate this formula (Unknown function AGE), so this is what the data holds for Age.');
    expect(readFromDataTag('', '').title).toBe('The panel cannot evaluate this formula, so this is what the data holds.');
    expect(differsTag().title).toMatch(/^The computed value and the current value/);
    expect(differsTag({ estimated: true }).title).toMatch(/estimate/);
  });
});

describe('verdicts', () => {
  it('are Fails red, Passes and Shown green, Hidden and Can\'t tell grey', () => {
    expect(verdictTag('fails')).toEqual({ text: 'Fails', tone: 'error' });
    expect(verdictTag('passes')).toEqual(VERDICTS.passes);
    expect(verdictTag('shown').tone).toBe('ok');
    expect(verdictTag('hidden')).toEqual({ text: 'Hidden', tone: 'neutral' });
    expect(verdictTag('nonsense')).toEqual({ text: "Can't tell", tone: 'neutral' });
  });

  it('never draw an estimate red', () => {
    expect(verdictTag('fails', { estimated: true })).toEqual({ text: 'Fails', tone: 'warn' });
    expect(verdictTag('passes', { estimated: true }).tone).toBe('ok');
  });

  it('follow the live result of Messaging and Set Errors', () => {
    expect(messagingVerdict({ state: 'false', blocks: true })).toBe('fails');
    expect(messagingVerdict({ state: 'true', blocks: false })).toBe('passes');
    expect(messagingVerdict({ state: 'unknown' })).toBe('unknown');
    expect(messagingVerdict(null)).toBe('unknown');
    expect(setErrorsVerdict({ state: 'true' })).toBe('fails');
    expect(setErrorsVerdict({ state: 'false' })).toBe('passes');
    expect(setErrorsVerdict({ state: 'unknown' })).toBe('unknown');
  });

  it('say an element is hidden by its own rule or a parent, shown, or can\'t tell', () => {
    expect(visibilityVerdict({ ok: false })).toBe('hidden');
    expect(visibilityVerdict({ ok: true })).toBe('shown');
    expect(visibilityVerdict({ ok: true, byParent: true })).toBe('hidden');
    expect(visibilityVerdict({ ok: null })).toBe('unknown');
    expect(visibilityVerdict({ ok: null, byParent: true })).toBe('hidden');
    expect(visibilityVerdict({ ok: true, hidden: true })).toBe('hidden');
  });
});

describe('values', () => {
  it('get a quiet type hint', () => {
    expect([30, 'Ada', true, null, '', undefined, [1], { a: 1 }].map(valueHint))
      .toEqual(['number', 'text', 'true/false', 'empty', 'empty', 'not in data', 'list', 'object']);
  });

  it('read on the Current value card as a form shows them', () => {
    expect(currentValueFact(30)).toEqual({ text: '30', hint: 'number', unknown: false });
    expect(currentValueFact('Ada')).toEqual({ text: 'Ada', hint: 'text', unknown: false });
    expect(currentValueFact(false)).toEqual({ text: 'false', hint: 'true/false', unknown: false });
    expect(currentValueFact(null)).toEqual({ text: 'null', hint: 'empty', unknown: false });
    expect(currentValueFact('')).toEqual({ text: '""', hint: 'empty', unknown: false });
    expect(currentValueFact(undefined)).toEqual({ text: 'not in data', hint: '', unknown: true });
  });

  it('join a stored choice with its option label', () => {
    expect(currentValueFact('GB', { optionLabels: { GB: 'United Kingdom' } }).text).toBe('GB (United Kingdom)');
    expect(currentValueFact('GB', { optionLabels: { GB: 'GB' } }).text).toBe('GB');
  });

  it('give a form row a hint only where text would not say it', () => {
    expect(['number', 'bool', 'empty', 'text', 'group'].map(formRowHint)).toEqual(['number', 'true/false', 'empty', '', '']);
  });
});

describe('names', () => {
  it('are the last part of a field, without a row', () => {
    expect(shortName('Step:Block|2:Field')).toBe('Field');
    expect(shortName('%Intro:Age%')).toBe('Age');
    expect(shortName('Rows|1')).toBe('Rows');
    expect(shortName('Plain')).toBe('Plain');
  });
});

describe('conditions', () => {
  it('say what a field must be and is now, never blank', () => {
    expect(mustBe(leaf({ condition: '>=', expected: '18' }))).toBe('≥ 18');
    expect(mustBe(leaf({ condition: '<>', expected: '""' }))).toBe('≠ ""');
    expect(isNow(leaf())).toEqual({ text: 'false', unknown: false });
    expect(isNow(leaf({ actual: 'not set' }))).toEqual({ text: 'not in data', unknown: true });
    expect(isNow(leaf({ actual: '""' }))).toEqual({ text: 'empty', unknown: true });
    expect(isNow(leaf({ ok: null }))).toEqual({ text: "can't tell", unknown: true });
    expect(isNow(leaf({ actual: null }))).toEqual({ text: 'no data', unknown: true });
  });

  it('read in plain language, met or not', () => {
    expect(read(leaf())).toBe('HasCard is false, not true');
    expect(read(leaf({ actual: 'null' }))).toBe('HasCard is null, which counts as not true');
    expect(read(leaf({ actual: 'not set' }))).toBe('HasCard is not in the data, which counts as not true');
    expect(read(leaf({ field: 'P:Age', ok: true, condition: '>=', expected: '18', actual: '30' }))).toBe('Age is 30, which is 18 or more');
    expect(read(leaf({ field: 'P:Age', ok: false, condition: '>=', expected: '18', actual: '12' }))).toBe('Age is 12, which is less than 18');
    expect(read(leaf({ field: 'P:Age', ok: true, condition: '<', expected: '18', actual: '12' }))).toBe('Age is 12, which is less than 18');
    expect(read(leaf({ field: 'P:Kind', ok: true, condition: '=', expected: '"Business"', actual: '"Business"' }))).toBe('Kind is "Business"');
    expect(read(leaf({ field: 'P:Kind', ok: false, condition: '<>', expected: '""', actual: '""' }))).toBe('Kind is empty, which it must not be');
    expect(read(leaf({ ok: null, formula: true }))).toBe("HasCard: can't tell (a formula the panel cannot evaluate)");
    expect(read(leaf({ ok: null, actual: null }))).toBe('HasCard: no data was read');
  });

  it('carry one mark each: met, not met or can\'t tell', () => {
    expect(conditionMark(true)).toEqual({ glyph: '✓', words: 'met', kind: 'true' });
    expect(conditionMark(false)).toEqual({ glyph: '✗', words: 'not met', kind: 'false' });
    expect(conditionMark(null).words).toBe("can't tell");
  });

  it('draws a condition as a neutral dot, with the same words as the tick', () => {
    expect(conditionDot(true)).toEqual({ glyph: '●', words: 'met', kind: 'true' });
    expect(conditionDot(false)).toEqual({ glyph: '○', words: 'not met', kind: 'false' });
    expect(conditionDot(null)).toEqual({ glyph: '?', words: "can't tell", kind: 'unknown' });
  });

  it('read as a group: what it needs and how it stands', () => {
    const fail = leaf();
    const pass = leaf({ ok: true });
    expect(groupReading(group('AND', [fail, pass]))).toBe('All of these must be true; 1 of 2 is not');
    expect(groupReading(group('AND', [pass, pass]))).toBe('All of these must be true; all 2 are');
    expect(groupReading(group('OR', [fail, fail]))).toBe('One of these must be true; none is');
    expect(groupReading(group('OR', [fail, pass, pass]))).toBe('One of these must be true; 2 of 3 are');
    expect(groupReading({ ...group('AND', [fail]), ok: null })).toBe("All of these must be true; can't tell");
  });

  it('name the condition that decides a rule, for a closed card', () => {
    const fail = leaf({ field: 'A' });
    const pass = leaf({ field: 'B', ok: true });
    expect(decidingCondition(group('AND', [pass, fail]))).toBe(fail);
    expect(decidingCondition(group('OR', [fail, pass]))).toBe(pass);
    expect(decidingCondition(fail)).toBe(fail);
    expect(decidingCondition({ ...group('AND', [fail]), ok: null })).toBeNull();
    expect(decidingCondition(null)).toBeNull();
  });
});

describe('messages', () => {
  it('say what a message does to Next', () => {
    expect(messageKind({ type: 'Requirement' }, true)).toBe('Requirement, which blocks Next');
    expect(messageKind({ type: 'Comment' }, false)).toBe('Comment, which does not block Next');
  });

  it('are labelled by when they show: Shows for the one the result selects', () => {
    expect(messageLabel({ when: 'false' }, 'false')).toBe('Shows');
    expect(messageLabel({ when: 'true' }, 'false')).toBe('If it passes');
    expect(messageLabel({ when: 'false' }, 'true')).toBe('If it fails');
    expect(messageLabel({ when: 'false' }, 'unknown')).toBe('If it fails');
    expect(messageLabel({ when: '', condition: 'A = 1' }, 'true')).toBe('When A = 1');
    expect(messageLabel({ when: '' }, 'true')).toBe('Message');
  });

  it('say when a Set Errors element checks its condition', () => {
    expect(checkedWhen('Step')).toBe('When the user moves between steps');
    expect(checkedWhen('')).toBe('When the user moves between steps');
    expect(checkedWhen('Submit')).toBe('On Submit');
  });
});

describe('a rule card as text', () => {
  const tree = group('AND', [leaf(), leaf({ field: 'P:Age', ok: true, condition: '>=', expected: '18', actual: '30', actualValue: 30 })]);

  it('lists its rows and each condition with its reading', () => {
    expect(cardText({ title: 'Visibility · Card', verdict: 'Hidden', rows: [{ label: 'As written', text: 'A = true' }], tree })).toBe([
      'Visibility · Card · Hidden',
      'As written\tA = true',
      'All of these must be true; 1 of 2 is not',
      '  ✗ Intro:HasCard = true · is now false · HasCard is false, not true',
      '  ✓ P:Age ≥ 18 · is now 30 · Age is 30, which is 18 or more'
    ].join('\n'));
  });

  it('masks what the data holds, and leaves out the readings that repeat it', () => {
    const text = cardText({ title: 'Validation', rows: [{ label: 'Shows', text: 'Hello Ada', data: true }, { label: 'Kind', text: 'Comment' }], tree, mask: true });
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('30');
    expect(text).toContain('Shows\t(masked)');
    expect(text).toContain('Kind\tComment');
    expect(text).toContain('✓ P:Age ≥ 18 · is now "<number>"');
    expect(text).toContain('✗ Intro:HasCard = true · is now false');
  });

  it('draws a single condition without a group line', () => {
    expect(conditionLines(group('AND', [leaf()]))).toEqual(['✗ Intro:HasCard = true · is now false · HasCard is false, not true']);
    expect(conditionLines(null)).toEqual([]);
  });
});
