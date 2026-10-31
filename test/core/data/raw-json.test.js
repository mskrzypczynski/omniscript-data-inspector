'use strict';

import { formatRaw, rawView, reorderKeys, hasUnsafeNumbers } from '../../../src/core/shared/raw-json.js';
import { payloadText } from '../../../src/core/shared/mask.js';
import { lineSize } from '../../../src/core/shared/json-tree-model.js';
import { countLines } from '../../../src/core/shared/text-search.js';
import { statusText } from '../../../src/core/data/data-status.js';

describe('formatRaw', () => {
  it('lays text out exactly like JSON.stringify does for ordinary payloads', () => {
    const value = { a: 1, b: [1, 2, { c: 'x, "y": {z}' }], d: {}, e: [], f: [[], {}], g: null, h: true, i: -1.5e3 };
    expect(formatRaw(JSON.stringify(value)).text).toBe(JSON.stringify(value, null, 2));
  });

  it('keeps the key order the page wrote, numeric keys included', () => {
    const { text } = formatRaw('{"b":1,"10":2,"2":3,"a":4}');
    expect(text.split('\n').map((line) => line.trim())).toEqual(['{', '"b": 1,', '"10": 2,', '"2": 3,', '"a": 4', '}']);
    expect(Object.keys(JSON.parse('{"b":1,"10":2,"2":3,"a":4}'))).toEqual(['2', '10', 'b', 'a']); // what a parse does
  });

  it('keeps every digit of a number above 2^53', () => {
    const { text, unsafe } = formatRaw('{"id":9007199254740993,"n":12345678901234567890}');
    expect(text).toContain('"id": 9007199254740993');
    expect(text).toContain('"n": 12345678901234567890');
    expect(unsafe).toBe(true);
  });

  it('flags only integers that a double cannot hold, and never ones inside strings', () => {
    expect(formatRaw('{"a":"12345678901234567890"}').unsafe).toBe(false);
    expect(formatRaw('{"a":9007199254740991}').unsafe).toBe(false);
    expect(formatRaw('{"a":1000000000000000}').unsafe).toBe(false);
    expect(formatRaw('{"a":-9007199254740993}').unsafe).toBe(true);
    expect(formatRaw('[9007199254740992]').unsafe).toBe(true);
  });

  it('puts whitespace-only containers on one line', () => {
    expect(formatRaw('{ "a" : { }, "b" : [ \n ] }').text).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it('copes with escaped quotes and backslashes in strings', () => {
    const raw = '{"q":"say \\"hi\\" \\\\","r":"}"}';
    expect(formatRaw(raw).text).toBe('{\n  "q": "say \\"hi\\" \\\\",\n  "r": "}"\n}');
  });

  it('never throws on text that is not JSON', () => {
    ['', '{"a":', '{"a":"x', ']]}}', '{,,:}', 'plain text', '\u0000'].forEach((text) => {
      expect(() => formatRaw(text)).not.toThrow();
    });
    expect(formatRaw(undefined).text).toBe('');
  });
});

describe('reorderKeys', () => {
  it('puts integer-like keys first, ascending, at every level, and touches nothing else', () => {
    expect(reorderKeys('{"b":{"x":1,"7":2,"3":[{"z":0,"1":1}]},"10":9007199254740993,"2":"a, b"}'))
      .toBe('{"2":"a, b","10":9007199254740993,"b":{"3":[{"1":1,"z":0}],"7":2,"x":1}}');
  });

  it('leaves text without such keys as it is (whitespace aside) and returns null for what is not JSON', () => {
    expect(reorderKeys('{ "a" : [ ] , "b" : { } }')).toBe('{"a":[],"b":{}}');
    expect(reorderKeys('{"a":')).toBe(null);
    expect(reorderKeys('{"a":1} x')).toBe(null);
    expect(reorderKeys('')).toBe(null);
  });
});

describe('rawView', () => {
  it('shows the Tree\'s key order, so a line number holds the same JSON in both', () => {
    ['{"b":{"x":1},"1":2}', '{"k":{"b":{"x":1},"1":2}}', '{"b":1,"10":2,"2":3,"a":[{"z":1,"0":2}]}'].forEach((raw) => {
      const data = JSON.parse(raw);
      const view = rawView(raw, data);
      expect(view.exact).toBe(true);
      expect(view.text).toBe(JSON.stringify(data, null, 2));
    });
  });

  it('keeps the page\'s digits while following the Tree\'s order, and copies the page\'s own order', () => {
    const raw = '{"b":1,"2":9007199254740993}';
    const view = rawView(raw, JSON.parse(raw));
    expect(view.text).toBe('{\n  "2": 9007199254740993,\n  "b": 1\n}');
    expect(view.copyText).toBe('{\n  "b": 1,\n  "2": 9007199254740993\n}');
    expect(view.exact).toBe(true);
  });

  it('has as many lines as the Tree numbers, so line numbers match', () => {
    const raw = '{"b":[1,{"c":{}}],"10":2,"2":[],"a":"x"}';
    const data = JSON.parse(raw);
    const view = rawView(raw, data);
    expect(view.exact).toBe(true);
    expect(countLines(view.text)).toBe(lineSize(data));
  });

  it('falls back to the parsed value when a repeated key makes the line counts differ', () => {
    const raw = '{"a":1,"a":2,"b":3}';
    const data = JSON.parse(raw);
    const view = rawView(raw, data);
    expect(view.exact).toBe(false);
    expect(view.text).toBe(JSON.stringify(data, null, 2));
    expect(countLines(view.text)).toBe(lineSize(data));
  });

  it('follows the Tree\'s order for an integer-like key written with an escape', () => {
    ['{"a":1,"\\u0031":2}', '{"b":{"x":1,"\\u0032":[]},"\\u0031\\u0030":2,"a":0}'].forEach((raw) => {
      const data = JSON.parse(raw);
      const view = rawView(raw, data);
      const keys = (text) => text.split('\n').map((line) => /^\s*("(?:[^"\\]|\\.)*")\s*:/.exec(line)).map((m) => (m ? JSON.parse(m[1]) : null));
      expect(view.exact).toBe(true);
      expect(keys(view.text)).toEqual(keys(JSON.stringify(data, null, 2)));
      expect(view.text).toContain('\\u00'); // the page's own spelling is kept
    });
  });

  it('keeps the page\'s order for an escaped key that is not an integer', () => {
    const raw = '{"caf\\u00e9":1,"b":2}';
    const view = rawView(raw, JSON.parse(raw));
    expect(view.exact).toBe(true);
    expect(view.text).toBe('{\n  "caf\\u00e9": 1,\n  "b": 2\n}');
  });

  it('still reports big integers when it has to print the parsed value', () => {
    const raw = '{"a":1,"a":2,"id":9007199254740993}';
    expect(rawView(raw, JSON.parse(raw)).unsafe).toBe(true);
  });
});

describe('hasUnsafeNumbers', () => {
  it('finds an integer above 2^53 outside a string, like formatRaw does', () => {
    expect(hasUnsafeNumbers('{"id":9007199254740993}')).toBe(true);
    expect(hasUnsafeNumbers('{"id":-9007199254740993,"b":1}')).toBe(true);
  });

  it('says no for safe numbers, for long digit runs inside a string and for text that is no payload', () => {
    expect(hasUnsafeNumbers('{"id":9007199254740991}')).toBe(false);
    expect(hasUnsafeNumbers('{"phone":"12345678901234567890"}')).toBe(false);
    expect(hasUnsafeNumbers('{"a":1.5,"b":[1,2,3]}')).toBe(false);
    expect(hasUnsafeNumbers(null)).toBe(false);
    expect(hasUnsafeNumbers('')).toBe(false);
  });

  it('agrees with the layout on every payload', () => {
    ['{"a":123456789012345678}', '{"a":"123456789012345678"}', '[1,2,3]', '{"a":1234567890123456}'].forEach((raw) => {
      expect(hasUnsafeNumbers(raw)).toBe(formatRaw(raw).unsafe);
    });
  });
});

describe('payloadText without masking is the page\'s own value', () => {
  it('keeps key order and digits that a parse would change', () => {
    const raw = '{"b":1,"10":2,"2":3,"id":9007199254740993}';
    const text = payloadText({ parseError: null, raw, data: JSON.parse(raw) }, false);
    expect(text).toBe('{\n  "b": 1,\n  "10": 2,\n  "2": 3,\n  "id": 9007199254740993\n}');
  });

  it('is unchanged for a payload that was already printed like JSON.stringify prints it', () => {
    const data = { a: [1, 2], b: { c: 'x' } };
    const raw = JSON.stringify(data, null, 2);
    expect(payloadText({ parseError: null, raw, data }, false)).toBe(raw);
  });

  it('with masking still prints the parsed data with placeholders', () => {
    const raw = '{"id":9007199254740993,"n":"Ada"}';
    expect(payloadText({ parseError: null, raw, data: JSON.parse(raw) }, true)).toBe('{\n  "id": "<number>",\n  "n": "<string>"\n}');
  });
});

describe('status note for big integers', () => {
  const base = { host: { label: 'c-a' }, shown: 1, nested: 0, rawLength: 5, visible: true, live: true, view: 'tree', hasData: true };

  it('says the Raw view is exact when it is', () => {
    expect(statusText({ ...base, unsafeNumbers: true, rawExact: true }).right).toContain('data has numbers above 2^53; Raw view is exact');
  });

  it('does not claim that when the text had to be reprinted', () => {
    const { right } = statusText({ ...base, unsafeNumbers: true, rawExact: false });
    expect(right).toContain('numbers above 2^53');
    expect(right).not.toContain('Raw view is exact');
  });

  it('says nothing for an ordinary payload', () => {
    expect(statusText(base).right).not.toContain('2^53');
  });
});
