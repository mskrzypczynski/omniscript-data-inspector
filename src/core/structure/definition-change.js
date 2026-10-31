'use strict';

/* Has the script's definition changed in a way the Structure tab shows? The
 * runtime rewrites the definition as the script runs (asIndex, bShow and so
 * on), so comparing the raw text would redraw constantly; this compares only
 * what a person edits in the Designer. And when it did change, which of the old
 * element keys are which of the new ones, so a selection and the folds survive.
 *
 * Pure: no DOM, no chrome.*. */

/* The part of an element's validation that comes from the definition. */
function validationPart(validation) {
  if (!validation || !validation.has) return null;
  return [
    validation.kind, validation.runsOn, validation.triggerExpr, validation.validateExpr,
    validation.message,
    validation.errorMap.map((m) => [m.element, m.message]),
    validation.messages.map((m) => [m.type, m.text, m.when, m.condition])
  ];
}

/* Keys the running script writes into an element's propSetMap itself: bShow
 * and asIndex, any other b-prefixed flag (bVisited), and __-prefixed
 * bookkeeping. Everything else in propSetMap is something a person set. */
const RUNTIME_KEY = /^(__|b[A-Z]|asIndex$)/;

/* A canonical copy of a value without the runtime keys, object keys sorted. */
function settled(value, depth) {
  if (Array.isArray(value)) return depth > 12 ? null : value.map((item) => settled(item, depth + 1));
  if (!value || typeof value !== 'object') return value === undefined ? null : value;
  if (depth > 12) return null;
  const out = {};
  Object.keys(value).sort().forEach((key) => {
    if (RUNTIME_KEY.test(key) || value[key] === undefined) return;
    out[key] = settled(value[key], depth + 1);
  });
  return out;
}

/* A short fingerprint of text (FNV-1a), so a big propSetMap adds a few
 * characters to the signature instead of its whole text. */
function hashText(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36) + ':' + text.length;
}

/* What a person set on the element, as one fingerprint. */
function propSetFingerprint(element) {
  const propertySet = element.node && element.node.propSetMap;
  return propertySet && typeof propertySet === 'object' ? hashText(JSON.stringify(settled(propertySet, 0))) : '';
}

/* A string that is equal for two flattened scripts exactly when they have the
 * same structure. Runtime fields (asIndex, bShow, indexInParent) are left out, but every
 * other propSetMap property counts: help text, options, Set Values maps and
 * label keys are edited in the Designer too. */
export function structureSignature(elements) {
  return JSON.stringify(elements.map((element) => [
    element.key,
    element.type,
    element.name,
    element.label,
    element.required,
    element.showExpr,
    element.remote,
    element.jsonPath,
    validationPart(element.validation),
    propSetFingerprint(element)
  ]));
}

/* Names from the top of the script down to the element, plus its type: what
 * stays the same when an element is added above it and every key shifts. */
function identityOf(element, byKey) {
  const names = [];
  let node = element;
  let guard = 0;
  while (node && guard++ < 100) {
    names.unshift(node.name);
    node = byKey.get(node.parentKey);
  }
  return `${names.join('/')}\u0000${element.type}`;
}

function identities(elements) {
  const byKey = new Map(elements.map((element) => [element.key, element]));
  return elements.map((element) => identityOf(element, byKey));
}

/* Map of old key to new key for the elements that are still there. Elements
 * that share a name path are paired in order. */
export function remapKeys(previous, next) {
  const queues = new Map();
  const nextIds = identities(next);
  next.forEach((element, i) => {
    if (!queues.has(nextIds[i])) queues.set(nextIds[i], []);
    queues.get(nextIds[i]).push(element.key);
  });

  const map = new Map();
  const previousIds = identities(previous);
  previous.forEach((element, i) => {
    const queue = queues.get(previousIds[i]);
    if (queue && queue.length) map.set(element.key, queue.shift());
  });
  return map;
}

/* A set of keys carried over to the new keys; gone elements drop out. */
export function remapSet(keys, map) {
  const out = new Set();
  keys.forEach((key) => { if (map.has(key)) out.add(map.get(key)); });
  return out;
}
