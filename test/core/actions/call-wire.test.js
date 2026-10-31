'use strict';

/* The wire side of test calls: the inverse of parseRequest. The requests are
 * the shapes the parser tests use (Aura message, LWR body, REST body), and
 * every rebuilt request is read back with parseRequest. */

import { parseRequest } from '../../../src/core/shared/actions-model.js';
import {
  TEST_HEADER, MAX_ENVELOPE_BODY, replayHeaders, testTokenOf, envelopeOf, rememberEnvelope, envelopeFor, buildRequest, buildVfRemote, originOf, sameOrigin
} from '../../../src/core/actions/call-wire.js';
import { ipPreviewCall, drPreviewCall, CTX, IP_ID } from '../../fixtures/debug-runs.js';

const AURA_URL = 'https://x.my.site.com/aura?r=1';
const LWR_URL = 'https://x.my.site.com/webruntime/api/apex/execute';
const REST_URL = 'https://x.my.site.com/services/apexrest/omnistudio/v1/integrationprocedure/Account_Fetch';

function auraBody(extra = {}) {
  const message = JSON.stringify({
    actions: [
      {
        id: '123;a',
        descriptor: 'aura://ApexActionController/ACTION$execute',
        params: {
          namespace: '',
          classname: 'omnistudiocore.IPService',
          method: 'invokeMethod',
          params: { sClassName: 'omnistudiocore.IPService', sMethodName: 'Account_Fetch', input: '{"AccountId":"001"}', options: '{"chainable":true}' }
        }
      },
      { id: '124;a', descriptor: 'aura://Other', params: { classname: 'Other', method: 'go', params: {} } }
    ]
  });
  return new URLSearchParams({ message, 'aura.context': '{"mode":"PROD"}', 'aura.token': 'abc', ...extra }).toString();
}

const request = (url, text, headers = []) => ({ url, method: 'POST', headers, postData: { text } });

function envelope(kind, url, body, headers) {
  const parsed = parseRequest(kind, body, url);
  return { env: envelopeOf(kind, request(url, body, headers), parsed), parsed };
}

describe('replayHeaders', () => {
  it('drops what fetch forbids and adds the test header', () => {
    const out = replayHeaders([
      { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
      { name: 'Content-Length', value: '10' }, { name: 'Host', value: 'x' }, { name: 'Cookie', value: 'sid=1' },
      { name: 'Origin', value: 'https://x' }, { name: 'Referer', value: 'https://x/' }, { name: 'User-Agent', value: 'u' },
      { name: 'Accept-Encoding', value: 'gzip' }, { name: 'Connection', value: 'keep-alive' },
      { name: ':authority', value: 'x' }, { name: 'sec-fetch-mode', value: 'cors' }, { name: 'Sec-CH-UA', value: 'c' },
      { name: 'X-SFDC-Request-Id', value: 'r1' }
    ], 'tok-1');
    expect(out).toEqual({
      'Content-Type': 'application/x-www-form-urlencoded', 'X-SFDC-Request-Id': 'r1', [TEST_HEADER]: 'tok-1'
    });
  });

  it('does not let a captured test header stand in for the new token', () => {
    const out = replayHeaders([{ name: 'x-omniscript-inspector-test', value: 'old' }], 'new');
    expect(out).toEqual({ [TEST_HEADER]: 'new' });
  });

  it('reads a plain object as well', () => {
    expect(replayHeaders({ Accept: '*/*' }, 't')).toEqual({ Accept: '*/*', [TEST_HEADER]: 't' });
  });
});

describe('testTokenOf', () => {
  it('finds the header whatever its case', () => {
    expect(testTokenOf([{ name: 'X-OMNISCRIPT-INSPECTOR-TEST', value: 'tk' }])).toBe('tk');
    expect(testTokenOf([{ name: 'Accept', value: '*/*' }])).toBe('');
    expect(testTokenOf(undefined)).toBe('');
  });
});

describe('envelopeOf', () => {
  it('keeps the address, method, headers and raw body of an OmniStudio request', () => {
    const { env } = envelope('aura', AURA_URL, auraBody(), [{ name: 'Accept', value: '*/*' }]);
    expect(env).toMatchObject({ kind: 'aura', url: AURA_URL, method: 'POST', headers: [{ name: 'Accept', value: '*/*' }] });
    expect(env.body).toBe(auraBody());
  });

  it('keeps nothing for a request that is not OmniStudio\'s, is too large, or has no body', () => {
    const plain = new URLSearchParams({ message: JSON.stringify({ actions: [{ id: '1', params: { classname: 'Plain', method: 'go', params: {} } }] }) }).toString();
    expect(envelope('aura', AURA_URL, plain).env).toBeNull();
    const big = auraBody({ pad: 'x'.repeat(MAX_ENVELOPE_BODY) });
    expect(envelopeOf('aura', request(AURA_URL, big), parseRequest('aura', big, AURA_URL))).toBeNull();
    expect(envelopeOf('aura', { url: AURA_URL, method: 'POST' }, [])).toBeNull();
    expect(envelopeOf('vfremote', request(AURA_URL, '[]'), [{ remoteClass: 'a' }])).toBeNull();
  });
});

describe('the envelope store', () => {
  it('keeps the latest of each kind per origin', () => {
    const a = envelope('aura', AURA_URL, auraBody()).env;
    const l = envelope('lwr', LWR_URL, JSON.stringify({ classname: 'C', method: 'm', params: { params: { sClassName: 'omnistudio.X', sMethodName: 'Y_Z' } } })).env;
    let store = rememberEnvelope({}, a);
    store = rememberEnvelope(store, l);
    const origin = originOf(AURA_URL);
    expect(envelopeFor(store, origin, 'lwr')).toBe(l);
    expect(envelopeFor(store, origin, 'rest')).toBe(a); // falls back to Aura first
    expect(envelopeFor(store, 'https://other', 'aura')).toBeNull();
    expect(rememberEnvelope(store, null)).toBe(store);
  });
});

describe('buildRequest', () => {
  it('rewrites an Aura message to carry one action with the edited input and options, encoded as before', () => {
    const { env, parsed } = envelope('aura', AURA_URL, auraBody());
    const built = buildRequest(env, parsed[0], { input: { AccountId: '002', n: 1 }, options: { chainable: false } });
    expect(built.url).toBe(AURA_URL);
    expect(built.method).toBe('POST');
    const form = new URLSearchParams(built.body);
    expect(form.get('aura.token')).toBe('abc');
    expect(form.get('aura.context')).toBe('{"mode":"PROD"}');
    const message = JSON.parse(form.get('message'));
    expect(message.actions).toHaveLength(1);
    expect(message.actions[0].id).toBe('123;a');
    expect(message.actions[0].params.params.input).toBe('{"AccountId":"002","n":1}'); // was text, stays text
    const [again] = parseRequest('aura', built.body, built.url);
    expect(again).toMatchObject({ remoteClass: 'omnistudiocore.IPService', remoteMethod: 'Account_Fetch', input: { AccountId: '002', n: 1 }, options: { chainable: false } });
  });

  it('keeps object-valued parameters as objects and a remote call sent as JSON text as text', () => {
    const asObject = JSON.stringify({ actions: [{ id: '1', descriptor: 'd', params: { classname: 'C', method: 'invokeMethod', params: { sClassName: 'a.IPService', sMethodName: 'A_B', input: { k: 1 }, options: {} } } }] });
    const asText = JSON.stringify({ actions: [{ id: '1', descriptor: 'd', params: { classname: 'C', method: 'invokeMethod', params: JSON.stringify({ sClassName: 'a.IPService', sMethodName: 'A_B', input: '{"k":1}', options: '{}' }) } }] });
    [asObject, asText].forEach((message) => {
      const body = new URLSearchParams({ message }).toString();
      const { env, parsed } = envelope('aura', AURA_URL, body);
      const built = buildRequest(env, parsed[0], { input: { k: 2 }, options: {} });
      const sent = JSON.parse(new URLSearchParams(built.body).get('message')).actions[0].params.params;
      expect(typeof sent).toBe(message === asText ? 'string' : 'object');
      expect(parseRequest('aura', built.body, built.url)[0].input).toEqual({ k: 2 });
    });
  });

  it('applies edits to the class, method and namespace', () => {
    const { env, parsed } = envelope('aura', AURA_URL, auraBody());
    const edited = { ...parsed[0], remoteClass: 'vlocity_ins.IntegrationProcedureService', remoteMethod: 'Order_Place', namespace: 'vlocity_ins' };
    const built = buildRequest(env, edited, { input: {}, options: undefined });
    const [again] = parseRequest('aura', built.body, built.url);
    expect(again).toMatchObject({ remoteClass: 'vlocity_ins.IntegrationProcedureService', remoteMethod: 'Order_Place', namespace: 'vlocity_ins', input: {}, options: {} });
  });

  it('models a request that has no action of its own on the first action of the envelope', () => {
    const { env, parsed } = envelope('aura', AURA_URL, auraBody());
    const built = buildRequest(env, { remoteClass: 'omnistudiocore.DRService', remoteMethod: 'invokeInboundDR', apexClass: 'omnistudiocore.DRService', apexMethod: 'invokeMethod', namespace: '' }, { input: { a: 1 }, options: { bundleName: 'Orders' } });
    const [again] = parseRequest('aura', built.body, built.url);
    expect(again).toMatchObject({ remoteMethod: 'invokeInboundDR', input: { a: 1 }, options: { bundleName: 'Orders' } });
    expect(parsed).toHaveLength(2);
  });

  it('rewrites an LWR body, nested or not', () => {
    const nested = JSON.stringify({ classname: 'vlocity_ins.DRService', method: 'invokeMethod', params: { params: { sClassName: 'vlocity_ins.DRService', sMethodName: 'invokeInboundDR', input: { a: 1 }, options: { bundle: 'X' } } } });
    const flat = JSON.stringify({ classname: 'vlocity_ins.DRService', method: 'invokeMethod', params: { sClassName: 'vlocity_ins.DRService', sMethodName: 'invokeInboundDR', input: { a: 1 } } });
    [nested, flat].forEach((body) => {
      const { env, parsed } = envelope('lwr', LWR_URL, body);
      const built = buildRequest(env, parsed[0], { input: { a: 2 }, options: { bundle: 'Y' } });
      expect(built.url).toBe(LWR_URL);
      const [again] = parseRequest('lwr', built.body, built.url);
      expect(again).toMatchObject({ remoteMethod: 'invokeInboundDR', input: { a: 2 }, options: { bundle: 'Y' } });
    });
  });

  it('sends a REST body as the input, to the address of the procedure', () => {
    const { env, parsed } = envelope('rest', REST_URL, JSON.stringify({ AccountId: '001' }));
    const built = buildRequest(env, { ...parsed[0], remoteMethod: 'Order_Place' }, { input: { AccountId: '002' } });
    expect(built.url).toBe('https://x.my.site.com/services/apexrest/omnistudio/v1/integrationprocedure/Order_Place');
    expect(JSON.parse(built.body)).toEqual({ AccountId: '002' });
    expect(parseRequest('rest', built.body, built.url)[0]).toMatchObject({ remoteMethod: 'Order_Place', input: { AccountId: '002' } });
  });

  it('refuses an envelope whose body is not in the shape of its kind', () => {
    const broken = { kind: 'aura', url: AURA_URL, method: 'POST', headers: [], body: 'message=not-json' };
    expect(buildRequest(broken, { remoteClass: 'a' }, { input: {} })).toBeNull();
    expect(buildRequest({ kind: 'lwr', url: LWR_URL, headers: [], body: '{broken' }, { remoteClass: 'a' }, { input: {} })).toBeNull();
    expect(buildRequest(null, {}, {})).toBeNull();
  });
});

describe('sameOrigin', () => {
  it('reads an address against the origin it must stay on', () => {
    expect(sameOrigin('https://x.my.site.com/aura?r=1', 'https://x.my.site.com')).toBe(true);
    expect(sameOrigin('/aura?r=1', 'https://x.my.site.com')).toBe(true);
    expect(sameOrigin('https://x.my.site.com.evil.example/aura', 'https://x.my.site.com')).toBe(false);
    expect(sameOrigin('http://x.my.site.com/aura', 'https://x.my.site.com')).toBe(false);
    expect(sameOrigin('https://x.my.site.com/aura', '')).toBe(false);
    expect(sameOrigin('https://x.my.site.com/aura', 'not an origin')).toBe(false);
  });
});

/* ------------------------------------------------ designer previews */

describe('re-running a designer preview (Visualforce remoting)', () => {
  const VF_URL = 'https://demo.example.invalid/apexremote';

  const parsedCall = (call, kindUrl = VF_URL) => {
    const body = JSON.stringify(call);
    const actions = parseRequest('vfremote', body, kindUrl);
    return { body, actions, env: envelopeOf('vfremote', request(kindUrl, body, [{ name: 'Content-Type', value: 'application/json' }]), actions) };
  };

  it('keeps an envelope for a preview only, not for any other remoting call', () => {
    expect(parsedCall(ipPreviewCall()).env).toMatchObject({ kind: 'vfremote', url: VF_URL });
    expect(parsedCall(drPreviewCall()).env).not.toBeNull();
    expect(parsedCall({ action: 'C', method: 'm', data: ['a', 'b', {}, {}], tid: 1 }).env).toBeNull();
  });

  it('lists vfremote among the kinds a test call can go to, and stores and finds it by kind', () => {
    const { env } = parsedCall(ipPreviewCall());
    const store = rememberEnvelope({}, env);
    expect(envelopeFor(store, 'https://demo.example.invalid', 'vfremote')).toBe(env);
  });

  it('writes an Integration Procedure back: Id kept, input as text, isDebug true, a larger tid', () => {
    const { env, actions } = parsedCall(ipPreviewCall({ tid: 12, options: { isDebug: false, chainable: true } }));
    const built = buildRequest(env, actions[0], { input: { ContextId: '001000000000002AAA' }, options: { chainable: false, isDebug: false } });
    expect(built.url).toBe(VF_URL);
    const sent = JSON.parse(built.body);
    expect(sent).toMatchObject({ action: 'ns.OmniScriptDesignerController', method: 'testIntegrationProcedure', type: 'rpc', ctx: CTX });
    expect(sent.data).toEqual([IP_ID, '{"ContextId":"001000000000002AAA"}', { chainable: false, isDebug: true }]);
    expect(sent.tid).toBeGreaterThan(12);
    // Read back, it is the same preview with the new input.
    const [again] = parseRequest('vfremote', built.body, VF_URL);
    expect(again).toMatchObject({ debug: 'ip', recordId: IP_ID, input: { ContextId: '001000000000002AAA' } });
  });

  it('writes a DataRaptor back: the request kept, objectList as text, debug true', () => {
    const { env, actions } = parsedCall(drPreviewCall({ tid: 24 }));
    const built = buildRequest(env, actions[0], { input: { accountId: '001000000000002AAA' }, options: { ...actions[0].options, interfaceType: 'Transform', debug: false } });
    const sent = JSON.parse(built.body);
    expect(sent.method).toBe('drPreviewExecute');
    expect(sent.data).toEqual([{
      bundleName: 'DRDemoGetAccount', inputType: 'JSON', interfaceType: 'Transform', ignoreCache: true, bulkUpload: false, debug: true,
      objectList: '{"accountId":"001000000000002AAA"}'
    }]);
    expect(sent.tid).toBeGreaterThan(24);
  });

  it('sends one call in the shape of the captured body: an object stays an object, an array an array', () => {
    const one = parsedCall(ipPreviewCall());
    expect(Array.isArray(JSON.parse(buildRequest(one.env, one.actions[0], { input: {}, options: {} }).body))).toBe(false);
    const body = JSON.stringify([ipPreviewCall({ tid: 3 }), ipPreviewCall({ tid: 9 })]);
    const actions = parseRequest('vfremote', body, VF_URL);
    const env = envelopeOf('vfremote', request(VF_URL, body), actions);
    const sent = JSON.parse(buildRequest(env, actions[0], { input: {}, options: {} }).body);
    expect(sent).toHaveLength(1);
    expect(sent[0].tid).toBe(10); // larger than any tid in the captured body
  });

  it('uses the newest context the envelope holds, and the tid larger than the captured one', () => {
    const old = parsedCall(ipPreviewCall({ tid: 5, ctx: { ...CTX, csrf: 'old-token' } }));
    const fresh = JSON.stringify(ipPreviewCall({ tid: 30, ctx: { ...CTX, csrf: 'new-token' } }));
    const env = envelopeOf('vfremote', request(VF_URL, fresh), parseRequest('vfremote', fresh, VF_URL));
    const sent = JSON.parse(buildRequest(env, old.actions[0], { input: {}, options: {} }).body);
    expect(sent.ctx.csrf).toBe('new-token');
    expect(sent.tid).toBe(31);
  });

  it('does not rewrite anything that is not a preview', () => {
    const { env } = parsedCall(ipPreviewCall());
    const [plain] = parseRequest('vfremote', JSON.stringify([{ tid: 1, action: 'C', method: 'm', data: ['a', 'b', {}, {}] }]));
    expect(buildVfRemote(env, plain, {}, {})).toBeNull();
    expect(buildVfRemote(null, plain, {}, {})).toBeNull();
    expect(buildRequest(env, plain, { input: {} })).toBeNull();
  });

  it('adds the test header like for the other kinds', () => {
    const { env } = parsedCall(ipPreviewCall());
    expect(replayHeaders(env.headers, 't1')[TEST_HEADER]).toBe('t1');
  });
});
