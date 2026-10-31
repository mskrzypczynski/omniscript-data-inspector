'use strict';

import { flatten } from '../../../src/core/shared/structure-model.js';
import { valueMismatch, matchesFormat, formatPattern } from '../../../src/core/structure/value-types.js';

const element = (type, propSetMap = {}, extra = {}) => {
  const list = flatten({
    children: [{ name: 'S', type: 'Step', propSetMap: {}, children: [{ eleArray: [{ name: 'X', type, propSetMap, ...extra }] }] }]
  }, null);
  return list.find((e) => e.name === 'X');
};
const hint = (type, value, propSetMap, extra) => valueMismatch(element(type, propSetMap, extra), value);

describe('no value, no hint', () => {
  it.each([[undefined], [null], [''], ['   ']])('%j gives none', (value) => {
    expect(hint('Number', value)).toBeNull();
    expect(hint('Checkbox', value)).toBeNull();
    expect(hint('Date', value)).toBeNull();
  });
  it('is null for no element', () => {
    expect(valueMismatch(null, 'x')).toBeNull();
  });
});

describe('placeholders of a masked bundle', () => {
  it.each(['<string>', '<number>'])('%s is no answer, so no type has a hint for it', (value) => {
    const options = { options: [{ name: 'GB', value: 'United Kingdom' }] };
    expect(hint('Number', value)).toBeNull();
    expect(hint('Currency', value)).toBeNull();
    expect(hint('Date', value)).toBeNull();
    expect(hint('Time', value)).toBeNull();
    expect(hint('Date/Time', value)).toBeNull();
    expect(hint('Select', value, options)).toBeNull();
    expect(hint('Radio', value, options)).toBeNull();
    expect(hint('Multi-select', value)).toBeNull();
    expect(hint('Checkbox', value)).toBeNull();
  });
});

describe('Number and Currency', () => {
  it('accepts numbers and numeric text', () => {
    expect(hint('Number', 12)).toBeNull();
    expect(hint('Number', '12')).toBeNull();
    expect(hint('Number', '-3.5')).toBeNull();
    expect(hint('Currency', '1200.50')).toBeNull();
  });

  it('flags text that is not a number', () => {
    expect(hint('Number', 'abc')).toEqual({ kind: 'number', text: 'Number holds text “abc”' });
    expect(hint('Currency', 'n/a')).toEqual({ kind: 'number', text: 'Currency holds text “n/a”' });
  });

  it('says a comma is a locale format, not a number', () => {
    expect(hint('Number', '12,5')).toEqual({
      kind: 'number',
      text: 'Number holds text “12,5”: a comma or space inside a number is a locale format, not a number'
    });
    expect(hint('Currency', '1,234.50').text).toMatch(/locale format/);
    expect(hint('Number', '1 000').text).toMatch(/locale format/);
  });

  it('does not call plain text a locale format', () => {
    expect(hint('Number', '1.2.3').text).toBe('Number holds text “1.2.3”');
  });

  it('only judges strings', () => {
    expect(hint('Number', true)).toBeNull();
    expect(hint('Number', [1])).toBeNull();
    expect(hint('Number', { a: 1 })).toBeNull();
  });

  it('shortens long text', () => {
    expect(hint('Number', 'x'.repeat(60)).text).toBe(`Number holds text “${'x'.repeat(40)}…”`);
  });
});

describe('Date, Date/Time and Time', () => {
  it('accepts ISO dates, date-times and times', () => {
    expect(hint('Date', '2026-03-04')).toBeNull();
    expect(hint('Date', '2026-03-04T09:30:00.000Z')).toBeNull();
    expect(hint('Date/Time', '2026-03-04T09:30')).toBeNull();
    expect(hint('Date/Time (Native)', '2026-03-04 09:30:15+01:00')).toBeNull();
    expect(hint('Time', '09:30')).toBeNull();
    expect(hint('Time', '23:59:59.123Z')).toBeNull();
  });

  it('flags text that is not a date, and dates that do not exist', () => {
    expect(hint('Date', 'tomorrow').kind).toBe('date');
    expect(hint('Date', '2026-02-30').kind).toBe('date');
    expect(hint('Date', '2026-13-01').kind).toBe('date');
    expect(hint('Date', '04/03/2026').text).toBe('Date holds text “04/03/2026” that is not a date or time in ISO, for example 2026-03-04');
    expect(hint('Time', '25:00').kind).toBe('date');
    expect(hint('Time', '9:30 PM').kind).toBe('date');
    expect(hint('Date/Time', '2026-03-04')).toBeNull();
  });

  it('accepts a leap day only in a leap year', () => {
    expect(hint('Date', '2024-02-29')).toBeNull();
    expect(hint('Date', '2025-02-29').kind).toBe('date');
  });

  it('accepts what the element dateFormat says', () => {
    expect(hint('Date', '04/03/2026', { dateFormat: 'dd/MM/yyyy' })).toBeNull();
    expect(hint('Date', '3/4/2026', { dateFormat: 'M/d/yyyy' })).toBeNull();
    expect(hint('Date', '04 Mar 2026', { dateFormat: 'dd MMM yyyy' })).toBeNull();
    expect(hint('Date', 'March 4, 2026', { dateFormat: "MMMM d, yyyy" })).toBeNull();
    expect(hint('Date', '2026-03-04', { dateFormat: 'dd/MM/yyyy' })).toBeNull(); // ISO is always welcome
  });

  it('names the format in the hint when the value fits neither', () => {
    expect(hint('Date', '31/02/2026', { dateFormat: 'dd/MM/yyyy' }).text)
      .toBe('Date holds text “31/02/2026” that is not a date or time in dd/MM/yyyy, or ISO 2026-03-04');
  });

  it('accepts what the element timeFormat says', () => {
    expect(hint('Time', '09:30 PM', { timeFormat: 'hh:mm a' })).toBeNull();
    expect(hint('Time', '13:30 PM', { timeFormat: 'hh:mm a' }).kind).toBe('date');
    expect(hint('Time', '13:30', { timeFormat: 'hh:mm a' })).toBeNull(); // ISO is always welcome
    expect(hint('Time', '21:30:15', { timeFormat: 'HH:mm:ss' })).toBeNull();
  });

  it('tries the date, the time and both for a Date/Time', () => {
    const props = { dateFormat: 'dd/MM/yyyy', timeFormat: 'HH:mm' };
    expect(hint('Date/Time', '04/03/2026 09:30', props)).toBeNull();
    expect(hint('Date/Time', '04/03/2026', props)).toBeNull();
    expect(hint('Date/Time', '09:30', props)).toBeNull();
    expect(hint('Date/Time', 'soon', props).kind).toBe('date');
  });

  it('gives no hint when the format cannot be read', () => {
    expect(hint('Date', '04.03.2026', { dateFormat: 'dd.MM.YYYY' })).toBeNull(); // Y is not a token it knows
  });

  it('only judges strings', () => {
    expect(hint('Date', 1772614800000)).toBeNull();
  });
});

describe('matchesFormat', () => {
  it('checks ranges, not only the shape', () => {
    expect(matchesFormat('31/12/2026', 'dd/MM/yyyy')).toBe(true);
    expect(matchesFormat('31/13/2026', 'dd/MM/yyyy')).toBe(false);
    expect(matchesFormat('31/04/2026', 'dd/MM/yyyy')).toBe(false);
    expect(matchesFormat('00:60', 'HH:mm')).toBe(false);
    expect(matchesFormat('13:00 PM', 'hh:mm a')).toBe(false);
    expect(matchesFormat('12:00 pm', 'hh:mm a')).toBe(true);
    expect(matchesFormat('x', 'dd/MM/yyyy')).toBe(false);
  });
  it('reads quoted text as literal and refuses unknown letters', () => {
    expect(matchesFormat('2026-03-04T09:30', "yyyy-MM-dd'T'HH:mm")).toBe(true);
    expect(matchesFormat('x', 'Q')).toBeNull();
    expect(formatPattern('Q')).toBeNull();
    expect(formatPattern('///')).toBeNull();
  });
});

describe('Checkbox and Toggle', () => {
  it('flags the text true or false', () => {
    expect(hint('Checkbox', 'true')).toEqual({ kind: 'boolean', text: 'Checkbox holds the text “true”, not a boolean' });
    expect(hint('Toggle', 'False').text).toBe('Toggle holds the text “False”, not a boolean');
  });
  it('accepts booleans and says nothing about other text', () => {
    expect(hint('Checkbox', true)).toBeNull();
    expect(hint('Checkbox', false)).toBeNull();
    expect(hint('Checkbox', 'yes')).toBeNull();
  });
});

describe('Select, Radio and Multi-select', () => {
  const options = [{ name: 'a', value: 'Alpha' }, { name: 'b', value: 'Beta' }];

  it('accepts a stored option name, or its label', () => {
    expect(hint('Select', 'a', { options })).toBeNull();
    expect(hint('Radio', 'Beta', { options })).toBeNull();
    expect(hint('Select', 1, { options: [{ name: 1, value: 'One' }] })).toBeNull();
  });

  it('flags a value that is not among static options, naming them', () => {
    expect(hint('Select', 'zzz', { options })).toEqual({
      kind: 'option', text: 'Select holds “zzz”, which is not one of its options (a, b)'
    });
    expect(hint('Radio', 'zzz', { options }).text).toMatch(/^Radio holds/);
  });

  it('shows only the first options of a long list', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ name: `o${i}`, value: `O${i}` }));
    expect(hint('Select', 'x', { options: many }).text).toBe('Select holds “x”, which is not one of its options (o0, o1, o2, o3, o4 +3)');
  });

  it('does not judge options that come from elsewhere or are absent', () => {
    expect(hint('Select', 'zzz', { options, optionSource: { type: 'SObject', source: 'Account' } })).toBeNull();
    expect(hint('Select', 'zzz', { options: [] })).toBeNull();
    expect(hint('Select', 'zzz', {})).toBeNull();
  });

  it('does not judge a list in a Select', () => {
    expect(hint('Select', ['zzz'], { options })).toBeNull();
  });

  it('flags a string in a Multi-select, and accepts a list', () => {
    expect(hint('Multi-select', 'a;b')).toEqual({ kind: 'list', text: 'Multi-select holds the text “a;b”, not a list' });
    expect(hint('Multi-select', ['a', 'b'])).toBeNull();
    expect(hint('Multi-select', 'a', { options })).toMatchObject({ kind: 'list' }); // never the option rule
  });
});

describe('what it leaves alone', () => {
  it('does not judge text, unknown types, containers, Set Values or formulas', () => {
    expect(hint('Text', 'abc')).toBeNull();
    expect(hint('Email', 'abc')).toBeNull();
    expect(hint('Formula', 'abc', { expression: '1+1' })).toBeNull();
    expect(hint('Edit Block', 'abc', {}, { children: [{ eleArray: [] }] })).toBeNull();
    expect(hint('Set Values', 'abc', { elementValueMap: { A: '1' } })).toBeNull();
    expect(hint('Custom Lightning Web Component', '12,5')).toBeNull();
  });
});
