'use strict';

import { kindOf, RESULT_WORDS, groupHeadline, rollUp } from '../../../src/core/structure/rule-words.js';
import { describeVerdict } from '../../../src/core/structure/visibility.js';
import { liveSetErrors } from '../../../src/core/structure/live-validation.js';

describe('the words of a condition', () => {
  it('reads true now, false now or can\'t tell, never holds or cannot be judged', () => {
    expect(RESULT_WORDS[kindOf(true)]).toEqual({ glyph: '✓', words: 'true now' });
    expect(RESULT_WORDS[kindOf(false)]).toEqual({ glyph: '✗', words: 'false now' });
    expect(RESULT_WORDS[kindOf(null)]).toEqual({ glyph: '?', words: "can't tell" });
  });
});

describe('the line of a group', () => {
  it('always says the rule as defined; the mark before it says whether it holds', () => {
    expect(groupHeadline('AND')).toBe('ALL of these are true');
    expect(groupHeadline('OR')).toBe('ANY of these is true');
    expect(groupHeadline('AND', false)).toBe('ALL of these are true');
    expect(groupHeadline('OR', null)).toBe('ANY of these is true');
  });

  it('counts the conditions that decide it', () => {
    expect(rollUp({ operator: 'AND', total: 2, fails: 1, holds: 1 })).toBe('(1 of 2 is false)');
    expect(rollUp({ operator: 'AND', total: 3, fails: 2, holds: 1 })).toBe('(2 of 3 are false)');
    expect(rollUp({ operator: 'OR', total: 2, fails: 2, holds: 0 })).toBe('(0 of 2 are true)');
    expect(rollUp({ operator: 'OR', total: 2, fails: 1, holds: 1 })).toBe('(1 of 2 is true)');
    expect(rollUp({ operator: 'AND', total: 0 })).toBe('no rules');
  });
});

describe('no sentence says holds or cannot be judged', () => {
  const rule = (ok) => ({ kind: 'rule', ok, field: 'A:B', condition: '=', expected: '"x"', actual: '"y"' });
  const group = (operator, ok, children) => ({ kind: 'group', operator, ok, total: children.length, fails: 1, holds: 0, children });

  it('in the verdict', () => {
    const sentences = [
      describeVerdict(group('AND', true, [rule(true)])),
      describeVerdict(group('OR', true, [rule(true), rule(false)])),
      describeVerdict(group('OR', false, [rule(false), rule(false)])),
      describeVerdict(group('AND', null, [rule(null)])),
      describeVerdict(group('AND', false, [rule(false), rule(false)]))
    ];
    sentences.forEach((sentence) => expect(sentence).not.toMatch(/\bholds?\b|cannot be judged|cannot judge/i));
    expect(sentences[0]).toBe('Shown: its condition is true');
    expect(sentences[1]).toBe('Shown: at least one condition is true');
    expect(sentences[2]).toBe('Hidden: no condition is true (0 of 2)');
    expect(sentences[3]).toMatch(/^Can't tell if this rule is true/);
  });

  it('for a Set Errors condition', () => {
    const validation = { kind: 'set-errors', triggerExpr: 'A:B = 1' };
    const heads = [
      liveSetErrors(validation, { live: true, hidden: false, evaluation: { result: true } }).headline,
      liveSetErrors(validation, { live: true, hidden: false, evaluation: { result: false } }).headline,
      liveSetErrors(validation, null).headline
    ];
    expect(heads).toEqual([
      'Condition is true now: the error is set and blocks Next',
      'Condition is false now: no error is set',
      "Can't tell: the panel cannot evaluate the condition"
    ]);
  });
});
