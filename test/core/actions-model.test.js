'use strict';

/* Characterization tests for src/core/actions-model.js.
 *
 * These pin the behaviour the Remote actions tab shipped with, so the decoding
 * rules can be refactored without anyone having to reload the extension and
 * click through a real org to find out what broke. Each case states the wire
 * shape it stands for — that context is the point, and is what makes a failure
 * here readable a year from now.
 *
 * src/core/actions-model.js is a real ES module with no ambient `document` or
 * `chrome` — the `no-restricted-globals` ESLint rule for src/core/** catches
 * a regression there before this file would even run.
 */

import {
  classify, safeParse, unwrap, parseRequest, parseResponse, resultFor,
  kindOf, displayName, findName, optionFlags, isOmni, isRealError,
  failureReason, failed
} from '../../src/core/actions-model.js';

/* ------------------------------------------------------------- classify */

describe('classify', () => {
  it('recognises only the three POST endpoints that carry actions', () => {
    expect(classify('https://x.my.site.com/aura?r=1', 'POST')).toBe('aura');
    expect(classify('https://x/webruntime/api/apex/execute', 'POST')).toBe('lwr');
    expect(classify('https://x/apexremote', 'POST')).toBe('vfremote');
  });

  it('rejects a GET, since a GET carries no action payload', () => {
    expect(classify('https://x/aura', 'GET')).toBeNull();
  });

  it('rejects an unrelated POST endpoint', () => {
    expect(classify('https://x/other', 'POST')).toBeNull();
  });

  it('requires /aura to be the whole path segment, not a prefix', () => {
    expect(classify('https://x/auraFoo', 'POST')).toBeNull();
  });
});

/* -------------------------------------------------------- safeParse/unwrap */

describe('safeParse', () => {
  it('decodes JSON object and array strings', () => {
    expect(safeParse('{"a":1}')).toEqual({ a: 1 });
    expect(safeParse('  [1,2] ')).toEqual([1, 2]);
  });

  it('leaves plain text alone, since it is not JSON', () => {
    expect(safeParse('hello')).toBe('hello');
  });

  it('leaves undecodable text untouched rather than throwing', () => {
    expect(safeParse('{broken')).toBe('{broken');
  });

  it('passes non-strings through unchanged', () => {
    expect(safeParse(42)).toBe(42);
    expect(safeParse('')).toBe('');
  });
});

describe('unwrap', () => {
  it('peels returnValue then result, both wrappers at once', () => {
    expect(unwrap({ returnValue: { result: { name: 'Ada' } }, cacheable: true }))
      .toEqual({ name: 'Ada' });
  });

  it('peels wrappers that arrive as JSON strings at any depth', () => {
    expect(unwrap('{"returnValue":"{\\"result\\":{\\"n\\":1}}"}')).toEqual({ n: 1 });
  });

  it('treats a wrapper carrying more than the payload as real data, not packaging', () => {
    const rich = { returnValue: 1, other: 2, third: 3 };
    expect(unwrap(rich)).toEqual(rich);
  });

  it('never treats an array as a wrapper', () => {
    expect(unwrap([1, 2])).toEqual([1, 2]);
  });
});

/* ---------------------------------------------------------- parseRequest */

describe('parseRequest', () => {
  it('decodes an Aura message into one record per action', () => {
    const message = JSON.stringify({
      actions: [{
        id: '123',
        descriptor: 'aura://ApexActionController/ACTION$execute',
        params: {
          classname: 'omnistudiocore.IPService',
          method: 'invokeMethod',
          params: {
            sClassName: 'omnistudiocore.IPService',
            sMethodName: 'Account_Fetch',
            input: '{"AccountId":"001"}',
            options: { chainable: true }
          }
        }
      }]
    });

    const actions = parseRequest('aura', new URLSearchParams({ message }).toString());

    expect(actions).toHaveLength(1);
    expect(actions[0].wireId).toBe('123');
    expect(actions[0].remoteClass).toBe('omnistudiocore.IPService');
    expect(actions[0].remoteMethod).toBe('Account_Fetch');
    expect(actions[0].input).toEqual({ AccountId: '001' }); // the input string is decoded
    expect(actions[0].options).toEqual({ chainable: true });
  });

  it('decodes an LWR apex/execute body', () => {
    const actions = parseRequest('lwr', JSON.stringify({
      classname: 'vlocity_ins.DRService',
      method: 'invokeMethod',
      params: { params: { sClassName: 'vlocity_ins.DRService', sMethodName: 'invokeInboundDR' } }
    }));

    expect(actions).toHaveLength(1);
    expect(actions[0].descriptor).toBe('webruntime/apex');
    expect(actions[0].remoteMethod).toBe('invokeInboundDR');
  });

  it('decodes Visualforce remoting, where the call is positional', () => {
    const actions = parseRequest('vfremote', JSON.stringify([{
      tid: 7,
      action: 'MyController',
      method: 'invokeMethod',
      data: ['vlocity_ins.DRService', 'invokeInboundDR', { ContextId: 'a01' }, { bundle: 'GetAccount' }]
    }]));

    expect(actions[0].wireId).toBe('7'); // the transaction id becomes a string
    expect(actions[0].remoteClass).toBe('vlocity_ins.DRService');
    expect(actions[0].input).toEqual({ ContextId: 'a01' }); // data[2] is the input
    expect(actions[0].options).toEqual({ bundle: 'GetAccount' }); // data[3] is the options
  });

  it('never throws on junk input — it returns nothing to show', () => {
    expect(parseRequest('aura', '')).toEqual([]);
    expect(parseRequest('aura', 'message=not-json')).toEqual([]);
    expect(parseRequest('lwr', '{broken')).toEqual([]);
    expect(parseRequest('vfremote', '{broken')).toEqual([]);
    expect(parseRequest('unknown-kind', '{}')).toEqual([]);
  });
});

/* -------------------------------------------------------- parseResponse */

describe('parseResponse', () => {
  it('strips the anti-JSON-hijacking prefix Aura sends', () => {
    expect(parseResponse('while(1);{"actions":[]}')).toEqual({ actions: [] });
    expect(parseResponse('  while (1); {"a":1}')).toEqual({ a: 1 });
  });

  it('returns null for an undecodable body rather than throwing', () => {
    expect(parseResponse('<html>error page</html>')).toBeNull();
    expect(parseResponse('')).toBeNull();
  });
});

/* ------------------------------------------------------------ resultFor */

describe('resultFor', () => {
  it('matches an Aura response to its action by wire id, not position', () => {
    const body = {
      actions: [
        { id: 'b', state: 'SUCCESS', returnValue: { returnValue: 'second' } },
        { id: 'a', state: 'ERROR', error: [{ message: 'boom' }] }
      ]
    };

    const first = resultFor('aura', body, { wireId: 'a' }, 0);
    expect(first.state).toBe('ERROR'); // id "a" wins over index 0
    expect(first.error).toEqual([{ message: 'boom' }]);

    const second = resultFor('aura', body, { wireId: 'b' }, 1);
    expect(second.output).toBe('second'); // the returnValue wrapper is peeled
  });

  it('falls back to position when no id matches', () => {
    const body = { actions: [{ id: 'x', state: 'SUCCESS', returnValue: 1 }] };
    expect(resultFor('aura', body, { wireId: 'unknown' }, 0).state).toBe('SUCCESS');
  });

  it('reads a Visualforce remoting status code', () => {
    const ok = resultFor('vfremote', [{ statusCode: 200, result: { n: 1 } }], {}, 0);
    expect(ok.state).toBe('SUCCESS');
    expect(ok.output).toEqual({ n: 1 });

    const bad = resultFor('vfremote', [{ statusCode: 500, message: 'nope' }], {}, 0);
    expect(bad.state).toBe('ERROR');
    expect(bad.error).toBe('nope');
  });

  it('survives a response that never arrived', () => {
    expect(resultFor('aura', null, {}, 0)).toEqual({ state: null, output: undefined, error: null });
  });
});

/* --------------------------------------------------------------- kindOf */

describe('kindOf', () => {
  const call = (remoteClass, remoteMethod, apexClass = '', apexMethod = '') =>
    ({ remoteClass, remoteMethod, apexClass, apexMethod });

  it('recognises a DataRaptor / Data Mapper call under either package spelling', () => {
    expect(kindOf(call('vlocity_ins.DRService', 'invokeInboundDR'))).toBe('DR');
    expect(kindOf(call('omnistudiocore.DataMapperService', 'x'))).toBe('DR');
  });

  it('recognises an Integration Procedure under either package spelling', () => {
    expect(kindOf(call('omnistudiocore.IPService', 'run'))).toBe('IP');
    expect(kindOf(call('vlocity_ins.IntegrationProcedureService', 'x'))).toBe('IP');
  });

  it('treats an unrecognised service class calling a Type_SubType method as an IP', () => {
    expect(kindOf(call('acme.CustomService', 'Account_Fetch'))).toBe('IP');
  });

  it('falls back to a plain remote action without the Type_SubType shape', () => {
    expect(kindOf(call('acme.CustomService', 'plainMethod'))).toBe('RA');
  });

  it('falls back to Apex when there is no remote class or method at all', () => {
    expect(kindOf(call('', '', 'MyController', 'getRecords'))).toBe('APEX');
  });
});

/* -------------------------------------------------- findName / displayName */

describe('displayName', () => {
  it('prefers the bundle name over the plumbing method for a DataRaptor', () => {
    // Every DataRaptor Extract in a script reports the same invokeInboundDR,
    // so a row labelled with the method alone tells the user nothing.
    const dataRaptorCall = {
      remoteClass: 'vlocity_ins.DRService', remoteMethod: 'invokeInboundDR',
      apexClass: '', apexMethod: '',
      options: { bundleName: 'GetAccountDetails' }
    };
    expect(displayName(dataRaptorCall)).toBe('GetAccountDetails');
  });

  it('falls back to the method for an Integration Procedure, which is the key', () => {
    const integrationProcedureCall = {
      remoteClass: 'omnistudiocore.IPService', remoteMethod: 'Account_Fetch',
      apexClass: '', apexMethod: '', options: {}
    };
    expect(displayName(integrationProcedureCall)).toBe('Account_Fetch');
  });

  it('labels a plain Apex call as Class.method', () => {
    const apexCall = {
      remoteClass: '', remoteMethod: '',
      apexClass: 'MyController', apexMethod: 'getRecords', options: {}
    };
    expect(displayName(apexCall)).toBe('MyController.getRecords');
  });
});

describe('findName', () => {
  it('looks in options first, then input, ignoring key casing', () => {
    expect(findName({ options: { IPKey: 'Type_Sub' }, input: {} })).toBe('Type_Sub');
    expect(findName({ options: {}, input: { dataRaptorName: 'GetAcct' } })).toBe('GetAcct');
  });

  it('ignores a non-string value, since a bundle name is always text', () => {
    expect(findName({ options: { bundle: 42 }, input: {} })).toBe('');
  });

  it('returns empty when neither options nor input carry a name', () => {
    expect(findName({ options: null, input: [] })).toBe('');
  });
});

/* ----------------------------------------------------------- optionFlags */

describe('optionFlags', () => {
  it('surfaces only the options that change what a call does', () => {
    const flags = optionFlags({ options: { chainable: true, useQueueable: true, somethingElse: true } });
    expect(flags.map((f) => f.label)).toEqual(['chain', 'queue']);
  });

  it('matches option keys case-insensitively, since packages disagree about casing', () => {
    expect(optionFlags({ options: { CHAINABLE: true } }).map((f) => f.label)).toEqual(['chain']);
  });

  it('requires the flag to be true, not merely present', () => {
    expect(optionFlags({ options: { chainable: false } })).toEqual([]);
  });

  it('names the bundle in the tooltip for a pre/post transform', () => {
    const transforms = optionFlags({ options: { preTransformBundle: 'Pre', postTransformBundle: 'Post' } });
    expect(transforms.map((f) => f.label)).toEqual(['pre', 'post']);
    expect(transforms[0].title).toMatch(/Pre$/);
  });

  it('returns nothing for an options value that is not an object', () => {
    expect(optionFlags({ options: 'not an object' })).toEqual([]);
  });
});

/* ------------------------------------------------------------- isOmni */

describe('isOmni', () => {
  it('keeps a call that carries a remote class or method', () => {
    expect(isOmni({ remoteClass: 'x', remoteMethod: '', apexClass: '', descriptor: '' })).toBe(true);
  });

  it('keeps an Apex invokeMethod call, the OmniStudio dispatch entry point', () => {
    expect(isOmni({ remoteClass: '', remoteMethod: '', apexClass: '', apexMethod: 'invokeMethod', descriptor: '' })).toBe(true);
  });

  it('keeps a call whose Apex class names an OmniStudio/Vlocity package', () => {
    expect(isOmni({ remoteClass: '', remoteMethod: '', apexClass: 'vlocity_ins.Foo', apexMethod: '', descriptor: '' })).toBe(true);
  });

  it('lets unrelated Apex through the filter', () => {
    expect(isOmni({ remoteClass: '', remoteMethod: '', apexClass: 'MyController', apexMethod: 'get', descriptor: '' })).toBe(false);
  });
});

/* -------------------------------------------------------- error detection */

describe('isRealError', () => {
  it.each(['OK', 'false', 'None', '', 'null', '0', 'success'])(
    'treats the benign value %j as not an error, since OmniStudio always sends one of these on success',
    (benignValue) => {
      expect(isRealError(benignValue)).toBe(false);
    }
  );

  it('treats null, false, zero and an empty array as not errors', () => {
    expect(isRealError(null)).toBe(false);
    expect(isRealError(false)).toBe(false);
    expect(isRealError(0)).toBe(false);
    expect(isRealError([])).toBe(false);
  });

  it('treats an empty error slot ({ code: null, message: null }) as not an error', () => {
    expect(isRealError({ code: null, message: null })).toBe(false);
  });

  it('treats a real message, a non-empty array, or an error object as an error', () => {
    expect(isRealError('INVALID_SESSION')).toBe(true);
    expect(isRealError(['a'])).toBe(true);
    expect(isRealError({ message: 'boom' })).toBe(true);
  });
});

describe('failureReason', () => {
  it('names the rule that fired, in priority order', () => {
    expect(failureReason({ error: 'boom' })).toMatch(/^Action error — boom/);
    expect(failureReason({ state: 'INCOMPLETE' })).toBe('Aura state is INCOMPLETE');
    expect(failureReason({ state: 'SUCCESS', httpStatus: 500 })).toBe('HTTP 500');
    expect(failureReason({ output: { hasErrors: true } })).toBe('Response sets hasErrors: true');
    expect(failureReason({ output: { error: 'bad' } })).toMatch(/^Response error — bad/);
    expect(failureReason({ output: { errors: ['bad'] } })).toMatch(/^Response errors —/);
  });

  it('lets the action-level error outrank everything below it', () => {
    expect(failureReason({ error: 'boom', state: 'INCOMPLETE', httpStatus: 500 })).toMatch(/^Action error/);
  });

  it('returns null for a call that worked, benign error key and all', () => {
    expect(failureReason({ state: 'SUCCESS', httpStatus: 200, error: 'OK', output: { error: 'OK' } })).toBeNull();
  });

  it('agrees with failed() on the same input', () => {
    expect(failed({ state: 'SUCCESS', httpStatus: 200 })).toBe(false);
    expect(failed({ state: 'ERROR' })).toBe(true);
  });

  it('clips a long message unless the detail pane asks for the whole thing', () => {
    const long = 'x'.repeat(300);
    expect(failureReason({ error: long }).length).toBeLessThan(200); // the row gets a clipped reason
    expect(failureReason({ error: long }, true).length).toBeGreaterThan(300); // the detail pane gets it all
  });
});
