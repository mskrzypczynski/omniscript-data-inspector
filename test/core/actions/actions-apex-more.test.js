'use strict';

import { apexSnippet, namespaceFor, inputText } from '../../../src/core/actions/actions-apex.js';
import { maskValues } from '../../../src/core/shared/mask.js';

describe('namespace carried by the call', () => {
  it('prefers the namespace the call itself carries', () => {
    expect(namespaceFor({ namespace: 'vlocity_ins', remoteClass: 'omnistudio.IntegrationProcedureService' })).toBe('vlocity_ins');
    expect(namespaceFor({ namespace: 'acme_pkg', remoteClass: '' })).toBe('acme_pkg');
  });

  it('falls back to the class when the carried one is empty or not an identifier', () => {
    expect(namespaceFor({ namespace: '', remoteClass: 'vlocity_cmt.X' })).toBe('vlocity_cmt');
    expect(namespaceFor({ namespace: "x'; y", remoteClass: 'vlocity_ps.X' })).toBe('vlocity_ps');
  });
});

describe('Data Mapper snippet', () => {
  const dr = (action, name = 'AccountExtract') => ({ type: 'DR', name, action });

  it('calls DRGlobal.process with the input and the bundle', () => {
    const text = apexSnippet(dr({
      namespace: 'vlocity_ins', input: { Id: '001' }, options: { bundle: 'AccountExtract' }, remoteClass: 'x.DRService'
    }));
    expect(text.split('\n')).toEqual([
      'Map<String, Object> input = (Map<String, Object>) JSON.deserializeUntyped(\'{"Id":"001"}\');',
      "vlocity_ins.DRProcessResult result = vlocity_ins.DRGlobal.process(input, 'AccountExtract');",
      'System.debug(JSON.serializePretty(result.toJson()));'
    ]);
  });

  it('serialises the plain map, not the DRProcessResult (which JSON cannot serialise)', () => {
    const text = apexSnippet(dr({ input: {}, options: { bundle: 'B' } }));
    expect(text).toContain('System.debug(JSON.serializePretty(result.toJson()));');
    expect(text).not.toContain('serializePretty(result))');
    expect(text).not.toMatch(/^Object result/m);
  });

  it('masks the input', () => {
    const text = apexSnippet(dr({ input: { Name: 'Jane' }, options: { bundle: 'B' } }), maskValues);
    expect(text).toContain('<string>');
    expect(text).not.toContain('Jane');
  });

  it('has no snippet when the bundle is not known, or for other calls', () => {
    expect(apexSnippet(dr({ input: {}, options: {} }))).toBeNull();
    expect(apexSnippet({ type: 'RA', action: {} })).toBeNull();
  });
});

describe('inputText', () => {
  it('is the bare input as pretty JSON, masked on request', () => {
    const entry = { action: { input: { a: 'x', n: 1 } } };
    expect(inputText(entry)).toBe('{\n  "a": "x",\n  "n": 1\n}');
    expect(JSON.parse(inputText(entry, maskValues))).toEqual({ a: '<string>', n: '<number>' });
  });

  it('gives {} for nothing', () => {
    expect(inputText({ action: {} })).toBe('{}');
    expect(inputText({ action: { input: '' } })).toBe('{}');
  });
});
