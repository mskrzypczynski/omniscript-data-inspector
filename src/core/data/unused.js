'use strict';

/* Unused data: the keys of a payload that no element of the script reads, so
 * the user can see the dead weight (a DataRaptor that returns forty fields of
 * which the script shows three, say).
 *
 * A key counts as read when an element has that name (case-sensitive, like the
 * OmniScript), or a reference in the definition (a show rule, a validation, a
 * Set Values target or source, a %merge% field in a label, text or formula,
 * an action's send or response path) runs through it. Best effort, on purpose
 * on the safe side: a key that only something this module does not read (an
 * action's extra payload, a custom LWC) uses is reported, but a branch is judged key by key only where the
 * definition says what its keys are, the steps and blocks; an element's own
 * value (an object a Lookup holds, an action's response) is never taken apart.
 * An action's sendJSONPath / sendJSONNode / responseJSONNode / responseJSONPath
 * count as references too: the data it sends or lands is read.
 *
 * Pure: no DOM, no chrome.*. */

import { isContainer, joinPath } from '../shared/json-tree-model.js';
import { createReferences, mergeFields, ruleReferences, assignmentsOf, referenceSegments } from '../shared/references.js';

/* Keys the platform or the runtime writes, which no element declares. Never
 * reported. */
export const PLATFORM_KEYS = new Set([
  'timeStamp', 'userId', 'userName', 'userProfile', 'userTimeZone', 'userTimeZoneName', 'userCurrencyCode',
  'omniProcessId', 'error', 'errorMessage', 'vlcPersistentComponent',
  'AccountId', 'ContextId', 'ContextIdNode'
]);

/* How many of them the Sizes list shows (the counts cover all of them). */
export const UNUSED_LIST_MAX = 50;

const MAX_DEPTH = 40;

/* Every string in a value (labels, text, formulas), for the %merge% fields in
 * them. Bounded in depth: a property set is not deep. */
function stringsIn(value, out, depth = 0) {
  if (typeof value === 'string') { out.push(value); return; }
  if (!value || typeof value !== 'object' || depth > 8) return;
  Object.keys(value).forEach((key) => stringsIn(value[key], out, depth + 1));
}

/* The settings of an action that name a place in the data: what it sends and
 * where the response lands. Written like a reference ("Step:Block|2:Field"). */
const ACTION_PATH_SETTINGS = ['sendJSONPath', 'sendJSONNode', 'responseJSONNode', 'responseJSONPath'];

/* The paths the definition reads, as lists of names (no |N positions). */
function referencedPaths(elements) {
  const refs = [];
  const add = (text) => {
    const parts = referenceSegments(text).filter(Boolean);
    if (parts.length) refs.push(parts);
  };
  elements.forEach((element) => {
    const property = element.node && element.node.propSetMap ? element.node.propSetMap : {};
    [ruleReferences(element.show), ruleReferences(typeof property.validateExpression === 'object' ? property.validateExpression : null)]
      .forEach(({ fields, merges }) => { fields.forEach(add); merges.forEach(add); });
    ACTION_PATH_SETTINGS.forEach((name) => { if (typeof property[name] === 'string') add(property[name]); });
    assignmentsOf(element).forEach(({ target, expression }) => { add(target); mergeFields(expression).forEach(add); });
    const texts = [];
    stringsIn(property, texts);
    texts.forEach((text) => mergeFields(text).forEach(add));
  });
  return refs;
}

/* A reference to the node, to something under it, or to something it sits under. */
function reachedBy(refs, parts) {
  return refs.some((ref) => {
    const shared = Math.min(ref.length, parts.length);
    for (let i = 0; i < shared; i++) if (ref[i] !== parts[i]) return false;
    return true;
  });
}

const sizeOf = (value) => {
  const text = JSON.stringify(value);
  return text === undefined ? 0 : text.length;
};

/* { keys: [{ path, size, share }], total, share }: the unused keys, largest
 * first (ties in tree order). path is the tree path; size the bytes of the
 * value as compact JSON; share its percent of the whole payload (one decimal).
 * total is the bytes of all of them, share their percent of the payload. With
 * no elements nothing can be judged, so nothing is reported. */
export function unusedKeys(data, elements) {
  const empty = { keys: [], total: 0, share: 0 };
  if (!isContainer(data) || !elements || !elements.length) return empty;

  const refs = referencedPaths(elements);
  const names = createReferences(elements).byName;
  const containers = new Set(elements.filter((element) => element.hasChildren).map((element) => element.name));
  const found = [];

  /* parts: the names above (positions left out); path: the tree path. */
  const judge = (node, parts, path, depth) => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => { if (isContainer(item)) judge(item, parts, joinPath(path, String(i), depth), depth + 1); });
      return;
    }
    Object.keys(node).forEach((key) => {
      if (PLATFORM_KEYS.has(key)) return;
      const childParts = [...parts, key];
      const childPath = joinPath(path, key, depth);
      const named = names.has(key);
      if (!named && !reachedBy(refs, childParts)) { found.push({ path: childPath, size: sizeOf(node[key]), order: found.length }); return; }
      if (named && containers.has(key) && isContainer(node[key])) judge(node[key], childParts, childPath, depth + 1);
    });
  };
  judge(data, [], '', 0);

  const whole = sizeOf(data);
  const percent = (size) => (whole ? Math.round((size / whole) * 1000) / 10 : 0);
  found.sort((a, b) => b.size - a.size || a.order - b.order);
  const keys = found.map(({ path, size }) => ({ path, size, share: percent(size) }));
  const total = found.reduce((sum, item) => sum + item.size, 0);
  return { keys, total, share: percent(total) };
}
