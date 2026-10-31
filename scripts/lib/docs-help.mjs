/* Reads the panel's help modules (src/ui/help/*.js) and turns them into one
 * plain model the page generators draw from. The modules are treated as data:
 * a tab module exports an object with `sections` ([[heading, entries]]), the
 * shared section is a [title, entries] pair, START maps a tab to its list and
 * shortcuts() returns a list of [keys, text]. An entry is [title, text], or
 * [title, rows] for a table of keys. Nothing here edits those files.
 * Dev tooling only; never shipped. */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { entryParts, slugify } from '../../src/core/shared/help-entry.js';
import { GATE_REGISTER } from './flavour.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HELP_DIR = path.join(ROOT, 'src', 'ui', 'help');

/* The order the tabs have in the panel; a tab module this list does not know
 * follows them, in file order. */
const TAB_ORDER = ['data', 'structure', 'actions'];

const isTable = (body) => Array.isArray(body);

/* The ids are the panel's own (src/core/shared/help-entry.js), so the help's
 * "More on the website" links land on the right entry. */
export { slugify };

/* Slugs are unique on a page: the tab id leads, and a title repeated inside
 * one tab gets -2, -3 in the order it appears. */
function uniqueSlug(base, taken) {
  let slug = base;
  for (let count = 2; taken.has(slug); count++) slug = `${base}-${count}`;
  taken.add(slug);
  return slug;
}

function normaliseEntry(raw, tabId, taken) {
  const [title, body] = raw;
  const entry = { title: String(title), id: uniqueSlug(`${tabId}-${slugify(title)}`, taken) };
  if (isTable(body)) entry.rows = body.map(([keys, text]) => ({ keys: keys.map(String), text: String(text) }));
  else {
    const parts = entryParts(raw);
    entry.text = String(body);
    if (parts.short) entry.short = parts.short;
    if (parts.keys) entry.keys = parts.keys;
    if (parts.more) entry.more = parts.more;
  }
  return entry;
}

/* [[heading, entries]] -> sections with their entries normalised. */
function normaliseSections(sections, tabId, taken) {
  return sections.map(([heading, entries]) => ({
    heading: String(heading),
    entries: entries.map((entry) => normaliseEntry(entry, tabId, taken))
  }));
}

function firstExport(module, accept) {
  return Object.values(module).find(accept);
}

/* The help lists a gated feature only in a build that has it (src/ui/features.js),
 * and the reference documents the whole build: register its gates first
 * (GATE_REGISTER in scripts/lib/flavour.mjs). A tree without such a module
 * (the Free build) registers nothing. */
const REGISTER = GATE_REGISTER && path.join(ROOT, GATE_REGISTER);
const registered = REGISTER && existsSync(REGISTER) ? import(pathToFileURL(REGISTER).href) : Promise.resolve();

async function load(file) {
  await registered;
  return import(pathToFileURL(path.join(HELP_DIR, file)).href);
}

/* A tab's module exports one object with a title, a lede and sections. */
const isTabHelp = (value) => value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.sections);
const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export async function loadHelp() {
  const files = readdirSync(HELP_DIR).filter((name) => name.endsWith('.js')).sort();
  const tabFiles = [];
  for (const file of files) {
    const help = firstExport(await load(file), isTabHelp);
    if (help) tabFiles.push({ id: file.replace(/\.js$/, ''), help });
  }
  const rank = (id) => (TAB_ORDER.includes(id) ? TAB_ORDER.indexOf(id) : TAB_ORDER.length);
  tabFiles.sort((left, right) => rank(left.id) - rank(right.id));

  const start = firstExport(await load('start.js'), isPlainObject) || {};
  const shortcutsOf = firstExport(await load('shortcuts.js'), (value) => typeof value === 'function');
  const shortcuts = shortcutsOf ? shortcutsOf() : [];
  const commonValue = firstExport(await load('common.js'), (value) => Array.isArray(value) || isTabHelp(value));

  const tabs = tabFiles.map(({ id, help }) => ({
    id,
    title: String(help.title),
    lede: String(help.lede || ''),
    start: (start[id] || []).map(String),
    sections: normaliseSections(help.sections, id, new Set())
  }));

  /* "Everywhere" is a single [title, entries] section, shown on every tab. */
  const shared = isTabHelp(commonValue);
  const common = {
    id: 'everywhere',
    title: String(shared ? commonValue.title : commonValue[0]),
    lede: String((shared && commonValue.lede) || 'The top bar, the settings and the rest of the shell. It is the same on every tab.'),
    start: [],
    sections: normaliseSections(shared ? commonValue.sections : [commonValue], 'everywhere', new Set())
  };

  return {
    tabs: [...tabs, common],
    keys: shortcuts.map(([keys, text]) => ({ keys: keys.map(String), text: String(text) })),
    version: JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version,
    // the bundle viewer is built from docs/viewer/; a tree without it links none
    viewer: existsSync(path.join(ROOT, 'docs', 'viewer'))
  };
}

/* Every entry of the model, with the tab it belongs to. */
export function allEntries(model) {
  return model.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.entries.map((entry) => ({ tab, entry }))));
}

/* Every anchor the reference page defines. */
export function anchorsOf(model) {
  const anchors = new Set(['keys']);
  model.tabs.forEach((tab) => {
    anchors.add(tab.id);
    if (tab.start.length) anchors.add(`${tab.id}-start`);
  });
  allEntries(model).forEach(({ entry }) => anchors.add(entry.id));
  return anchors;
}

/* The lines an entry's text is drawn as: the panel writes an entry with several
 * facts one per line, the first line the lead and each later one a bullet
 * (a leading "- " is dropped). Anything else is one paragraph. */
export function entryLines(text) {
  const [lead = '', ...items] = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
  return { lead, items: items.map((line) => line.replace(/^-\s+/, '')) };
}
