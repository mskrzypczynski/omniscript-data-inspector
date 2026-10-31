'use strict';

/* The "From the data…" picker of the Test call form, without a DOM: which
 * nodes of the data JSON it lists, how each is named in the input, and how the
 * picked ones are merged into (or replace) the Input box. src/ui/actions/
 * test-pane.js draws it and wires the keys.
 *
 * An Integration Procedure reads a few nodes of the data, by key, and the key
 * it expects is often not the node's own name. So the picker lists nodes with
 * their OmniScript path and size, and every ticked node gets a name that is
 * the key it will have in the input.
 *
 * Pure: no DOM, no chrome.*. */

import { SEP, joinPath, isContainer, entriesOf, summarise, collectMatches } from '../shared/json-tree-model.js';
import { omniPath } from '../shared/path-links.js';
import { parseJsonText, textOfValue } from './test-calls.js';

/* More rows than this are cut, and the list says how many it left out. */
export const ROW_CAP = 300;

/* A plain value's preview is cut at this many characters. */
const PREVIEW_CHARS = 40;

export const WHOLE_LABEL = 'Whole data JSON';
export const NO_DATA_WORDS = 'No data has been read yet';

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/* ------------------------------------------------------------ the list */

/* "12 keys", "1 key", "3 items", or a short look at a plain value: "\"Gold\"",
 * 42, true, null. A container is counted the way the Data tab counts it
 * (summarise), without its brackets. */
export function sizeWords(value) {
  if (isContainer(value)) return summarise(value, '', null, null).trim().slice(1, -1).replace(/ •$/, '');
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text;
}

/* The key a node is sent under when nothing else is said: its own, and for an
 * item of a list the list's (an item has only a position). */
function keyOf(key, parentKey, inArray) {
  if (!inArray) return key;
  return parentKey || 'item';
}

/* The node at a tree path of the data: { found, value }. */
export function valueAt(data, path) {
  if (path === '') return { found: data !== undefined, value: data };
  let current = data;
  for (const part of path.split(SEP)) {
    if (!isContainer(current) || !Object.prototype.hasOwnProperty.call(current, part)) return { found: false, value: undefined };
    current = current[part];
  }
  return { found: true, value: current };
}

/* Does this node, on its own, contain the query: in its path as the script
 * writes it, in its key, or in a plain value? */
function ownHit(label, key, value, query) {
  return label.toLowerCase().includes(query) || String(key).toLowerCase().includes(query) ||
    (!isContainer(value) && String(value).toLowerCase().includes(query));
}

function rowOf(data, shown, path, key, parentKey, inArray, depth) {
  const label = omniPath(data, path);
  const real = valueAt(data, path).value;
  return {
    path, label, key: keyOf(key, parentKey, inArray), size: sizeWords(valueAt(shown, path).value), value: real, depth,
    container: isContainer(real), whole: false, context: false
  };
}

/* The rows of the picker for the data JSON and what is typed in its filter:
 * { empty, rows, more }.
 *
 *   empty  no data has been read (the picker says so and lists nothing)
 *   rows   Whole data JSON first, then the nodes: with no query the top-level
 *          nodes with, under each object, its children (so Step1:Account is
 *          there without typing); with a query every node at every depth whose
 *          path, key or value contains every word, plus the ancestors that
 *          reach it (marked `context`, since they matched only through what is
 *          inside). `first` is a list of tree paths that go straight after the
 *          Whole row when there is no query, in that order.
 *   more   how many matching rows the cap left out
 *
 * `mask(value)` is what Mask values does to a value: the sizes and the
 * matching read the masked data, so a masked panel does not give a value away
 * by finding it; the row's `value` is always the real one. */
export function listRows(data, query = '', { mask = (value) => value, first = [], cap = ROW_CAP } = {}) {
  if (data === undefined) return { empty: true, rows: [], more: 0 };
  const shown = mask(data);
  const whole = {
    path: '', label: WHOLE_LABEL, key: '', size: sizeWords(shown), value: data, depth: 0, container: isContainer(data), whole: true, context: false
  };
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const nodes = words.length ? filtered(data, shown, words) : browsed(data, shown, first);
  return { empty: false, rows: [whole, ...nodes.slice(0, cap)], more: Math.max(0, nodes.length - cap) };
}

/* No query: the top level, each object opened one level. */
function browsed(data, shown, first) {
  if (!isContainer(data)) return [];
  const rows = [];
  const seen = new Set();
  const add = (row) => { if (!seen.has(row.path)) { seen.add(row.path); rows.push(row); } };
  const wanted = first.map((path) => nodeAt(data, shown, path)).filter(Boolean);
  wanted.forEach(add);
  const rootArray = Array.isArray(data);
  entriesOf(data).forEach(([key, child]) => {
    const path = joinPath('', key, 0);
    add(rowOf(data, shown, path, key, '', rootArray, 1));
    if (!isPlain(child)) return;
    entriesOf(child).forEach(([childKey]) => {
      add(rowOf(data, shown, joinPath(path, childKey, 1), childKey, key, false, 2));
    });
  });
  return rows;
}

/* One row for a path of the data, or null when it is not there. */
function nodeAt(data, shown, path) {
  if (path === '' || !valueAt(data, path).found) return null;
  const parts = path.split(SEP);
  const parent = valueAt(data, parts.slice(0, -1).join(SEP)).value;
  const parentKey = parts.length > 1 ? parts[parts.length - 2] : '';
  const inArray = Array.isArray(parent);
  // An item of a list is sent under the list's key, which is the part before its position.
  const owner = inArray && parts.length > 1 ? parts.filter((_, i) => i < parts.length - 1).reverse().find((part) => !/^\d+$/.test(part)) || '' : parentKey;
  return rowOf(data, shown, path, parts[parts.length - 1], owner, inArray, Math.min(parts.length, 2));
}

/* A query: every word has to be somewhere in the node or inside it. */
function filtered(data, shown, words) {
  // One pass per word, kept to the paths every word reached.
  let reached = null;
  words.forEach((word) => {
    const out = new Set();
    collectMatches(shown, '', '', word, out);
    // The label of a node is matched too, which the key alone cannot say (Step1:Account).
    walk(data, shown, (path, key) => { if (omniPath(data, path).toLowerCase().includes(word) || String(key).toLowerCase().includes(word)) out.add(path); });
    reached = reached ? new Set([...reached].filter((path) => out.has(path))) : out;
  });
  const rows = [];
  walk(data, shown, (path, key, parentKey, inArray, depth) => {
    if (path === '' || !reached.has(path)) return;
    const row = rowOf(data, shown, path, key, parentKey, inArray, depth);
    row.context = !words.every((word) => ownHit(row.label, key, valueAt(shown, path).value, word));
    rows.push(row);
  });
  return rows;
}

/* Every node in document order, bounded like the Data tree's own walks. */
function walk(data, shown, visit) {
  let count = 0;
  const go = (value, path, key, parentKey, inArray, depth) => {
    if (count++ > 20000 || depth > 40) return;
    visit(path, key, parentKey, inArray, depth);
    if (!isContainer(value)) return;
    const array = Array.isArray(value);
    // An item of a list is sent under the list's key; a list inside a list takes the outer one.
    const listName = inArray ? parentKey : key;
    entriesOf(value).forEach(([childKey, child]) => go(child, joinPath(path, childKey, depth === 0 ? 0 : 1), childKey, array ? listName : key, array, depth + 1));
  };
  go(data, '', '', '', false, 0);
}

/* -------------------------------------------------------- the names */

/* Do two values hold the same thing, key order aside? */
export function sameValue(a, b) {
  if (a === b) return true;
  if (!isContainer(a) || !isContainer(b) || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]));
}

/* The input of the call a form re-runs, as an object, or null: the call's own
 * input when it is an object, or the text of it when that is a JSON object. */
export function originalInput(entry) {
  const input = entry && entry.action ? entry.action.input : undefined;
  if (isPlain(input)) return input;
  if (typeof input === 'string') {
    const parsed = parseJsonText(input);
    if (parsed.ok && isPlain(parsed.value)) return parsed.value;
  }
  return null;
}

/* The name a node is first offered under: { name, sentAs }. When the original
 * call's input holds a top-level value equal to the node, that key is the
 * name and `sentAs` is true (the row says "sent as AccountDetails"); the node's
 * own key when it is one of them. Otherwise the node's own key. */
export function suggestName(row, original) {
  const own = row.key || '';
  if (!original || row.whole) return { name: own, sentAs: false };
  const same = Object.keys(original).filter((key) => sameValue(original[key], row.value));
  if (!same.length) return { name: own, sentAs: false };
  return { name: same.includes(own) ? own : same[0], sentAs: true };
}

/* ------------------------------------------------------- the memory */

/* What the user named, kept per procedure while DevTools is open: plain data,
 * { [signature]: [{ path, name }] }. Never stored. */
export const emptyMemory = () => ({});

export function remember(memory, signature, picks) {
  if (!signature) return memory;
  const kept = picks.filter((pick) => pick.path !== '' && pick.name).map((pick) => ({ path: pick.path, name: pick.name }));
  return { ...memory, [signature]: kept };
}

/* What was kept for a procedure, minus the nodes the data no longer has. */
export function recall(memory, signature, data) {
  const kept = (signature && memory[signature]) || [];
  return kept.filter((pick) => valueAt(data, pick.path).found);
}

/* --------------------------------------------------- names and clashes */

const MISSING_NAME_WORDS = 'Name every picked node';

/* Why a name cannot be a key, or ''. A dotted name nests, so no part may be empty. */
export function nameProblem(name) {
  const text = String(name);
  if (!text.trim()) return MISSING_NAME_WORDS;
  if (text.split('.').some((part) => !part.trim())) return `${text} has an empty part`;
  return '';
}

const partsOf = (name) => String(name).trim().split('.').map((part) => part.trim());

/* A name as it is compared and written: without the spaces around its parts. */
export const normalName = (name) => partsOf(name).join('.');

/* Names two picks cannot share: the same name twice, or one name inside the
 * other (Context and Context.Account), since the second would write into the
 * first. */
export function clashes(picks) {
  const names = picks.map((pick) => partsOf(pick.name).join('.'));
  const out = new Set();
  names.forEach((name, i) => names.forEach((other, j) => {
    if (i !== j && (name === other || other.startsWith(`${name}.`))) { out.add(name); out.add(other); }
  }));
  return [...out];
}

function put(target, key, value) {
  // defineProperty: "__proto__" as a key is a key, not a prototype.
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function has(target, parts) {
  let current = target;
  for (const part of parts) {
    if (!isPlain(current) || !Object.prototype.hasOwnProperty.call(current, part)) return false;
    current = current[part];
  }
  return true;
}

/* Writes the value at a dotted name, the way a Set Values writes nested keys:
 * the parts that are missing (or hold something that is not an object) become objects. */
function setAt(target, parts, value) {
  let current = target;
  parts.slice(0, -1).forEach((part) => {
    if (!Object.prototype.hasOwnProperty.call(current, part) || !isPlain(current[part])) put(current, part, {});
    current = current[part];
  });
  put(current, parts[parts.length - 1], value);
}

/* ------------------------------------------------------ the results */

/* picks: [{ name, value }] (the real value). The same words the foot uses. */
const twoNodes = (names) => `Two nodes named ${names.join(', ')}`;
const replacedWords = (names) => (names.length === 1
  ? `${names[0]} is already in the input: it will be replaced`
  : `${names.join(', ')} are already in the input: they will be replaced`);

/* The names of the picks that are already keys of the object in the box. */
function presentNames(base, picks) {
  return picks.map((pick) => partsOf(pick.name)).filter((parts) => has(base, parts)).map((parts) => parts.join('.'));
}

/* Adds the picked nodes to the JSON in the Input box:
 *   { ok: true, text, replaced: [names that were already there] }, or
 *   { ok: false, why } when the box does not parse, is not an object, a name is
 *   missing or two names clash. Dotted names nest. */
export function addPicked(inputText, picks) {
  const parsed = parseJsonText(inputText);
  if (!parsed.ok) return { ok: false, why: 'Fix the input first' };
  if (!isPlain(parsed.value)) return { ok: false, why: 'The input is not a JSON object: use Replace input' };
  const bad = picks.map((pick) => nameProblem(pick.name)).find(Boolean);
  if (bad) return { ok: false, why: bad };
  const clash = clashes(picks);
  if (clash.length) return { ok: false, why: twoNodes(clash), clash };
  const base = JSON.parse(JSON.stringify(parsed.value));
  const replaced = presentNames(base, picks);
  picks.forEach((pick) => setAt(base, partsOf(pick.name), pick.value));
  return { ok: true, text: textOfValue(base), replaced };
}

/* The Input box as an object of the picked nodes alone. */
export function replacePicked(picks) {
  const bad = picks.map((pick) => nameProblem(pick.name)).find(Boolean);
  if (bad) return { ok: false, why: bad };
  const clash = clashes(picks);
  if (clash.length) return { ok: false, why: twoNodes(clash), clash };
  const out = {};
  picks.forEach((pick) => setAt(out, partsOf(pick.name), pick.value));
  return { ok: true, text: textOfValue(out) };
}

/* What the foot of the picker says and allows, for the picks as they stand:
 *   words         the sentence ('' when there is nothing to say)
 *   tone          '' | 'warn' | 'bad'
 *   clash         names two picks share (their rows are marked)
 *   replaced      names already in the input (their rows are marked, a warning)
 *   canAdd        Add to input may be pressed
 *   canReplace    Replace input may be pressed
 * `whole` is a pick of the Whole data JSON row: it replaces, and needs no names. */
export function pickStatus(inputText, picks, { whole = false } = {}) {
  if (whole) return { words: 'The whole data JSON replaces the input', tone: '', clash: [], replaced: [], canAdd: true, canReplace: true };
  if (!picks.length) return { words: 'Tick the nodes the call reads', tone: '', clash: [], replaced: [], canAdd: false, canReplace: false };
  const unnamed = picks.map((pick) => nameProblem(pick.name)).find(Boolean);
  const clash = clashes(picks);
  const parsed = parseJsonText(inputText);
  const base = parsed.ok && isPlain(parsed.value) ? parsed.value : null;
  const replaced = base ? presentNames(base, picks) : [];
  const out = { clash, replaced, canAdd: false, canReplace: false };
  if (unnamed) return { ...out, words: unnamed, tone: 'bad' };
  if (clash.length) return { ...out, words: twoNodes(clash), tone: 'bad' };
  if (!parsed.ok) return { ...out, canReplace: true, words: 'Fix the input first', tone: 'bad' };
  if (!base) return { ...out, canReplace: true, words: 'The input is not a JSON object: use Replace input', tone: 'bad' };
  if (replaced.length) return { ...out, canAdd: true, canReplace: true, words: replacedWords(replaced), tone: 'warn' };
  return { ...out, canAdd: true, canReplace: true, words: pickCount(picks.length), tone: '' };
}

export const pickCount = (count) => `${count} ${count === 1 ? 'node' : 'nodes'} picked`;

/* The toast after the box changed. */
export const addedWords = (count) => `Added ${count} ${count === 1 ? 'node' : 'nodes'} to the input`;
export const REPLACED_WORDS = 'Input replaced';

/* The foot of a list the cap cut short. */
export const moreWords = (count) => `${count} more, type to narrow`;
