'use strict';

/* Remote-action domain model: everything the Calls tab knows about
 * decoding OmniStudio traffic, with no DOM and no chrome.* in sight.
 *
 * A remote action reaches the server as an Aura ApexAction wrapping
 * { sClassName, sMethodName, input, options }, so one HTTP request can carry
 * several actions. This module turns a request/response pair into plain action
 * records, then answers the questions the view asks about them: what kind of
 * call is it, what should it be called, and did it fail.
 *
 * Everything is best-effort: when a shape is not recognised the caller still
 * gets the raw request and response back, so nothing is silently dropped.
 *
 * Pure by contract - same input, same output, no I/O, no clock, no globals.
 * That is what lets it run under Jest with no DOM and no chrome.* (see
 * test/core/actions-model.test.js, and the `no-restricted-globals` ESLint
 * rule for this directory). Keep it that way: anything that touches the DOM
 * belongs in src/ui/actions-tab.js or src/ui/actions/.
 */

import { parseQuery, matchesQuery, slowFilterMs, withoutSlow } from './actions-search.js';
import { timingParts, knownDuration } from './actions-timing.js';
import { MASK_STRING } from './mask.js';

export function classify(url, method) {
  if (String(method).toUpperCase() !== 'POST') return null;
  if (/\/aura(\?|$)/.test(url)) return 'aura';
  if (/webruntime\/api\/apex\/execute/.test(url)) return 'lwr';
  if (/\/apexremote/.test(url)) return 'vfremote';
  if (REST_IP.test(url)) return 'rest';
  return null;
}

/* The REST face of an Integration Procedure:
 * /services/apexrest/<namespace>/v1/integrationprocedure/<Type_SubType>. The
 * body is the procedure's input; the key is the last path segment. */
const REST_IP = /\/services\/apexrest\/(?:[^?#]*?\/)?integrationprocedure\/([^/?#]+)/i;
const REST_NAMESPACE = /\/services\/apexrest\/([^/?#]+)\//i;

function restTarget(url) {
  const hit = REST_IP.exec(url || '');
  if (!hit) return { key: '', namespace: '' };
  let key = hit[1];
  try { key = decodeURIComponent(key); } catch { /* keep the raw segment */ }
  const ns = REST_NAMESPACE.exec(url);
  const namespace = ns && !/^(v\d+|integrationprocedure)$/i.test(ns[1]) ? ns[1] : '';
  return { key, namespace };
}

/* How many times a JSON text may sit inside a JSON string. Some orgs hand
 * back options (and sometimes input or output) encoded twice: a string that
 * holds a string that holds the object. */
const MAX_JSON_NESTING = 3;

/* JSON text that starts like an object, an array or a quoted string. */
const looksLikeJson = (text) => text[0] === '{' || text[0] === '[' || text[0] === '"';

/* The object or array inside a string, however many times it was encoded
 * (up to MAX_JSON_NESTING); anything else, text that is not JSON, JSON that
 * is a number or a plain string, comes back as it was. */
export function safeParse(value) {
  let current = value;
  for (let level = 0; level < MAX_JSON_NESTING && typeof current === 'string'; level++) {
    const trimmed = current.trim();
    if (!trimmed || !looksLikeJson(trimmed)) break;
    try {
      current = JSON.parse(trimmed);
    } catch {
      break;
    }
  }
  return current !== null && typeof current === 'object' ? current : value;
}

/* What Aura and LWR share: the remote call is { sClassName, sMethodName,
 * input, options }, and a payload that is not wrapped that way is the input. */
function callParts(sent) {
  // Some orgs send the whole remote call as JSON text inside the parameters.
  const decoded = safeParse(sent);
  const isCall = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded);
  const remoteCall = isCall ? decoded : { input: decoded };
  return {
    remoteClass: remoteCall.sClassName || '',
    remoteMethod: remoteCall.sMethodName || '',
    input: safeParse(remoteCall.input !== undefined ? remoteCall.input : remoteCall),
    options: safeParse(remoteCall.options)
  };
}

const textOrEmpty = (value) => (typeof value === 'string' ? value : '');

function fromAuraAction(auraAction) {
  const params = auraAction.params || {};
  return {
    wireId: auraAction.id,
    descriptor: auraAction.descriptor || '',
    apexClass: params.classname || '',
    apexMethod: params.method || '',
    namespace: textOrEmpty(params.namespace),
    ...callParts(params.params || {}),
    rawRequest: auraAction
  };
}

/* ------------------------------------------- designer previews */

/* The designers' Preview runs an Integration Procedure or a DataRaptor with
 * debug information, over Visualforce remoting. Unlike the invokeMethod calls
 * the page makes, these are not positional [class, method, input, options]:
 *   testIntegrationProcedure  data = [recordId, inputText, options]
 *   drPreviewExecute          data = [{ bundleName, objectList (the input as
 *                                       text), interfaceType, ... }]
 * Matched on the method and the class suffix, whatever the namespace. */
const IP_PREVIEW_CLASS = /(^|\.)OmniScriptDesignerController$/i;
const DR_PREVIEW_CLASS = /(^|\.)DRMapperControllerFoundation$/i;

const namespaceOfClass = (className) => (className.includes('.') ? className.slice(0, className.lastIndexOf('.')) : '');

/* One remoting call read as a designer preview: { flavour: 'ip' | 'dr',
 * namespace, recordId, name, input, options }, or null when it is any other
 * call. The name of an Integration Procedure is '' (the request has only its
 * Id). Never throws. */
export function decodeDebugCall(call) {
  if (!isPlainObject(call) || typeof call.action !== 'string' || typeof call.method !== 'string') return null;
  const data = Array.isArray(call.data) ? call.data : [];
  const namespace = namespaceOfClass(call.action);
  if (call.method === 'testIntegrationProcedure' && IP_PREVIEW_CLASS.test(call.action)) {
    return {
      flavour: 'ip',
      namespace,
      recordId: typeof data[0] === 'string' ? data[0] : '',
      name: '',
      input: safeParse(data[1] === undefined ? {} : data[1]),
      options: safeParse(data[2])
    };
  }
  if (call.method === 'drPreviewExecute' && DR_PREVIEW_CLASS.test(call.action)) {
    const first = safeParse(data[0]);
    const request = isPlainObject(first) ? first : {};
    const { objectList, ...options } = request;
    return {
      flavour: 'dr',
      namespace,
      recordId: '',
      name: typeof request.bundleName === 'string' ? request.bundleName : '',
      input: safeParse(objectList === undefined ? {} : objectList),
      options
    };
  }
  return null;
}

/* The flavour of designer preview a "Class.method" signature names ('ip' or
 * 'dr'), or null: what tells a preview read back from a file from an
 * Integration Procedure that answered with a debug run, since both rows carry
 * debug. */
export function previewOfSignature(signature) {
  if (typeof signature !== 'string') return null;
  const at = signature.lastIndexOf('.');
  const owner = at > 0 ? signature.slice(0, at) : '';
  const method = signature.slice(at + 1);
  if (method === 'testIntegrationProcedure' && IP_PREVIEW_CLASS.test(owner)) return 'ip';
  if (method === 'drPreviewExecute' && DR_PREVIEW_CLASS.test(owner)) return 'dr';
  return null;
}

/* The action record of a designer preview. The class and method stay the
 * Apex ones (they make the signature); the name of a DataRaptor is its
 * remote method, as for any other Data Mapper call. */
function debugAction(call, debug) {
  return {
    wireId: call.tid !== undefined ? String(call.tid) : null,
    descriptor: 'apexremote',
    apexClass: call.action,
    apexMethod: call.method,
    namespace: debug.namespace,
    remoteClass: '',
    remoteMethod: debug.flavour === 'dr' ? debug.name : '',
    input: debug.input,
    options: debug.options,
    rawRequest: call,
    debug: debug.flavour,
    recordId: debug.recordId
  };
}

export function parseRequest(kind, text, url) {
  if (!text) return [];

  if (kind === 'aura') {
    let message = null;
    try {
      message = new URLSearchParams(text).get('message');
    } catch {
      /* fall through */
    }
    if (!message) return [];
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      return [];
    }
    return (parsed.actions || []).map(fromAuraAction);
  }

  if (kind === 'lwr') {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return [];
    }
    const remoteCall = (body.params && body.params.params) || body.params || {};
    return [{
      wireId: null,
      descriptor: 'webruntime/apex',
      apexClass: body.classname || '',
      apexMethod: body.method || '',
      namespace: textOrEmpty(body.namespace) || textOrEmpty(body.params && body.params.namespace),
      ...callParts(remoteCall),
      rawRequest: body
    }];
  }

  if (kind === 'rest') {
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return [];
    }
    const { key, namespace } = restTarget(url);
    return [{
      wireId: null,
      descriptor: 'apexrest/integrationprocedure',
      apexClass: '',
      apexMethod: '',
      namespace,
      remoteClass: `${namespace ? `${namespace}.` : ''}IntegrationProcedureService`,
      remoteMethod: key,
      input: body,
      options: undefined,
      rawRequest: body
    }];
  }

  if (kind === 'vfremote') {
    let calls;
    try {
      calls = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(calls)) calls = [calls];
    return calls.map((call) => {
      const debug = decodeDebugCall(call);
      if (debug) return debugAction(call, debug);
      const data = Array.isArray(call.data) ? call.data : [];
      return {
        wireId: call.tid !== undefined ? String(call.tid) : null,
        descriptor: 'apexremote',
        apexClass: call.action || '',
        apexMethod: call.method || '',
        remoteClass: typeof data[0] === 'string' ? data[0] : '',
        remoteMethod: typeof data[1] === 'string' ? data[1] : '',
        input: safeParse(data[2] !== undefined ? data[2] : data),
        options: safeParse(data[3]),
        rawRequest: call
      };
    });
  }

  return [];
}

export function parseResponse(text) {
  return decodeResponse(text).body;
}

/* An Aura failure comes wrapped as   *\/{"exceptionEvent":true,...}/*ERROR*\/
 * and a normal answer behind a   while(1);   guard. */
export function stripEnvelope(text) {
  const guarded = String(text).replace(/^\s*while\s*\(1\);?/, '').trim();
  const wrapped = /^\*\/([\s\S]*?)\/\*ERROR\*\/$/.exec(guarded);
  return wrapped ? wrapped[1].trim() : guarded;
}

const textOf = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

/* The failures an Aura answer announces about itself, with HTTP 200. */
function bodyProblem(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const event = body.event && typeof body.event === 'object' ? body.event : {};
  const descriptor = typeof event.descriptor === 'string' ? event.descriptor : '';
  if (/clientOutOfSync/i.test(descriptor)) return { problem: 'out-of-sync', note: '' };
  if (body.exceptionEvent === true || /systemError/i.test(descriptor)) {
    const values = event.attributes && event.attributes.values;
    const detail = values && (values.error || values.message);
    return { problem: 'system-error', note: detail ? textOf(detail) : '' };
  }
  return null;
}

/* The response text as { body, problem, note }. problem is null for a usable
 * answer, otherwise one of 'empty', 'not-json', 'system-error', 'out-of-sync'. */
export function decodeResponse(text) {
  if (text === undefined || text === null || String(text).trim() === '') {
    return { body: null, problem: 'empty', note: '' };
  }
  let body;
  try {
    body = JSON.parse(stripEnvelope(text));
  } catch {
    return { body: null, problem: 'not-json', note: '' };
  }
  const found = bodyProblem(body);
  return { body, problem: found ? found.problem : null, note: found ? found.note : '' };
}

/* What is wrong with the answer as a whole, or null: { problem, note } with
 * problem 'no-response' (the request never got an answer, HTTP status 0) or
 * one of decodeResponse's. request: { httpStatus, responseText }; without
 * responseText only the decoded body is looked at. */
export function responseProblem(request, body) {
  if (request.httpStatus === 0) return { problem: 'no-response', note: '' };
  if (request.responseText !== undefined) {
    const decoded = decodeResponse(request.responseText);
    return decoded.problem ? { problem: decoded.problem, note: decoded.note } : null;
  }
  return bodyProblem(body);
}

const NO_RESULT = { state: null, output: undefined, error: null };

/* Pull the result for one action out of a decoded response body. */
export function resultFor(kind, body, action, index) {
  if (!body) return { ...NO_RESULT };

  if (kind === 'aura' && Array.isArray(body.actions)) {
    // Two undefined ids are not the same id: a call without one is matched by position.
    const hasId = action.wireId !== undefined && action.wireId !== null;
    const byId = hasId ? body.actions.find((entry) => entry.id === action.wireId) : null;
    // Position is a guess: only when ids cannot tell the actions apart.
    const guess = body.actions[index];
    const idsMissing = action.wireId === undefined || action.wireId === null || (guess && (guess.id === undefined || guess.id === null));
    const hit = byId || (idsMissing ? guess : null) || null;
    if (!hit) return { ...NO_RESULT };
    return {
      state: hit.state || null,
      output: unwrap(hit.returnValue),
      error: (hit.error && hit.error.length) ? hit.error : null
    };
  }

  if (kind === 'vfremote') {
    const results = Array.isArray(body) ? body : [body];
    // The tid ties an answer to its call; without one there is no result to show.
    const found = action.wireId === null || action.wireId === undefined
      ? null
      : results.find((result) => result && result.tid !== undefined && String(result.tid) === String(action.wireId));
    if (!found) return { ...NO_RESULT };
    return {
      state: found.statusCode === 200 ? 'SUCCESS' : 'ERROR',
      output: unwrap(found.result),
      error: found.message || null
    };
  }

  // LWR apex execute, and anything else that came back as plain JSON.
  return {
    state: body.returnValue !== undefined ? 'SUCCESS' : null,
    output: unwrap(body.returnValue !== undefined ? body.returnValue : body),
    error: body.error || null
  };
}

/* Apex hands back a Map whose payload usually sits under result/returnValue. */
export function unwrap(value) {
  let out = safeParse(value);
  // Aura wraps the Apex return in { returnValue, cacheable }, and OmniStudio
  // hands back a Map whose payload sits under `result`. Peel both, but only
  // while the wrapper carries nothing else worth keeping.
  for (let i = 0; i < 3; i++) {
    if (!out || typeof out !== 'object' || Array.isArray(out)) break;
    if (peelable(out, 'returnValue')) { out = safeParse(out.returnValue); continue; }
    if (peelable(out, 'result')) { out = safeParse(out.result); continue; }
    break;
  }
  return out;
}

/* { result, error: "OK" } is a wrapper; { result, error: "Required field
 * missing" } is a failure, and peeling it would hide the error and show the
 * call as a success. The same goes for { result, success: false } and a
 * sibling errorCode or an HTTP-like statusCode. */
const ERROR_KEYS = ['error', 'errors', 'haserrors', 'errorcode'];
const STATUS_KEYS = ERROR_KEYS.concat(['success', 'statuscode']);

const isStatusKey = (key) => STATUS_KEYS.includes(key.toLowerCase());

function marksFailure(key, value) {
  const name = key.toLowerCase();
  if (name === 'success') return value === false;
  if (name === 'statuscode') return typeof value === 'number' && value >= 400;
  return ERROR_KEYS.includes(name) && isRealError(value);
}

function peelable(wrapper, key) {
  if (wrapper[key] === undefined) return false;
  const others = Object.keys(wrapper).filter((other) => other !== key);
  // One other key of any kind is tolerated (a cacheable flag, say). More than
  // that only when every one of them is a status key saying "fine": the
  // { result, error: "OK", errorCode: "INVOKE-200" } shape.
  if (others.length > 1 && !others.every(isStatusKey)) return false;
  return !others.some((other) => marksFailure(other, wrapper[other]));
}

export function isOmni(action) {
  if (action.debug) return true; // a designer preview is OmniStudio's by definition
  if (action.remoteClass || action.remoteMethod) return true;
  if (/invokeMethod/i.test(action.apexMethod)) return true;
  return /omniscript|omnistudio|vlocity|integrationprocedure/i.test(
    action.apexClass + ' ' + action.descriptor);
}

export function label(action) {
  // A designer preview is told by its Apex class and method; its name is not part of the wire.
  if (action.debug) return (action.apexClass || '?') + '.' + (action.apexMethod || '?');
  if (action.remoteClass || action.remoteMethod) {
    return (action.remoteClass || '?') + '.' + (action.remoteMethod || '?');
  }
  if (action.apexClass || action.apexMethod) {
    return (action.apexClass || '?') + '.' + (action.apexMethod || '?');
  }
  return action.descriptor || 'unknown action';
}

/* DataRaptors and Integration Procedures are dispatched through the same
 * remote-action plumbing as custom Apex, so on the wire they all look like
 * invokeMethod. The class and method identify the *integration*, not the
 * bundle the user configured — every DataRaptor Extract in a script reports
 * the same invokeInboundDR. The bundle name travels in the options (or, for a
 * Data Mapper, in a few known keys of the input), so dig it out and label rows
 * with that instead.
 *
 * Where a name came from matters: an Integration Procedure is named by its
 * method (its key), never by a field of its input, because the input is the
 * user's data and a field called "integrationProcedure" in it is just data. A
 * name read from the input is a value for masking (maskedName) even where it
 * is a known key. */

const IP_OPTION_KEYS = ['integrationprocedurekey', 'ipkey', 'procedurekey', 'integrationprocedure'];
const DR_OPTION_KEYS = ['bundle', 'bundlename', 'dataraptorname', 'drname', 'drbundle'];
/* The only keys of a Data Mapper's input that name its bundle. */
const DR_INPUT_KEYS = ['bundlename', 'bundle', 'drbundle'];

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function textAt(source, keys) {
  if (!isPlainObject(source)) return '';
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (keys.includes(key.toLowerCase()) && typeof value === 'string' && value) return value;
  }
  return '';
}

/* { name, from }: the bundle or key the call is for and where it was read,
 * 'method' (the IP key), 'options', 'input' (Data Mapper input, a known key
 * only) or '' (no name found). Top-level keys only, no deep search. */
export function nameInfo(action) {
  const kind = kindOf(action);
  if (kind === 'IP') {
    if (typeof action.remoteMethod === 'string' && action.remoteMethod) return { name: action.remoteMethod, from: 'method' };
    const key = textAt(action.options, IP_OPTION_KEYS);
    return key ? { name: key, from: 'options' } : { name: '', from: '' };
  }
  const fromOptions = textAt(action.options, DR_OPTION_KEYS.concat(IP_OPTION_KEYS));
  if (fromOptions) return { name: fromOptions, from: 'options' };
  if (kind === 'DR') {
    const fromInput = textAt(action.input, DR_INPUT_KEYS);
    if (fromInput) return { name: fromInput, from: 'input' };
  }
  return { name: '', from: '' };
}

export function findName(action) {
  return nameInfo(action).name;
}

/* An Integration Procedure preview's name: "IP preview · <record Id>". */
export const IP_PREVIEW = 'IP preview';
const PREVIEW_JOIN = ' · ';

/* The Id in a preview's name, '' when the name is the bare label. */
export function previewId(name) {
  const text = String(name || '');
  return text.startsWith(IP_PREVIEW + PREVIEW_JOIN) ? text.slice((IP_PREVIEW + PREVIEW_JOIN).length) : '';
}

/* The row's name as it may leave the panel: a name read from the input is
 * user data, so `mask` applies to it; the others are code names. */
export function maskedName(entry, mask = (value) => value) {
  if (entry.nameFrom === 'input') return String(mask(entry.name));
  // "IP preview · <Id>": the Id is a value, the words are not.
  if (entry.nameFrom === 'preview') return `${IP_PREVIEW}${PREVIEW_JOIN}${String(mask(previewId(entry.name)))}`;
  return entry.name;
}

/* Class names differ between the Vlocity managed packages and standard
 * OmniStudio — vlocity_ins.IntegrationProcedureService versus
 * omnistudiocore.IPService, and likewise DataRaptor versus Data Mapper — so
 * match on several spellings, then fall back to the shape of the call. */
const IP_PATTERN = /integrationprocedure|ipservice|invokeip|runintegrationprocedure/i;
const DR_PATTERN = /dromniscript|inbounddr|outbounddr|dataraptor|datamapper|drservice|invokeinbound|invokeoutbound|turboextract/i;

/* Type_SubType, the shape of an Integration Procedure key. */
const IP_KEY_SHAPE = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;

/* The two methods Data Mapper calls travel through, whatever the class. */
const DR_METHOD = /^invoke(inbound|outbound)dr$/i;

export function kindOf(action) {
  if (action.debug) return action.debug === 'dr' ? 'DR' : 'IP';
  /* Class names decide, not method names: an Integration Procedure's key is
   * its method, and a key such as Sync_DataRaptor says nothing about the kind. */
  const classes = `${action.remoteClass} ${action.apexClass}`;
  if (DR_PATTERN.test(classes) || DR_METHOD.test(action.remoteMethod || '')) return 'DR';
  if (IP_PATTERN.test(classes)) return 'IP';
  // Unrecognised service class calling a Type_SubType method: still an IP.
  if (/service$/i.test(action.remoteClass || '') && IP_KEY_SHAPE.test(action.remoteMethod || '')) return 'IP';
  if (action.remoteClass || action.remoteMethod) return 'RA';
  return 'APEX';
}

export const KIND_LABEL = {
  DR: 'Data Mapper (DataRaptor)',
  IP: 'Integration Procedure',
  RA: 'Remote Action',
  APEX: 'Apex call'
};

/* Options that change what a call actually does are worth seeing without
 * opening the Options tab. Text labels rather than glyphs: they need no
 * legend, and a chain emoji renders at a different size on every platform.
 * "chain" is kept for the group of calls a chained procedure ran as (see
 * actions-chains.js); a call that only asks for it is "chainable". */
export const CHAINABLE_LABEL = 'chainable';
const OPTION_FLAGS = [
  [CHAINABLE_LABEL, ['chainable'],
    'Chainable — the response is fed into the next call in the chain'],
  ['queueable chain', ['queueableChainable'],
    'Queueable chainable — the chain continues on a later queued request, so the result here may not be the end of it'],
  ['queue', ['useQueueableApexRemoting', 'useQueueable'],
    'Runs as queueable Apex; the result arrives on a later request'],
  ['future', ['useFuture'],
    'Runs in a future method, asynchronously'],
  ['continuation', ['useContinuation'],
    'Uses an Apex continuation for a long-running callout'],
  ['no cache', ['ignoreCache'],
    'Cache bypassed for this call']
];

/* Option keys differ in casing between packages and versions, so match on a
 * lowercased index rather than an exact property name. */
function lowercasedIndex(options) {
  const index = {};
  Object.keys(options).forEach((key) => { index[key.toLowerCase()] = options[key]; });
  return index;
}

export function optionFlags(action) {
  const options = action.options;
  if (!options || typeof options !== 'object' || Array.isArray(options)) return [];

  const index = lowercasedIndex(options);
  const flags = [];

  OPTION_FLAGS.forEach(([flagLabel, keyNames, title]) => {
    const on = keyNames.some((name) => index[name.toLowerCase()] === true);
    if (on) flags.push({ label: flagLabel, title });
  });

  /* Transform bundles are Data Mappers running either side of the call —
   * worth naming, since a failure there looks like a failure of the call. */
  const preTransformBundle = index.pretransformbundle;
  const postTransformBundle = index.posttransformbundle;
  if (typeof preTransformBundle === 'string' && preTransformBundle) {
    flags.push({ label: 'pre', title: `Pre-Transform Data Mapper: ${preTransformBundle}` });
  }
  if (typeof postTransformBundle === 'string' && postTransformBundle) {
    flags.push({ label: 'post', title: `Post-Transform Data Mapper: ${postTransformBundle}` });
  }
  return flags;
}

export function displayName(action) {
  return displayInfo(action).name;
}

/* displayName with where the name came from: 'label' when it is the
 * Class.method text, which is no bundle or key. */
function displayInfo(action) {
  const kind = kindOf(action);
  if (kind === 'DR' || kind === 'IP') {
    const found = nameInfo(action);
    if (found.name) return found;
  }
  // The request of an Integration Procedure preview names it by Id only: the Id tells previews of different procedures apart.
  if (action.debug === 'ip' && typeof action.recordId === 'string' && action.recordId) {
    return { name: `${IP_PREVIEW}${PREVIEW_JOIN}${action.recordId}`, from: 'preview' };
  }
  if (action.debug) return { name: action.debug === 'dr' ? 'DR preview' : IP_PREVIEW, from: 'label' };
  return { name: label(action), from: 'label' };
}

/* ---------------------------------------------------------- failure */

/* OmniStudio payloads often carry an `error` key that is not an error —
 * DataRaptor and Integration Procedure responses routinely come back with
 * error: "OK" or error: false. Flagging those red would mark almost every
 * successful call as broken, so only a meaningful value counts. */
const BENIGN_ERROR_VALUES = ['ok', 'false', 'no', 'none', 'null', 'success', '0', ''];

/* A success code spelled as an error code: "INVOKE-200", "200", "OK-201".
 * OmniStudio fills errorCode with the status even when the call worked. */
const SUCCESS_CODE = /(^|-)2\d\d$/;

export function isRealError(value, depth = 0) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return !BENIGN_ERROR_VALUES.includes(text) && !SUCCESS_CODE.test(text);
  }
  if (typeof value === 'number') return value !== 0 && !(value >= 200 && value < 300);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    // { code: null, message: null } is an empty error slot, not an error.
    if (depth > 3) return true;
    return Object.keys(value).some((key) => isRealError(value[key], depth + 1));
  }
  return !!value;
}

export function brief(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > 120 ? text.slice(0, 120) + '…' : text;
}

/* The wording of each way an answer can be wrong as a whole. */
const PROBLEM_TEXT = {
  'no-response': () => 'No response',
  empty: () => 'Empty response body',
  'not-json': () => 'Response is not JSON',
  'system-error': (note, say) => (note ? `Aura system error: ${say(note)}` : 'Aura system error'),
  'out-of-sync': () => 'Session expired / client out of sync'
};

/* Returns why this call counts as failed, or null when it does not. Naming
 * the rule that fired matters: a red row on a SUCCESS response is otherwise
 * impossible to account for without reading the source. `mask` turns a value
 * into the value that may be shown (identity when masking is off); it is
 * applied to every value quoted in the text. */
export function failureReason(entry, full, mask) {
  // Records never change, so buildActionRecord stores the short reason once.
  if (!full && !mask && entry.failure !== undefined) return entry.failure;
  const show = mask || ((value) => value);
  const say = (value) => {
    const shown = show(value);
    return full ? (typeof shown === 'string' ? shown : JSON.stringify(shown)) : brief(shown);
  };
  const found = reasonFor(entry, say);
  /* A call read back from a file keeps the file's verdict: what the file says
   * failed stays failed, and what it says did not stays clean, even where the
   * data the rules need did not survive the file (a masked "OK", say). */
  if (!entry.loaded) return found;
  if (!entry.loaded.failed) return null;
  return found || (entry.loaded.text ? say(entry.loaded.text) : LOADED_FAILURE);
}

const LOADED_FAILURE = 'Marked as failed in the loaded file';

/* The status of a step of a debug run that counts as having worked. Anything
 * else the run names (Error, Failed, Aborted...) is a failure; a step with no
 * status at all is not blamed. A warning is a success with a note, and the
 * placeholder a masked file puts where a status was is no status. */
const STEP_FINE = /^(success|succeeded|successful|complete|completed|ok|done|skipped|not executed|not run)$/i;
const STEP_WARNING = /warning/i;

export function isStepFailure(status) {
  if (typeof status !== 'string' || status.trim() === '' || status === MASK_STRING) return false;
  return !STEP_FINE.test(status.trim()) && !STEP_WARNING.test(status);
}

/* ------------------------------------------- what a debug run is made of */

export const DEBUG_SUFFIX = 'Debug';

export const FULL_DATA_KEY = 'fullDataJson';
export const IP_RESULT_KEY = 'IPResult';

/* The object under `key`, read through safeParse: { root, key } with the key
 * as the answer spells it, or null when there is no object there. With
 * `anyCase` the key matches in any case (an IPResult, as flagFailure reads it). */
function childAt(parent, key, anyCase = false) {
  const found = anyCase ? Object.keys(parent).find((name) => name.toLowerCase() === key.toLowerCase()) : key;
  const value = found === undefined ? undefined : safeParse(parent[found]);
  return isPlainObject(value) ? { root: value, key: found } : null;
}

/* Whether an object holds an element's <Name>Debug block. */
function hasDebugBlock(root) {
  return Object.keys(root).some((key) => key.length > DEBUG_SUFFIX.length && key.endsWith(DEBUG_SUFFIX) && isPlainObject(safeParse(root[key])));
}

/* Whether an object is the level of an answer that holds a run: its
 * execution sequence, or a <Name>Debug block. */
function holdsRun(root) {
  return Array.isArray(safeParse(root.executionSequence)) || hasDebugBlock(root);
}

/* Where the run sits in an answer: { root, key }, key being the one the root
 * was found under ('' for the answer itself). A designer preview puts the run
 * under fullDataJson; an Integration Procedure called from a page with
 * isDebug on puts it under IPResult, beside a fullDataJson that holds only the
 * procedure's data. So the levels are tried outermost first: the answer, its
 * IPResult, then the fullDataJson of each, and the first that holds a run is
 * the root. When none does, the fullDataJson when it is an object, else the
 * answer, as it always was. An answer that is not an object has the root {}. */
export function ipRootOf(output) {
  const top = safeParse(output);
  if (!isPlainObject(top)) return { root: {}, key: '' };
  const result = childAt(top, IP_RESULT_KEY, true);
  const full = childAt(top, FULL_DATA_KEY);
  const inner = result ? childAt(result.root, FULL_DATA_KEY) : null;
  const found = [{ root: top, key: '' }, result, full, inner].find((level) => level && holdsRun(level.root));
  return found || full || { root: top, key: '' };
}

/* The level of an answer that holds its run (see ipRootOf). */
export function ipRoot(output) {
  return ipRootOf(output).root;
}

/* Whether an Integration Procedure's answer is a debug run, strictly: a plain
 * answer (only data under IPResult) must not pass. Its root has an execution
 * sequence naming at least one element, or a <Name>Debug block and a debug log. */
function holdsDebugRun(root) {
  const sequence = safeParse(root.executionSequence);
  if (Array.isArray(sequence) && sequence.some((name) => typeof name === 'string' && name !== '')) return true;
  return hasDebugBlock(root) && Array.isArray(safeParse(root.debugLog));
}

/* The flavour of debug run a call of this kind answered with: 'ip' for an
 * Integration Procedure whose answer holds a run, undefined otherwise. */
export function answerFlavour(type, output) {
  return type === 'IP' && holdsDebugRun(ipRoot(output)) ? 'ip' : undefined;
}

/* Whether a call's answer holds a debug run, and of which flavour: 'ip' or
 * 'dr' for a designer preview (its request says so), else 'ip' for an
 * Integration Procedure that was asked for one (isDebug in its options) and
 * answered with it, undefined for any other call. Never throws. */
export function debugFlavourOf(action, output) {
  if (!isPlainObject(action)) return undefined;
  if (action.debug === 'ip' || action.debug === 'dr') return action.debug;
  try {
    return answerFlavour(kindOf(action), output);
  } catch {
    return undefined;
  }
}

/* The flag an org may set beside an element's output: <Name>Status, true
 * when the element ran well, false when it did not. */
export const STATUS_SUFFIX = 'Status';

/* An element's <Name>Debug block as an object, or {}: an org may hand the
 * block over as JSON text, so it is read through safeParse. */
export function debugBlockOf(root, name) {
  const block = isPlainObject(root) ? safeParse(root[`${name}${DEBUG_SUFFIX}`]) : undefined;
  return isPlainObject(block) ? block : {};
}

/* The elements that left a <Name>Debug block or a <Name>Status flag, in the
 * object's own order, each once. */
function debugBlockNames(root) {
  const names = [];
  Object.keys(root).forEach((key) => {
    let name = null;
    if (key.length > DEBUG_SUFFIX.length && key.endsWith(DEBUG_SUFFIX) && isPlainObject(safeParse(root[key]))) {
      name = key.slice(0, -DEBUG_SUFFIX.length);
    } else if (key.length > STATUS_SUFFIX.length && key.endsWith(STATUS_SUFFIX) && typeof root[key] === 'boolean') {
      name = key.slice(0, -STATUS_SUFFIX.length);
    }
    if (name && !names.includes(name)) names.push(name);
  });
  return names;
}

/* The names in the order they ran, then the elements that have a block and no
 * place in the sequence. The placeholder a masked file puts in the sequence is
 * no name. */
export function ipStepNames(root) {
  const listed = safeParse(root.executionSequence);
  const sequence = (Array.isArray(listed) ? listed : [])
    .filter((name) => typeof name === 'string' && name && name !== MASK_STRING);
  const rest = debugBlockNames(root).filter((name) => !sequence.includes(name));
  return sequence.concat(rest);
}

/* A number, or a number written as text; anything else is unknown (null). */
export function numberOrNull(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/* A time in milliseconds, or null: a negative time is no time. */
export function timeOrNull(value) {
  const found = numberOrNull(value);
  return found !== null && found >= 0 ? found : null;
}

/* The org's own words for the two common outcomes, written as the panel
 * writes them everywhere else; any other word (Warning...) is shown as it came. */
function displayStatus(status) {
  if (/^success$/i.test(status.trim())) return 'Succeeded';
  if (/^error$/i.test(status.trim())) return 'Failed';
  return status;
}

/* A step's status as text: the block's Status when it is one; else the
 * block's or the root's true/false flag. A true flag is Succeeded. A false flag
 * on an element that ran (it has a Debug block or a place in the sequence) is
 * Failed; on one that did not run (a conditional block whose condition was
 * false, a Set Values behind it) it is Skipped. Else ''. */
function stepStatus(root, name, block) {
  if (typeof block.Status === 'string') return displayStatus(block.Status);
  const flag = typeof block.Status === 'boolean' ? block.Status : root[`${name}${STATUS_SUFFIX}`];
  if (flag === true) return 'Succeeded';
  if (flag === false) return Object.keys(block).length || inSequence(root, name) ? 'Failed' : 'Skipped';
  return '';
}

/* Whether the run's execution sequence names the element. */
function inSequence(root, name) {
  const listed = safeParse(root.executionSequence);
  return Array.isArray(listed) && listed.includes(name);
}

/* A step's facts without its values: { name, type, status, elapsedMs, cpuMs }. */
export function stepFacts(root, name) {
  const block = debugBlockOf(root, name);
  return {
    name,
    type: typeof block.Type === 'string' ? block.Type : '',
    status: stepStatus(root, name, block),
    elapsedMs: timeOrNull(block.ElapsedTime),
    cpuMs: timeOrNull(block.ElapsedTimeCPU)
  };
}

/* "<ISO timestamp>: <text>", the timestamp with or without a zone. */
const STAMPED = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?):[ \t]*([\s\S]*)$/;

export function kindOfLine(text) {
  if (/^Query:/i.test(text)) return 'query';
  if (/^Query results found/i.test(text)) return 'count';
  if (/^(Query time|Time in Server)\b/i.test(text)) return 'time';
  return 'info';
}

const lineText = (line) => (typeof line === 'string' ? line : JSON.stringify(line));

/* The log as a list of lines: an array as it is; JSON text of an array
 * parsed; any other text split at line ends; anything else, no lines. */
function logLines(lines) {
  const parsed = typeof lines === 'string' ? safeParse(lines) : lines;
  if (Array.isArray(parsed)) return parsed.filter((line) => line !== null && line !== undefined);
  if (typeof parsed === 'string') return parsed.split(/\r?\n/).filter((line) => line.trim() !== '');
  return [];
}

/* The log lines of a run as [{ at, offsetMs, text, kind }]. `at` is the line's
 * own timestamp (null for a line without one), `offsetMs` the time since the
 * first stamped line (null without a stamp), `kind` is 'query' (Query: ...),
 * 'count' (Query results found), 'time' (Query time, Time in Server) or
 * 'info'. A line that is not "<stamp>: text" is kept whole as info. */
export function parseDebugLog(lines) {
  const list = logLines(lines);
  let first = null;
  return list.map((line) => {
    const whole = lineText(line);
    const hit = STAMPED.exec(whole);
    const stamp = hit ? Date.parse(hit[1].replace(' ', 'T')) : NaN;
    if (!hit || Number.isNaN(stamp)) return { at: null, offsetMs: null, text: whole, kind: kindOfLine(whole) };
    if (first === null) first = stamp;
    return { at: hit[1], offsetMs: stamp - first, text: hit[2], kind: kindOfLine(hit[2]) };
  });
}

/* ----------------------------------------- the skeleton of a debug run */

/* What a debug run leaves in an exported row when its values are masked: the
 * facts the Debug tab needs and no value in them. Step names, types, statuses
 * and times; the total and CPU times; for a DataRaptor the response and
 * interface types; the kind and offset of each log line, never its text; and
 * the outcome. A loaded file builds the Debug tab from it. */
export function debugSkeleton(entry) {
  if (!entry || (entry.debug !== 'ip' && entry.debug !== 'dr')) return undefined;
  const top = safeParse(entry.output);
  const log = (lines) => parseDebugLog(lines).map((line) => ({ kind: line.kind, offsetMs: line.offsetMs }));
  const outcome = failed(entry) ? 'failed' : 'succeeded';
  if (entry.debug === 'dr') {
    const root = isPlainObject(top) ? top : {};
    const options = entry.action && isPlainObject(entry.action.options) ? entry.action.options : {};
    return {
      flavour: 'dr',
      outcome,
      elapsedMs: timeOrNull(root.ActualTime),
      cpuMs: timeOrNull(root.CpuTime),
      responseType: typeof root.responseType === 'string' ? root.responseType : '',
      interfaceType: typeof options.interfaceType === 'string' ? options.interfaceType : '',
      log: log(root.debugLog)
    };
  }
  const root = ipRoot(top);
  return {
    flavour: 'ip',
    outcome,
    elapsedMs: timeOrNull(root.elapsedTimeActual),
    cpuMs: timeOrNull(root.elapsedTimeCPU),
    steps: ipStepNames(root).map((name) => stepFacts(root, name)),
    log: log(root.debugLog)
  };
}

/* A skeleton read back from a file: the same shape with every field checked,
 * or null when the row has none (or it is not one). */
export function readSkeleton(value, flavour) {
  if (!isPlainObject(value) || value.flavour !== flavour) return null;
  const text = (field) => (typeof field === 'string' && field !== MASK_STRING ? field : '');
  const time = (field) => timeOrNull(typeof field === 'number' ? field : null);
  const log = (Array.isArray(value.log) ? value.log : []).filter(isPlainObject).map((line) => ({
    kind: ['query', 'count', 'time'].includes(line.kind) ? line.kind : 'info',
    offsetMs: typeof line.offsetMs === 'number' && Number.isFinite(line.offsetMs) ? line.offsetMs : null
  }));
  const common = { flavour, outcome: value.outcome === 'failed' ? 'failed' : 'succeeded', elapsedMs: time(value.elapsedMs), cpuMs: time(value.cpuMs), log };
  if (flavour === 'dr') return { ...common, responseType: text(value.responseType), interfaceType: text(value.interfaceType) };
  const steps = (Array.isArray(value.steps) ? value.steps : []).filter((step) => isPlainObject(step) && text(step.name)).map((step) => ({
    name: text(step.name), type: text(step.type), status: text(step.status), elapsedMs: time(step.elapsedMs), cpuMs: time(step.cpuMs)
  }));
  return { ...common, steps };
}

/* Why a debug run's answer counts as failed beyond the general flags of its
 * root, or null: an Integration Procedure step whose <Name>Debug block says it
 * did not work, or the flags (flagFailure) of the run's own root and of its
 * response; a DataRaptor that reports an error of its own. `flavour` is 'ip'
 * or 'dr'; `output` is the parsed answer. */
export function debugOutputFailure(flavour, output, say = brief) {
  const top = safeParse(output);
  if (!isPlainObject(top)) return null;
  if (flavour === 'dr') {
    const found = isPlainObject(top.errorsAsJson) ? top.errorsAsJson.DRError : undefined;
    if (isRealError(found)) return `Data Mapper error — ${say(found)}`;
    if (isRealError(top.errorsAsJson)) return `Data Mapper error — ${say(top.errorsAsJson)}`;
    return isRealError(top.errorsByField) ? `Data Mapper field errors — ${say(top.errorsByField)}` : null;
  }
  const root = ipRoot(top);
  const failing = ipStepNames(root).map((name) => stepFacts(root, name)).find((step) => isStepFailure(step.status));
  if (failing) return `Step ${failing.name} ${failing.status.trim()}`;
  return (root !== top ? flagFailure(root, say) : null) || flagFailure(root.response, say);
}

/* Why the answer as a whole counts as failed by what the run says: the
 * reason of debugOutputFailure, else the flags at the root of the answer.
 * The row's verdict reads the same pieces, in this order. */
export function debugRunFailure(flavour, output, say = brief) {
  return debugOutputFailure(flavour, output, say) || flagFailure(safeParse(output), say);
}

/* Why an object says, by its own flags, that it went wrong, or null: the
 * flags every answer can carry at its root (hasErrors, success: false, an
 * errorCode, an IPResult that signals failure, error, errors). The row's
 * verdict and the Debug tab's model both read through this one function, so
 * the two cannot disagree about the same flags. */
export function flagFailure(root, say = brief) {
  if (!isPlainObject(root)) return null;
  if (root.hasErrors === true) return 'Response sets hasErrors: true';
  if (root.success === false) {
    return `Response sets success: false${isRealError(root.error) ? ` — ${say(root.error)}` : ''}`;
  }
  if (isRealError(root.errorCode)) return `Response errorCode — ${say(root.errorCode)}`;

  // Integration Procedure may nest an IPResult node that signals failure
  // explicitly. Match the key case-insensitively and treat success:false
  // or a meaningful error as a failure marker.
  try {
    const ipResultKey = Object.keys(root).find((key) => key.toLowerCase() === 'ipresult');
    if (ipResultKey) {
      const ipResult = root[ipResultKey];
      if (ipResult && typeof ipResult === 'object') {
        if (ipResult.success === false) return `IPResult indicates failure — ${say(ipResult.error || ipResult)}`;
        if (isRealError(ipResult.error)) return `IPResult indicates failure — ${say(ipResult.error)}`;
      }
    }
  } catch {
    /* defensive: root may not be enumerable */
  }

  if (isRealError(root.error)) return `Response error — ${say(root.error)}`;
  if (isRealError(root.errors)) return `Response errors — ${say(root.errors)}`;
  return null;
}

function reasonFor(entry, say) {

  // A 4xx/5xx explains an empty or unreadable body better than the body does.
  const httpBad = entry.httpStatus && entry.httpStatus >= 400;
  const problem = entry.responseProblem;
  /* An empty body behind a 2xx is not a failure: DevTools hands back an empty
   * body when it no longer holds the content, so blaming the call would turn
   * the badge red after every reload of a long session. */
  const emptyButOk = problem === 'empty' && entry.httpStatus >= 200 && entry.httpStatus < 400;
  if (problem && !emptyButOk && !(httpBad && (problem === 'empty' || problem === 'not-json'))) {
    return PROBLEM_TEXT[problem](entry.responseNote, say);
  }

  if (isRealError(entry.error)) return `Action error — ${say(entry.error)}`;
  if (entry.state && entry.state !== 'SUCCESS') return `Aura state is ${entry.state}`;
  if (httpBad) return `HTTP ${entry.httpStatus}`;

  if (entry.output && typeof entry.output === 'object' && !Array.isArray(entry.output)) {
    // A debug run, a designer preview's or an Integration Procedure's asked for with isDebug.
    const flavour = entry.debug || (entry.action ? debugFlavourOf(entry.action, entry.output) : undefined);
    if (flavour) {
      const stopped = debugOutputFailure(flavour, entry.output, say);
      if (stopped) return stopped;
    }
    const flagged = flagFailure(entry.output, say);
    if (flagged) return flagged;
  }

  return null;
}

/* What the Result pill says and how it is drawn: { text, tone } with tone
 * 'bad' (red), 'good' or 'neutral' (nothing came back, so nothing is known). */
export function verdictOf(entry, why = failureReason(entry)) {
  if (entry.responseProblem === 'no-response') return { text: 'No response', tone: 'neutral' };
  if (entry.responseProblem === 'empty' && !why) return { text: 'No body', tone: 'neutral' };
  return why ? { text: 'Failed', tone: 'bad' } : { text: 'Succeeded', tone: 'good' };
}

export function failed(entry) {
  if (entry.failure !== undefined) return entry.failure !== null;
  return failureReason(entry) !== null;
}

/* ------------------------------------------------------ filtering */

/* opts: { onlyOmni, query, errorsOnly, slowMs, masked, visits }. query is the
 * filter box (see actions-search.js); parsed may carry it already parsed.
 * slowMs is the slow-call threshold setting, which only a bare slow: in the
 * box turns into a filter. */
export function matchesFilter(entry, opts) {
  if (opts.onlyOmni && !entry.omni) return false;
  if (opts.errorsOnly && !failed(entry)) return false;

  return matchesQuery(entry, opts.parsed || parseQuery(opts.query), opts);
}

/* What differs from the defaults and is narrowing or shaping the list right
 * now, as short phrases for the status bar: "all Apex calls" (the All Apex calls
 * switch is on; off is the default and goes unsaid), "clears on reload", "errors
 * only", "slow: 800 ms", "text: foo". Same opts as matchesFilter, plus
 * clearOnReload. A state that is the default is never named. */
export function activeFilterLabels(opts) {
  const labels = [];
  if (!opts.onlyOmni) labels.push('all Apex calls');
  if (opts.clearOnReload) labels.push('clears on reload');
  if (opts.errorsOnly) labels.push('failed only');
  const slow = slowFilterMs(opts.parsed || parseQuery(opts.query), opts.slowMs);
  if (slow !== null) labels.push(`slow: ${slow} ms`);
  const query = withoutSlow(opts.query);
  if (query) labels.push(`text: ${query}`);
  return labels;
}

/* "1 call", "3 calls": the noun in its plural unless the count is one. */
export function countText(count, noun) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/* The longest filter text the no-match line quotes. */
const QUOTE_LIMIT = 40;

/* What the list says when the filters leave no call to show although some were
 * captured: 'No calls match "text"', or, when the text is not what hides them,
 * 'No calls match the filters'. Cut short when the text is long. */
export function noMatchText(query) {
  const text = String(query || '').trim();
  if (!text) return 'No calls match the filters';
  const quoted = text.length > QUOTE_LIMIT ? `${text.slice(0, QUOTE_LIMIT)}…` : text;
  return `No calls match "${quoted}"`;
}

/* What the tab badge shows. `inView` are the calls the filters show; `scoped`
 * (default: the same) are the calls that count at all, those the All Apex calls
 * switch lets through, whatever the other filters hide. A failure must be seen from
 * the other tabs even while a filter keeps it off the list, so:
 *   - any failed call in scope: "✕ N", the number of failed calls, red (the
 *     glyph carries the meaning, so it does not rest on the colour);
 *   - else the number of calls in view, grey;
 *   - hidden only while there is nothing in scope to count.
 * { text, label, count (in view), failed, total (in scope), hidden, title }.
 * `label` is the accessible name of the failed badge ("2 failed calls"), ''
 * for the plain count. The title
 * says which number it is, and adds how many of the calls in view repeat an
 * earlier call when `repeats` (core findRepeats) says any do. */
export function badgeSummary(inView, repeats, scoped = inView) {
  const count = inView.length;
  const total = scoped.length;
  const failedCount = scoped.filter(failed).length;
  const repeated = repeats ? inView.filter((entry) => repeats.has(entry.id)).length : 0;
  let title;
  if (failedCount) {
    title = `${countText(failedCount, 'failed call')}${total !== failedCount ? ` of ${total} captured` : ''}`;
    if (count !== total) title += ` · ${count} in view`;
  } else {
    title = `${countText(count, 'call')} in view`;
    if (count !== total) title += ` of ${total} captured`;
  }
  if (repeated) title += ` · ${repeated} repeated`;
  const shown = failedCount || count;
  // A grey 0 beside calls that exist but are all filtered away says nothing.
  const none = total === 0 || shown === 0;
  const text = none ? '' : failedCount ? `✕ ${shown}` : String(shown);
  const label = none || !failedCount ? '' : countText(failedCount, 'failed call');
  return { text, label, count, failed: failedCount, total, hidden: none, title };
}

/* ---------------------------------------------- script elements */

/* The names a call goes by: what the row says, the class and method, and the
 * bundle or key found in its options. */
function callNames(entry) {
  return [entry.name, entry.signature, findName(entry.action || {})].filter(Boolean);
}

/* The element of the script that makes this call: the one whose bundle,
 * Integration Procedure key or remote class is what the call is named after.
 * null when none does (a custom Apex call, or the definition is not loaded). */
export function elementForCall(entry, elements) {
  const names = new Set(callNames(entry));
  return elements.find((element) => element.remote && names.has(element.remote)) || null;
}

/* Calls made by one element, in the order they happened. */
export function callsForElement(element, entries) {
  if (!element.remote) return [];
  return entries.filter((entry) => callNames(entry).includes(element.remote));
}

/* The call before this one that was made to the same place, for "what
 * changed since last time". With { successful: true } only a call that did
 * not fail counts: the last time it worked. */
export function previousSimilar(entries, entry, { successful = false } = {}) {
  const at = entries.indexOf(entry);
  // Not in the list (a chain made to look like one call is not): nothing to compare with.
  if (at < 0) return null;
  for (let i = at - 1; i >= 0; i--) {
    const other = entries[i];
    if (other.name !== entry.name || other.signature !== entry.signature) continue;
    if (successful && failed(other)) continue;
    return other;
  }
  return null;
}

/* Where a call belongs in a list kept in the order the requests started:
 * after every call that started at or before it, so calls of one request keep
 * their order. Responses arrive in the order they finish, not start. */
export function insertIndex(entries, time) {
  const at = time instanceof Date ? time.getTime() : Number(time);
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const midAt = entries[mid].time instanceof Date ? entries[mid].time.getTime() : Number(entries[mid].time);
    if (midAt <= at) low = mid + 1;
    else high = mid;
  }
  return low;
}

/* ------------------------------------------------ records and export */

/* How much of an answer is kept as text, for when it could not be decoded. */
export const RAW_LIMIT = 20 * 1024;

/* Turns one decoded action, plus the request/response it travelled in, into
 * the record every view reads. `id` is assigned by the caller, which owns the
 * sequence; `request` is { url, startedAt, durationMs, httpStatus, bodySize,
 * responseText, requestId, batchSize, timings }. responseText is the raw
 * answer (undefined when it was not read); requestId and batchSize say which
 * network request the action travelled in and how many actions shared it. */
export function buildActionRecord(id, kind, action, index, responseBody, request) {
  const result = resultFor(kind, responseBody, action, index);
  const problem = responseProblem(request, responseBody);
  const displayed = displayInfo(action);
  const record = {
    id,
    kind,
    url: request.url,
    time: request.startedAt,
    duration: knownDuration(request.durationMs),
    timings: timingParts(request.timings),
    requestId: request.requestId,
    batchSize: request.batchSize || 1,
    httpStatus: request.httpStatus,
    size: request.bodySize,
    omni: isOmni(action),
    type: kindOf(action),
    flags: optionFlags(action),
    name: displayed.name,
    nameFrom: displayed.from,
    signature: label(action),
    action,
    state: result.state,
    output: result.output,
    error: result.error,
    responseProblem: problem ? problem.problem : null,
    responseNote: problem ? problem.note : '',
    rawResponse: typeof request.responseText === 'string' ? request.responseText.slice(0, RAW_LIMIT) : undefined
  };
  /* debug: the answer holds a debug run ('ip' | 'dr'). action.debug stays
   * what makes the request a designer preview. */
  const flavour = debugFlavourOf(action, result.output);
  if (flavour) record.debug = flavour;
  record.failure = failureReason(record); // short reason, or null: computed once, read everywhere
  return record;
}

/* Whether the call carried options worth showing. */
export function hasOptions(entry) {
  const options = entry.action.options;
  if (options === undefined || options === null || options === '') return false;
  if (typeof options === 'object') return Object.keys(options).length > 0;
  return true;
}

/* The rows of the exported file. `mask` turns a value into the value that may
 * leave the panel (identity when masking is off). */
export function exportEntries(entries, mask = (value) => value) {
  return entries.map((entry) => ({
    time: entry.time.toISOString(),
    action: maskedName(entry, mask),
    type: KIND_LABEL[entry.type],
    signature: entry.signature,
    url: entry.url,
    options_flags: (entry.flags || []).map((flag) => flag.label),
    requestId: entry.requestId,
    batchSize: entry.batchSize,
    durationMs: entry.duration,
    httpStatus: entry.httpStatus,
    state: entry.state,
    failed: failed(entry),
    failure: failureReason(entry, true, mask),
    input: mask(entry.action.input),
    options: hasOptions(entry) ? mask(entry.action.options) : undefined,
    output: mask(entry.output),
    error: mask(entry.error),
    ...(entry.debug ? { debug: entry.debug, debugRun: debugSkeleton(entry) } : {}),
    // A call the panel sent: {}, with the time of the call it re-ran when it was one.
    ...(entry.test ? { test: entry.test.rerunTime ? { rerunOf: new Date(entry.test.rerunTime).toISOString() } : {} } : {})
  }));
}
