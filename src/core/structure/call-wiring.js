'use strict';

/* How an action element is wired to the data: what it sends (from sendJSONPath,
 * sendJSONNode, sendOnlyExtraPayload and extraPayload), where the answer lands
 * (responseJSONNode, responseJSONPath) and what it does on failure, all read
 * from its propSetMap. Best effort: a key that is absent says nothing, and a
 * build that names these properties differently simply shows less.
 *
 * Pure: no DOM, no chrome.*. */

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/* true for true and "true". */
const isOn = (value) => value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

/* The keys of the extra payload: an object, or JSON text that holds one. */
function extraKeys(value) {
  let object = value;
  if (typeof value === 'string' && value.trim()) {
    try { object = JSON.parse(value); } catch { return []; }
  }
  return object && typeof object === 'object' && !Array.isArray(object) ? Object.keys(object) : [];
}

/* "Step1:Block|2:Field" -> ['Step1', 'Block', 'Field']: the keys from the root
 * of the data, as the Data tab takes them. */
export function pathSegments(path) {
  return String(path || '').trim().replace(/^%|%$/g, '').split(':').map((part) => {
    const bar = part.indexOf('|');
    return (bar > -1 ? part.slice(0, bar) : part).trim();
  }).filter(Boolean);
}

/* The tooltip of the Response node line. */
const RESPONSE_NODE_TITLE = 'The response node (responseJSONNode) is the place in the data where the answer of ' +
  'the call is written. When the action sets none, the answer is merged into the data root, the top level of ' +
  'the OmniScript data, instead.';

const FAILURE = [
  ['failureNextStep', 'On failure goes to'],
  ['failureResponse', 'On failure responds with']
];

/* null for an element that is no action and names none of the keys; else
 *   sends   — { label: 'Sends', value, note, segments, line }
 *   lands   — { label: 'Response node', value, note, segments, line, title }
 *   failure — [{ label, value }]
 *   remote  — the Data Mapper, Integration Procedure or class it calls ('' if none)
 * `value` is the part that names a place in the data and `segments` its keys
 * (null when it does not name one: the whole data, or only the extra payload);
 * `note` is what follows it; `line` is all of it as one sentence. */
export function callWiring(element) {
  const props = (element && element.node && element.node.propSetMap) || {};
  const keys = ['sendJSONPath', 'sendJSONNode', 'sendOnlyExtraPayload', 'extraPayload', 'responseJSONPath',
    'responseJSONNode', 'failureNextStep', 'failureResponse'];
  const isAction = !!element && !!element.category && element.category.key === 'action';
  if (!isAction && !keys.some((key) => props[key] !== undefined)) return null;

  const sendPath = text(props.sendJSONPath);
  const sendNode = text(props.sendJSONNode);
  const only = isOn(props.sendOnlyExtraPayload);
  const extra = extraKeys(props.extraPayload);
  const extraNote = extra.length ? `extra payload: ${extra.join(', ')}` : '';

  let sendValue;
  let sendNote;
  let sendSegments = null;
  if (only) {
    sendValue = 'only the extra payload';
    sendNote = extra.length ? ` (${extra.join(', ')})` : '';
  } else if (sendPath) {
    sendValue = sendPath;
    sendSegments = pathSegments(sendPath);
    sendNote = `${sendNode ? ` as ${sendNode}` : ''}${extraNote ? `, plus ${extraNote}` : ''}`;
  } else {
    sendValue = 'the whole data';
    sendNote = `${sendNode ? ` as ${sendNode}` : ''}${extraNote ? `, plus ${extraNote}` : ''}`;
  }

  const node = text(props.responseJSONNode);
  const responsePath = text(props.responseJSONPath);
  let landValue;
  let landNote;
  let landSegments = null;
  if (node) {
    landValue = node;
    landSegments = pathSegments(node);
    landNote = responsePath ? ` (from ${responsePath} of the response)` : '';
  } else {
    landValue = 'none set';
    landNote = ` · ${responsePath ? `takes ${responsePath} of the response, ` : ''}the answer lands in the data root`;
  }

  const failure = FAILURE
    .map(([key, label]) => {
      const raw = props[key];
      const value = typeof raw === 'string' ? raw.trim() : (raw && typeof raw === 'object' ? JSON.stringify(raw) : '');
      return value ? { label, value } : null;
    })
    .filter(Boolean);

  return {
    sends: { label: 'Sends', value: sendValue, note: sendNote, segments: sendSegments, line: `Sends: ${sendValue}${sendNote}` },
    lands: {
      label: 'Response node', value: landValue, note: landNote, segments: landSegments,
      line: `Response node: ${landValue}${landNote}`, title: RESPONSE_NODE_TITLE
    },
    failure,
    remote: (element && element.remote) || ''
  };
}
