'use strict';

import { apexSnippet, apexString, namespaceFor } from '../../../src/core/actions/actions-apex.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const ip = (action, name = 'Order_Place') => ({ type: 'IP', name, action });

describe('namespaceFor', () => {
  it('reads the namespace of a known package from the remote class', () => {
    expect(namespaceFor({ remoteClass: 'vlocity_cmt.IntegrationProcedureService' })).toBe('vlocity_cmt');
    expect(namespaceFor({ remoteClass: 'vlocity_ins.IntegrationProcedureService' })).toBe('vlocity_ins');
    expect(namespaceFor({ remoteClass: 'vlocity_ps.IntegrationProcedureService' })).toBe('vlocity_ps');
    expect(namespaceFor({ remoteClass: 'omnistudio.IntegrationProcedureService' })).toBe('omnistudio');
  });

  it('falls back to the Apex class, then to omnistudio', () => {
    expect(namespaceFor({ remoteClass: '', apexClass: 'vlocity_ins.Foo' })).toBe('vlocity_ins');
    expect(namespaceFor({ remoteClass: 'Plain', apexClass: 'vlocity_ps.Foo' })).toBe('vlocity_ps');
    expect(namespaceFor({ remoteClass: 'omnistudiocore.IPService' })).toBe('omnistudio');
    expect(namespaceFor({ remoteClass: 'IPService' })).toBe('omnistudio');
    expect(namespaceFor({})).toBe('omnistudio');
    expect(namespaceFor(undefined)).toBe('omnistudio');
  });

  it('ignores case in the prefix', () => {
    expect(namespaceFor({ remoteClass: 'VLOCITY_CMT.Service' })).toBe('vlocity_cmt');
  });
});

describe('apexString', () => {
  it('escapes backslashes and single quotes', () => {
    expect(apexString("it's")).toBe("'it\\'s'");
    expect(apexString('a\\b')).toBe("'a\\\\b'");
    expect(apexString("\\'")).toBe("'\\\\\\''");
  });
});

describe('apexSnippet', () => {
  it('builds the four lines for an Integration Procedure', () => {
    const entry = ip({
      remoteClass: 'vlocity_cmt.IntegrationProcedureService',
      input: { AccountId: '001', Items: [1, 2] },
      options: { chainable: true }
    });
    expect(apexSnippet(entry)).toBe([
      "Map<String, Object> input = (Map<String, Object>) JSON.deserializeUntyped('{\"AccountId\":\"001\",\"Items\":[1,2]}');",
      "Map<String, Object> options = (Map<String, Object>) JSON.deserializeUntyped('{\"chainable\":true}');",
      "Object result = vlocity_cmt.IntegrationProcedureService.runIntegrationService('Order_Place', input, options);",
      'System.debug(JSON.serializePretty(result));'
    ].join('\n'));
  });

  it('uses omnistudio and {} when the call carried neither namespace nor options', () => {
    const text = apexSnippet(ip({ remoteClass: 'omnistudiocore.IPService', input: { a: 1 } }));
    expect(text).toContain("deserializeUntyped('{}')");
    expect(text).toContain('Object result = omnistudio.IntegrationProcedureService.runIntegrationService(');
  });

  it('escapes quotes and backslashes inside the data and the key', () => {
    const text = apexSnippet(ip({ input: { note: "it's a \\ test", line: 'a\nb' } }, "My_Key'x"));
    // JSON.stringify gives {"note":"it's a \\ test","line":"a\nb"}; the literal doubles the backslashes.
    expect(text).toContain("'{\"note\":\"it\\'s a \\\\\\\\ test\",\"line\":\"a\\\\nb\"}'");
    expect(text).toContain("runIntegrationService('My_Key\\'x'");
    expect(text.split('\n')).toHaveLength(4); // never a raw line break inside a literal
  });

  it('passes input and options through the mask', () => {
    const text = apexSnippet(ip({ input: { Name: 'Ada', Age: 36, Ok: true }, options: { token: 'abc' } }), maskValues);
    expect(text).toContain('{"Name":"<string>","Age":"<number>","Ok":true}');
    expect(text).toContain('{"token":"<string>"}');
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('abc');
  });

  it('does not touch the Integration Procedure key', () => {
    expect(apexSnippet(ip({ input: {} }, 'Order_Place'), maskValues)).toContain("runIntegrationService('Order_Place'");
  });

  it('handles an input that is not an object', () => {
    expect(apexSnippet(ip({ input: 'plain text' }))).toContain("deserializeUntyped('\"plain text\"')");
    expect(apexSnippet(ip({ input: undefined }))).toContain("input = (Map<String, Object>) JSON.deserializeUntyped('{}')");
  });

  it('is only for Integration Procedures', () => {
    expect(apexSnippet({ type: 'DR', name: 'X', action: {} })).toBeNull();
    expect(apexSnippet({ type: 'RA', name: 'X', action: {} })).toBeNull();
    expect(apexSnippet({ type: 'APEX', name: 'X', action: {} })).toBeNull();
    expect(apexSnippet(null)).toBeNull();
  });
});

describe('apexSnippet names', () => {
  it('has no snippet for an Integration Procedure that has no key, only Class.method', () => {
    expect(apexSnippet({ type: 'IP', name: 'Svc.?', nameFrom: 'label', action: { input: {} } })).toBeNull();
  });

  it('masks a Data Mapper bundle read from the input, with the input beside it', () => {
    const action = { remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR', input: { bundle: 'Jane Doe Notes' }, options: {} };
    const entry = { type: 'DR', name: 'Jane Doe Notes', nameFrom: 'input', action };
    expect(apexSnippet(entry)).toContain("'Jane Doe Notes'");
    expect(apexSnippet(entry, maskValues)).not.toContain('Jane Doe Notes');
  });
});
