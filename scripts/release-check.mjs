#!/usr/bin/env node
'use strict';

/* Checks that things which must agree before a release do agree.
 *
 *   npm run release:check
 *
 *   - The version is the same in manifest.json, package.json and
 *     package-lock.json.
 *   - The licence: GPL-3.0 for the Free build, the proprietary one for the
 *     build with every gate.
 *   - Every button, input and select with an id in the top bar or a toolbar
 *     of panel.html sits under a data-help that names a help entry (so the
 *     right-click Help and the ? key can open it), except the controls listed
 *     with a reason in scripts/release-check.allow.json.
 *   - store/description.txt names no feature that has been removed.
 *   - For the Free build (`npm run release:check -- free`, or plain
 *     `npm run release:check` in a tree that is the Free build): the same
 *     checks on the Free texts (the free/ folder of a tree that has one)
 *     and on panel.html as the Free build has it, with no gate registered;
 *     and the Free texts use none of the words they must not use.
 *
 * Prints every problem it finds and exits 1 when there is one. Dev tooling
 * only; never shipped. The checks are plain functions of text, so
 * test/scripts/release-check.test.js runs them on small examples. */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { EDITION_WORDS, GATE_REGISTER, freePanelHtml, treeFlavour } from './lib/flavour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Words of features that no longer exist. A match in the store description
 * means its text is out of date. */
export const REMOVED_FEATURES = ['Route', 'Blockers', 'Next step', 'timeline under'];

/* The regions of panel.html whose controls need a help entry. */
const BARS = '.scope, .toolbar, .bar';

/* ------------------------------------------------------------- versions */

/* sources: { manifest, packageJson, lock } (the file texts). */
export function checkVersions({ manifest, packageJson, lock }) {
  const problems = [];
  const versions = {
    'manifest.json': JSON.parse(manifest).version,
    'package.json': JSON.parse(packageJson).version
  };
  const lockJson = JSON.parse(lock);
  versions['package-lock.json'] = lockJson.version;
  if (lockJson.packages && lockJson.packages['']) versions['package-lock.json (root package)'] = lockJson.packages[''].version;

  const wanted = versions['manifest.json'];
  Object.entries(versions).forEach(([file, version]) => {
    if (version !== wanted) problems.push(`${file} says ${version}, manifest.json says ${wanted}`);
  });

  return problems;
}

/* ------------------------------------------------------------- licence */

/* The Free build is GPL-3.0; the build with every gate is proprietary. sources:
 * { free, readme, licence (the LICENSE text the build ships), packageJson }.
 * packageJson is only checked for the gated build here: the Free export writes its own. */
export function checkLicence({ free = false, readme, licence, packageJson }) {
  const problems = [];
  if (free) {
    if (!/^## Licen[cs]e\b[\s\S]*?GPL-3\.0/m.test(readme)) problems.push('README.md has no Licence section naming GPL-3.0');
    if (!/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/.test(licence)) problems.push('LICENSE is not the GPL-3.0 text');
    return problems;
  }
  if (!/^## Licen[cs]e\b[\s\S]*?All rights reserved/m.test(readme)) problems.push('README.md has no Licence section saying All rights reserved');
  if (!/All rights reserved/.test(licence)) problems.push('LICENSE is not the proprietary licence (no "All rights reserved")');
  if (/GNU GENERAL PUBLIC LICENSE/.test(licence)) problems.push('LICENSE holds the GPL text; this build ships its own licence');
  if (packageJson && JSON.parse(packageJson).license !== 'SEE LICENSE IN LICENSE') problems.push('package.json license must be "SEE LICENSE IN LICENSE"');
  return problems;
}

/* -------------------------------------------------------- control help */

/* html: panel.html. titles: the help entry titles, any case. allow: { id: reason }
 * for controls known not to have help yet. Returns the problems. */
export function checkControlHelp(html, titles, allow = {}) {
  const wanted = new Set([...titles].map((title) => String(title).trim().toLowerCase()));
  const document = new JSDOM(html).window.document;
  const problems = [];
  const seen = new Set();

  document.querySelectorAll('button[id], input[id], select[id]').forEach((control) => {
    if (!control.closest(BARS)) return;
    seen.add(control.id);
    const owner = control.closest('[data-help]');
    if (!owner) {
      if (!(control.id in allow)) problems.push(`#${control.id} has no data-help (add one, or list it in scripts/release-check.allow.json with a reason)`);
      return;
    }
    if (control.id in allow) problems.push(`#${control.id} has data-help now: remove it from scripts/release-check.allow.json`);
    const title = owner.getAttribute('data-help');
    if (!wanted.has(title.trim().toLowerCase())) problems.push(`#${control.id} names the help entry "${title}", which does not exist`);
  });

  /* Every data-help in the page, on a control or not, must resolve. */
  document.querySelectorAll('[data-help]').forEach((node) => {
    const title = node.getAttribute('data-help');
    if (!wanted.has(title.trim().toLowerCase()) && !problems.some((line) => line.includes(`"${title}"`))) {
      problems.push(`${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''} names the help entry "${title}", which does not exist`);
    }
  });

  Object.keys(allow).filter((id) => !seen.has(id)).forEach((id) => {
    problems.push(`scripts/release-check.allow.json lists #${id}, which is not a control in the top bar or a toolbar`);
  });
  return problems;
}

/* ---------------------------------------------------------- description */

export function checkDescription(text, removed = REMOVED_FEATURES) {
  const problems = [];
  text.split('\n').forEach((line, index) => {
    removed.forEach((word) => {
      if (line.toLowerCase().includes(word.toLowerCase())) {
        problems.push(`store/description.txt line ${index + 1} mentions "${word}", a removed feature: ${line.trim().slice(0, 100)}`);
      }
    });
  });
  return problems;
}

/* ---------------------------------------------------------- Free texts */

/* Words the Free build's texts never use: those of scripts/lib/flavour.mjs
 * (its texts describe what Free does), and a licence other than the current
 * GPL-3.0. */
export const NOT_IN_FREE_TEXTS = [...EDITION_WORDS, /\bMIT\b/];

/* texts: { file: text }. */
export function checkFreeTexts(texts, words = NOT_IN_FREE_TEXTS) {
  const problems = [];
  Object.entries(texts).forEach(([file, text]) => {
    String(text).split('\n').forEach((line, index) => {
      words.forEach((word) => {
        if (word.test(line)) problems.push(`${file} line ${index + 1} has ${word}: ${line.trim().slice(0, 100)}`);
      });
    });
  });
  return problems;
}

/* ----------------------------------------------------------------- main */

const TREE = treeFlavour(ROOT);
const FREE = TREE === 'free' || process.argv.slice(2).includes('free');

async function helpTitles() {
  // The help lists a gated feature only once its gate is registered; the Free build registers none.
  if (!FREE && GATE_REGISTER) await import(pathToFileURL(path.join(ROOT, GATE_REGISTER)).href);
  const [{ DATA_HELP }, { STRUCTURE_HELP }, { ACTIONS_HELP }, { COMMON_HELP }] = await Promise.all([
    import('../src/ui/help/data.js'),
    import('../src/ui/help/structure.js'),
    import('../src/ui/help/actions.js'),
    import('../src/ui/help/common.js')
  ]);
  const titles = [];
  [DATA_HELP, STRUCTURE_HELP, ACTIONS_HELP].forEach((tab) => {
    tab.sections.forEach(([, entries]) => entries.forEach(([title]) => titles.push(title)));
  });
  COMMON_HELP[1].forEach(([title]) => titles.push(title));
  return titles;
}

const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

/* A text as the Free build has it: here, its free/ overlay when there is one. */
const readText = (file) => (FREE && TREE !== 'free' && existsSync(path.join(ROOT, 'free', file)) ? read(`free/${file}`) : read(file));

const FREE_TEXTS = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'store/description.txt'];

async function main() {
  const allow = JSON.parse(read('scripts/release-check.allow.json')).controlsWithoutHelp || {};
  const panel = FREE ? freePanelHtml(read('panel.html')) : read('panel.html');
  const groups = {
    'Versions': checkVersions({
      manifest: read('manifest.json'), packageJson: read('package.json'), lock: read('package-lock.json')
    }),
    'Licence': checkLicence({
      free: FREE, readme: readText('README.md'), licence: readText('LICENSE'), packageJson: FREE ? undefined : read('package.json')
    }),
    'Control help': checkControlHelp(panel, await helpTitles(), allow),
    'Store description': checkDescription(readText('store/description.txt'))
  };
  if (FREE) groups['Free texts'] = checkFreeTexts(Object.fromEntries(FREE_TEXTS.map((file) => [file, readText(file)])));
  console.log(`Checking the ${FREE ? 'free' : TREE} build.`);

  let total = 0;
  Object.entries(groups).forEach(([name, problems]) => {
    console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${name}`);
    problems.forEach((line) => console.log(`        ${line}`));
    total += problems.length;
  });
  if (total) {
    console.log(`\n${total} problem${total === 1 ? '' : 's'}.`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
