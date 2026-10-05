'use strict';

/* Remote-action domain model: everything the Remote actions tab knows about
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
 * belongs in src/ui/actions-tab.js.
 */

export function classify(url, method) {
  if (String(method).toUpperCase() !== 'POST') return null;
  if (/\/aura(\?|$)/.test(url)) return 'aura';
  if (/webruntime\/api\/apex\/execute/.test(url)) return 'lwr';
  if (/\/apexremote/.test(url)) return 'vfremote';
  return null;
}

export function safeParse(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function fromAuraAction(auraAction) {
  const params = auraAction.params || {};
  const remoteCall = params.params || {};
  return {
    wireId: auraAction.id,
    descriptor: auraAction.descriptor || '',
    apexClass: params.classname || '',
    apexMethod: params.method || '',
    remoteClass: remoteCall.sClassName || '',
    remoteMethod: remoteCall.sMethodName || '',
    input: safeParse(remoteCall.input !== undefined ? remoteCall.input : remoteCall),
    options: safeParse(remoteCall.options),
    rawRequest: auraAction
  };
}

export function parseRequest(kind, text) {
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
      remoteClass: remoteCall.sClassName || '',
      remoteMethod: remoteCall.sMethodName || '',
      input: safeParse(remoteCall.input !== undefined ? remoteCall.input : remoteCall),
      options: safeParse(remoteCall.options),
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
  if (!text) return null;
  const stripped = String(text).replace(/^\s*while\s*\(1\);?/, '');
  try {
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

/* Pull the result for one action out of a decoded response body. */
export function resultFor(kind, body, action, index) {
  if (!body) return { state: null, output: undefined, error: null };

  if (kind === 'aura' && Array.isArray(body.actions)) {
    const hit = body.actions.find((entry) => entry.id === action.wireId) || body.actions[index] || null;
    if (!hit) return { state: null, output: undefined, error: null };
    return {
      state: hit.state || null,
      output: unwrap(hit.returnValue),
      error: (hit.error && hit.error.length) ? hit.error : null
    };
  }

  if (kind === 'vfremote') {
    const results = Array.isArray(body) ? body : [body];
    const found = results[index] || results[0];
    if (!found) return { state: null, output: undefined, error: null };
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
    const keys = Object.keys(out);
    if (out.returnValue !== undefined && keys.length <= 2) { out = safeParse(out.returnValue); continue; }
    if (out.result !== undefined && keys.length <= 2) { out = safeParse(out.result); continue; }
    break;
  }
  return out;
}

export function isOmni(action) {
  if (action.remoteClass || action.remoteMethod) return true;
  if (/invokeMethod/i.test(action.apexMethod)) return true;
  return /omniscript|omnistudio|vlocity|integrationprocedure/i.test(
    action.apexClass + ' ' + action.descriptor);
}

export function label(action) {
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
 * the same invokeInboundDR. The bundle name travels in the options (or
 * sometimes the input), so dig it out and label rows with that instead. */

const BUNDLE_NAME_KEYS = [
  'bundle', 'bundlename', 'dataraptorname', 'drname', 'drbundle',
  'integrationprocedurekey', 'ipkey', 'procedurekey', 'integrationprocedure'
];

export function findName(action) {
  for (const source of [action.options, action.input]) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (BUNDLE_NAME_KEYS.includes(key.toLowerCase()) && typeof value === 'string' && value) return value;
    }
  }
  return '';
}

/* Class names differ between the Vlocity managed packages and standard
 * OmniStudio — vlocity_ins.IntegrationProcedureService versus
 * omnistudiocore.IPService, and likewise DataRaptor versus Data Mapper — so
 * match on several spellings, then fall back to the shape of the call. */
const IP_PATTERN = /integrationprocedure|ipservice|invokeip|runintegrationprocedure/i;
const DR_PATTERN = /dromniscript|inbounddr|outbounddr|dataraptor|datamapper|drservice|invokeinbound|invokeoutbound|turboextract/i;

/* Type_SubType, the shape of an Integration Procedure key. */
const IP_KEY_SHAPE = /^[A-Za-z0-9]+_[A-Za-z0-9]+$/;

export function kindOf(action) {
  const signature = `${action.remoteClass}.${action.remoteMethod} ${action.apexClass}.${action.apexMethod}`;
  if (DR_PATTERN.test(signature)) return 'DR';
  if (IP_PATTERN.test(signature)) return 'IP';
  // Unrecognised service class calling a Type_SubType method: still an IP.
  if (/service$/i.test(action.remoteClass || '') && IP_KEY_SHAPE.test(action.remoteMethod || '')) return 'IP';
  if (action.remoteClass || action.remoteMethod) return 'RA';
  return 'APEX';
}

export const KIND_LABEL = {
  DR: 'Data mapper / DataRaptor',
  IP: 'Integration Procedure',
  RA: 'Remote action',
  APEX: 'Apex call'
};

/* Options that change what a call actually does are worth seeing without
 * opening the Options tab. Text labels rather than glyphs: "chain" needs no
 * legend, and a chain emoji renders at a different size on every platform. */
const OPTION_FLAGS = [
  ['chain', ['chainable'],
    'Chainable — the response is fed into the next call in the chain'],
  ['q-chain', ['queueableChainable'],
    'Queueable chainable — the chain continues on a later queued request, so the result here may not be the end of it'],
  ['queue', ['useQueueableApexRemoting', 'useQueueable'],
    'Runs as queueable Apex; the result arrives on a later request'],
  ['future', ['useFuture'],
    'Runs in a future method, asynchronously'],
  ['cont', ['useContinuation'],
    'Uses an Apex continuation for a long-running callout'],
  ['cache✕', ['ignoreCache'],
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
    flags.push({ label: 'pre', title: `Pre-transform Data Mapper: ${preTransformBundle}` });
  }
  if (typeof postTransformBundle === 'string' && postTransformBundle) {
    flags.push({ label: 'post', title: `Post-transform Data Mapper: ${postTransformBundle}` });
  }
  return flags;
}

export function displayName(action) {
  const kind = kindOf(action);
  const found = findName(action);
  if (kind === 'DR') return found || label(action);
  if (kind === 'IP') return found || action.remoteMethod || label(action);
  return label(action);
}

/* ---------------------------------------------------------- failure */

/* OmniStudio payloads often carry an `error` key that is not an error —
 * DataRaptor and Integration Procedure responses routinely come back with
 * error: "OK" or error: false. Flagging those red would mark almost every
 * successful call as broken, so only a meaningful value counts. */
const BENIGN_ERROR_VALUES = ['ok', 'false', 'no', 'none', 'null', 'success', '0', ''];

export function isRealError(value, depth = 0) {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') return !BENIGN_ERROR_VALUES.includes(value.trim().toLowerCase());
  if (typeof value === 'number') return value !== 0;
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

/* Returns why this call counts as failed, or null when it does not. Naming
 * the rule that fired matters: a red row on a SUCCESS response is otherwise
 * impossible to account for without reading the source. */
export function failureReason(entry, full) {
  const say = (value) => (full ? (typeof value === 'string' ? value : JSON.stringify(value)) : brief(value));

  if (isRealError(entry.error)) return `Action error — ${say(entry.error)}`;
  if (entry.state && entry.state !== 'SUCCESS') return `Aura state is ${entry.state}`;
  if (entry.httpStatus && entry.httpStatus >= 400) return `HTTP ${entry.httpStatus}`;

  if (entry.output && typeof entry.output === 'object' && !Array.isArray(entry.output)) {
    if (entry.output.hasErrors === true) return 'Response sets hasErrors: true';

    // Integration Procedure may nest an IPResult node that signals failure
    // explicitly. Match the key case-insensitively and treat success:false
    // or a meaningful error as a failure marker.
    try {
      const ipResultKey = Object.keys(entry.output).find((key) => key.toLowerCase() === 'ipresult');
      if (ipResultKey) {
        const ipResult = entry.output[ipResultKey];
        if (ipResult && typeof ipResult === 'object') {
          if (ipResult.success === false) return `IPResult indicates failure — ${say(ipResult.error || ipResult)}`;
          if (isRealError(ipResult.error)) return `IPResult indicates failure — ${say(ipResult.error)}`;
        }
      }
    } catch {
      /* defensive: entry.output may not be enumerable */
    }

    if (isRealError(entry.output.error)) return `Response error — ${say(entry.output.error)}`;
    if (isRealError(entry.output.errors)) return `Response errors — ${say(entry.output.errors)}`;
  }

  return null;
}

export function failed(entry) {
  return failureReason(entry) !== null;
}

/* ------------------------------------------------------ filtering */

/* opts: { onlyOmni, query, errorsOnly, slowMs } */
export function matchesFilter(entry, opts) {
  if (opts.onlyOmni && !entry.omni) return false;
  if (opts.errorsOnly && !failed(entry)) return false;
  if (opts.slowMs > 0 && !(entry.duration >= opts.slowMs)) return false;

  const query = (opts.query || '').trim().toLowerCase();
  if (!query) return true;
  return `${entry.name} ${entry.signature} ${entry.url}`.toLowerCase().includes(query);
}

/* ---------------------------------------------- script elements */

/* The element of the script that makes this call: the one whose bundle,
 * Integration Procedure key or remote class is what the call is named after.
 * null when none does (a custom Apex call, or the definition is not loaded). */
export function elementForCall(entry, elements) {
  const names = new Set([entry.name, entry.signature, findName(entry.action || {})].filter(Boolean));
  return elements.find((element) => element.remote && names.has(element.remote)) || null;
}

/* Calls made by one element, in the order they happened. */
export function callsForElement(element, entries) {
  if (!element.remote) return [];
  return entries.filter((entry) => {
    const names = [entry.name, entry.signature, findName(entry.action || {})];
    return names.includes(element.remote);
  });
}

/* The call before this one that was made to the same place, for "what
 * changed since last time". */
export function previousSimilar(entries, entry) {
  const at = entries.indexOf(entry);
  for (let i = at - 1; i >= 0; i--) {
    if (entries[i].name === entry.name && entries[i].signature === entry.signature) return entries[i];
  }
  return null;
}
