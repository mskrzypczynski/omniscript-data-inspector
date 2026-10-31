'use strict';

import {
  pastedSummary, canCompare, jsonErrorHint, indexOfPlace, looseNote, sideReading, sortKeysDeep, callOutputText, recentCalls,
  boxStatus, errorCaret, sideToFix, compareAnnouncement
} from '../../../src/core/shared/compare-json.js';
import { parseLoose } from '../../../src/core/shared/loose-json.js';
import { errorIndex } from '../../../src/core/actions/test-calls.js';
import { parseJsonText } from '../../../src/core/actions/test-calls.js';

/* A box's status as the dialog works it out. */
function statusOf(text, asked = false) {
  const strict = parseJsonText(text);
  const loose = strict.ok ? null : parseLoose(text);
  return boxStatus({ strict, reading: sideReading(strict, loose, false), asked, text });
}

describe('Compare JSON words', () => {
  it('sums up what a box holds', () => {
    expect(pastedSummary({ a: 1, b: 2 })).toBe('2 keys');
    expect(pastedSummary({ a: 1 })).toBe('1 key');
    expect(pastedSummary([1, 2, 3])).toBe('3 items');
    expect(pastedSummary('x')).toBe('a text');
    expect(pastedSummary(4)).toBe('a number');
    expect(pastedSummary(null)).toBe('null');
  });

  it('says where a box stops being JSON, as the test call form finds it', () => {
    expect(statusOf('{\n  "a": 1,\n  "b": ,\n}').text).toBe('⚠ invalid');
    expect(statusOf('{"a": 1').text).toBe('⚠ invalid');
    expect(statusOf('{"a": 1}').text).toBe('1 key ✓');
  });

  it('compares only two boxes that both hold JSON', () => {
    expect(canCompare(parseJsonText('{}'), parseJsonText('[1]'))).toBe(true);
    expect(canCompare(parseJsonText(''), parseJsonText('[1]'))).toBe(false);
    expect(canCompare(parseJsonText('{'), parseJsonText('[1]'))).toBe(false);
  });
});

/* The hint for the text, at the place the strict reading stops. */
const hintFor = (text) => jsonErrorHint(text, errorIndex(text));

describe('what is wrong with a box', () => {
  it('says a key needs a colon and a value', () => {
    expect(hintFor('{ "Lol" }')).toBe('A key needs a colon and a value, like "Lol": 1.');
    expect(hintFor('{"a": 1, "b" 2}')).toBe('A key needs a colon and a value, like "b": 1.');
  });

  it('says JSON uses double quotes', () => {
    expect(hintFor("{'a': 'b'}")).toBe('JSON uses double quotes, "like this", for texts and keys.');
    expect(hintFor('{"a": \'b\'}')).toMatch(/double quotes/);
  });

  it('says keys need double quotes, and texts too', () => {
    expect(hintFor('{Name: 1}')).toBe('Keys need double quotes: write "Name", not Name.');
    expect(hintFor('{"a": 1, b: 2}')).toBe('Keys need double quotes: write "b", not b.');
    expect(hintFor('{"a": hello}')).toBe('A text needs double quotes: write "hello".');
  });

  it('says to remove a trailing comma', () => {
    expect(hintFor('{"a": 1,}')).toBe('Remove the comma before the }.');
    expect(hintFor('[1, 2,]')).toBe('Remove the comma before the ].');
  });

  it('recognises an Apex map', () => {
    const apex = 'This looks like an Apex map; JSON writes "Name": "Ada", with a colon and double quotes.';
    expect(hintFor('{Name=Ada, Age=36}')).toBe(apex);
    expect(hintFor('{"Name"="Ada"}')).toBe(apex);
  });

  it('says JSON has no comments', () => {
    expect(hintFor('// note\n{"a": 1}')).toBe('JSON has no comments; remove them.');
    expect(hintFor('{"a": /* x */ 1}')).toBe('JSON has no comments; remove them.');
  });

  it('says only one JSON value is allowed, before or after it', () => {
    expect(hintFor('{"a": 1} {"b": 2}')).toMatch(/^Only one JSON value is allowed; remove what follows it/);
    expect(hintFor('Result: {"a": 1}')).toBe('Only one JSON value is allowed; remove what comes before the {.');
  });

  it('says when the text ends early, and what is open', () => {
    expect(hintFor('{"a": [1, 2')).toBe('The [ is not closed: add a ] at the end.');
    expect(hintFor('{"a": 1')).toBe('The { is not closed: add a } at the end.');
    expect(hintFor('{"a": "x')).toBe('A text is not closed: add the closing ".');
    expect(hintFor('{"a":')).toBe('A value is missing after the colon.');
  });

  it('names the other common slips', () => {
    expect(hintFor('{"a": }')).toBe('A value is missing after the colon.');
    expect(hintFor('[1 2]')).toBe('A comma is missing between these two.');
    expect(hintFor('{"a": 1 "b": 2}')).toBe('A comma is missing between these two.');
    expect(hintFor('{"a": True}')).toBe('JSON writes true, false and null in lowercase.');
    expect(hintFor('{"a": undefined}')).toBe('JSON has no NaN, undefined or Infinity; use null.');
    expect(hintFor('(1, 2)')).toBe('Parentheses are not JSON; write a list as [ … ].');
    expect(hintFor('{"a": "x\ny"}')).toBe('A text cannot hold a line break; write \\n instead.');
    expect(hintFor('[01]')).toMatch(/does not start with 0/);
    expect(hintFor('[+1]')).toBe('A JSON number has no plus sign.');
  });

  it('gives no hint for what it cannot explain, or for nothing', () => {
    expect(hintFor('{"a": 1,,}')).toBe('');
    expect(hintFor('{"a": tru}')).toBe('');
    expect(jsonErrorHint('', 0)).toBe('');
    expect(jsonErrorHint('   ', 1)).toBe('');
  });

  it('puts the hint with the status of a box that is not JSON, when the text gives one', () => {
    expect(statusOf('{\n  "Lol"\n}')).toMatchObject({
      text: '⚠ invalid', where: 'Line 3, column 1', hint: 'A key needs a colon and a value, like "Lol": 1.'
    });
    expect(statusOf('{"a": 1,,}').hint).toBe('');
    expect(statusOf('{"a": 1}').hint).toBe('');
  });

  it('turns a line and a column back into an index', () => {
    expect(indexOfPlace('ab\ncd\nef', 3, 2)).toBe(7);
    expect(indexOfPlace('abc', 1, 4)).toBe(3);
    expect(indexOfPlace('abc', 9, 9)).toBe(3);
  });
});

describe('reading a box loosely', () => {
  const read = (text, accepted) => {
    const strict = parseJsonText(text);
    return sideReading(strict, strict.ok ? null : parseLoose(text), accepted);
  };

  it('is JSON, empty, offered, accepted or bad', () => {
    expect(read('{"a": 1}').kind).toBe('json');
    expect(read('  ').kind).toBe('empty');
    expect(read("{'a': 1}").kind).toBe('offer');
    expect(read("{'a': 1}").ok).toBe(false);
    const accepted = read("{'a': 1}", true);
    expect([accepted.kind, accepted.ok, accepted.value, accepted.words]).toEqual(['loose', true, { a: 1 }, ['single quotes']]);
    expect(read('{ "Lol" }', true).kind).toBe('bad');
    expect(canCompare(accepted, read('{"a": 2}'))).toBe(true);
    expect(canCompare(read("{'a': 1}"), read('{"a": 2}'))).toBe(false);
  });

  it('says what was accepted', () => {
    expect(looseNote(['single quotes', 'unquoted keys'])).toBe('Read loosely: single quotes and unquoted keys were accepted');
    expect(looseNote(['comments'])).toBe('Read loosely: comments were accepted');
    expect(looseNote(['single quotes', 'unquoted keys', 'trailing commas'])).toBe('Read loosely: single quotes, unquoted keys and trailing commas were accepted');
  });
});

describe('the tools of a box', () => {
  it('sorts keys at every depth and leaves lists in order', () => {
    const sorted = sortKeysDeep({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }, 3] } });
    expect(JSON.stringify(sorted)).toBe('{"a":{"c":[{"y":2,"z":1},3],"d":1},"b":1}');
    expect(sortKeysDeep(3)).toBe(3);
    expect(sortKeysDeep(null)).toBeNull();
  });

  it('writes a call\'s answer as text, or says it has none', () => {
    expect(callOutputText({ output: { a: 1 } })).toBe('{\n  "a": 1\n}');
    expect(callOutputText({ output: '{"a":1}' })).toBe('{\n  "a": 1\n}');
    expect(callOutputText({ output: 'plain' })).toBe('plain');
    expect(callOutputText({})).toBeNull();
    expect(callOutputText({ output: '' })).toBeNull();
    expect(callOutputText(null)).toBeNull();
  });

  it('lists the newest calls first, leaving a chain\'s group out', () => {
    const entries = [{ id: 1 }, { id: 2, chain: true }, { id: 3 }, { id: 4 }];
    expect(recentCalls(entries, 2).map((entry) => entry.id)).toEqual([4, 3]);
    expect(recentCalls(entries).map((entry) => entry.id)).toEqual([4, 3, 1]);
    expect(recentCalls(undefined)).toEqual([]);
  });
});

describe('boxStatus: the status in the header of a box', () => {
  it('is quiet for a box that parses: its size and a tick', () => {
    expect(statusOf('{"a": 1, "b": 2}')).toEqual({ tone: 'muted', text: '2 keys ✓', plain: '2 keys', hint: '' });
    expect(statusOf('{"a": 1}').text).toBe('1 key ✓');
    expect(statusOf('[1, 2, 3]').text).toBe('3 items ✓');
  });

  it('calls an empty box empty, quietly, and not an error', () => {
    expect(statusOf('')).toEqual({ tone: 'muted', text: 'empty', plain: 'empty', hint: '' });
    expect(statusOf('   \n ').tone).toBe('muted');
  });

  it('asks for a value, in amber and not in red, once Compare was pressed on an empty box', () => {
    expect(statusOf('', true)).toEqual({ tone: 'warn', text: 'empty: paste or type JSON', plain: 'empty: paste or type JSON', hint: '' });
  });

  it('says invalid JSON with the line and the column, in red', () => {
    expect(statusOf('{\n  "a": 1,\n  "b": ,\n}')).toMatchObject({ tone: 'error', plain: 'invalid JSON, line 3, column 8' });
    expect(statusOf('{ "Lol" }').tone).toBe('error');
  });

  it('shows no position when none is known', () => {
    const reading = sideReading({ ok: false, error: 'x' }, null, false);
    expect(boxStatus({ strict: { ok: false, error: 'x' }, reading, text: '{' })).toEqual({
      tone: 'error', text: '⚠ invalid', plain: 'invalid JSON', where: '', hint: ''
    });
    expect(boxStatus({ strict: { ok: false, line: 0, column: -2 }, reading, text: '{' }).text).toBe('⚠ invalid');
  });

  it('reads text that is accepted loosely as a box that parses', () => {
    const strict = parseJsonText("{'a': 1}");
    const loose = parseLoose("{'a': 1}");
    expect(boxStatus({ strict, reading: sideReading(strict, loose, true), text: "{'a': 1}" }).text).toBe('1 key ✓');
    expect(boxStatus({ strict, reading: sideReading(strict, loose, false), text: "{'a': 1}" }).tone).toBe('error');
  });
});

describe('errorCaret', () => {
  it('is the index of the line and column the parse stopped at', () => {
    const text = '{\n  "a": 1,\n  "b": ,\n}';
    expect(errorCaret(parseJsonText(text), text)).toBe(text.indexOf(',\n}'));
    expect(errorCaret(parseJsonText('{"a": 1'), '{"a": 1')).toBe(7);
  });

  it('is null for text that parses and for a position that is not known', () => {
    expect(errorCaret(parseJsonText('{}'), '{}')).toBeNull();
    expect(errorCaret({ ok: false }, '{')).toBeNull();
    expect(errorCaret(null, '{')).toBeNull();
  });
});

describe('sideToFix', () => {
  const read = (text) => sideReading(parseJsonText(text), null, false);

  it('names the first box that is empty or not JSON, Before first', () => {
    expect(sideToFix(read(''), read('{}'))).toBe('before');
    expect(sideToFix(read('{'), read(''))).toBe('before');
    expect(sideToFix(read('{}'), read(''))).toBe('after');
    expect(sideToFix(read('{}'), read('{'))).toBe('after');
  });

  it('is null when both can be compared', () => {
    expect(sideToFix(read('{}'), read('[1]'))).toBeNull();
  });
});

describe('compareAnnouncement', () => {
  const box = (name, text, asked = true) => ({ name, status: statusOf(text, asked) });

  it('says what is wrong with each box that cannot be compared, with the hint', () => {
    expect(compareAnnouncement([box('Before', '{ "Lol" }'), box('After', '')])).toBe(
      'Before: invalid JSON, line 1, column 9. A key needs a colon and a value, like "Lol": 1. After: empty: paste or type JSON.'
    );
  });

  it('says nothing about a box that is fine', () => {
    expect(compareAnnouncement([box('Before', '{}'), box('After', '[1]')])).toBe('');
  });
});
