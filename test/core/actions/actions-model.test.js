'use strict';

/* Characterization tests for src/core/shared/actions-model.js.
 *
 * These pin the behaviour the Calls tab shipped with, so the decoding
 * rules can be refactored without anyone having to reload the extension and
 * click through a real org to find out what broke. Each case states the wire
 * shape it stands for — that context is the point, and is what makes a failure
 * here readable a year from now.
 *
 * src/core/shared/actions-model.js is a real ES module with no ambient `document` or
 * `chrome` — the `no-restricted-globals` ESLint rule for src/core/** catches
 * a regression there before this file would even run.
 */

import {
  classify, safeParse, unwrap, parseRequest, parseResponse, resultFor,
  kindOf, displayName, findName, maskedName, optionFlags, isOmni, isRealError,
  failureReason, failed, buildActionRecord, hasOptions, exportEntries, label, badgeSummary, countText, noMatchText,
  decodeResponse, verdictOf, insertIndex, previousSimilar, elementForCall, callsForElement, matchesFilter
} from '../../../src/core/shared/actions-model.js';

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

  it('peels JSON that was encoded twice or three times, up to three levels', () => {
    const once = JSON.stringify({ chainable: true });
    const twice = JSON.stringify(once);
    const thrice = JSON.stringify(twice);
    expect(safeParse(twice)).toEqual({ chainable: true });
    expect(safeParse(thrice)).toEqual({ chainable: true });
    expect(safeParse(JSON.stringify(thrice))).toBe(JSON.stringify(thrice)); // four levels: left as text
    expect(safeParse(JSON.stringify('[1,2]'))).toEqual([1, 2]);
  });

  it('keeps a quoted string that does not hold an object or array as it came', () => {
    expect(safeParse('"hello"')).toBe('"hello"');
    expect(safeParse('"12"')).toBe('"12"');
    expect(safeParse('"{broken"')).toBe('"{broken"');
  });

  it('passes non-strings through unchanged', () => {
    expect(safeParse(42)).toBe(42);
    expect(safeParse('')).toBe('');
  });
});

describe('unwrap', () => {
  it('keeps a wrapper whose sibling key carries a real error', () => {
    const failedCall = { result: { Account: null }, error: 'Required field missing: Name' };
    expect(unwrap(failedCall)).toEqual(failedCall);
    expect(unwrap({ result: { n: 1 }, error: 'OK' })).toEqual({ n: 1 });
  });

  it('peels a wrapper whose other keys are all status keys saying fine', () => {
    expect(unwrap({ result: { n: 1 }, error: 'OK', errorCode: 'INVOKE-200' })).toEqual({ n: 1 });
    expect(unwrap({ result: { n: 1 }, success: true, statusCode: 200 })).toEqual({ n: 1 });
    // One key that says failure keeps the wrapper, and so does an unrelated second key.
    const failed = { result: { n: 1 }, error: 'OK', errorCode: 'INVOKE-500' };
    expect(unwrap(failed)).toEqual(failed);
    const rich = { result: { n: 1 }, error: 'OK', note: 'kept' };
    expect(unwrap(rich)).toEqual(rich);
  });

  it('marks such a call as failed', () => {
    const action = { remoteClass: 'MyService', remoteMethod: 'run', apexClass: '', apexMethod: '', descriptor: '', input: {}, options: {} };
    const body = { returnValue: { result: {}, error: 'Required field missing: Name' } };
    const record = buildActionRecord(1, 'lwr', action, 0, body,
      { url: '/x', startedAt: new Date(0), durationMs: 1, httpStatus: 200, bodySize: 0 });
    expect(failureReason(record)).toBe('Response error — Required field missing: Name');
  });

  it('peels returnValue then result, both wrappers at once', () => {
    expect(unwrap({ returnValue: { result: { name: 'Ada' } }, cacheable: true }))
      .toEqual({ name: 'Ada' });
  });

  it('peels wrappers that arrive as JSON strings at any depth', () => {
    expect(unwrap('{"returnValue":"{\\"result\\":{\\"n\\":1}}"}')).toEqual({ n: 1 });
  });

  it('decodes a response that was encoded twice', () => {
    const twice = JSON.stringify(JSON.stringify({ result: { n: 1 } }));
    expect(unwrap(twice)).toEqual({ n: 1 });
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

  it('decodes the remote call when it is sent as JSON text, once or twice encoded', () => {
    const call = { sClassName: 'vlocity_ins.IntegrationProcedureService', sMethodName: 'Order_Place', input: '{"Id":"001"}', options: '{"chainable":true}' };
    [JSON.stringify(call), JSON.stringify(JSON.stringify(call))].forEach((sent) => {
      const message = JSON.stringify({ actions: [{ id: '1;a', descriptor: 'd', params: { namespace: '', classname: 'C', method: 'invokeMethod', params: sent } }] });
      const [action] = parseRequest('aura', new URLSearchParams({ message }).toString());
      expect(action.remoteClass).toBe('vlocity_ins.IntegrationProcedureService');
      expect(action.remoteMethod).toBe('Order_Place');
      expect(action.input).toEqual({ Id: '001' });
      expect(action.options).toEqual({ chainable: true });
    });
  });

  it('keeps parameters that are text but not a remote call as the input', () => {
    const message = JSON.stringify({ actions: [{ id: '1', descriptor: 'd', params: { classname: 'Plain', method: 'go', params: 'just words' } }] });
    const [action] = parseRequest('aura', new URLSearchParams({ message }).toString());
    expect(action.remoteMethod).toBe('');
    expect(action.input).toBe('just words');
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

  it('falls back to position only when ids cannot tell the actions apart', () => {
    const noIds = { actions: [{ state: 'SUCCESS', returnValue: 1 }] };
    expect(resultFor('aura', noIds, { wireId: '7' }, 0).state).toBe('SUCCESS');
    expect(resultFor('aura', { actions: [{ id: 'x', state: 'SUCCESS' }] }, { wireId: undefined }, 0).state).toBe('SUCCESS');
  });

  it('gives each action without an id its own answer by position, not the first answer to all', () => {
    // A boxcar whose actions and answers carry no ids: undefined is not a match.
    const body = { actions: [{ state: 'SUCCESS', returnValue: 'first' }, { state: 'ERROR', error: [{ message: 'second failed' }] }] };
    const actions = [{ wireId: undefined }, { wireId: undefined }];
    expect(actions.map((action, index) => resultFor('aura', body, action, index).state)).toEqual(['SUCCESS', 'ERROR']);
  });

  it('does not borrow another action\'s answer when ids exist and none matches', () => {
    const body = { actions: [{ id: 'x', state: 'SUCCESS', returnValue: 1 }] };
    expect(resultFor('aura', body, { wireId: 'unknown' }, 0)).toEqual({ state: null, output: undefined, error: null });
  });

  it('reads a Visualforce remoting status code, matched by tid', () => {
    const ok = resultFor('vfremote', [{ tid: 4, statusCode: 200, result: { n: 1 } }], { wireId: '4' }, 0);
    expect(ok.state).toBe('SUCCESS');
    expect(ok.output).toEqual({ n: 1 });

    const bad = resultFor('vfremote', [{ tid: 4, statusCode: 500, message: 'nope' }], { wireId: '4' }, 0);
    expect(bad.state).toBe('ERROR');
    expect(bad.error).toBe('nope');
  });

  it('matches Visualforce answers by tid, not by position', () => {
    const body = [
      { tid: 6, statusCode: 200, result: 'second' },
      { tid: 5, statusCode: 500, message: 'first failed' }
    ];
    expect(resultFor('vfremote', body, { wireId: '5' }, 0).error).toBe('first failed');
    expect(resultFor('vfremote', body, { wireId: '6' }, 1).output).toBe('second');
  });

  it('shows no result for a Visualforce call whose tid has no answer', () => {
    const body = [{ tid: 9, statusCode: 200, result: 'someone else' }];
    expect(resultFor('vfremote', body, { wireId: '5' }, 0)).toEqual({ state: null, output: undefined, error: null });
    expect(resultFor('vfremote', body, { wireId: null }, 0)).toEqual({ state: null, output: undefined, error: null });
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
  const dr = (extra) => ({
    remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR',
    apexClass: '', apexMethod: '', options: {}, input: {}, ...extra
  });

  it('reads an Integration Procedure from its method first, then its options', () => {
    const ip = (extra) => ({ remoteClass: 'vlocity_ins.IntegrationProcedureService', apexClass: '', apexMethod: '', ...extra });
    expect(findName(ip({ remoteMethod: 'Order_Place', options: { ipKey: 'Other_Key' } }))).toBe('Order_Place');
    expect(findName(ip({ remoteMethod: '', options: { IPKey: 'Type_Sub' } }))).toBe('Type_Sub');
  });

  it('reads a Data Mapper from its options, ignoring key casing, then from known input keys', () => {
    expect(findName(dr({ options: { BundleName: 'GetAcct' } }))).toBe('GetAcct');
    expect(findName(dr({ input: { DRBundle: 'GetAcct' } }))).toBe('GetAcct');
    expect(findName(dr({ input: { bundleName: 'A' }, options: { bundle: 'B' } }))).toBe('B');
  });

  it('does not take a name from an input field that only looks like one', () => {
    // The input is the user's data: a field named after a bundle key is data.
    const ip = { remoteClass: 'vlocity_ins.IntegrationProcedureService', remoteMethod: 'Dispatch_Orders', apexClass: '', apexMethod: '', options: {}, input: { integrationProcedure: 'Jane_Doe_Private' } };
    expect(findName(ip)).toBe('Dispatch_Orders');
    expect(findName(dr({ input: { dataRaptorName: 'Free text', nested: { bundle: 'deep' } } }))).toBe('');
    expect(findName({ options: {}, input: { bundle: 'x' }, remoteClass: '', remoteMethod: '' })).toBe('');
  });

  it('ignores a non-string value, since a bundle name is always text', () => {
    expect(findName(dr({ options: { bundle: 42 } }))).toBe('');
  });

  it('returns empty when neither options nor input carry a name', () => {
    expect(findName(dr({ options: null, input: [] }))).toBe('');
  });
});

describe('option labels: chainable is a call, chain is a group', () => {
  it('names the options a call asks for with words that cannot be taken for a chain group', () => {
    expect(optionFlags({ options: { chainable: true } }).map((flag) => flag.label)).toEqual(['chainable']);
    expect(optionFlags({ options: { queueableChainable: true } }).map((flag) => flag.label)).toEqual(['queueable chain']);
    ['chainable', 'queueableChainable', 'useFuture', 'ignoreCache'].forEach((key) => {
      optionFlags({ options: { [key]: true } }).forEach((flag) => expect(flag.label).not.toBe('chain'));
    });
  });
});

describe('where a call name came from', () => {
  const request = { url: 'https://x.example/aura', startedAt: new Date(1000), durationMs: 100, httpStatus: 200, requestId: 1, batchSize: 1 };
  const record = (action) => buildActionRecord(1, 'aura', { wireId: '1;a', descriptor: '', apexClass: '', apexMethod: '', options: {}, ...action }, 0, undefined, request);
  const mask = () => '<string>';

  it('names an Integration Procedure by its key, whatever its input holds', () => {
    const entry = record({ remoteClass: 'vlocity_ins.IntegrationProcedureService', remoteMethod: 'Dispatch_Orders', input: { integrationProcedure: 'Jane_Doe_Private' } });
    expect(entry.name).toBe('Dispatch_Orders');
    expect(entry.nameFrom).toBe('method');
    expect(exportEntries([entry], mask)[0].action).toBe('Dispatch_Orders');
  });

  it('treats a Data Mapper name read from the input as a value when masking', () => {
    const entry = record({ remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR', input: { bundle: 'Customer Notes ABC' } });
    expect(entry.name).toBe('Customer Notes ABC');
    expect(entry.nameFrom).toBe('input');
    expect(maskedName(entry, mask)).toBe('<string>');
    expect(exportEntries([entry], mask)[0].action).toBe('<string>');
    expect(exportEntries([entry])[0].action).toBe('Customer Notes ABC');
  });

  it('leaves a name from the options as it is, since it is configuration', () => {
    const entry = record({ remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR', options: { bundleName: 'GetAcct' } });
    expect(entry.nameFrom).toBe('options');
    expect(maskedName(entry, mask)).toBe('GetAcct');
  });

  it('marks the Class.method text as a label', () => {
    expect(record({ remoteClass: '', remoteMethod: '', apexClass: 'MyController', apexMethod: 'get' }).nameFrom).toBe('label');
  });
});

/* ----------------------------------------------------------- optionFlags */

describe('optionFlags', () => {
  it('surfaces only the options that change what a call does', () => {
    const flags = optionFlags({ options: { chainable: true, useQueueable: true, somethingElse: true } });
    expect(flags.map((f) => f.label)).toEqual(['chainable', 'queue']);
  });

  it('matches option keys case-insensitively, since packages disagree about casing', () => {
    expect(optionFlags({ options: { CHAINABLE: true } }).map((f) => f.label)).toEqual(['chainable']);
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

  it.each(['INVOKE-200', 'invoke-201', '200', 'OK-204', 200, 204])(
    'treats the success code %j as not an error, since the status is sometimes sent as errorCode',
    (code) => {
      expect(isRealError(code)).toBe(false);
    }
  );

  it.each(['INVOKE-500', 'INVOKE-400', 'E200X', '2000', 404, 500, 300])(
    'still treats %j as an error',
    (code) => {
      expect(isRealError(code)).toBe(true);
    }
  );

  it('does not fail a call whose answer carries error "OK" and errorCode "INVOKE-200"', () => {
    const entry = { output: { result: { Name: 'Ada' }, error: 'OK', errorCode: 'INVOKE-200' }, state: 'SUCCESS', httpStatus: 200 };
    expect(failureReason(entry)).toBeNull();
    expect(failureReason({ ...entry, output: { ...entry.output, errorCode: 'INVOKE-500' } })).toMatch(/^Response errorCode/);
  });

  it('peels a { result, errorCode: "INVOKE-200" } wrapper but not one that failed', () => {
    expect(unwrap({ result: { a: 1 }, errorCode: 'INVOKE-200' })).toEqual({ a: 1 });
    expect(unwrap({ result: { a: 1 }, errorCode: 'INVOKE-500' })).toEqual({ result: { a: 1 }, errorCode: 'INVOKE-500' });
  });

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

describe('filtering, grouping and matching to the script', () => {
  const mk = (name, extra = {}) => ({
    name, signature: `Svc.${name}`, url: '/aura', omni: true, duration: 50, state: 'SUCCESS', httpStatus: 200,
    action: { input: { who: 'Ada' }, options: {} }, output: { ok: 1 }, ...extra
  });
  const el = (key, name, category, remote, parentKey = '') => ({ key, name, parentKey, remote, category: { key: category } });

  it('filters by errors, slowness and text', async () => {
    const { matchesFilter } = await import('../../../src/core/shared/actions-model.js');
    const ok = mk('Fine');
    const bad = mk('Bad', { error: 'boom' });
    const slow = mk('Slow', { duration: 900 });

    expect(matchesFilter(ok, { errorsOnly: true })).toBe(false);
    expect(matchesFilter(bad, { errorsOnly: true })).toBe(true);
    // The threshold alone filters nothing; only slow: in the box does (see actions-search.test.js).
    expect(matchesFilter(ok, { slowMs: 500 })).toBe(true);
    expect(matchesFilter(slow, { query: 'slow:500' })).toBe(true);
    expect(matchesFilter(ok, { query: 'slow:500' })).toBe(false);
    expect(matchesFilter(ok, { query: 'ada' })).toBe(false);
    expect(matchesFilter(ok, { query: 'fine' })).toBe(true);
    expect(matchesFilter(mk('X', { omni: false }), { onlyOmni: true })).toBe(false);
  });

  it('matches calls to the element that makes them', async () => {
    const { elementForCall, callsForElement, previousSimilar } = await import('../../../src/core/shared/actions-model.js');
    const elements = [
      el('s1', 'StepA', 'step', ''), el('a1', 'DoWork', 'action', 'BundleOne', 's1'),
      el('s2', 'StepB', 'step', ''), el('a2', 'Other', 'action', 'BundleTwo', 's2')
    ];
    const c1 = mk('BundleTwo'); const c2 = mk('BundleOne'); const c3 = mk('Unknown'); const c4 = mk('BundleOne');

    expect(elementForCall(c2, elements).name).toBe('DoWork');
    expect(elementForCall(c3, elements)).toBeNull();
    expect(callsForElement(elements[1], [c1, c2, c3, c4])).toEqual([c2, c4]);
    expect(c1.name).toBe('BundleTwo');

    expect(previousSimilar([c2, c3, c4], c4)).toBe(c2);
    expect(previousSimilar([c2, c3, c4], c2)).toBeNull();
  });
});

describe('buildActionRecord / exportEntries / hasOptions', () => {
  const request = { url: '/aura', startedAt: new Date('2024-01-02T03:04:05.000Z'), durationMs: 42, httpStatus: 200, bodySize: 10 };
  const action = { input: { a: 'x' }, options: { chainable: true }, remoteClass: 'MyClass', remoteMethod: 'run', apexClass: '', apexMethod: '' };

  test('shapes a record around the given id and request metadata', () => {
    const record = buildActionRecord(7, 'aura', action, 0, undefined, request);
    expect(record).toMatchObject({
      id: 7, kind: 'aura', url: '/aura', time: request.startedAt, duration: 42, httpStatus: 200, size: 10, action
    });
    expect(record.name).toBe(displayName(action));
    expect(record.signature).toBe(label(action));
    expect(record.type).toBe(kindOf(action));
  });

  test('stores why the call failed, once, and failed() / failureReason() read it', () => {
    const bad = buildActionRecord(1, 'aura', action, 0, { actions: [{ state: 'ERROR', error: [{ message: 'boom' }] }] }, request);
    expect(bad.failure).toMatch(/^Action error/);
    expect(failed(bad)).toBe(true);
    expect(failureReason(bad)).toBe(bad.failure);
    // The stored value wins: the record is not inspected again.
    expect(failureReason({ ...bad, failure: 'stored', error: null })).toBe('stored');
    // The full banner text is still computed from the record.
    expect(failureReason(bad, true)).toMatch(/boom/);

    const good = buildActionRecord(2, 'aura', action, 0, undefined, request);
    expect(good.failure).toBeNull();
    expect(failed(good)).toBe(false);
    expect(failed({ ...good, error: 'late', failure: null })).toBe(false);
  });

  test('hasOptions ignores empty options', () => {
    expect(hasOptions({ action: { options: undefined } })).toBe(false);
    expect(hasOptions({ action: { options: '' } })).toBe(false);
    expect(hasOptions({ action: { options: {} } })).toBe(false);
    expect(hasOptions({ action: { options: { a: 1 } } })).toBe(true);
    expect(hasOptions({ action: { options: 'x' } })).toBe(true);
  });

  test('exports rows, passing every payload through the mask', () => {
    const record = buildActionRecord(1, 'aura', { ...action, options: {} }, 0, undefined, request);
    const rows = exportEntries([record], (value) => (value === undefined ? value : '<m>'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      time: '2024-01-02T03:04:05.000Z', durationMs: 42, httpStatus: 200, input: '<m>', options: undefined
    });
    expect(Object.keys(rows[0])).toEqual([
      'time', 'action', 'type', 'signature', 'url', 'options_flags', 'requestId', 'batchSize',
      'durationMs', 'httpStatus', 'state', 'failed', 'failure', 'input', 'options', 'output', 'error'
    ]);
    expect(exportEntries([record])[0].input).toEqual({ a: 'x' });
  });
});

describe('filter summaries', () => {
  it('lists only what differs from the defaults and is in force', async () => {
    const { activeFilterLabels } = await import('../../../src/core/shared/actions-model.js');
    expect(activeFilterLabels({ onlyOmni: true, query: ' ', errorsOnly: false, slowMs: 0 })).toEqual([]);
    expect(activeFilterLabels({ onlyOmni: false, query: ' ', errorsOnly: false, slowMs: 0 })).toEqual(['all Apex calls']);
    expect(activeFilterLabels({ onlyOmni: true, query: ' Foo ', errorsOnly: true, slowMs: 500, clearOnReload: true }))
      .toEqual(['clears on reload', 'failed only', 'text: Foo']);
    expect(activeFilterLabels({ onlyOmni: true, query: 'slow:800 Foo', slowMs: 500 })).toEqual(['slow: 800 ms', 'text: Foo']);
    expect(activeFilterLabels({ onlyOmni: true, query: 'slow:', slowMs: 500 })).toEqual(['slow: 500 ms']);
    expect(activeFilterLabels({ onlyOmni: true, query: 'slow:', slowMs: 0 })).toEqual(['slow: 2000 ms']);
  });
});

describe('badgeSummary', () => {
  it('hides when a filter leaves no call in view, and does not show a grey 0', () => {
    const call = { id: 1, failure: null, omni: true };
    const badge = badgeSummary([], new Map(), [call]);
    expect(badge.hidden).toBe(true);
    expect(badge.text).toBe('');
    expect(badge.title).toBe('0 calls in view of 1 captured');
  });

  const ok = { failure: null };
  const bad = { failure: 'HTTP 500' };

  it('counts the calls in view, grey, when nothing failed', () => {
    expect(badgeSummary([ok, ok])).toEqual({ text: '2', label: '', count: 2, failed: 0, total: 2, hidden: false, title: '2 calls in view' });
    expect(badgeSummary([ok]).title).toBe('1 call in view');
  });

  it('counts the failed calls instead when any failed, whatever the filters show', () => {
    const rows = [bad, ok, { failure: 'Aura state is ERROR' }];
    expect(badgeSummary(rows)).toMatchObject({ text: '✕ 2', label: '2 failed calls', failed: 2, hidden: false, title: '2 failed calls of 3 captured' });
    expect(badgeSummary([bad]).label).toBe('1 failed call');
    expect(badgeSummary([bad]).title).toBe('1 failed call');
  });

  it('is not hidden by a filter: a failure the list does not show still counts', () => {
    // The filter leaves one good call in view; two others, one of them failed, are filtered out.
    const all = [ok, ok, bad];
    const summary = badgeSummary([ok], undefined, all);
    expect(summary).toMatchObject({ text: '✕ 1', failed: 1, count: 1, total: 3, hidden: false });
    expect(summary.title).toBe('1 failed call of 3 captured · 1 in view');
    expect(badgeSummary([], undefined, [ok, ok]).title).toBe('0 calls in view of 2 captured');
  });

  it('shows nothing for a filter that hides every call, and nothing for no calls at all', () => {
    expect(badgeSummary([], undefined, [ok])).toMatchObject({ text: '', hidden: true });
    // ...unless a failure the filter hides is still worth the red number.
    expect(badgeSummary([], undefined, [ok, bad])).toMatchObject({ text: '✕ 1', hidden: false });
    expect(badgeSummary([])).toEqual({ text: '', label: '', count: 0, failed: 0, total: 0, hidden: true, title: '0 calls in view' });
  });

  it('adds how many calls in view repeat an earlier one', () => {
    const repeats = new Map([[2, { ofId: 1 }]]);
    expect(badgeSummary([{ id: 1, failure: null }, { id: 2, failure: null }], repeats).title).toBe('2 calls in view · 1 repeated');
  });

  it('works on records without a stored reason', () => {
    expect(badgeSummary([{ error: 'boom' }, {}]).failed).toBe(1);
  });
});

describe('countText and noMatchText', () => {
  it('pluralises by the count', () => {
    expect(countText(0, 'call')).toBe('0 calls');
    expect(countText(1, 'call')).toBe('1 call');
    expect(countText(2, 'failed call')).toBe('2 failed calls');
  });

  it('quotes the filter text, or names the filters when the text is not what hides the calls', () => {
    expect(noMatchText('order')).toBe('No calls match "order"');
    expect(noMatchText('  order  ')).toBe('No calls match "order"');
    expect(noMatchText('')).toBe('No calls match the filters');
    expect(noMatchText(undefined)).toBe('No calls match the filters');
    expect(noMatchText('x'.repeat(60))).toBe(`No calls match "${'x'.repeat(40)}…"`);
  });
});

/* ------------------------------------------------ answers that are not answers */

describe('a response that is not a usable answer', () => {
  const request = { url: '/aura', startedAt: new Date('2024-01-02T03:04:05.000Z'), durationMs: 42, httpStatus: 200, bodySize: 10 };
  const action = { wireId: '1', input: {}, options: {}, remoteClass: 'omnistudiocore.IPService', remoteMethod: 'Acc_Fetch', apexClass: '', apexMethod: '' };
  const build = (text, extra = {}) => {
    const decoded = decodeResponse(text);
    return buildActionRecord(1, 'aura', action, 0, decoded.body, { ...request, responseText: text, ...extra });
  };

  it('fails a call that never got an answer (HTTP status 0)', () => {
    const record = build('', { httpStatus: 0 });
    expect(record.failure).toBe('No response');
    expect(failed(record)).toBe(true);
    expect(verdictOf(record)).toEqual({ text: 'No response', tone: 'neutral' });
  });

  it('does not fail an empty body behind a 2xx: DevTools may just have dropped the body', () => {
    const record = build('');
    expect(record.failure).toBeNull();
    expect(verdictOf(record)).toEqual({ text: 'No body', tone: 'neutral' });
    expect(build(undefined, { responseText: '' }).failure).toBeNull();
  });

  it('leaves the blame on the HTTP status when an error page came back empty', () => {
    expect(build('', { httpStatus: 503 }).failure).toBe('HTTP 503');
    expect(build('<html>down</html>', { httpStatus: 502 }).failure).toBe('HTTP 502');
  });

  it('fails a body that is not JSON, and keeps the text', () => {
    const record = build('<html><body>Maintenance</body></html>');
    expect(record.failure).toBe('Response is not JSON');
    expect(verdictOf(record).tone).toBe('bad');
    expect(record.rawResponse).toBe('<html><body>Maintenance</body></html>');
  });

  it('keeps only the first 20 KB of the raw text', () => {
    expect(build('x'.repeat(30000)).rawResponse).toHaveLength(20 * 1024);
  });

  it('reads the Aura error envelope as a system error', () => {
    const record = build('*/{"exceptionEvent":true}/*ERROR*/');
    expect(record.failure).toBe('Aura system error');
    expect(build('while(1);\n*/{"exceptionEvent":true,"event":{"descriptor":"markup://aura:systemError","attributes":{"values":{"error":"Boom happened"}}}}/*ERROR*/').failure)
      .toBe('Aura system error: Boom happened');
  });

  it('flags exceptionEvent and systemError descriptors in a parsed body', () => {
    expect(build('{"exceptionEvent":true,"event":{"descriptor":"markup://aura:systemError"}}').failure).toBe('Aura system error');
    expect(build('{"event":{"descriptor":"markup://aura:systemError","attributes":{"values":{"error":"x"}}}}').failure).toBe('Aura system error: x');
  });

  it('says the session expired for clientOutOfSync', () => {
    const text = '{"event":{"descriptor":"markup://aura:clientOutOfSync"},"exceptionEvent":true}';
    expect(build(text).failure).toBe('Session expired / client out of sync');
  });

  it('uses the decoded body alone when the text was not read', () => {
    const record = buildActionRecord(1, 'aura', action, 0, { exceptionEvent: true }, request);
    expect(record.failure).toBe('Aura system error');
    expect(buildActionRecord(2, 'aura', action, 0, undefined, request).failure).toBeNull();
  });

  it('masks the values quoted in the text when asked', () => {
    const record = build('*/{"exceptionEvent":true,"event":{"attributes":{"values":{"error":"Order 801 is bad"}}}}/*ERROR*/');
    expect(failureReason(record, true, () => '<string>')).toBe('Aura system error: <string>');
    const action2 = { ...action };
    const withError = buildActionRecord(3, 'aura', action2, 0, { actions: [{ id: '1', state: 'ERROR', error: [{ message: 'Account Acme is closed' }] }] }, request);
    expect(failureReason(withError, true)).toContain('Acme');
    expect(failureReason(withError, true, (v) => (typeof v === 'string' ? v : { message: '<string>' }))).not.toContain('Acme');
    expect(failureReason(withError, false, () => '<m>')).not.toContain('Acme');
  });

  it('decodeResponse: the usable answer comes back as a body', () => {
    expect(decodeResponse('while(1);{"actions":[]}')).toEqual({ body: { actions: [] }, problem: null, note: '' });
    expect(parseResponse('*/{"a":1}/*ERROR*/')).toEqual({ a: 1 });
    expect(parseResponse('nope')).toBeNull();
  });
});

describe('batched calls', () => {
  it('records which request an action travelled in and how many shared it', () => {
    const request = { url: '/aura', startedAt: new Date(0), durationMs: 400, httpStatus: 200, bodySize: 1, requestId: 12, batchSize: 3 };
    const record = buildActionRecord(1, 'aura', { input: {}, options: {}, remoteClass: 'a.B', remoteMethod: 'c', apexClass: '', apexMethod: '' }, 0, undefined, request);
    expect(record).toMatchObject({ requestId: 12, batchSize: 3 });
    expect(exportEntries([record])[0]).toMatchObject({ requestId: 12, batchSize: 3 });
  });

  it('counts a call alone in its request as a batch of one', () => {
    const record = buildActionRecord(1, 'aura', { input: {}, remoteClass: 'a.B', remoteMethod: 'c', apexClass: '', apexMethod: '' }, 0, undefined, { startedAt: new Date(0) });
    expect(record.batchSize).toBe(1);
  });
});

describe('kindOf: class names decide', () => {
  const call = (remoteClass, remoteMethod, apexClass = '', apexMethod = '') =>
    ({ remoteClass, remoteMethod, apexClass, apexMethod });

  it('keeps an Integration Procedure whose key mentions a Data Mapper word', () => {
    expect(kindOf(call('IntegrationProcedureService', 'DataRaptor_Sync'))).toBe('IP');
    expect(kindOf(call('vlocity_ins.IntegrationProcedureService', 'DataMapper_Load'))).toBe('IP');
    expect(kindOf(call('', '', 'omnistudio.IPService', 'DRService_Run'))).toBe('IP');
  });

  it('still reads the two Data Mapper methods whatever the class', () => {
    expect(kindOf(call('acme.Wrapper', 'invokeInboundDR'))).toBe('DR');
    expect(kindOf(call('acme.Wrapper', 'invokeOutboundDR'))).toBe('DR');
  });

  it('does not take a method name for a class name', () => {
    expect(kindOf(call('acme.Thing', 'integrationProcedureLike'))).toBe('RA');
  });
});

describe('namespace and REST capture', () => {
  it('captures the Aura namespace parameter', () => {
    const message = JSON.stringify({ actions: [{ id: '1', descriptor: 'd', params: { namespace: 'vlocity_ins', classname: 'X', method: 'invokeMethod', params: { sClassName: 'c', sMethodName: 'm' } } }] });
    const [action] = parseRequest('aura', new URLSearchParams({ message }).toString());
    expect(action.namespace).toBe('vlocity_ins');
  });

  it('captures the LWR namespace, and defaults to none', () => {
    const [lwr] = parseRequest('lwr', JSON.stringify({ classname: 'X', method: 'm', namespace: 'omnistudio', params: {} }));
    expect(lwr.namespace).toBe('omnistudio');
    const [plain] = parseRequest('lwr', JSON.stringify({ classname: 'X', method: 'm', params: {} }));
    expect(plain.namespace).toBe('');
  });

  it('classifies an Integration Procedure REST call and takes the key from the URL', () => {
    const url = 'https://x.my.salesforce.com/services/apexrest/vlocity_ins/v1/integrationprocedure/Acc_Fetch?x=1';
    expect(classify(url, 'POST')).toBe('rest');
    expect(classify(url, 'GET')).toBeNull();
    const [action] = parseRequest('rest', '{"AccountId":"001"}', url);
    expect(kindOf(action)).toBe('IP');
    expect(displayName(action)).toBe('Acc_Fetch');
    expect(action.namespace).toBe('vlocity_ins');
    expect(action.input).toEqual({ AccountId: '001' });
    expect(isOmni(action)).toBe(true);
  });

  it('does not take other apexrest services for Integration Procedures', () => {
    expect(classify('https://x/services/apexrest/other/thing', 'POST')).toBeNull();
  });
});

describe('unwrap keeps a failing wrapper', () => {
  it('does not peel { result, success: false }', () => {
    expect(unwrap({ result: { a: 1 }, success: false })).toEqual({ result: { a: 1 }, success: false });
    expect(unwrap({ result: { a: 1 }, success: true })).toEqual({ a: 1 });
  });

  it('does not peel { result, errorCode } or a 4xx/5xx statusCode', () => {
    expect(unwrap({ result: 1, errorCode: 'INVALID' })).toEqual({ result: 1, errorCode: 'INVALID' });
    expect(unwrap({ result: 1, errorCode: '' })).toBe(1);
    expect(unwrap({ result: 1, statusCode: 500 })).toEqual({ result: 1, statusCode: 500 });
    expect(unwrap({ result: 1, statusCode: 200 })).toBe(1);
  });

  it('reports the failures the unpeeled wrapper shows', () => {
    expect(failureReason({ output: { result: 1, success: false } })).toBe('Response sets success: false');
    expect(failureReason({ output: { result: 1, errorCode: 'INVALID' } })).toMatch(/errorCode/);
    expect(failureReason({ output: { success: true, data: 1 } })).toBeNull();
  });
});

describe('unknown durations', () => {
  it('treats -1 (unknown in a HAR) and 0 as no duration', () => {
    const base = { url: '/aura', startedAt: new Date(0), httpStatus: 200 };
    const action = { input: {}, remoteClass: 'a.B', remoteMethod: 'c', apexClass: '', apexMethod: '' };
    expect(buildActionRecord(1, 'aura', action, 0, undefined, { ...base, durationMs: -1 }).duration).toBeNull();
    expect(buildActionRecord(2, 'aura', action, 0, undefined, { ...base, durationMs: 0 }).duration).toBeNull();
    expect(buildActionRecord(3, 'aura', action, 0, undefined, { ...base, durationMs: 15 }).duration).toBe(15);
  });
});

describe('order and baselines', () => {
  const at = (ms, over = {}) => ({ time: new Date(ms), name: 'A', signature: 'x.A', ...over });

  it('insertIndex puts a call by its start time, after equal ones', () => {
    const list = [at(10), at(20), at(20), at(40)];
    expect(insertIndex(list, new Date(5))).toBe(0);
    expect(insertIndex(list, new Date(20))).toBe(3);
    expect(insertIndex(list, new Date(30))).toBe(3);
    expect(insertIndex(list, new Date(99))).toBe(4);
    expect(insertIndex([], new Date(1))).toBe(0);
  });

  it('previousSimilar can insist on a call that worked', () => {
    const good = at(1, { failure: null });
    const bad = at(2, { failure: 'HTTP 500' });
    const other = at(3, { name: 'B', failure: null });
    const now = at(4, { failure: 'HTTP 500' });
    const list = [good, bad, other, now];
    expect(previousSimilar(list, now)).toBe(bad);
    expect(previousSimilar(list, now, { successful: true })).toBe(good);
    expect(previousSimilar([bad, now], now, { successful: true })).toBeNull();
  });

  it('callsForElement and elementForCall agree on the names', () => {
    const entry = { name: 'Acc_Fetch', signature: 'svc.Acc_Fetch', action: { options: { bundle: 'Bundle1' } } };
    const element = { remote: 'Bundle1' };
    expect(elementForCall(entry, [element])).toBe(element);
    expect(callsForElement(element, [entry])).toEqual([entry]);
  });
});

describe('filter box', () => {
  const entry = {
    name: 'Acc_Fetch', signature: 'svc.Acc_Fetch', url: 'https://x/aura?r=1', omni: true,
    action: { input: { OrderId: '801abc' }, options: {} }, output: { ok: true },
    time: new Date(1000), duration: 5
  };

  it('matches the name on plain words and no longer the URL', () => {
    expect(matchesFilter(entry, { query: 'fetch' })).toBe(true);
    expect(matchesFilter(entry, { query: 'aura' })).toBe(false);
    expect(matchesFilter(entry, { query: 'url:aura' })).toBe(true);
  });

  it('searches payload keys and values after in:', () => {
    expect(matchesFilter(entry, { query: 'in:801abc' })).toBe(true);
    expect(matchesFilter(entry, { query: 'in:orderid' })).toBe(true);
    expect(matchesFilter(entry, { query: 'in:nothere' })).toBe(false);
    expect(matchesFilter(entry, { query: 'fetch in:801' })).toBe(true);
    expect(matchesFilter(entry, { query: 'zzz in:801' })).toBe(false);
  });

  it('searches only keys while values are masked', () => {
    expect(matchesFilter(entry, { query: 'in:801abc', masked: true })).toBe(false);
    expect(matchesFilter(entry, { query: 'in:OrderId', masked: true })).toBe(true);
  });

  it('narrows by step name or key after step:', () => {
    const visits = [{ key: 'S1', name: 'Account Info', from: 0, to: 2000 }, { key: 'S2', name: 'Review', from: 2000, to: null }];
    expect(matchesFilter(entry, { query: 'step:review', visits })).toBe(false);
    expect(matchesFilter(entry, { query: 'step:"account info"', visits })).toBe(true);
    expect(matchesFilter(entry, { query: 'step:S1', visits })).toBe(true);
    expect(matchesFilter(entry, { query: 'step:S1', visits: [] })).toBe(false);
  });
});

describe('masking a row difference for copy', () => {
  it('masks the row identity as well as the values', async () => {
    const { maskChange } = await import('../../../src/core/actions/actions-detail.js');
    const masked = maskChange({ kind: 'row-removed', path: 'Rows[0]', identity: 'Id=801x', before: { Id: '801x' } }, () => '<m>');
    expect(masked.before).toBe('<m>');
    expect(masked.identity).not.toContain('801x');
  });
});

describe('previousSimilar', () => {
  const at = (id, name = 'Order_Place', signature = 'svc.Order_Place', extra = {}) => ({ id, name, signature, failure: null, ...extra });

  it('finds the last earlier call to the same place, optionally one that did not fail', () => {
    const list = [at(1), at(2, 'Other', 'svc.Other'), at(3, 'Order_Place', 'svc.Order_Place', { failure: 'x' }), at(4)];
    expect(previousSimilar(list, list[3])).toBe(list[2]);
    expect(previousSimilar(list, list[3], { successful: true })).toBe(list[0]);
    expect(previousSimilar(list, list[0])).toBeNull();
  });

  it('has nothing to compare a call with that is not in the list, such as a chain', () => {
    const list = [at(1), at(2)];
    expect(previousSimilar(list, at('chain-3'))).toBeNull();
  });
});
