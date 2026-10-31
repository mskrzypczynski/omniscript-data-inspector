'use strict';

/* The summary of a whole script, for the detail pane while no element is
 * selected: what it is, how big it is, what it calls, how it stands now. Rows
 * appear only while they have something to say, so a bare definition gives
 * just its identity (or nothing).
 *
 * A row is { id, label, text, items?, link? }:
 *   text  — the line, when the row is plain text
 *   items — [{ text, key, count }] names the row lists; each links to the
 *           element `key` (the first that has that name)
 *   link  — { kind: 'problems' } or { kind: 'element', key, tab? } when the
 *           whole row is one jump
 *
 * Read best effort from the root of the definition and its propSetMap: a
 * field a build does not carry is left out, never guessed.
 *
 * Pure: no DOM, no chrome.*. */

import { countProblems } from './lint.js';
import { customLabelRows } from './structure-export.js';
import { overriddenElements, overrideTitle } from './overrides.js';

/* Root fields the summary reads; everything else (above all the children, which
 * can be megabytes) is left behind. */
const ROOT_KEYS = ['name', 'bpType', 'bpSubType', 'bpLang', 'omniProcessType', 'isActive', 'isReusable', 'versionNumber',
  'bpVersion', 'version', 'lwcId', 'asIndex'];
const PROP_KEYS = ['persistentComponent', 'elementTypeComponentMapping', 'lwcId', 'omniProcessType', 'versionNumber', 'isActive', 'isReusable'];

/* The part of a definition the summary needs, small enough to keep in state. */
export function rootOf(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return {};
  const root = {};
  ROOT_KEYS.forEach((key) => { if (definition[key] !== undefined) root[key] = definition[key]; });
  const props = definition.propSetMap;
  if (props && typeof props === 'object' && !Array.isArray(props)) {
    root.propSetMap = {};
    PROP_KEYS.forEach((key) => { if (props[key] !== undefined) root.propSetMap[key] = props[key]; });
  }
  return root;
}

const text = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '');

/* A field of the root, else the same name in its propSetMap. */
function field(root, key) {
  if (root[key] !== undefined && root[key] !== null && root[key] !== '') return root[key];
  const props = root.propSetMap || {};
  return props[key] !== undefined && props[key] !== null && props[key] !== '' ? props[key] : undefined;
}

const flag = (value) => (value === true || value === 'true' ? true : (value === false || value === 'false' ? false : null));

function scriptName(root) {
  const type = text(root.bpType);
  const subType = text(root.bpSubType);
  const own = text(root.name);
  if (type || subType) return [type, subType].filter(Boolean).join('/');
  return own;
}

function identityRows(root) {
  const rows = [];
  const type = text(root.bpType);
  const subType = text(root.bpSubType);
  const language = text(root.bpLang);
  const identity = [type, subType, language].filter(Boolean).join(' / ');
  if (identity) rows.push({ id: 'identity', label: 'Type/SubType/Language', text: identity });

  const version = text(field(root, 'versionNumber') !== undefined ? field(root, 'versionNumber') : (root.bpVersion !== undefined ? root.bpVersion : root.version));
  const active = flag(field(root, 'isActive'));
  const reusable = flag(field(root, 'isReusable'));
  const bits = [];
  /* The row is labelled Version, so the number needs no word of its own. */
  const kind = [text(field(root, 'omniProcessType')), version].filter(Boolean).join(' ');
  if (kind) bits.push(kind);
  if (active !== null) bits.push(active ? 'active' : 'not active');
  if (reusable) bits.push('reusable');
  if (bits.length) rows.push({ id: 'version', label: 'Version', text: bits.join(' · ') });

  const component = text(field(root, 'lwcId'));
  if (component) rows.push({ id: 'component', label: 'Component id', text: component });

  const mapping = field(root, 'elementTypeComponentMapping');
  const mapped = mapping && typeof mapping === 'object' && !Array.isArray(mapping) ? Object.keys(mapping).length : 0;
  if (mapped) rows.push({ id: 'mapping', label: 'Custom component mappings', text: String(mapped) });

  const persistent = field(root, 'persistentComponent');
  const persistentCount = Array.isArray(persistent) ? persistent.filter(Boolean).length : (persistent && typeof persistent === 'object' ? 1 : 0);
  if (persistentCount) rows.push({ id: 'persistent', label: 'Persistent components', text: String(persistentCount) });
  return rows;
}

const KINDS = [
  ['fields', (e) => ['input', 'choice'].includes(e.category.key), (n) => `${n} ${n === 1 ? 'field' : 'fields'}`],
  ['display', (e) => e.category.key === 'display', (n) => `${n} text or display`],
  ['blocks', (e) => e.category.key === 'block', (n) => `${n} ${n === 1 ? 'block' : 'blocks'}`],
  ['actions', (e) => e.category.key === 'action', (n) => `${n} ${n === 1 ? 'action' : 'actions'}`],
  ['validations', (e) => e.category.key === 'error', (n) => `${n} validation or set errors`],
  ['custom', (e) => e.category.key === 'custom', (n) => `${n} custom ${n === 1 ? 'component' : 'components'}`]
];

/* One row for all the elements, the same figure the status bar gives, split
 * by kind: "22: 4 steps · 14 fields · 2 text or display · 2 actions". */
function countRows(elements) {
  if (!elements.length) return [];
  const steps = elements.filter((e) => e.category.key === 'step').length;
  const others = elements.filter((e) => e.category.key !== 'step');
  const parts = [];
  if (steps) parts.push(`${steps} ${steps === 1 ? 'step' : 'steps'}`);
  KINDS.forEach(([, test, say]) => {
    const n = others.filter(test).length;
    if (n > 0) parts.push(say(n));
  });
  return [{ id: 'elements', label: 'Elements', text: parts.length ? `${elements.length}: ${parts.join(' · ')}` : String(elements.length) }];
}

/* What an element calls: [{ kind, name }] (an element can call more than one). */
function callsOf(element) {
  const props = (element.node && element.node.propSetMap) || {};
  const out = [];
  const add = (kind, name) => { const value = text(name); if (value) out.push({ kind, name: value }); };
  add('ip', props.integrationProcedureKey);
  if (text(props.remoteClass)) {
    add('remote', text(props.remoteMethod) ? `${text(props.remoteClass)}.${text(props.remoteMethod)}` : props.remoteClass);
  }
  add('dr', props.bundle);
  add('dr', props.preTransformBundle);
  add('dr', props.postTransformBundle);
  return out;
}

const CALL_LABELS = { dr: 'Data Mappers', ip: 'Integration Procedures', remote: 'Remote Actions' };

/* One row per kind of call, listing each distinct name once, linked to the
 * first element that makes it and counted when several do. */
function callRows(elements) {
  const groups = { dr: new Map(), ip: new Map(), remote: new Map() };
  elements.forEach((element) => {
    callsOf(element).forEach(({ kind, name }) => {
      const group = groups[kind];
      const seen = group.get(name);
      if (seen) seen.count++; else group.set(name, { text: name, key: element.key, count: 1 });
    });
  });
  return ['dr', 'ip', 'remote']
    .filter((kind) => groups[kind].size)
    .map((kind) => ({ id: `calls-${kind}`, label: CALL_LABELS[kind], items: [...groups[kind].values()] }));
}

/* "Overridden: 2" with each element a custom component draws instead of the
 * standard one, linked to it; no row while there are none. */
function overrideRows(elements) {
  const found = overriddenElements(elements);
  if (!found.length) return [];
  return [{
    id: 'overridden', label: `Overridden: ${found.length}`,
    items: found.map((element) => ({ text: element.name, key: element.key, count: 1, title: overrideTitle(element) }))
  }];
}

function labelRow(elements, header) {
  const { rows, languages, multiLang } = customLabelRows(elements, header);
  if (!rows.length) return null;
  const missing = rows.filter((row) => row.missing).length;
  const parts = [`${rows.length} ${rows.length === 1 ? 'key' : 'keys'}`];
  if (languages.length) parts.push(languages.length > 4 ? `${languages.length} languages` : languages.join(', '));
  else if (multiLang) parts.push('1 language');
  const row = { id: 'labels', label: 'Custom labels', text: parts.join(' · ') };
  if (missing) {
    row.text += ` · ${missing} missing`;
    row.link = { kind: 'problems' };
  }
  return row;
}

/* The step furthest down the script that the script has been on: `visits` are
 * { key } in the order they happened, `step` the one it is on now. */
function furthestStep(elements, step, visits) {
  const position = new Map(elements.map((element, i) => [element.key, i]));
  const keys = [...(visits || []).map((visit) => visit.key), step ? step.key : null]
    .filter((key) => key && position.has(key) && elements[position.get(key)].category.key === 'step');
  if (!keys.length) return null;
  return elements[Math.max(...keys.map((key) => position.get(key)))];
}

function standingRows(elements, { step, visits, problems, stoppers }) {
  const rows = [];
  const labelOf = (element) => (element.label && element.label !== element.name ? `${element.name} (${element.label})` : element.name);

  const current = step && step.key ? elements.find((element) => element.key === step.key) : null;
  if (current) {
    rows.push({ id: 'step', label: 'On step', text: labelOf(current), link: { kind: 'element', key: current.key } });
  }
  const furthest = furthestStep(elements, step, visits);
  if (furthest && (!current || furthest.key !== current.key)) {
    rows.push({ id: 'furthest', label: 'Last step reached', text: labelOf(furthest), link: { kind: 'element', key: furthest.key } });
  }

  const count = countProblems(problems || []);
  if (count) rows.push({ id: 'problems', label: 'Problems', text: String(count), link: { kind: 'problems' } });

  if (current && stoppers && stoppers.count > 0) {
    rows.push({
      id: 'stoppers', label: 'May stop Next', text: String(stoppers.count),
      link: { kind: 'element', key: current.key, tab: 'validation' }
    });
  }
  return rows;
}

/* { title, rows } for the script. `root` is rootOf(definition) (or the
 * definition itself), `elements` the flattened list. In `ctx`:
 *   step     — { key } of the step the script is on, or null
 *   visits   — [{ key }] the steps it has been on, oldest first
 *   problems — lintDefinition's list
 *   stoppers — stepStoppers of the current step ({ count })
 *   header   — scriptHeaderDef, for the custom labels */
export function scriptSummary(root, elements, ctx = {}) {
  const source = root && typeof root === 'object' ? root : {};
  const list = Array.isArray(elements) ? elements : [];
  const label = labelRow(list, ctx.header);
  const rows = [
    ...identityRows(source),
    ...countRows(list),
    ...callRows(list),
    ...overrideRows(list),
    ...(label ? [label] : []),
    ...standingRows(list, ctx)
  ];
  return { title: scriptName(source) || 'this script', rows };
}
