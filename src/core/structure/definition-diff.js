'use strict';

/* What differs between two versions of a script's definition: elements added,
 * removed, renamed, and changed in the things a person edits in the Designer.
 * Both sides are flattened element lists (structure-model.js flatten), the
 * older one first. Runtime fields (bShow, asIndex, indexInParent) are not
 * compared: the running script rewrites them.
 *
 * Elements are paired from the top down. Inside a pair of parents, children
 * with the same name and type are the same element; of the rest, a child with
 * the same type at the same position among its siblings is the same element
 * under a new name (a rename). Anything left is added or removed.
 *
 * Pure: no DOM, no chrome.*. */

import { parseObj } from '../shared/structure-model.js';

const OPTIONS_SHOWN = 3;

function childrenByParent(elements) {
  const out = new Map();
  elements.forEach((element) => {
    const key = element.parentKey || '';
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(element);
  });
  return out;
}

/* Names from the top of the script down to the element: "Step1 › Block › Field". */
function pathOf(element, byKey) {
  const names = [];
  let node = element;
  let guard = 0;
  while (node && guard++ < 100) {
    names.unshift(node.name);
    node = byKey.get(node.parentKey);
  }
  return names.join(' › ');
}

function descendants(element, kids) {
  const out = [];
  (kids.get(element.key) || []).forEach((child) => { out.push(child, ...descendants(child, kids)); });
  return out;
}

/* ------------------------------------------------------------ what changed */

const quote = (text) => `“${text}”`;
const shortText = (text, limit = 60) => (text.length > limit ? `${text.slice(0, limit)}…` : text);
const propertySetOf = (element) => (element.node && element.node.propSetMap) || {};

function describeValue(value) {
  if (value === undefined || value === null || value === '') return '(none)';
  return typeof value === 'string' ? quote(shortText(value)) : shortText(JSON.stringify(value));
}

const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);

function describeOptions(before, after) {
  const asMap = (options) => {
    const map = new Map();
    (Array.isArray(options) ? options : []).forEach((option, i) => {
      const name = option && option.name !== undefined ? String(option.name) : `#${i + 1}`;
      map.set(name, JSON.stringify(option));
    });
    return map;
  };
  const was = asMap(before);
  const now = asMap(after);
  const added = [...now.keys()].filter((name) => !was.has(name));
  const removed = [...was.keys()].filter((name) => !now.has(name));
  const edited = [...now.keys()].filter((name) => was.has(name) && was.get(name) !== now.get(name));
  const list = (names) => names.slice(0, OPTIONS_SHOWN).join(', ') + (names.length > OPTIONS_SHOWN ? ` +${names.length - OPTIONS_SHOWN}` : '');
  const bits = [];
  if (added.length) bits.push(`added ${list(added)}`);
  if (removed.length) bits.push(`removed ${list(removed)}`);
  if (edited.length) bits.push(`changed ${list(edited)}`);
  if (!bits.length) bits.push('reordered');
  return `options: ${bits.join('; ')}`;
}

function describeAssignments(before, after) {
  const asMap = (value) => {
    if (Array.isArray(value)) {
      return new Map(value.filter((entry) => entry && typeof entry === 'object')
        .map((entry) => [String(entry.name || entry.key || entry.field || ''), entry.value]));
    }
    return new Map(Object.entries(value && typeof value === 'object' ? value : {}));
  };
  const was = asMap(before);
  const now = asMap(after);
  const added = [...now.keys()].filter((name) => !was.has(name));
  const removed = [...was.keys()].filter((name) => !now.has(name));
  const edited = [...now.keys()].filter((name) => was.has(name) && !same(was.get(name), now.get(name)));
  const bits = [];
  if (added.length) bits.push(`added ${added.join(', ')}`);
  if (removed.length) bits.push(`removed ${removed.join(', ')}`);
  if (edited.length) bits.push(`changed ${edited.join(', ')}`);
  return `Set Values: ${bits.join('; ') || 'changed'}`;
}

/* The parts of an element's validation that a person edits. */
function validationParts(validation) {
  if (!validation || !validation.has) return {};
  return {
    'condition': validation.triggerExpr,
    'expression': validation.validateExpr,
    'message': validation.message,
    'runs on': validation.runsOn,
    'error targets': validation.errorMap.map((entry) => [entry.element, entry.message]),
    'messages': validation.messages.map((m) => [m.type, m.text, m.when, m.condition])
  };
}

function describeValidation(before, after) {
  const was = validationParts(before);
  const now = validationParts(after);
  const names = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter((name) => !same(was[name], now[name]));
  return `validation: ${names.join(', ') || 'changed'}`;
}

/* A short sentence per difference between a pair; empty when nothing a person
 * edits differs. */
export function elementChanges(before, after) {
  const changes = [];
  const was = propertySetOf(before);
  const now = propertySetOf(after);

  if (before.label !== after.label || before.labelKey !== after.labelKey) {
    const textWas = before.label || before.labelKey;
    const textNow = after.label || after.labelKey;
    changes.push(`label: ${describeValue(textWas)} → ${describeValue(textNow)}`);
  }
  if (before.required !== after.required) changes.push(`required: ${before.required ? 'yes' : 'no'} → ${after.required ? 'yes' : 'no'}`);

  if (before.showExpr !== after.showExpr || !same(before.show, after.show)) {
    changes.push(`show rule: ${describeValue(before.showExpr)} → ${describeValue(after.showExpr)}`);
  }
  if (!same(validationParts(before.validation), validationParts(after.validation))) {
    changes.push(describeValidation(before.validation, after.validation));
  }
  if (before.remote !== after.remote) changes.push(`calls: ${describeValue(before.remote)} → ${describeValue(after.remote)}`);
  if (!same(was.options, now.options)) changes.push(describeOptions(was.options, now.options));
  if (!same(was.elementValueMap, now.elementValueMap)) changes.push(describeAssignments(was.elementValueMap, now.elementValueMap));
  if (!same(was.helpText, now.helpText)) changes.push(`help text: ${describeValue(was.helpText)} → ${describeValue(now.helpText)}`);
  return changes;
}

/* ------------------------------------------------------------- the diff */

/* Pairs the children of two matched parents: [{ before, after, renamed }]. */
function pairChildren(beforeKids, afterKids) {
  const pairs = [];
  const usedBefore = new Set();
  const usedAfter = new Set();

  afterKids.forEach((child) => {
    const twin = beforeKids.find((candidate) => !usedBefore.has(candidate.key) &&
      candidate.name === child.name && candidate.type === child.type);
    if (!twin) return;
    usedBefore.add(twin.key);
    usedAfter.add(child.key);
    pairs.push({ before: twin, after: child, renamed: false });
  });

  afterKids.forEach((child, i) => {
    if (usedAfter.has(child.key)) return;
    const candidate = beforeKids[i];
    if (!candidate || usedBefore.has(candidate.key) || candidate.type !== child.type) return;
    usedBefore.add(candidate.key);
    usedAfter.add(child.key);
    pairs.push({ before: candidate, after: child, renamed: true });
  });
  return pairs;
}

/* { added, removed, renamed, changed, unchanged, total }
 *   added    — [{ element, path, parentAdded }] elements only in `after`;
 *              parentAdded is true for one inside an added element
 *   removed  — [{ element, path, parentRemoved }] elements only in `before`
 *   renamed  — [{ before, after, path, changes }] same place and type, new name
 *   changed  — [{ before, after, path, changes }] same element, edited
 *   unchanged — how many pairs differ in nothing a person edits
 *   total    — the number of differences listed
 * `path` is the element's place in its own version. A rename that also edited
 * something lists those edits in `changes`. */
export function diffDefinitions(before, after) {
  const was = Array.isArray(before) ? before : [];
  const now = Array.isArray(after) ? after : [];
  const wasKids = childrenByParent(was);
  const nowKids = childrenByParent(now);
  const wasByKey = new Map(was.map((element) => [element.key, element]));
  const nowByKey = new Map(now.map((element) => [element.key, element]));

  const out = { added: [], removed: [], renamed: [], changed: [], unchanged: 0, total: 0 };
  const matchedBefore = new Set();
  const matchedAfter = new Set();

  function walk(beforeParent, afterParent) {
    const pairs = pairChildren(wasKids.get(beforeParent) || [], nowKids.get(afterParent) || []);
    pairs.forEach(({ before: oldOne, after: newOne, renamed }) => {
      matchedBefore.add(oldOne.key);
      matchedAfter.add(newOne.key);
      const changes = elementChanges(oldOne, newOne);
      const entry = { before: oldOne, after: newOne, path: pathOf(newOne, nowByKey), changes };
      if (renamed) out.renamed.push(entry);
      else if (changes.length) out.changed.push(entry);
      else out.unchanged++;
      walk(oldOne.key, newOne.key);
    });
  }
  walk('', '');

  now.forEach((element) => {
    if (matchedAfter.has(element.key)) return;
    out.added.push({ element, path: pathOf(element, nowByKey), parentAdded: !!element.parentKey && !matchedAfter.has(element.parentKey) });
  });
  was.forEach((element) => {
    if (matchedBefore.has(element.key)) return;
    out.removed.push({ element, path: pathOf(element, wasByKey), parentRemoved: !!element.parentKey && !matchedBefore.has(element.parentKey) });
  });

  /* A renamed element is listed in the order of the newer script. */
  const order = new Map(now.map((element, i) => [element.key, i]));
  out.renamed.sort((a, b) => order.get(a.after.key) - order.get(b.after.key));
  out.changed.sort((a, b) => order.get(a.after.key) - order.get(b.after.key));
  out.total = out.added.length + out.removed.length + out.renamed.length + out.changed.length;
  return out;
}

/* Every element beneath one (for a count such as "and 4 inside"). */
export function elementsInside(element, elements) {
  return descendants(element, childrenByParent(elements));
}

/* ----------------------------------------------------------- reading a file */

const looksLikeDefinition = (value) => !!value && typeof value === 'object' && !Array.isArray(value) &&
  (Array.isArray(value.children) || Array.isArray(value.eleArray) || Array.isArray(value.childrenElements) ||
    typeof value.bpType === 'string' || typeof value.type === 'string');

/* The definition a loaded file holds: { definition } for a raw definition (the
 * jsonDef text) or a debug bundle that carries it as definition.raw, else
 * { error } saying what the file is missing. `text` is the file's contents. */
export function definitionFromFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'This file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'This file is not an OmniScript definition.' };
  }

  const isBundle = parsed.definition && typeof parsed.definition === 'object' && ('tabs' in parsed || 'generatedAt' in parsed || 'payload' in parsed);
  if (isBundle) {
    const raw = parsed.definition.raw;
    const definition = typeof raw === 'string' ? parseObj(raw) : (raw && typeof raw === 'object' ? raw : null);
    return looksLikeDefinition(definition)
      ? { definition, from: 'bundle' }
      : { error: 'This debug bundle holds no definition. Save the bundle again from a build that includes it, or use a definition file.' };
  }
  return looksLikeDefinition(parsed)
    ? { definition: parsed, from: 'definition' }
    : { error: 'This file is not an OmniScript definition or a debug bundle.' };
}
