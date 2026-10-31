'use strict';

/* Test calls, the wire side: the inverse of parseRequest. A captured request
 * is kept as an envelope (its address, method, headers and raw body), and a
 * call the user composes is the envelope with its body rewritten to carry
 * exactly one action with the edited input and options. Headers are cut down
 * to what fetch may set, and one is added that tells the capture the request
 * is a test call.
 *
 * Pure: no DOM, no chrome.*, no fetch. Sending is hostSend's job. */

import { safeParse, isOmni } from '../shared/actions-model.js';

/* The header that marks a request as a test call. */
export const TEST_HEADER = 'X-Omniscript-Inspector-Test';

/* The most body an envelope keeps. A larger request is not offered as a model. */
export const MAX_ENVELOPE_BODY = 1024 * 1024;

/* The endpoint kinds a test call can go to. */
export const SEND_KINDS = Object.freeze(['aura', 'lwr', 'rest', 'vfremote']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/* The origin of an address, '' when it is not one. */
export function originOf(url) {
  try { return new URL(url).origin; } catch { return ''; }
}

/* Whether an address, read against `origin`, is on that origin. */
export function sameOrigin(url, origin) {
  if (!origin) return false;
  try { return new URL(String(url), origin).origin === origin; } catch { return false; }
}

/* HAR headers ([{ name, value }]) or a plain object, as [name, value] pairs. */
function pairsOf(headers) {
  if (Array.isArray(headers)) {
    return headers
      .filter((header) => header && typeof header.name === 'string')
      .map((header) => [header.name, String(header.value === undefined ? '' : header.value)]);
  }
  if (isObject(headers)) return Object.keys(headers).map((name) => [name, String(headers[name])]);
  return [];
}

/* What fetch refuses to set, or the browser sets itself. */
const FORBIDDEN = new Set([
  'content-length', 'host', 'cookie', 'origin', 'referer', 'user-agent', 'accept-encoding', 'connection'
]);

function forbidden(name) {
  const lower = name.toLowerCase();
  return FORBIDDEN.has(lower) || lower.startsWith(':') || lower.startsWith('sec-') || lower === TEST_HEADER.toLowerCase();
}

/* The headers to send: a plain object, the forbidden ones dropped, the test
 * header added (with `token`). A name repeated keeps its last value. */
export function replayHeaders(headers, token = '') {
  const out = {};
  pairsOf(headers).forEach(([name, value]) => {
    if (!name || forbidden(name)) return;
    out[name] = value;
  });
  out[TEST_HEADER] = String(token);
  return out;
}

/* The token a request carries in the test header, or ''. */
export function testTokenOf(headers) {
  const wanted = TEST_HEADER.toLowerCase();
  const found = pairsOf(headers).find(([name]) => name.toLowerCase() === wanted);
  return found ? found[1] : '';
}

/* The envelope worth keeping for a captured request, or null: only a request
 * of an endpoint a test call can go to, that carries a body no larger than the
 * cap and at least one OmniStudio action. request is the network entry's
 * request; actions are what parseRequest made of it. */
export function envelopeOf(kind, request, actions) {
  if (!SEND_KINDS.includes(kind) || !request) return null;
  const body = request.postData && typeof request.postData.text === 'string' ? request.postData.text : '';
  if (!body || body.length > MAX_ENVELOPE_BODY) return null;
  if (!Array.isArray(actions) || !actions.some(isOmni)) return null;
  // Visualforce remoting carries every kind of Apex call; only a designer preview is a model for a re-run.
  if (kind === 'vfremote' && !actions.some((action) => action.debug)) return null;
  return {
    kind,
    url: String(request.url || ''),
    method: String(request.method || 'POST').toUpperCase(),
    headers: pairsOf(request.headers).map(([name, value]) => ({ name, value })),
    body
  };
}

/* The envelopes seen, per origin and kind: { [origin]: { aura, lwr, rest } }.
 * A new object; the store is left as it was. */
export function rememberEnvelope(store, envelope) {
  const origin = envelope ? originOf(envelope.url) : '';
  if (!origin) return store;
  return { ...store, [origin]: { ...(store[origin] || {}), [envelope.kind]: envelope } };
}

/* The envelope to model a call on at `origin`: its own kind first, then the
 * Aura one, the LWR one, the REST one. null when none was seen. A designer
 * preview (Visualforce remoting) is a model for its own kind only. */
export function envelopeFor(store, origin, preferred) {
  const known = (store && store[origin]) || {};
  return known[preferred] || known.aura || known.lwr || known.rest || null;
}

/* ------------------------------------------------------ rewriting */

/* The same encoding as `original`: text that held JSON text (once, twice) holds
 * the new value the same way, anything else holds it as it is. */
function encodeLike(original, value) {
  let depth = 0;
  let current = original;
  while (typeof current === 'string' && depth < 3) {
    const decoded = safeParse(current);
    if (decoded === current) break;
    depth += 1;
    current = decoded;
  }
  let out = value;
  for (let level = 0; level < depth; level++) out = JSON.stringify(out);
  return out;
}

const emptyObject = (value) => (value === undefined || value === null || value === '' ? {} : value);

/* The remote call a request carries ({ sClassName, sMethodName, input, options },
 * or a bare input) rewritten for the action and the edited input and options. */
function rewriteCall(original, action, input, options) {
  const decoded = safeParse(original);
  const wrapped = isObject(decoded) && (decoded.sClassName !== undefined || decoded.sMethodName !== undefined ||
    decoded.input !== undefined || decoded.options !== undefined);
  if (!wrapped && !(action.remoteClass || action.remoteMethod)) return encodeLike(original, emptyObject(input));
  const call = wrapped ? { ...decoded } : {};
  call.sClassName = action.remoteClass || '';
  call.sMethodName = action.remoteMethod || '';
  call.input = encodeLike(wrapped ? decoded.input : undefined, emptyObject(input));
  call.options = encodeLike(wrapped ? decoded.options : undefined, emptyObject(options));
  return encodeLike(original, call);
}

function buildAura(envelope, action, input, options) {
  const form = new URLSearchParams(envelope.body);
  let message;
  try { message = JSON.parse(form.get('message')); } catch { message = null; }
  if (!isObject(message) || !Array.isArray(message.actions)) return null;
  const own = isObject(action.rawRequest) && isObject(action.rawRequest.params) ? action.rawRequest : null;
  const base = clone(own || message.actions.find((candidate) => isObject(candidate) && isObject(candidate.params)) || message.actions[0]);
  if (!isObject(base)) return null;
  const params = isObject(base.params) ? base.params : (base.params = {});
  if (action.apexClass) params.classname = action.apexClass;
  if (action.apexMethod) params.method = action.apexMethod;
  if (action.namespace !== undefined && (action.namespace || params.namespace !== undefined)) params.namespace = action.namespace;
  params.params = rewriteCall(params.params, action, input, options);
  form.set('message', JSON.stringify({ ...message, actions: [base] }));
  return form.toString();
}

function buildLwr(envelope, action, input, options) {
  let body;
  try { body = JSON.parse(envelope.body); } catch { return null; }
  if (!isObject(body)) return null;
  if (action.apexClass) body.classname = action.apexClass;
  if (action.apexMethod) body.method = action.apexMethod;
  if (action.namespace !== undefined && (action.namespace || body.namespace !== undefined)) body.namespace = action.namespace;
  const nested = isObject(body.params) && body.params.params !== undefined;
  if (nested) body.params.params = rewriteCall(body.params.params, action, input, options);
  else body.params = rewriteCall(body.params, action, input, options);
  return JSON.stringify(body);
}

const REST_KEY = /(\/integrationprocedure\/)([^/?#]+)/i;

/* The address of a REST call for another procedure key. */
function restUrl(url, key) {
  return REST_KEY.test(url) && key ? url.replace(REST_KEY, (all, lead) => lead + encodeURIComponent(key)) : url;
}

/* ----------------------------------------------- designer previews */

/* The calls a Visualforce remoting body holds: one object or an array. */
function callsOf(body) {
  let parsed;
  try { parsed = JSON.parse(body); } catch { return { calls: [], array: false }; }
  const calls = (Array.isArray(parsed) ? parsed : [parsed]).filter(isObject);
  return { calls, array: Array.isArray(parsed) };
}

const tidOf = (call) => (isObject(call) && Number.isFinite(Number(call.tid)) ? Number(call.tid) : 0);

/* The preview call to model a re-run on: the call the action was read from,
 * else one of the envelope's with the same method. */
function modelCall(calls, action) {
  if (isObject(action.rawRequest) && Array.isArray(action.rawRequest.data)) return action.rawRequest;
  return calls.find((call) => call.method === action.apexMethod && call.action === action.apexClass) || null;
}

/* A re-run of a designer preview (Visualforce remoting): the captured call
 * with its action, method, type and context kept, a transaction id larger than
 * any seen, and the edited input (and options) written back in the call's own
 * shape:
 *   Integration Procedure  data = [recordId, JSON text of the input, { ...options, isDebug: true }]
 *   DataRaptor             data = [{ ...the request, ...options, objectList: JSON text of the input, debug: true }]
 * The context (csrf, vid, authorization) is the newest the envelope holds, as
 * the older one may have expired. Returns the body text, null when the
 * action is not a preview or no captured call is there to copy. */
export function buildVfRemote(envelope, action, input, options) {
  if (!envelope || !action || (action.debug !== 'ip' && action.debug !== 'dr')) return null;
  const { calls, array } = callsOf(envelope.body);
  const base = modelCall(calls, action);
  if (!base) return null;
  const edited = isObject(options) ? options : {};
  const data = Array.isArray(base.data) ? base.data : [];
  const text = JSON.stringify(emptyObject(input));
  const rewritten = action.debug === 'ip'
    ? [data[0] === undefined ? (action.recordId || '') : data[0], text, { ...edited, isDebug: true }]
    : [{ ...(isObject(safeParse(data[0])) ? safeParse(data[0]) : {}), ...edited, objectList: text, debug: true }];
  const newest = [...calls].reverse().find((call) => isObject(call.ctx));
  const call = {
    action: base.action,
    method: base.method,
    data: rewritten,
    type: base.type === undefined ? 'rpc' : base.type,
    tid: Math.max(tidOf(base), ...calls.map(tidOf)) + 1,
    ctx: clone((newest || base).ctx)
  };
  if (call.ctx === undefined) delete call.ctx;
  return JSON.stringify(array ? [call] : call);
}

/* The request that sends `action` with the edited { input, options } the way
 * the envelope's request was sent: { url, method, headers, body }, headers as
 * the captured list (replayHeaders cuts it down). `url` in the edits replaces
 * the address. null when the envelope's body is not in the shape its kind
 * says, so nothing half-built is ever sent. */
export function buildRequest(envelope, action, { input, options, url } = {}) {
  if (!envelope || !action) return null;
  let body = null;
  if (envelope.kind === 'aura') body = buildAura(envelope, action, input, options);
  else if (envelope.kind === 'lwr') body = buildLwr(envelope, action, input, options);
  else if (envelope.kind === 'rest') body = JSON.stringify(emptyObject(input));
  else if (envelope.kind === 'vfremote') body = buildVfRemote(envelope, action, input, options);
  if (body === null) return null;
  const target = url || (envelope.kind === 'rest' ? restUrl(envelope.url, action.remoteMethod) : envelope.url);
  return { url: target, method: envelope.method || 'POST', headers: envelope.headers, body };
}
