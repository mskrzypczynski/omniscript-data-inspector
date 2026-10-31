'use strict';

import {
  sendGate, gateWords, entryPoint, newCallButton, canRerun, parseJsonText, errorLine, formatJsonText, optionsSummary, draftFromEntry, draftNew, applyName,
  requestOfDraft, headLine, pickableCalls, newToken, resolveTest, dropStale, signatureOfDraft, testTags, importedTest,
  MATCH_WINDOW_MS, GAVE_UP_KEEP_MS, NOT_IN_SESSION, errorIndex, modelFor, formPhase, markGaveUp, applyUrl, hiddenBy, hiddenWords,
  hiddenToastWords, landedWords, sentWords, confirmWords, closeTitle, draftKey, isRest, MASK_WORDS, GAVE_UP_WORDS, formTitle
} from '../../../src/core/actions/test-calls.js';
import { envelopeOf, rememberEnvelope, TEST_HEADER, originOf } from '../../../src/core/actions/call-wire.js';
import { parseRequest, buildActionRecord, exportEntries } from '../../../src/core/shared/actions-model.js';
import { recordsFromExport } from '../../../src/core/actions/actions-import.js';
import { fitTags } from '../../../src/core/actions/option-tags.js';
import { ipPreviewCall, drPreviewCall, IP_ID, ACCOUNT_ID } from '../../fixtures/debug-runs.js';

const AURA_URL = 'https://x.my.site.com/aura?r=1';

function auraText(method = 'Account_Fetch', cls = 'omnistudiocore.IPService', options = '{"chainable":true}') {
  const message = JSON.stringify({ actions: [{ id: '1;a', descriptor: 'd', params: { namespace: '', classname: cls, method: 'invokeMethod', params: { sClassName: cls, sMethodName: method, input: '{"AccountId":"001"}', options } } }] });
  return new URLSearchParams({ message, 'aura.token': 't' }).toString();
}

function recordFor(text, id = 1, time = new Date('2024-01-01T10:00:00Z')) {
  const [action] = parseRequest('aura', text, AURA_URL);
  return buildActionRecord(id, 'aura', action, 0, null, { url: AURA_URL, startedAt: time, durationMs: 5, httpStatus: 200, bodySize: 1 });
}

const envelopes = () => rememberEnvelope({}, envelopeOf('aura', { url: AURA_URL, method: 'POST', headers: [{ name: 'Accept', value: '*/*' }], postData: { text: auraText() } }, parseRequest('aura', auraText(), AURA_URL)));
const clock = (ms) => new Date(ms).toISOString().slice(11, 19);

describe('sendGate', () => {
  it('is the one decision: setting on, no loaded session, a live page and a model request', () => {
    expect(sendGate({ allowed: false })).toEqual({ ok: false, reason: 'off' });
    expect(sendGate({ allowed: true, session: true })).toEqual({ ok: false, reason: 'session' });
    expect(sendGate({ allowed: true })).toEqual({ ok: true, reason: '' });
    expect(sendGate({ allowed: true, live: false }, true).reason).toBe('no-page');
    expect(sendGate({ allowed: true, envelope: false }, true).reason).toBe('no-model');
    expect(sendGate({ allowed: true, live: true, envelope: true }, true).ok).toBe(true);
    expect(sendGate({ allowed: false, live: true, envelope: true }, true).ok).toBe(false);
    expect(gateWords('session')).toBe(NOT_IN_SESSION);
    expect(gateWords('nope')).toBe('');
  });
});

describe('sendGate: paused and the kind of the model', () => {
  it('refuses to send while Recording is paused, because the answer would be thrown away', () => {
    expect(sendGate({ allowed: true, recording: false }, true)).toEqual({ ok: false, reason: 'paused' });
    expect(gateWords('paused')).toBe('Recording is paused');
    // Opening the form is not sending: only the send itself asks.
    expect(sendGate({ allowed: true, recording: false }).ok).toBe(true);
    // The other reasons keep their order.
    expect(sendGate({ allowed: false, recording: false }, true).reason).toBe('off');
    expect(sendGate({ allowed: true, session: true, recording: false }, true).reason).toBe('session');
    expect(sendGate({ allowed: true, recording: true, kind: false }, true).reason).toBe('no-kind');
  });

  it('entryPoint disables a menu item while paused, and says why', () => {
    expect(entryPoint({ allowed: true, paused: true }, 'Run it')).toEqual({ visible: true, disabled: true, title: 'Recording is paused' });
    expect(entryPoint({ allowed: true, session: true, paused: true }, 'x').title).toBe(NOT_IN_SESSION);
    expect(entryPoint({ allowed: false, paused: true }, 'x').visible).toBe(false);
  });
});

describe('formPhase', () => {
  it('is busy while sending or waiting, locked once given up on, and bad for both failures', () => {
    expect(formPhase('idle')).toEqual({ busy: false, locked: false, bad: false });
    expect(formPhase('sending').busy).toBe(true);
    expect(formPhase('sent').busy).toBe(true);
    expect(formPhase('failed')).toEqual({ busy: false, locked: false, bad: true });
    expect(formPhase('gaveup')).toEqual({ busy: false, locked: true, bad: true });
  });
});

describe('entryPoint', () => {
  it('is hidden with the setting off, disabled in a session, and otherwise on', () => {
    expect(entryPoint({ allowed: false }, 't').visible).toBe(false);
    expect(entryPoint({ allowed: true, session: true }, 't')).toEqual({ visible: true, disabled: true, title: 'Not available while a bundle is open' });
    expect(entryPoint({ allowed: true, session: false }, 'Run it')).toEqual({ visible: true, disabled: false, title: 'Run it' });
  });
});

describe('canRerun', () => {
  it('needs an OmniStudio call that went through an endpoint a test call can reach', () => {
    expect(canRerun(recordFor(auraText()))).toBe(true);
    expect(canRerun({ ...recordFor(auraText()), kind: 'vfremote' })).toBe(false);
    expect(canRerun({ ...recordFor(auraText()), kind: 'file' })).toBe(false);
    expect(canRerun({ ...recordFor(auraText()), chain: {} })).toBe(false);
    expect(canRerun(null)).toBe(false);
  });
});

describe('parseJsonText', () => {
  it('reads empty text as {} and valid text as its value', () => {
    expect(parseJsonText('  ')).toEqual({ ok: true, value: {}, empty: true });
    expect(parseJsonText('{"a":[1]}')).toEqual({ ok: true, value: { a: [1] }, empty: false });
  });

  it('names the error and its line and column', () => {
    const parsed = parseJsonText('{\n  "a": 1,\n  "b": ]\n}');
    expect(parsed.ok).toBe(false);
    expect(parsed.line).toBe(3);
    expect(parsed.column).toBeGreaterThan(1);
    expect(errorLine(parsed)).toMatch(/\(line 3, column \d+\)$/);
    expect(parsed.error).toBe('Unexpected "]"');
    expect(parsed.column).toBe(8);
  });

  it('formats valid text and refuses the rest', () => {
    expect(formatJsonText('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(formatJsonText('')).toBe('{}');
    expect(formatJsonText('{')).toBeNull();
  });
});

describe('optionsSummary', () => {
  it('counts keys', () => {
    expect(optionsSummary('{"a":1,"b":2}')).toBe('Options (2 keys)');
    expect(optionsSummary('{"a":1}')).toBe('Options (1 key)');
    expect(optionsSummary('{}')).toBe('Options (empty)');
    expect(optionsSummary('{')).toBe('Options (not valid JSON)');
  });
});

describe('drafts', () => {
  it('starts a re-run from the call, with the time it re-runs', () => {
    const entry = recordFor(auraText());
    const draft = draftFromEntry(entry);
    expect(draft).toMatchObject({ kind: 'IP', name: 'Account_Fetch', remoteClass: 'omnistudiocore.IPService', wireKind: 'aura', guess: false, from: 1 });
    expect(JSON.parse(draft.input)).toEqual({ AccountId: '001' });
    expect(JSON.parse(draft.options)).toEqual({ chainable: true });
    expect(draft.rerun).toEqual({ id: 1, time: entry.time.getTime() });
    expect(headLine(draft, clock)).toBe('Integration Procedure Account_Fetch · re-run of 10:00:00');
  });

  it('starts a New test call from the latest call of the kind, with no name', () => {
    const entries = [recordFor(auraText('Old_One'), 1), recordFor(auraText('New_One', 'omnistudiocore.IPService', '{"queueableChainable":true}'), 2)];
    const draft = draftNew('IP', { entries, envelopes: envelopes(), origin: originOf(AURA_URL) });
    expect(draft).toMatchObject({ kind: 'IP', name: '', remoteMethod: '', guess: false, from: 2, rerun: null, input: '{}' });
    expect(JSON.parse(draft.options)).toEqual({ queueableChainable: true });
    expect(headLine(draft, clock)).toBe('Integration Procedure, no name yet');
  });

  it('guesses from the package namespace when no call of the kind was captured', () => {
    const entries = [recordFor(auraText())]; // an IP, so a Data Mapper has no model
    const draft = draftNew('DR', { entries, envelopes: envelopes(), origin: originOf(AURA_URL), namespace: 'vlocity_ins' });
    expect(draft).toMatchObject({ kind: 'DR', guess: true, remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR', wireKind: 'aura' });
    expect(draftNew('IP', { namespace: '' }).remoteClass).toBe('omnistudio.IntegrationProcedureService');
    expect(draftNew('IP', {}).wireKind).toBe('');
  });

  it('puts a new Data Mapper name where the old one was', () => {
    const base = { kind: 'DR', name: 'Old', nameFrom: 'options', input: '{}', options: '{"bundle":"Old","x":1}' };
    expect(JSON.parse(applyName(base, 'Orders').options)).toEqual({ bundle: 'Orders', x: 1 });
    expect(JSON.parse(applyName({ ...base, options: '{}' }, 'Orders').options)).toEqual({ bundleName: 'Orders' });
    const fromInput = applyName({ ...base, nameFrom: 'input', input: '{"bundleName":"Old","q":2}' }, 'Orders');
    expect(JSON.parse(fromInput.input)).toEqual({ bundleName: 'Orders', q: 2 });
    expect(applyName({ ...base, options: '{' }, 'Orders').options).toBe('{');
    expect(applyName({ kind: 'IP', name: '' }, 'A_B').name).toBe('A_B');
  });

  it('lists other calls of the same kind, newest first', () => {
    const entries = [recordFor(auraText('A_A'), 1), recordFor(auraText('B_B'), 2)];
    expect(pickableCalls(entries, { kind: 'IP' }).map((entry) => entry.id)).toEqual([2, 1]);
    expect(pickableCalls(entries, { kind: 'DR' })).toEqual([]);
  });
});

describe('requestOfDraft', () => {
  const origin = originOf(AURA_URL);

  it('builds the request the draft says, with the test header', () => {
    const draft = { ...draftFromEntry(recordFor(auraText())), input: '{"AccountId":"009"}' };
    const made = requestOfDraft(draft, envelopes(), origin, 'tok');
    expect(made.ok).toBe(true);
    expect(made.request.headers[TEST_HEADER]).toBe('tok');
    expect(made.request.headers.Accept).toBe('*/*');
    expect(parseRequest('aura', made.request.body, made.request.url)[0].input).toEqual({ AccountId: '009' });
  });

  it('says why it cannot', () => {
    const draft = draftFromEntry(recordFor(auraText()));
    expect(requestOfDraft({ ...draft, input: '{' }, envelopes(), origin, 't').why).toMatch(/^Input: .*line 1/);
    expect(requestOfDraft({ ...draft, options: '[' }, envelopes(), origin, 't').why).toMatch(/^Options: /);
    expect(requestOfDraft({ ...draft, name: ' ' }, envelopes(), origin, 't').why).toMatch(/is empty$/);
    expect(requestOfDraft(draft, {}, origin, 't').why).toBe(gateWords('no-model', origin));
    expect(gateWords('no-model', origin)).toMatch(/^No OmniStudio call from https:\/\/x\.my\.site\.com has been captured yet/);
    expect(gateWords('no-model')).toMatch(/^No OmniStudio call has been captured on this page yet/);
  });

  it('sends a renamed procedure under its new key', () => {
    const draft = { ...draftFromEntry(recordFor(auraText())), name: 'Order_Place' };
    const made = requestOfDraft(draft, envelopes(), origin, 't');
    expect(parseRequest('aura', made.request.body, made.request.url)[0].remoteMethod).toBe('Order_Place');
    expect(signatureOfDraft(draft)).toBe('omnistudiocore.IPService.Order_Place');
  });
});

describe('requestOfDraft: the address, the kind and the origin', () => {
  const REST_URL = 'https://x.my.site.com/services/apexrest/omnistudio/v1/integrationprocedure/Acme_Fetch';
  const restEnvelopes = () => rememberEnvelope({}, { kind: 'rest', url: REST_URL, method: 'POST', headers: [], body: '{}' });
  const restDraft = (over = {}) => ({
    kind: 'IP', name: 'Acme_Fetch', input: '{"a":1}', options: '{"x":1}', remoteClass: '', remoteMethod: '', apexClass: '', apexMethod: '',
    namespace: '', url: REST_URL, wireKind: 'rest', nameFrom: '', rerun: { id: 1, time: 1 }, guess: false, urlEdited: false, from: 1, ...over
  });
  const origin = originOf(REST_URL);

  it('sends a renamed REST procedure to the new key, not to the call it was copied from', () => {
    const made = requestOfDraft(restDraft({ name: 'Other_Proc' }), restEnvelopes(), origin, 't');
    expect(made.ok).toBe(true);
    expect(made.request.url).toBe(REST_URL.replace('Acme_Fetch', 'Other_Proc'));
    // Not renamed: the same address.
    expect(requestOfDraft(restDraft(), restEnvelopes(), origin, 't').request.url).toBe(REST_URL);
  });

  it('follows the Endpoint field once it was edited by hand', () => {
    const typed = 'https://x.my.site.com/services/apexrest/omnistudio/v1/integrationprocedure/Typed_Key';
    const made = requestOfDraft(applyUrl(restDraft({ name: 'Other_Proc' }), typed), restEnvelopes(), origin, 't');
    expect(made.request.url).toBe(typed);
  });

  it('sends only the input as the body of a REST call, and says options are not sent', () => {
    const made = requestOfDraft(restDraft(), restEnvelopes(), origin, 't');
    expect(JSON.parse(made.request.body)).toEqual({ a: 1 });
    expect(isRest(restDraft())).toBe(true);
    expect(isRest({ wireKind: 'aura' })).toBe(false);
    expect(optionsSummary('{"x":1,"y":2}', true)).toBe('Options (2 keys, not sent)');
    expect(optionsSummary('{}', true)).toBe('Options (empty, not sent)');
  });

  it('refuses a re-run whose own kind of request was never captured, instead of building a malformed one', () => {
    const lwr = { ...restDraft(), wireKind: 'lwr', url: 'https://x.my.site.com/webruntime/api/apex/execute/x' };
    const made = requestOfDraft(lwr, envelopes(), originOf(AURA_URL), 't'); // only an Aura envelope exists
    expect(made).toEqual({ ok: false, why: gateWords('no-kind') });
    expect(gateWords('no-kind')).toMatch(/No model request of this kind was captured yet/);
    expect(modelFor(lwr, envelopes(), originOf(AURA_URL)).reason).toBe('no-kind');
    // New test call may still take any kind there is.
    expect(modelFor({ ...lwr, rerun: null }, envelopes(), originOf(AURA_URL)).envelope.kind).toBe('aura');
    expect(modelFor({ ...lwr, rerun: null }, {}, originOf(AURA_URL)).reason).toBe('no-model');
  });

  it('never sends across origins, whatever the Endpoint field says', () => {
    const draft = draftFromEntry(recordFor(auraText()));
    const made = requestOfDraft(draft, envelopes(), 'https://x.my.site.com', 't');
    expect(made.ok).toBe(true);
    const elsewhere = applyUrl(draft, 'https://evil.example.com/aura?r=1');
    const refused = requestOfDraft(elsewhere, envelopes(), 'https://x.my.site.com', 't');
    expect(refused.ok).toBe(false);
    expect(refused.why).toMatch(/not on https:\/\/x\.my\.site\.com/);
  });
});

describe('telling a test call', () => {
  const send = (over = {}) => ({ token: 'tk1', rerunOf: 4, rerunTime: 1000, signature: 'a.B.c', sentAt: 5000, ...over });

  it('takes the header as the proof and uses up the send', () => {
    const found = resolveTest([{ name: TEST_HEADER, value: 'tk1' }], 'other', 9e9, [send(), send({ token: 'tk2' })]);
    expect(found.test).toEqual({ token: 'tk1', rerunOf: 4, rerunTime: 1000 });
    expect(found.pending.map((item) => item.token)).toEqual(['tk2']);
    // A token the panel does not know (another session) is still a test call.
    expect(resolveTest([{ name: TEST_HEADER, value: 'zz' }], 's', 1, []).test).toEqual({ token: 'zz', rerunOf: null, rerunTime: null });
  });

  it('falls back to the next call with the same signature within 30 s', () => {
    const pending = [send()];
    expect(resolveTest([], 'a.B.c', 5000 + MATCH_WINDOW_MS, pending).test.token).toBe('tk1');
    expect(resolveTest([], 'a.B.c', 5000 + MATCH_WINDOW_MS + 1, pending).test).toBeNull();
    expect(resolveTest([], 'a.B.c', 4999, pending).test).toBeNull(); // started before the send
    expect(resolveTest([], 'a.B.x', 6000, pending).test).toBeNull();
    expect(resolveTest([], 'a.B.c', 6000, pending).pending).toEqual([]);
  });

  it('forgets sends that can no longer match', () => {
    expect(dropStale([send()], 5000 + MATCH_WINDOW_MS * 2 + 1)).toEqual([]);
    expect(dropStale([send()], 6000)).toHaveLength(1);
  });

  it('remembers a send that was given up on for ten minutes, so a late answer is still a test', () => {
    const pending = markGaveUp([send(), send({ token: 'tk2' })], 'tk1');
    expect(pending[0].gaveUp).toBe(true);
    expect(pending[1].gaveUp).toBeUndefined();
    const later = 5000 + MATCH_WINDOW_MS * 2 + 1000;
    expect(dropStale(pending, later).map((item) => item.token)).toEqual(['tk1']);
    expect(dropStale(pending, 5000 + GAVE_UP_KEEP_MS)).toHaveLength(1);
    expect(dropStale(pending, 5000 + GAVE_UP_KEEP_MS + 1)).toEqual([]);
    // The header still names it when the answer finally arrives.
    expect(resolveTest([{ name: TEST_HEADER, value: 'tk1' }], 's', later, dropStale(pending, later)).test).toEqual({ token: 'tk1', rerunOf: 4, rerunTime: 1000 });
  });

  it('makes tokens that differ', () => {
    expect(newToken(1, 0.5)).not.toBe(newToken(2, 0.5));
  });
});

describe('test tags', () => {
  const byId = new Map([[4, { id: 4 }]]);
  it('has none for an ordinary call, "test" for a new call, and the original for a re-run', () => {
    expect(testTags({}, { clock, byId })).toEqual([]);
    expect(testTags({ test: { token: 't', rerunOf: null, rerunTime: null } }, { clock, byId }).map((tag) => tag.label)).toEqual(['test']);
    const tags = testTags({ test: { token: 't', rerunOf: 4, rerunTime: Date.parse('2024-01-01T10:00:00Z') } }, { clock, byId });
    expect(tags.map((tag) => tag.label)).toEqual(['test', 're-run of 10:00:00']);
    expect(tags[1].select).toBe(4);
    const gone = testTags({ test: { token: 't', rerunOf: 99, rerunTime: 1 } }, { clock, byId });
    expect(gone[1].select).toBeNull();
    expect(gone[1].title).toMatch(/no longer in the list/);
  });

  it('says just "re-run" in the list, with the time in its tooltip, and keeps the time for the detail head', () => {
    const entry = { test: { token: 't', rerunOf: 4, rerunTime: Date.parse('2024-01-01T10:00:00Z') } };
    const short = testTags(entry, { clock, byId, short: true });
    expect(short.map((tag) => tag.label)).toEqual(['test', 're-run']);
    expect(short[1].title).toBe('Re-run of the call at 10:00:00. Click to select that call.');
    expect(short[1].select).toBe(4);
    const gone = testTags({ test: { token: 't', rerunOf: 99, rerunTime: 1 } }, { clock, byId, short: true });
    expect(gone[1].title).toMatch(/no longer in the list/);
    expect(gone[1].select).toBeNull();
    expect(testTags(entry, { clock, byId })[1].label).toBe('re-run of 10:00:00');
  });

  it('names a cut answer, and keeps test and re-run in a wide list ahead of the other options', () => {
    const tags = testTags({ test: { token: 't', rerunOf: 4, rerunTime: Date.parse('2024-01-01T10:00:00Z'), truncated: true } }, { clock, byId });
    expect(tags.map((tag) => tag.label)).toEqual(['test', 'answer cut at 2 MB', 're-run of 10:00:00']);
    const plain = testTags({ test: { token: 't', rerunOf: 4, rerunTime: Date.parse('2024-01-01T10:00:00Z') } }, { clock, byId });
    const options = [{ label: 'chainable', title: 'c' }, { label: 'no cache', title: 'n' }];
    const fit = fitTags([...options, ...plain.map((tag) => ({ ...tag, label: tag.label.replace('10:00:00', '10:00:00 AM') }))]);
    expect(fit.shown.map((tag) => tag.label)).toEqual(['test', 're-run of 10:00:00 AM']);
    expect(fit.more).toBe(2);
    expect(fit.moreTitle).toBe('c\nn');
    // A cut answer is named in the list before the re-run is, since the row cannot show its body.
    const cut = fitTags([...options, ...tags.map((tag) => ({ ...tag, label: tag.label.replace('10:00:00', '10:00:00 AM') }))]);
    expect(cut.shown.map((tag) => tag.label)).toEqual(['test', 'answer cut at 2 MB']);
  });

  it('survives an export', () => {
    const plain = recordFor(auraText());
    expect(exportEntries([plain])[0].test).toBeUndefined();
    const fresh = { ...plain, test: { token: 't', rerunOf: null, rerunTime: null } };
    expect(exportEntries([fresh])[0].test).toEqual({});
    const again = { ...plain, test: { token: 't', rerunOf: 4, rerunTime: Date.parse('2024-01-01T10:00:00Z') } };
    const out = exportEntries([again])[0].test;
    expect(out).toEqual({ rerunOf: '2024-01-01T10:00:00.000Z' });
    expect(importedTest({ test: out }).rerunTime).toBe(Date.parse('2024-01-01T10:00:00Z'));
    expect(importedTest({ test: {} })).toEqual({ token: '', rerunOf: null, rerunTime: null });
    expect(importedTest({})).toBeUndefined();
    expect(recordsFromExport([{ ...exportEntries([again])[0], id: 3 }])[0].test.rerunTime).toBe(Date.parse('2024-01-01T10:00:00Z'));
  });
});

describe('errorIndex', () => {
  it('finds the first character that is not JSON', () => {
    expect(errorIndex('{"a":1}')).toBe(-1);
    expect(errorIndex('[1, 2,]')).toBe(6);
    expect(errorIndex('{"a" 1}')).toBe(5);
    expect(errorIndex("{'a':1}")).toBe(1);
    expect(errorIndex('{"a":')).toBe(5);
    expect(errorIndex('{"a":1} x')).toBe(8);
    expect(errorIndex('{"a":tru}')).toBe(8);
    expect(errorIndex('"abc')).toBe(4);
    expect(errorIndex('01')).toBe(1);
    expect(errorIndex('{"a":"\\u12G4"}')).toBeGreaterThan(0);
  });

  it('agrees with JSON.parse on what is valid', () => {
    ['{}', '[]', '-1.5e3', '"x\\n"', 'null', '{"a":[1,{"b":false}]}', ' [ 1 ] '].forEach((text) => {
      expect(errorIndex(text)).toBe(-1);
      expect(() => JSON.parse(text)).not.toThrow();
    });
  });
});

describe('what the panel says', () => {
  const base = { onlyOmni: true, errorsOnly: false, slowMs: 0, query: '', masked: false, visits: [], repeatIds: new Set() };
  const ok = { ...recordFor(auraText()), omni: true, output: { fine: true }, httpStatus: 200, duration: 40 };

  it('names the filter that hides a call, and nothing when none does', () => {
    expect(hiddenBy(ok, base)).toBe('');
    expect(hiddenBy(ok, { ...base, errorsOnly: true })).toBe('Failed only');
    expect(hiddenBy({ ...ok, omni: false }, base)).toBe('All Apex calls being off');
    expect(hiddenBy(ok, { ...base, query: 'slow:5000' })).toBe('slow:');
    expect(hiddenBy(ok, { ...base, query: 'step:"Order Review"' })).toBe('step:');
    expect(hiddenBy(ok, { ...base, query: 'zzzz' })).toBe('the filter box');
    expect(hiddenBy(ok, { ...base, query: 'in:nothing-like-this' })).toBe('in:');
    expect(hiddenBy(ok, { ...base, errorsOnly: true, query: 'zzzz' })).toBe('Failed only and the filter box');
    expect(hiddenWords('Failed only')).toBe('The call you sent is listed but hidden by Failed only');
    expect(hiddenToastWords('slow:')).toBe('Listed, hidden by slow:');
  });

  it('words the landing of a re-run', () => {
    expect(landedWords({ status: 200, took: '640 ms' })).toBe('Listed: HTTP 200, 640 ms');
    expect(landedWords({ status: 500, took: '1.2 s', failed: true })).toBe('Listed: HTTP 500, 1.2 s · marked as failed');
    expect(landedWords({ status: 200, truncated: true })).toBe('Listed: HTTP 200, answer cut at 2 MB');
  });

  it('adds the Mask values wording to the toasts only while Mask values is on', () => {
    expect(sentWords(false)).toBe('Sent · waiting for the answer…');
    expect(sentWords(true)).toBe(`Sent · waiting for the answer… ${MASK_WORDS}.`);
    expect(confirmWords('Account_Fetch', false)).toBe('Send Account_Fetch again as it was?');
    expect(confirmWords('Account_Fetch', true)).toBe(`Send Account_Fetch again as it was? ${MASK_WORDS}.`);
    expect(GAVE_UP_WORDS).toBe('No answer after 60 s; the call may still be running on the server. The row will appear if it answers.');
  });

  it('says what Close does, before and after a send', () => {
    expect(closeTitle('idle')).toMatch(/without sending; your edits are kept/);
    expect(closeTitle('sent')).toBe('Close the form; a call already sent still lands in the list (Esc)');
    expect(closeTitle('gaveup')).toBe(closeTitle('sending'));
  });

  it('keeps a draft under the call it re-runs, and none for a New test call', () => {
    expect(draftKey({ rerun: { id: 7, time: 1 }, kind: 'IP' })).toBe('rerun:7');
    expect(draftKey({ rerun: null, kind: 'DR' })).toBe('');
  });
});

/* ------------------------------------------------ debug runs */

describe('re-running a designer preview', () => {
  const VF = 'https://demo.example.invalid/apexremote';
  const ORIGIN = 'https://demo.example.invalid';

  function preview(call) {
    const body = JSON.stringify(call);
    const actions = parseRequest('vfremote', body, VF);
    const record = buildActionRecord(1, 'vfremote', actions[0], 0, null, { url: VF, startedAt: new Date('2026-03-02T09:15:00Z'), durationMs: 5, httpStatus: 200, bodySize: 1 });
    const store = rememberEnvelope({}, envelopeOf('vfremote', { url: VF, method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: body } }, actions));
    return { record, store };
  }

  it('offers a re-run for a preview and for no other remoting call', () => {
    expect(canRerun(preview(ipPreviewCall()).record)).toBe(true);
    expect(canRerun(preview(drPreviewCall()).record)).toBe(true);
    const [plain] = parseRequest('vfremote', JSON.stringify([{ tid: 1, action: 'C', method: 'm', data: ['a', 'b', {}, {}] }]));
    const record = buildActionRecord(2, 'vfremote', plain, 0, null, { url: VF, startedAt: new Date(0) });
    expect(record.omni).toBe(true);
    expect(canRerun(record)).toBe(false);
  });

  it('makes a draft that knows it is a debug run, with no name to fill in', () => {
    const { record, store } = preview(ipPreviewCall());
    const draft = draftFromEntry(record);
    expect(draft).toMatchObject({ kind: 'IP', debug: 'ip', recordId: IP_ID, wireKind: 'vfremote', name: 'IP preview' });
    expect(JSON.parse(draft.input)).toEqual({ ContextId: ACCOUNT_ID });
    expect(formTitle(draft)).toBe('Debug run of IP preview');
    expect(formTitle({ ...draftFromEntry(preview(drPreviewCall()).record) })).toBe('Debug run of DRDemoGetAccount');
    expect(formTitle({ kind: 'IP', name: 'Account_Fetch' })).toBe('Test call');
    const made = requestOfDraft({ ...draft, input: '{"ContextId":"001000000000009AAA"}' }, store, ORIGIN, 'tok');
    expect(made.ok).toBe(true);
    expect(made.kind).toBe('vfremote');
    expect(made.request.headers[TEST_HEADER]).toBe('tok');
    const sent = JSON.parse(made.request.body);
    expect(sent.data[1]).toBe('{"ContextId":"001000000000009AAA"}');
    expect(sent.data[2].isDebug).toBe(true);
    expect(sent.tid).toBeGreaterThan(12);
  });

  it('sends a DataRaptor preview with the edited input', () => {
    const { record, store } = preview(drPreviewCall());
    const made = requestOfDraft({ ...draftFromEntry(record), input: '{"accountId":"x"}' }, store, ORIGIN, 'tok');
    expect(made.ok).toBe(true);
    expect(JSON.parse(made.request.body).data[0]).toMatchObject({ bundleName: 'DRDemoGetAccount', objectList: '{"accountId":"x"}', debug: true });
  });

  it('needs a preview of its own kind captured, and the origin of the page', () => {
    const { record } = preview(ipPreviewCall());
    expect(requestOfDraft(draftFromEntry(record), envelopes(), 'https://x.my.site.com', 't').ok).toBe(false);
    expect(modelFor(draftFromEntry(record), envelopes(), 'https://x.my.site.com').reason).toBe('no-kind');
    expect(requestOfDraft(draftFromEntry(record), preview(ipPreviewCall()).store, 'https://other.example.invalid', 't').ok).toBe(false);
  });

  it('is told by the signature the captured call will have, and by its head line', () => {
    const { record } = preview(ipPreviewCall());
    const draft = draftFromEntry(record);
    expect(signatureOfDraft(draft)).toBe(record.signature);
    expect(headLine(draft, clock)).toBe(`Integration Procedure preview Id ${IP_ID} · re-run of ${clock(draft.rerun.time)}`);
    expect(headLine(draftFromEntry(preview(drPreviewCall()).record), clock)).toMatch(/^Data Mapper preview · re-run of /);
  });

  it('takes inputs from calls of the same debug flavour only', () => {
    const ip = preview(ipPreviewCall()).record;
    const dr = preview(drPreviewCall()).record;
    const aura = recordFor(auraText('Account_Fetch'), 5);
    expect(pickableCalls([aura, dr, ip], draftFromEntry(ip)).map((entry) => entry.id)).toEqual([ip.id]);
  });

  it('keeps New test call to Aura, LWR and REST models', () => {
    const { record, store } = preview(ipPreviewCall());
    const fresh = draftNew('IP', { entries: [record], envelopes: store, origin: ORIGIN, namespace: 'omnistudio' });
    expect(fresh.debug).toBeUndefined();
    expect(fresh.guess).toBe(true);
    expect(fresh.wireKind).toBe('');
  });
});

describe('newCallButton', () => {
  it('stays in view with Allow test calls off, out of use and saying where the setting is', () => {
    expect(newCallButton({ allowed: false, session: false }, 't')).toEqual({
      visible: true, disabled: true, title: 'Test calls are off. Turn on Allow test calls in Settings.'
    });
  });

  it('is usable with it on, and out of use in a loaded session whatever the setting', () => {
    expect(newCallButton({ allowed: true, session: false }, 'Run it')).toEqual({ visible: true, disabled: false, title: 'Run it' });
    expect(newCallButton({ allowed: false, session: true }, 'x').title).toBe('Not available while a bundle is open');
    expect(newCallButton({ allowed: true, session: true }, 'x').disabled).toBe(true);
  });
});
