'use strict';

/* Test calls, the decisions: may the panel send now, what the form starts from,
 * whether what was typed is JSON, which request a draft turns into, and how a
 * test call is told apart when its answer is captured. The wire side (the
 * request itself) is call-wire.js.
 *
 * Pure: no DOM, no chrome.*, no clock (callers hand in the time). */

import { classify, nameInfo, label, matchesFilter, IP_PREVIEW } from '../shared/actions-model.js';
import { parseQuery } from '../shared/actions-search.js';
import { buildRequest, replayHeaders, envelopeFor, testTokenOf, sameOrigin } from './call-wire.js';

/* How long after a send the next call with the same signature is taken for
 * its answer, when the request did not carry the test header. */
export const MATCH_WINDOW_MS = 30000;

/* How long the page is asked for the answer (Targets.send polls for this long)
 * before the panel stops waiting. The call itself may still be running. */
export const WAIT_LIMIT_MS = 60000;

/* How long a send that was given up on is still remembered, so that a late
 * answer arriving in the network stream is listed as the test it was. */
export const GAVE_UP_KEEP_MS = 10 * 60 * 1000;

/* What the Mask values chip, the confirm toast and the sent toast say. */
export const MASK_WORDS = 'Mask values does not apply to what you send';

export const GAVE_UP_WORDS = 'No answer after 60 s; the call may still be running on the server. The row will appear if it answers.';

/* The longest answer the page hands back (hostSend caps it at this). */
export const ANSWER_LIMIT_WORDS = 'answer cut at 2 MB';

export const NOT_IN_SESSION = 'Not available while a bundle is open';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ------------------------------------------------------ may it send */

/* One decision, used by every entry point and by Send itself:
 * { ok, reason }. reason is '' when ok, else one of 'off' (the setting is
 * off), 'session' (a debug bundle is loaded), 'paused' (Recording is paused,
 * and a call sent now would have its answer thrown away), 'no-page' (no page to
 * send through), 'no-model' (no OmniStudio call was captured to model the
 * request on), 'no-kind' (a re-run needs a captured request of its own kind).
 * state: { allowed, session, recording, live, envelope, kind }; the last three
 * are only asked about when `sending` is true (the form needs them, a menu
 * entry does not). */
export function sendGate({ allowed, session, recording = true, live = true, envelope = true, kind = true } = {}, sending = false) {
  if (!allowed) return { ok: false, reason: 'off' };
  if (session) return { ok: false, reason: 'session' };
  if (!sending) return { ok: true, reason: '' };
  if (!recording) return { ok: false, reason: 'paused' };
  if (!live) return { ok: false, reason: 'no-page' };
  if (!envelope) return { ok: false, reason: 'no-model' };
  if (!kind) return { ok: false, reason: 'no-kind' };
  return { ok: true, reason: '' };
}

const GATE_WORDS = {
  off: 'Test calls are off. Turn on Allow test calls in Settings.',
  session: NOT_IN_SESSION,
  paused: 'Recording is paused',
  'no-page': 'There is no page to send through',
  'no-model': 'No OmniStudio call has been captured on this page yet, so there is no request to copy. Run a step of the script, then try again.',
  'no-kind': 'No model request of this kind was captured yet, so this call cannot be re-run. Run a step of the script that makes a call of this kind, then try again.'
};

/* The sentence for a gate reason. `origin` is the origin the send would go
 * to: when it is known, a missing model is said to be missing for it (a script
 * in a frame of another origin has its own calls). */
export function gateWords(reason, origin = '') {
  if (reason === 'no-model' && origin) {
    return `No OmniStudio call from ${origin} has been captured yet, so there is no request to copy. Run a step of the script, then try again.`;
  }
  return GATE_WORDS[reason] || '';
}

/* The captured request a draft is modelled on: { envelope, reason }, reason ''
 * when there is one. A re-run needs a request of its own kind (an LWR call
 * cannot be rebuilt from an Aura request); New test call may use any kind there is. */
export function modelFor(draft, envelopes, origin) {
  const envelope = envelopeFor(envelopes, origin, draft.wireKind);
  if (!envelope) return { envelope: null, reason: 'no-model' };
  if (draft.rerun && envelope.kind !== draft.wireKind) return { envelope: null, reason: 'no-kind' };
  return { envelope, reason: '' };
}

/* What the form's status says about a send: busy while it is going out or
 * waiting for its answer, locked once the panel gave up waiting (the call may
 * still be running, so it is not sent again until the form is closed or
 * edited), bad for both failures. */
export function formPhase(status) {
  return {
    busy: status === 'sending' || status === 'sent',
    locked: status === 'gaveup',
    bad: status === 'failed' || status === 'gaveup'
  };
}

/* How an entry point looks: { visible, disabled, title }. Off: not shown at
 * all. In a loaded session: shown but out of use, and says why. */
export function entryPoint({ allowed, session, paused = false }, title) {
  if (!allowed) return { visible: false, disabled: true, title };
  if (session) return { visible: true, disabled: true, title: NOT_IN_SESSION };
  if (paused) return { visible: true, disabled: true, title: gateWords('paused') };
  return { visible: true, disabled: false, title };
}

/* The New test call… button of the toolbar. Unlike a menu item it stays in
 * view with Allow test calls off (where its gate is open), out of use and saying where the
 * setting is, so the button is findable before the setting is. */
export function newCallButton({ allowed, session }, title) {
  if (!allowed && !session) return { visible: true, disabled: true, title: gateWords('off') };
  return entryPoint({ allowed: true, session }, title);
}

/* A call can be run again when it is an Integration Procedure or a Data Mapper
 * or other remote call of OmniStudio's that travelled through a kind of
 * endpoint a test call can go to. Visualforce remoting carries every kind of
 * Apex call; only a designer preview (a debug run) can be sent again. */
export function canRerun(entry) {
  if (!entry || entry.chain || !entry.omni) return false;
  // The request is the designer's (action.debug), not just an answer that holds a debug run.
  if (entry.kind === 'vfremote') return !!(entry.action && entry.action.debug);
  return ['aura', 'lwr', 'rest'].includes(entry.kind);
}

/* Whether the draft is a debug run: a designer preview sent again. It has no
 * name field (the request names the procedure by its Id, a DataRaptor in its
 * options) and no wire to edit. */
/* Said at the top of the form of a debug run. */
export const DEBUG_NOTE = 'A designer preview, sent again with the remoting context the designer page was issued: the designer has to stay open in this tab. The answer opens on its Debug tab.';

export const isDebugDraft = (draft) => !!draft && !!draft.debug;

/* ------------------------------------------------------ typed JSON */

/* Where a parse error is: a line and column of the text. */
function placeOf(text, position) {
  const before = text.slice(0, Math.min(position, text.length));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/* The index of the first character that makes `text` not JSON, found by
 * reading it as the grammar says (engines differ in whether their message
 * names a position at all). text.length when it ends too early. */
export function errorIndex(text) {
  let at = 0;
  const skip = () => { while (at < text.length && ' \t\r\n'.includes(text[at])) at += 1; };
  const fail = () => { throw at; };
  const literal = (word) => { for (const ch of word) { if (text[at] !== ch) fail(); at += 1; } };
  const string = () => {
    at += 1;
    while (at < text.length && text[at] !== '"') {
      if (text[at] === '\\') {
        at += 1;
        if (text[at] === 'u') {
          for (let i = 1; i <= 4; i++) if (!/[0-9a-fA-F]/.test(text[at + i] || '')) { at += i; fail(); }
          at += 4;
        } else if (!'"\\/bfnrt'.includes(text[at] || '\u0000')) fail();
      } else if (text.charCodeAt(at) < 32) fail();
      at += 1;
    }
    if (text[at] !== '"') fail();
    at += 1;
  };
  const number = () => {
    const hit = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(at));
    if (!hit) { if (text[at] === '-') at += 1; fail(); }
    at += hit[0].length;
  };
  const value = () => {
    skip();
    const ch = text[at];
    if (ch === '{') {
      at += 1; skip();
      if (text[at] === '}') { at += 1; return; }
      for (;;) {
        skip();
        if (text[at] !== '"') fail();
        string(); skip();
        if (text[at] !== ':') fail();
        at += 1; value(); skip();
        if (text[at] === ',') { at += 1; continue; }
        if (text[at] === '}') { at += 1; return; }
        fail();
      }
    } else if (ch === '[') {
      at += 1; skip();
      if (text[at] === ']') { at += 1; return; }
      for (;;) {
        value(); skip();
        if (text[at] === ',') { at += 1; continue; }
        if (text[at] === ']') { at += 1; return; }
        fail();
      }
    } else if (ch === '"') string();
    else if (ch === 't') literal('true');
    else if (ch === 'f') literal('false');
    else if (ch === 'n') literal('null');
    else number();
  };
  try {
    value(); skip();
    if (at < text.length) fail();
    return -1;
  } catch (index) {
    return typeof index === 'number' ? index : text.length;
  }
}

/* What the text in an Input or Options box means:
 * { ok: true, value, empty } (empty text is `{}`), or
 * { ok: false, error: 'message', line, column }. */
export function parseJsonText(text) {
  const source = String(text === undefined || text === null ? '' : text);
  if (!source.trim()) return { ok: true, value: {}, empty: true };
  try {
    return { ok: true, value: JSON.parse(source), empty: false };
  } catch {
    const index = errorIndex(source);
    const place = placeOf(source, index < 0 ? 0 : index);
    const end = index >= source.length;
    const plain = end ? 'Unexpected end of text' : `Unexpected ${JSON.stringify(source[index])}`;
    return { ok: false, error: plain, line: place.line, column: place.column };
  }
}

/* The sentence under a box that does not parse. */
export function errorLine(parsed) {
  return `${parsed.error} (line ${parsed.line}, column ${parsed.column})`;
}

/* The text pretty-printed, or null when it is not JSON. */
export function formatJsonText(text) {
  const parsed = parseJsonText(text);
  if (!parsed.ok) return null;
  return parsed.empty ? '{}' : JSON.stringify(parsed.value, null, 2);
}

/* A value as the text a box starts with. */
export function textOfValue(value) {
  return value === undefined || value === null || value === '' ? '{}' : JSON.stringify(value, null, 2);
}

/* "Options (3 keys)", "Options (empty)", "Options (not valid)"; a REST call
 * does not carry them, and the summary says so. */
export function optionsSummary(text, rest = false) {
  const parsed = parseJsonText(text);
  const tail = rest ? ', not sent' : '';
  if (!parsed.ok) return `Options (not valid JSON${tail})`;
  if (!isObject(parsed.value)) return `Options (1 value${tail})`;
  const count = Object.keys(parsed.value).length;
  if (!count) return `Options (empty${tail})`;
  return `Options (${count} ${count === 1 ? 'key' : 'keys'}${tail})`;
}

/* A REST call's body is the input alone: Options has no place in it. */
export const isRest = (draft) => !!draft && draft.wireKind === 'rest';

export const REST_OPTIONS_NOTE = 'A REST call carries only the input: the options are not sent.';

/* ------------------------------------------------------ the draft */

export const KIND_WORDS = {
  IP: 'Integration Procedure',
  DR: 'Data Mapper',
  RA: 'Remote Action',
  APEX: 'Apex call'
};

/* The kinds New test call offers, and the label of the name field of each. */
export const NEW_KINDS = ['IP', 'DR'];
export const NAME_LABEL = {
  IP: 'Integration Procedure (Type_SubType)',
  DR: 'Data Mapper bundle',
  RA: 'Remote Action',
  APEX: 'Apex call'
};

const hasName = (kind) => kind === 'IP' || kind === 'DR';

/* A draft: what the form edits.
 *   kind        IP, DR, RA or APEX
 *   name        the procedure key or bundle (IP, DR); '' for the others
 *   input, options  the text of the boxes
 *   remoteClass, remoteMethod, apexClass, apexMethod, namespace, url   the wire
 *   rerun       { id, time (ms) } of the call it re-runs, or null
 *   guess       true while the wire was guessed, not copied from a call
 *   from        the captured call the wire was copied from (its id) or null
 *   urlEdited   true once the Endpoint field was edited by hand; until then a
 *               REST call's address follows the name, never the call it came from
 */
export function draftFromEntry(entry) {
  const action = entry.action || {};
  // A preview's name carries the record Id; the form keeps the plain label and the Id in recordId.
  const name = hasName(entry.type) ? (entry.nameFrom === 'preview' ? IP_PREVIEW : entry.name) : '';
  return {
    kind: entry.type,
    name,
    input: textOfValue(action.input),
    options: textOfValue(action.options),
    remoteClass: action.remoteClass || '',
    remoteMethod: action.remoteMethod || '',
    apexClass: action.apexClass || '',
    apexMethod: action.apexMethod || '',
    namespace: typeof action.namespace === 'string' ? action.namespace : '',
    url: entry.url || '',
    wireKind: entry.kind,
    nameFrom: entry.nameFrom || '',
    rerun: { id: entry.id, time: entry.time instanceof Date ? entry.time.getTime() : Number(entry.time) },
    guess: false,
    urlEdited: false,
    from: entry.id,
    rawRequest: action.rawRequest,
    ...(action.debug ? { debug: action.debug, recordId: typeof action.recordId === 'string' ? action.recordId : '' } : {})
  };
}

/* The endpoint kind of an address, or ''. */
function wireKindOf(url) {
  return classify(url, 'POST') || '';
}

/* The package classes a best guess is made of. */
function guessClasses(kind, namespace) {
  const ns = namespace || 'omnistudio';
  return kind === 'DR'
    ? { remoteClass: `${ns}.DefaultDROmniScriptIntegration`, remoteMethod: 'invokeInboundDR' }
    : { remoteClass: `${ns}.IntegrationProcedureService`, remoteMethod: '' };
}

/* A New test call: it starts from the most recent captured call of the kind (its
 * class, method, options shape and endpoint) with the name replaced; with none
 * captured, from a template made from the namespace of the org's package and
 * the shape of the latest envelope's endpoint. `entries` are the captured
 * calls, `envelopes` the store of call-wire, `origin` the page's origin. */
export function draftNew(kind, { entries = [], envelopes = {}, origin = '', namespace = '' } = {}) {
  const wanted = hasName(kind) ? kind : 'IP';
  const last = [...entries].reverse().find((entry) => entry.type === wanted && entry.omni && ['aura', 'lwr', 'rest'].includes(entry.kind));
  if (last) {
    const draft = draftFromEntry(last);
    return {
      ...draft, name: '', input: '{}', options: draft.options, rerun: null,
      remoteMethod: wanted === 'IP' ? '' : draft.remoteMethod, from: last.id
    };
  }
  const envelope = envelopeFor(envelopes, origin, 'aura');
  const classes = guessClasses(wanted, namespace);
  return {
    kind: wanted,
    name: '',
    input: '{}',
    options: '{}',
    nameFrom: '',
    remoteClass: classes.remoteClass,
    remoteMethod: classes.remoteMethod,
    apexClass: '', apexMethod: '',
    namespace: '',
    url: envelope ? envelope.url : '',
    wireKind: envelope ? envelope.kind : '',
    rerun: null,
    guess: true,
    urlEdited: false,
    from: null,
    rawRequest: undefined
  };
}

/* The key of `source` that holds a name, or ''. */
function nameKey(source, keys) {
  if (!isObject(source)) return '';
  return Object.keys(source).find((key) => keys.includes(key.toLowerCase()) && typeof source[key] === 'string' && source[key]) || '';
}

const DR_KEYS = ['bundle', 'bundlename', 'dataraptorname', 'drname', 'drbundle', 'integrationprocedurekey', 'ipkey', 'procedurekey', 'integrationprocedure'];
const DR_INPUT_KEYS = ['bundlename', 'bundle', 'drbundle'];

/* The draft with a new name. An Integration Procedure's name is its key, kept
 * in the draft. A Data Mapper's travels in the options, or in the input when
 * that is where the call had it: the key that held the old name takes the new
 * one (bundleName when there was none). A box that is not valid JSON is left
 * for the user to mend. */
export function applyName(draft, name) {
  if (draft.kind !== 'DR') return { ...draft, name };
  const where = draft.nameFrom === 'input' ? 'input' : 'options';
  const parsed = parseJsonText(draft[where]);
  if (!parsed.ok) return { ...draft, name };
  const value = isObject(parsed.value) ? { ...parsed.value } : {};
  value[nameKey(value, where === 'input' ? DR_INPUT_KEYS : DR_KEYS) || 'bundleName'] = name;
  return { ...draft, name, [where]: JSON.stringify(value, null, 2) };
}

/* The wire fields of the draft as the action a request is built for. */
export function actionOfDraft(draft) {
  const named = draft.kind === 'IP' && draft.name && !draft.debug ? { remoteMethod: draft.name } : {};
  return {
    ...(draft.debug ? { debug: draft.debug, recordId: draft.recordId || '' } : {}),
    remoteClass: draft.remoteClass, remoteMethod: draft.remoteMethod,
    apexClass: draft.apexClass, apexMethod: draft.apexMethod,
    namespace: draft.namespace,
    rawRequest: draft.rawRequest,
    ...named
  };
}

/* The draft with its Endpoint typed over. */
export function applyUrl(draft, url) {
  return { ...draft, url, urlEdited: true };
}

/* The address to force on the request, or undefined to let the envelope say.
 * A REST call's address holds the procedure key, so it follows the name unless
 * the Endpoint field was edited by hand; the address of the call it was copied
 * from would send a renamed draft to the old procedure. */
function addressOf(draft, envelope) {
  if (!draft.url || wireKindOf(draft.url) !== envelope.kind) return undefined;
  if (envelope.kind === 'rest' && !draft.urlEdited) return undefined;
  return draft.url;
}

/* What a draft sends: { ok: true, request: { url, method, headers, body } } or
 * { ok: false, why }. `tokenValue` is the token of the test header. A draft
 * with a name field needs the name. The request goes to `origin` and nowhere
 * else: the page's session and the test header are never sent across origins. */
export function requestOfDraft(draft, envelopes, origin, tokenValue) {
  const input = parseJsonText(draft.input);
  if (!input.ok) return { ok: false, why: `Input: ${errorLine(input)}` };
  const options = parseJsonText(draft.options);
  if (!options.ok) return { ok: false, why: `Options: ${errorLine(options)}` };
  if (hasName(draft.kind) && !isDebugDraft(draft) && !draft.name.trim()) return { ok: false, why: `${NAME_LABEL[draft.kind]} is empty` };
  const model = modelFor(draft, envelopes, origin);
  if (!model.envelope) return { ok: false, why: gateWords(model.reason, origin) };
  const { envelope } = model;
  const action = actionOfDraft({ ...draft, name: draft.name.trim() });
  const built = buildRequest(envelope, action, { input: input.value, options: options.value, url: addressOf(draft, envelope) });
  if (!built) return { ok: false, why: 'The captured request could not be rewritten' };
  if (!sameOrigin(built.url, origin)) return { ok: false, why: `The endpoint is not on ${origin}: a test call goes to the org of this script only` };
  return { ok: true, request: { ...built, headers: replayHeaders(built.headers, tokenValue) }, kind: envelope.kind };
}

/* The first line of the form: the kind and the name, and what it re-runs. */
export function headLine(draft, clock) {
  if (isDebugDraft(draft)) {
    const target = draft.debug === 'ip' ? (draft.recordId ? `Id ${draft.recordId}` : 'no Id') : '';
    const parts = [`${KIND_WORDS[draft.kind]} preview${target ? ` ${target}` : ''}`];
    if (draft.rerun) parts.push(`re-run of ${clock(draft.rerun.time)}`);
    return parts.join(' · ');
  }
  const kind = KIND_WORDS[draft.kind] || KIND_WORDS.RA;
  const name = hasName(draft.kind)
    ? draft.name.trim()
    : [draft.remoteClass || draft.apexClass, draft.remoteMethod || draft.apexMethod].filter(Boolean).join('.');
  const parts = [name ? `${kind} ${name}` : `${kind}, no name yet`];
  if (draft.rerun) parts.push(`re-run of ${clock(draft.rerun.time)}`);
  return parts.join(' · ');
}

/* The title of the form: "Test call", or, for a designer preview sent again,
 * "Debug run of <name>" ("IP preview" when the request does not name it). */
export function formTitle(draft) {
  if (!isDebugDraft(draft)) return 'Test call';
  return `Debug run of ${(draft.name || '').trim() || (draft.debug === 'dr' ? 'DR preview' : 'IP preview')}`;
}

/* The captured calls a draft can take its input from: calls of the same kind,
 * newest first, at most `limit`. */
export function pickableCalls(entries, draft, limit = 30) {
  return [...entries].reverse()
    .filter((entry) => entry.type === draft.kind && !entry.chain && (!draft.debug || entry.debug === draft.debug)).slice(0, limit);
}

/* ------------------------------------------------------ telling a test call */

/* A token for a new send: the sequence number and some randomness. */
export function newToken(seq, random) {
  return `t${seq}-${Math.floor(random * 1e9).toString(36)}`;
}

/* The pending sends: [{ token, rerunOf, rerunTime, signature, sentAt }]. A
 * captured call is a test call when its request carried the test header (the
 * token names the send), or else when it is the next call with the same
 * signature within MATCH_WINDOW_MS of a send nothing has claimed. Returns
 * { test: { token, rerunOf, rerunTime } | null, pending: the sends left }. */
export function resolveTest(headers, signature, startedMs, pending) {
  const token = testTokenOf(headers);
  if (token) {
    const send = pending.find((candidate) => candidate.token === token);
    const test = { token, rerunOf: send ? send.rerunOf : null, rerunTime: send ? send.rerunTime : null };
    return { test, pending: pending.filter((candidate) => candidate !== send) };
  }
  const near = pending.find((candidate) => candidate.signature === signature &&
    startedMs >= candidate.sentAt && startedMs - candidate.sentAt <= MATCH_WINDOW_MS);
  if (!near) return { test: null, pending };
  return {
    test: { token: near.token, rerunOf: near.rerunOf, rerunTime: near.rerunTime },
    pending: pending.filter((candidate) => candidate !== near)
  };
}

/* Sends that can no longer be matched are forgotten: after a minute, or, for a
 * send the panel gave up waiting for, after GAVE_UP_KEEP_MS. */
export function dropStale(pending, nowMs) {
  return pending.filter((candidate) => nowMs - candidate.sentAt <= (candidate.gaveUp ? GAVE_UP_KEEP_MS : MATCH_WINDOW_MS * 2));
}

/* The pending sends with `token` marked as given up on. */
export function markGaveUp(pending, token) {
  return pending.map((candidate) => (candidate.token === token ? { ...candidate, gaveUp: true } : candidate));
}

/* The signature a captured call will have for a draft, to match its answer. */
export function signatureOfDraft(draft) {
  if (isDebugDraft(draft)) return label({ apexClass: draft.apexClass, apexMethod: draft.apexMethod, debug: draft.debug });
  if (draft.remoteClass || draft.remoteMethod || draft.kind === 'IP' || draft.kind === 'DR') {
    return label({ remoteClass: draft.remoteClass, remoteMethod: draft.kind === 'IP' && draft.name ? draft.name.trim() : draft.remoteMethod });
  }
  return label({ apexClass: draft.apexClass, apexMethod: draft.apexMethod });
}

/* ------------------------------------------------------ the tags */

export const TEST_TAG_TITLE = 'A call sent from the panel (Calls, Test call), not one the page made.';

/* The tags of a test call's row: [{ label, title, tone, select? }]; select is
 * the id of the call a re-run was of, when that call is still in the list.
 * short: the list's row says just "re-run" (the time is in its tooltip) so the
 * narrow tag cell has room for the tags beside it; the detail head keeps the time. */
export function testTags(entry, { clock, byId, short = false }) {
  const test = entry && entry.test;
  if (!test) return [];
  const tags = [{ label: 'test', title: TEST_TAG_TITLE, tone: 'info' }];
  if (test.truncated) {
    tags.push({ label: ANSWER_LIMIT_WORDS, title: 'The server\'s answer was longer than 2 MB, so the panel did not keep it. The Network tab of DevTools has the whole answer.', tone: 'warn' });
  }
  if (test.rerunTime) {
    const original = test.rerunOf !== null && test.rerunOf !== undefined && byId ? byId.get(test.rerunOf) : null;
    const at = clock(test.rerunTime);
    const gone = original ? '' : ' (it is no longer in the list)';
    tags.push({
      label: short ? 're-run' : `re-run of ${at}`,
      title: short
        ? `Re-run of the call at ${at}.${original ? ' Click to select that call.' : gone}`
        : `Sent again from the call started at ${at}.${original ? ' Click to select that call.' : gone}`,
      tone: 'info',
      select: original ? original.id : null
    });
  }
  return tags;
}

/* A file's row read back (exportEntries writes `test`: {} or { rerunOf: time }). */
export function importedTest(row) {
  if (!isObject(row) || !isObject(row.test)) return undefined;
  const at = row.test.rerunOf ? new Date(row.test.rerunOf).getTime() : NaN;
  return { token: '', rerunOf: null, rerunTime: Number.isFinite(at) ? at : null };
}

/* Kept for the form: the name of a call as the draft wants it. */
export function nameOfEntry(entry) {
  if (!hasName(entry.type)) return '';
  return nameInfo(entry.action || {}).name || entry.name;
}

/* ------------------------------------------------------ what the panel says */

/* Which filter keeps a call out of the list: '' when none does, else the
 * name of the first filter that, taken away alone, lets the call through
 * ("Failed only", "All Apex calls being off", "slow:", "step:", "url:", "in:", "repeat:",
 * "the filter box"); when only several together hide it, the names joined.
 * `opts` are the arguments of matchesFilter. */
export function hiddenBy(entry, opts) {
  if (!entry || matchesFilter(entry, opts)) return '';
  const parsed = opts.parsed || parseQuery(opts.query);
  const none = { ...parseQuery(''), slow: null };
  /* Each filter as a change to the options: `off` takes it away from the
   * options in force, `alone` keeps only it. */
  const part = (name, active, key, empty) => ({
    name, active,
    off: key === 'onlyOmni' || key === 'errorsOnly' ? { [key]: false } : { parsed: { ...parsed, [key]: empty } },
    alone: key === 'onlyOmni' || key === 'errorsOnly'
      ? { onlyOmni: key === 'onlyOmni', errorsOnly: key === 'errorsOnly', parsed: none }
      : { onlyOmni: false, errorsOnly: false, parsed: { ...none, [key]: parsed[key] } }
  });
  const filters = [
    part('All Apex calls being off', !!opts.onlyOmni, 'onlyOmni'),
    part('Failed only', !!opts.errorsOnly, 'errorsOnly'),
    part('slow:', parsed.slow !== null, 'slow', null),
    part('step:', !!parsed.step, 'step', ''),
    part('url:', !!parsed.url, 'url', ''),
    part('in:', !!parsed.inPayload, 'inPayload', ''),
    part('repeat:', !!parsed.repeats, 'repeats', false),
    part('the filter box', !!parsed.text, 'text', '')
  ].filter((filter) => filter.active);
  const fits = (change) => matchesFilter(entry, { ...opts, parsed, ...change });
  const single = filters.find((filter) => fits(filter.off));
  if (single) return single.name;
  const culprits = filters.filter((filter) => !fits(filter.alone));
  return (culprits.length ? culprits : filters).map((filter) => filter.name).join(' and ') || 'the filters';
}

/* The line above the list for a call that was sent and is listed, but kept out
 * of sight by a filter. */
export const hiddenWords = (by) => `The call you sent is listed but hidden by ${by}`;

/* The toast for the same, from Re-run as it was. */
export const hiddenToastWords = (by) => `Listed, hidden by ${by}`;

/* The toast when a re-run's answer has landed in the list. `took` is the time
 * already written the way the list writes it. */
export function landedWords({ status, took = '', failed = false, truncated = false }) {
  const parts = [status ? `HTTP ${status}` : 'no HTTP status'];
  if (took) parts.push(took);
  if (truncated) parts.push(ANSWER_LIMIT_WORDS);
  return `Listed: ${parts.join(', ')}${failed ? ' · marked as failed' : ''}`;
}

/* The toast after Re-run as it was sent a call. */
export const sentWords = (masked) => `Sent · waiting for the answer…${masked ? ` ${MASK_WORDS}.` : ''}`;

/* The question before Re-run as it was sends anything. */
export const confirmWords = (name, masked) => `Send ${name} again as it was?${masked ? ` ${MASK_WORDS}.` : ''}`;

/* What the Close button of the form says it does. */
export function closeTitle(status) {
  return status === 'sending' || status === 'sent' || status === 'gaveup'
    ? 'Close the form; a call already sent still lands in the list (Esc)'
    : 'Close the form without sending; your edits are kept for this call (Esc)';
}

/* The key a draft is kept under while its form is closed: the call it re-runs.
 * A New test call has no original to come back to, so it is not kept ('') . */
export const draftKey = (draft) => (draft.rerun ? `rerun:${draft.rerun.id}` : '');
