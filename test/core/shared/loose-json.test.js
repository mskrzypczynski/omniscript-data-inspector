'use strict';

import { parseLoose } from '../../../src/core/shared/loose-json.js';

const ok = (text) => {
  const read = parseLoose(text);
  expect(read.ok).toBe(true);
  return read;
};

describe('parseLoose', () => {
  it('reads plain JSON as it is, and says nothing was loose', () => {
    const read = ok('{"a": [1, 2.5, -3e2, true, false, null, "x\\n\\u0041"], "b": {}}');
    expect(read.value).toEqual({ a: [1, 2.5, -300, true, false, null, 'x\nA'], b: {} });
    expect(read.loose).toEqual([]);
    expect(ok('"text"').value).toBe('text');
    expect(ok(' 12 ').value).toBe(12);
    expect(ok('[]').value).toEqual([]);
  });

  it('accepts single quotes for texts and keys', () => {
    const read = ok("{'a': 'it\\'s', \"b\": 'x'}");
    expect(read.value).toEqual({ a: "it's", b: 'x' });
    expect(read.loose).toEqual(['single quotes']);
    expect(ok("'one'").value).toBe('one');
  });

  it('accepts unquoted keys', () => {
    const read = ok('{Name: "Ada", first_name: 1, $id: 2, a-b: 3, 7: 4}');
    expect(read.value).toEqual({ Name: 'Ada', first_name: 1, $id: 2, 'a-b': 3, 7: 4 });
    expect(read.loose).toEqual(['unquoted keys']);
  });

  it('accepts trailing commas in objects and lists', () => {
    const read = ok('{"a": [1, 2,], "b": 1,}');
    expect(read.value).toEqual({ a: [1, 2], b: 1 });
    expect(read.loose).toEqual(['trailing commas']);
  });

  it('accepts // and block comments, anywhere whitespace is', () => {
    const read = ok('// first\n{ /* k */ "a": 1, // one\n "b": /* two */ 2 }\n/* end */');
    expect(read.value).toEqual({ a: 1, b: 2 });
    expect(read.loose).toEqual(['comments']);
  });

  it('reads an Apex map: = as the separator, bare words as texts', () => {
    const read = ok('{Name=Ada Lovelace, Age=36, Active=true, Boss=null, Ratio=0.5, Phone=0123, Empty=}');
    expect(read.value).toEqual({ Name: 'Ada Lovelace', Age: 36, Active: true, Boss: null, Ratio: 0.5, Phone: '0123', Empty: '' });
    expect(read.loose).toEqual(['unquoted keys', '= separators', 'bare words']);
  });

  it('reads nested maps and lists, and (a, b) as a list', () => {
    const read = ok('{Name=Ada, Tags=(a, b, 3), Address={Street=Main St, Geo={Lat=1.5}}, Rows=[{Id=1}, {Id=2}]}');
    expect(read.value).toEqual({
      Name: 'Ada', Tags: ['a', 'b', 3], Address: { Street: 'Main St', Geo: { Lat: 1.5 } }, Rows: [{ Id: 1 }, { Id: 2 }]
    });
    expect(read.loose).toContain('parenthesised lists');
    expect(ok('(1, 2)').value).toEqual([1, 2]);
    expect(ok('()').value).toEqual([]);
  });

  it('lists everything it accepted, in a fixed order', () => {
    const read = ok("{a: 'x', // c\n b=y,}");
    expect(read.loose).toEqual(['single quotes', 'unquoted keys', 'trailing commas', 'comments', '= separators', 'bare words']);
  });

  it('keeps a key called __proto__ as data', () => {
    const read = ok('{"__proto__": 1, a=2}');
    expect(Object.keys(read.value)).toEqual(['__proto__', 'a']);
    expect({}.polluted).toBeUndefined();
  });

  it('refuses text that is not even loosely JSON, with the place', () => {
    expect(parseLoose('{ "Lol" }')).toEqual({ ok: false, error: 'Unexpected "}"', line: 1, column: 9 });
    expect(parseLoose('hello world')).toMatchObject({ ok: false, line: 1, column: 1 });
    expect(parseLoose('{"a" 1}')).toMatchObject({ ok: false, error: 'Unexpected "1"' });
    expect(parseLoose('[1 2]')).toMatchObject({ ok: false });
    expect(parseLoose('{a: hello}')).toMatchObject({ ok: false });
    expect(parseLoose('{"a": tru}')).toMatchObject({ ok: false });
    expect(parseLoose('{"a": 1} {"b": 2}')).toMatchObject({ ok: false, column: 10 });
    expect(parseLoose('{"a": 1,, "b": 2}')).toMatchObject({ ok: false });
    expect(parseLoose('{"a": "x\ny"}')).toMatchObject({ ok: false, line: 1 });
    expect(parseLoose('{=1}')).toMatchObject({ ok: false });
    expect(parseLoose('{a:}')).toMatchObject({ ok: false });
  });

  it('says where an unfinished text stops', () => {
    expect(parseLoose('{"a": [1,\n')).toEqual({ ok: false, error: 'Unexpected end of text', line: 2, column: 1 });
    expect(parseLoose('{"a": "x')).toMatchObject({ ok: false, error: 'Unexpected end of text' });
    expect(parseLoose('/* open')).toMatchObject({ ok: false, error: 'Unexpected end of text' });
    expect(parseLoose('')).toMatchObject({ ok: false, error: 'Unexpected end of text' });
  });

  it('never throws, on any input, however deep', () => {
    expect(() => parseLoose(undefined)).not.toThrow();
    expect(() => parseLoose(null)).not.toThrow();
    expect(() => parseLoose('\\u')).not.toThrow();
    const deep = '['.repeat(5000);
    expect(parseLoose(deep).ok).toBe(false);
    expect(parseLoose('['.repeat(150) + ']'.repeat(150)).ok).toBe(true);
  });
});
