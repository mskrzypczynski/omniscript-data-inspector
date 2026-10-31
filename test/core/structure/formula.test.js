'use strict';

import { evaluateFormula, isFormulaText, formatFormulaValue, notEvaluatedText, FORMULA_FUNCTIONS } from '../../../src/core/structure/formula.js';

const fields = {
  Qty: 3, Price: '2.50', Name: ' Ada ', Empty: '', Flag: true, Nothing: null,
  'Step1:Total': 100, 'Step1:Label': 'Gold', Prices: [1, 2, '3']
};
const lookup = (path) => fields[path];
const run = (text) => evaluateFormula(text, lookup);
const value = (text) => {
  const result = run(text);
  if (!result.ok) throw new Error(`${text} failed: ${result.reason}`);
  return result.value;
};
const reason = (text) => {
  const result = run(text);
  expect(result.ok).toBe(false);
  return result.reason;
};

describe('isFormulaText', () => {
  it('is true for text starting with = after spaces', () => {
    expect(isFormulaText('=1+1')).toBe(true);
    expect(isFormulaText('  =IF(1,2,3)')).toBe(true);
    expect(isFormulaText('1=1')).toBe(false);
    expect(isFormulaText(5)).toBe(false);
  });
});

describe('literals and references', () => {
  it('reads numbers, both kinds of string, and the words TRUE, FALSE and NULL', () => {
    expect(value('42')).toBe(42);
    expect(value('1.5')).toBe(1.5);
    expect(value('.5')).toBe(0.5);
    expect(value('"hi"')).toBe('hi');
    expect(value("'hi'")).toBe('hi');
    expect(value('true')).toBe(true);
    expect(value('FALSE')).toBe(false);
    expect(value('null')).toBeNull();
  });

  it('allows a leading = and spaces', () => {
    expect(value('= 1 + 2')).toBe(3);
    expect(value('=1+2')).toBe(3);
  });

  it('handles quotes inside strings by doubling or escaping', () => {
    expect(value('"say ""hi"""')).toBe('say "hi"');
    expect(value('"a\\"b"')).toBe('a"b');
  });

  it('resolves %Field% and %Step:Field% through the lookup', () => {
    expect(value('%Qty%')).toBe(3);
    expect(value('%Step1:Total%')).toBe(100);
    expect(value('% Qty %')).toBe(3);
    expect(value('%Step1:Label%')).toBe('Gold');
  });

  it('keeps null as null when the data holds it', () => {
    expect(value('%Nothing%')).toBeNull();
  });

  it('fails on a reference that holds nothing, naming it', () => {
    expect(reason('%Nope%')).toBe('No value for %Nope%');
    expect(reason('%Nope% + 1')).toBe('No value for %Nope%');
    expect(reason('UPPER(%Nope%)')).toBe('No value for %Nope%');
    expect(reason('"a" & %Step9:X%')).toBe('No value for %Step9:X%');
  });
});

describe('arithmetic and precedence', () => {
  it('multiplies and divides before adding and subtracting', () => {
    expect(value('2 + 3 * 4')).toBe(14);
    expect(value('(2 + 3) * 4')).toBe(20);
    expect(value('10 - 4 - 3')).toBe(3);
    expect(value('100 / 5 / 2')).toBe(10);
    expect(value('2 * 3 + 4 * 5')).toBe(26);
  });

  it('handles unary minus and plus', () => {
    expect(value('-3 + 5')).toBe(2);
    expect(value('--3')).toBe(3);
    expect(value('2 * -3')).toBe(-6);
    expect(value('+4')).toBe(4);
    expect(value('-%Qty%')).toBe(-3);
  });

  it('adds numbers held as text', () => {
    expect(value('%Price% * %Qty%')).toBe(7.5);
    expect(value('"5" + 1')).toBe(6);
  });

  it('keeps decimals tidy', () => {
    expect(value('0.1 + 0.2')).toBe(0.3);
    expect(value('1.1 * 3')).toBe(3.3);
  });

  it('refuses text where a number is needed, and says which text', () => {
    expect(reason('"abc" + 1')).toBe('"abc" is not a number');
    expect(reason('%Step1:Label% * 2')).toBe('"Gold" is not a number');
    expect(reason('%Empty% + 1')).toBe('"" is not a number');
    expect(reason('true + 1')).toBe('true is not a number');
    expect(reason('%Prices% + 1')).toBe('A list or object is not a number');
  });

  it('refuses a division by zero', () => {
    expect(reason('1 / 0')).toBe('Division by zero');
    expect(reason('%Qty% / (3 - 3)')).toBe('Division by zero');
  });
});

describe('comparisons', () => {
  it('compares numbers as numbers, even when held as text', () => {
    expect(value('2 < 10')).toBe(true);
    expect(value('"2" < "10"')).toBe(true); // both numeric: 2 < 10, not text order
    expect(value('%Price% = 2.5')).toBe(true);
    expect(value('%Qty% >= 3')).toBe(true);
    expect(value('%Qty% > 3')).toBe(false);
    expect(value('%Qty% <= 2')).toBe(false);
  });

  it('compares other values as text, case sensitively', () => {
    expect(value('%Step1:Label% = "Gold"')).toBe(true);
    expect(value('%Step1:Label% = "gold"')).toBe(false);
    expect(value('"abc" < "abd"')).toBe(true);
  });

  it('knows !=, <> and ==', () => {
    expect(value('1 != 2')).toBe(true);
    expect(value('1 <> 1')).toBe(false);
    expect(value('1 == 1')).toBe(true);
  });

  it('treats null as empty text', () => {
    expect(value('%Nothing% = ""')).toBe(true);
  });

  it('compares after concatenation and addition', () => {
    expect(value('1 + 1 = 2')).toBe(true);
    expect(value('"a" & "b" = "ab"')).toBe(true);
  });

  it('fails on a list', () => {
    expect(reason('%Prices% = 1')).toBe('A list or object cannot be compared');
  });
});

describe('concatenation', () => {
  it('joins with & and loosely binds numbers', () => {
    expect(value('"a" & "b"')).toBe('ab');
    expect(value('"n=" & 1 + 2')).toBe('n=3'); // + binds tighter than &
    expect(value('%Step1:Label% & " " & %Qty%')).toBe('Gold 3');
  });
});

describe('IF, AND, OR, NOT', () => {
  it('picks a branch', () => {
    expect(value('IF(%Qty% > 2, "many", "few")')).toBe('many');
    expect(value('IF(%Qty% > 5, "many", "few")')).toBe('few');
  });

  it('gives false when the else branch is left out', () => {
    expect(value('IF(1 = 2, "x")')).toBe(false);
  });

  it('nests', () => {
    const text = 'IF(%Qty% < 1, "none", IF(%Qty% < 5, "some", IF(%Qty% < 10, "lots", "huge")))';
    expect(value(text)).toBe('some');
    expect(value('IF(AND(%Qty% > 1, OR(%Flag%, FALSE)), "yes", "no")')).toBe('yes');
  });

  it('reads only the branch it takes', () => {
    expect(value('IF(TRUE, 1, %Missing%)')).toBe(1);
    expect(reason('IF(FALSE, 1, %Missing%)')).toBe('No value for %Missing%');
    expect(value('OR(TRUE, %Missing%)')).toBe(true);
    expect(value('AND(FALSE, %Missing%)')).toBe(false);
  });

  it('accepts true and false as a boolean, a number or the words', () => {
    expect(value('IF(%Flag%, 1, 2)')).toBe(1);
    expect(value('IF("false", 1, 2)')).toBe(2);
    expect(value('IF(0, 1, 2)')).toBe(2);
    expect(value('NOT(0)')).toBe(true);
    expect(value('NOT(%Flag%)')).toBe(false);
  });

  it('refuses a condition that is neither', () => {
    expect(reason('IF("maybe", 1, 2)')).toBe('"maybe" is not true or false');
  });

  it('checks the number of arguments', () => {
    expect(reason('IF(1)')).toBe('IF needs 2 to 3 values');
    expect(reason('NOT()')).toBe('NOT needs 1 value');
    expect(reason('AND()')).toBe('AND needs 1 to many values');
  });
});

describe('text functions', () => {
  it('computes LEN, UPPER, LOWER, TRIM, CONCAT', () => {
    expect(value('LEN("abcd")')).toBe(4);
    expect(value('UPPER("ab")')).toBe('AB');
    expect(value('LOWER("AB")')).toBe('ab');
    expect(value('TRIM(%Name%)')).toBe('Ada');
    expect(value('CONCAT("a", 1, TRUE)')).toBe('a1true');
    expect(value('LEN(%Nothing%)')).toBe(0);
  });

  it('turns values into text and numbers', () => {
    expect(value('TEXT(12.5)')).toBe('12.5');
    expect(value('TEXT(TRUE)')).toBe('true');
    expect(value('NUMBER("7") + 1')).toBe(8);
    expect(reason('NUMBER("x")')).toBe('"x" is not a number');
  });

  it('ignores the case of the function name', () => {
    expect(value('upper("a")')).toBe('A');
    expect(value('If(true, 1, 2)')).toBe(1);
  });
});

describe('ISBLANK and ISNULL', () => {
  it('treat a missing field, null and empty text as blank', () => {
    expect(value('ISBLANK(%Nope%)')).toBe(true);
    expect(value('ISBLANK(%Nothing%)')).toBe(true);
    expect(value('ISBLANK(%Empty%)')).toBe(true);
    expect(value('ISNULL(%Nope%)')).toBe(true);
    expect(value('ISBLANK(%Qty%)')).toBe(false);
    expect(value('ISBLANK("  ")')).toBe(true);
    expect(value('IF(ISBLANK(%Nope%), "ask", %Nope%)')).toBe('ask');
  });
});

describe('number functions', () => {
  it('computes ABS, FLOOR, CEILING', () => {
    expect(value('ABS(-4.5)')).toBe(4.5);
    expect(value('FLOOR(2.9)')).toBe(2);
    expect(value('FLOOR(-2.1)')).toBe(-3);
    expect(value('CEILING(2.1)')).toBe(3);
  });

  it('rounds half away from zero, to the given places', () => {
    expect(value('ROUND(2.5)')).toBe(3);
    expect(value('ROUND(-2.5)')).toBe(-3);
    expect(value('ROUND(1.005, 2)')).toBe(1.01);
    expect(value('ROUND(3.14159, 3)')).toBe(3.142);
    expect(value('ROUND(1234, 0)')).toBe(1234);
  });

  it('computes MAX, MIN, SUM, AVERAGE over values and lists', () => {
    expect(value('MAX(1, 7, 3)')).toBe(7);
    expect(value('MIN(4, "2", 9)')).toBe(2);
    expect(value('SUM(1, 2, 3.5)')).toBe(6.5);
    expect(value('AVERAGE(2, 4, 9)')).toBe(5);
    expect(value('SUM(%Prices%)')).toBe(6);
    expect(value('MAX(%Prices%, 10)')).toBe(10);
  });

  it('refuses an empty list and non-numbers', () => {
    expect(reason('SUM()')).toBe('SUM needs at least one value');
    expect(reason('SUM(1, "x")')).toBe('"x" is not a number');
  });
});

describe('failures', () => {
  it('names an unknown function', () => {
    expect(reason('FOO(1)')).toBe('Unknown function FOO');
    expect(reason('VLOOKUP(1, 2)')).toBe('Unknown function VLOOKUP');
  });

  it('names an unknown bare word', () => {
    expect(reason('banana')).toBe('Unknown name banana');
  });

  it.each([
    ['1 +', 'Syntax error: the formula ends too soon'],
    ['(1 + 2', 'Syntax error: expected ")"'],
    ['1 2', 'Syntax error: unexpected "2"'],
    ['"open', 'Syntax error: a text is not closed'],
    ['%open', 'Syntax error: a % reference is not closed'],
    ['%%', 'Syntax error: an empty % reference'],
    ['1 $ 2', 'Syntax error: unexpected "$"'],
    ['IF(1,', 'Syntax error: the formula ends too soon'],
    [')', 'Syntax error: unexpected ")"']
  ])('reports a syntax error in %s', (text, expected) => {
    expect(reason(text)).toBe(expected);
  });

  it('reports an empty formula', () => {
    expect(reason('')).toBe('The formula is empty');
    expect(reason('=  ')).toBe('The formula is empty');
  });

  it('refuses something that is not text, and a result that is a list', () => {
    expect(evaluateFormula(5)).toEqual({ ok: false, reason: 'Not a formula' });
    expect(reason('%Prices%')).toBe('The formula gives a list or object');
  });

  it('refuses a formula that is too long or nested too deeply', () => {
    expect(evaluateFormula('1+'.repeat(3000) + '1').ok).toBe(false);
    expect(reason('('.repeat(100) + '1' + ')'.repeat(100))).toBe('The formula is nested too deeply');
  });

  it('never throws, even when the lookup does', () => {
    const result = evaluateFormula('%X% + 1', () => { throw new Error('boom'); });
    expect(result).toEqual({ ok: false, reason: 'The formula could not be evaluated' });
  });

  it('does not run code', () => {
    expect(evaluateFormula('constructor.constructor("return 1")()', lookup).ok).toBe(false);
    expect(evaluateFormula('alert(1)', lookup).ok).toBe(false);
  });
});

describe('formatFormulaValue and the function list', () => {
  it('quotes text and writes the rest bare', () => {
    expect(formatFormulaValue('a')).toBe('"a"');
    expect(formatFormulaValue(3)).toBe('3');
    expect(formatFormulaValue(false)).toBe('false');
    expect(formatFormulaValue(null)).toBe('null');
  });

  it('lists the supported functions', () => {
    expect(FORMULA_FUNCTIONS).toEqual(expect.arrayContaining([
      'IF', 'AND', 'OR', 'NOT', 'ISBLANK', 'ISNULL', 'CONCAT', 'LEN', 'UPPER', 'LOWER', 'TRIM',
      'ABS', 'ROUND', 'FLOOR', 'CEILING', 'MAX', 'MIN', 'SUM', 'AVERAGE', 'NUMBER', 'TEXT'
    ]));
  });
});

describe('notEvaluatedText', () => {
  it('words a reason as a sentence, once', () => {
    expect(notEvaluatedText('Unknown function FOO')).toBe('The formula could not be evaluated: Unknown function FOO');
    expect(notEvaluatedText('The formula could not be evaluated')).toBe('The formula could not be evaluated');
    expect(notEvaluatedText('The formula is empty.')).toBe('The formula is empty');
    expect(notEvaluatedText('The result is not a number')).toBe('The result is not a number');
    expect(notEvaluatedText('')).toBe('The formula could not be evaluated');
    expect(notEvaluatedText(undefined)).toBe('The formula could not be evaluated');
  });
});
