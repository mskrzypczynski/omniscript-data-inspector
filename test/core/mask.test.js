'use strict';

import { maskValues, MASK_STRING, MASK_NUMBER } from '../../src/core/mask.js';

describe('maskValues', () => {
  it('replaces strings and numbers but keeps keys and structure', () => {
    const input = { StepA: { Name: 'Ada', Count: 3, Items: [{ Code: 'x1' }, { Code: 'y2' }] } };
    expect(maskValues(input)).toEqual({
      StepA: { Name: MASK_STRING, Count: MASK_NUMBER, Items: [{ Code: MASK_STRING }, { Code: MASK_STRING }] }
    });
  });

  it('leaves empty strings, booleans and null alone', () => {
    expect(maskValues({ a: '', b: true, c: false, d: null })).toEqual({ a: '', b: true, c: false, d: null });
  });

  it('masks a bare scalar and does not mutate its input', () => {
    const input = { a: 'secret' };
    expect(maskValues('secret')).toBe(MASK_STRING);
    maskValues(input);
    expect(input.a).toBe('secret');
  });

  it('survives a self-referencing structure by cutting off deep nesting', () => {
    const loop = { name: 'x' };
    loop.self = loop;
    expect(() => maskValues(loop)).not.toThrow();
  });
});

describe('maskJsonText', () => {
  it('masks string and number values line by line, keeping keys, braces, booleans and blanks', async () => {
    const { maskJsonText } = await import('../../src/core/mask.js');
    const text = [
      '{', '  "Name": "Ada",', '  "Age": 30,', '  "Ok": true,', '  "Blank": "",', '  "Rows": [',
      '    "x",', '    2.5', '  ],', '  "N": null', '}'
    ].join('\n');
    expect(maskJsonText(text).split('\n')).toEqual([
      '{', '  "Name": "<string>",', '  "Age": "<number>",', '  "Ok": true,', '  "Blank": "",', '  "Rows": [',
      '    "<string>",', '    "<number>"', '  ],', '  "N": null', '}'
    ]);
  });

  it('copes with escaped quotes and a selection that starts mid-line', async () => {
    const { maskJsonText } = await import('../../src/core/mask.js');
    expect(maskJsonText('  "Q": "say \\"hi\\"",')).toBe('  "Q": "<string>",');
  });

  it('masks a fragment of a line, as a drag selection often starts or ends mid-value', async () => {
    const { maskJsonText } = await import('../../src/core/mask.js');
    expect(maskJsonText('ce Smith",')).toBe('"<string>",');
    expect(maskJsonText('  "Name": "Alice Sm')).toBe('  "<string>"');
    expect(maskJsonText('"Name": "Alice')).not.toContain('Alice');
  });
});
