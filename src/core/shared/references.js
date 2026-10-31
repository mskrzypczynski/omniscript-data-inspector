'use strict';

/* Who points at whom in a definition: show rules and validation expressions
 * name fields, Set Values name the fields they write, labels and formulas
 * carry %merge% fields. One index is built per definition and answers
 * "which element is this field?", "what does this element depend on?", "who
 * uses it?" and "what writes into it?".
 *
 * Best effort by design: a field can also name data that is not an element
 * (an action's response, a node a Set Values creates), so such a reference is
 * "external" (not judged) rather than an error.
 *
 * Pure: no DOM, no chrome.*. */

const MERGE = /%([A-Za-z_][\w:|.-]*)%/g;
const PLAIN_REF = /^[\w.-]+(?::[\w.|-]+)*$/;

/* Every %merge% field written in a text. */
export function mergeFields(text) {
  const out = [];
  if (typeof text !== 'string') return out;
  let match;
  MERGE.lastIndex = 0;
  while ((match = MERGE.exec(text))) out.push(match[1]);
  return out;
}

/* A rule group's fields and the %merge% fields in its expected values, in
 * reading order. Accepts { group: {...} } or a bare group. */
export function ruleReferences(group, depth = 0) {
  const out = { fields: [], merges: [] };
  const node = group && typeof group === 'object' && group.group && typeof group.group === 'object' ? group.group : group;
  if (!node || typeof node !== 'object' || depth > 6) return out;

  const add = (inner) => { out.fields.push(...inner.fields); out.merges.push(...inner.merges); };
  (node.rules || []).forEach((rule) => {
    if (!rule || typeof rule !== 'object') return;
    if (rule.group || rule.rules || rule.groups) { add(ruleReferences(rule.group || rule, depth + 1)); return; }
    const field = rule.field || rule.name;
    if (typeof field === 'string' && field.trim()) out.fields.push(field.trim());
    const data = rule.data !== undefined ? rule.data : rule.value;
    /* A value that starts with "=" is a formula: not judged. */
    if (!(typeof data === 'string' && data.trim().startsWith('='))) out.merges.push(...mergeFields(data));
  });
  (node.groups || []).forEach((nested) => {
    if (nested && typeof nested === 'object') add(ruleReferences(nested.group || nested, depth + 1));
  });
  return out;
}

/* The assignments of a Set Values element as [{ target, expression }], from
 * the object form ({ target: value }) or a list of { name, value }. */
export function assignmentsOf(element) {
  const map = element && element.setValues;
  const text = (value) => (value === undefined || value === null ? ''
    : (typeof value === 'string' ? value : JSON.stringify(value)));
  if (Array.isArray(map)) {
    return map
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({ target: String(entry.name || entry.key || entry.field || ''), expression: text(entry.value) }))
      .filter((entry) => entry.target);
  }
  if (map && typeof map === 'object') {
    return Object.keys(map).map((target) => ({ target, expression: text(map[target]) }));
  }
  return [];
}

/* "%Step:Field|1%" or "Step:Block|2:Field" -> ['Step', 'Block', 'Field']. */
export function referenceSegments(ref) {
  return String(ref).trim().replace(/^%|%$/g, '').split(':').map((part) => part.split('|')[0].trim());
}

/* The names of the elements above this one, nearest first. */
function ancestorNames(element, byKey) {
  const names = [];
  let node = byKey.get(element.parentKey);
  let guard = 0;
  while (node && guard++ < 100) { names.push(node.name); node = byKey.get(node.parentKey); }
  return names;
}

/* Are the wanted names (outermost first) found, in that order, among the
 * ancestors? Blocks may sit between them, so this is a subsequence test. */
function underPath(element, wanted, byKey) {
  const above = ancestorNames(element, byKey); // nearest first
  let at = 0;
  for (let i = wanted.length - 1; i >= 0; i--) {
    const found = above.indexOf(wanted[i], at);
    if (found < 0) return false;
    at = found + 1;
  }
  return true;
}

export function createReferences(elements) {
  const byKey = new Map(elements.map((element) => [element.key, element]));
  const byName = new Map();
  elements.forEach((element) => {
    if (!byName.has(element.name)) byName.set(element.name, []);
    byName.get(element.name).push(element);
  });
  const actionNames = new Set(elements.filter((e) => e.category.key === 'action').map((e) => e.name));

  /* Names a Set Values writes into: they may create data that is no element. */
  const setValueTargets = new Set();
  elements.forEach((element) => {
    if (element.isSetValues) assignmentsOf(element).forEach(({ target }) => {
      setValueTargets.add(referenceSegments(target).pop());
    });
  });

  /* { element } when the field is an element of the script; { external: true }
   * when it can be data that is no element; { element: null } when nothing by
   * that name exists. `strict` does not take a Set Values target as a node that
   * exists: the lint asks that way about the targets themselves. */
  function resolve(ref, { strict = false } = {}) {
    const text = String(ref === undefined || ref === null ? '' : ref).trim().replace(/^%|%$/g, '');
    if (!text || !PLAIN_REF.test(text)) return { element: null, external: true };

    const parts = referenceSegments(text);
    const last = parts[parts.length - 1];
    const earlier = parts.slice(0, -1);
    const candidates = byName.get(last) || [];

    if (candidates.length) {
      if (!earlier.length) return { element: candidates[0], external: false };
      const match = candidates.find((candidate) => underPath(candidate, earlier, byKey));
      if (match) return { element: match, external: false };
    }
    const viaAction = earlier.some((part) => actionNames.has(part));
    if (viaAction || (!strict && setValueTargets.has(last))) return { element: null, external: true };
    return { element: null, external: false };
  }

  /* Fields in each element's show rule and validateExpression. */
  const dependsOn = new Map();
  const usedBy = new Map();
  elements.forEach((element) => {
    const raw = element.node && element.node.propSetMap ? element.node.propSetMap : {};
    const refs = [
      ...ruleReferences(element.show).fields,
      ...ruleReferences(typeof raw.validateExpression === 'object' ? raw.validateExpression : null).fields
    ];
    const seen = new Set();
    const list = [];
    refs.forEach((field) => {
      const hit = resolve(field).element;
      const key = hit ? hit.key : null;
      const id = `${field}\u0000${key}`;
      if (seen.has(id)) return;
      seen.add(id);
      list.push({ field, key });
      if (key && key !== element.key) {
        if (!usedBy.has(key)) usedBy.set(key, []);
        if (!usedBy.get(key).includes(element.key)) usedBy.get(key).push(element.key);
      }
    });
    if (list.length) dependsOn.set(element.key, list);
  });

  /* Which Set Values write into which element. */
  const writtenBy = new Map();
  elements.forEach((element) => {
    if (!element.isSetValues) return;
    assignmentsOf(element).forEach(({ target }) => {
      const hit = resolve(target).element;
      if (!hit) return;
      if (!writtenBy.has(hit.key)) writtenBy.set(hit.key, []);
      if (!writtenBy.get(hit.key).includes(element.key)) writtenBy.get(hit.key).push(element.key);
    });
  });

  return { byKey, byName, resolve, dependsOn, usedBy, writtenBy, setValueTargets };
}

/* "A, B, C +2" for a long list; the full list lives in the relevant tab. */
export function shortList(names, limit = 3) {
  if (names.length <= limit) return names.join(', ');
  return `${names.slice(0, limit).join(', ')} +${names.length - limit}`;
}
