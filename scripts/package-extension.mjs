#!/usr/bin/env node
'use strict';

/* Packs the shipped files into a zip ready for the Chrome Web Store upload.
 *
 *   npm run package
 *
 * Uses an explicit allowlist rather than "zip everything except test/ and
 * node_modules/" — safer against a stray file (an editor-restored old copy,
 * a personal note, a local tool folder) quietly ending up in a public
 * upload. A file only ships once someone deliberately adds it to
 * SHIPPED_PATHS below.
 *
 * Requires the system `zip` command, present by default on macOS and Linux.
 * There is no npm dependency for this on purpose — it is dev tooling, run by
 * a person on their own machine before an upload, not something the
 * extension needs at runtime.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS } from './lib/browsers.mjs';
import { FLAVOURS, treeFlavour, writeBuildTree } from './lib/flavour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');

const SHIPPED_PATHS = [
  'manifest.json',
  'devtools.html',
  'devtools.js',
  'panel.html',
  'panel.css',
  'popup.html',
  'icons',
  'src',
  'LICENSE'
];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/* Catches exactly the mistake CONTRIBUTING.md's Releasing section warns about:
 * bumping one of the two version fields and forgetting the other. */
function verifyVersionsMatch() {
  const manifestVersion = readJson('manifest.json').version;
  const packageVersion = readJson('package.json').version;
  if (manifestVersion !== packageVersion) {
    throw new Error(
      `manifest.json (${manifestVersion}) and package.json (${packageVersion}) versions disagree — ` +
      'bump both before packaging (see CONTRIBUTING.md\'s Releasing section).'
    );
  }
  return manifestVersion;
}

function verifyShippedPathsExist() {
  const missing = SHIPPED_PATHS.filter((shippedPath) => !existsSync(path.join(ROOT, shippedPath)));
  if (missing.length) {
    throw new Error(
      `Expected file(s) missing, or SHIPPED_PATHS in scripts/package-extension.mjs is out of date: ${missing.join(', ')}`
    );
  }
}

/*   npm run package                         the tree as it is, for Chromium
 *   npm run package -- free                 Free for Chromium (dist/free/)
 *   npm run package -- free firefox         Free for Firefox (dist/free-firefox/)
 *   npm run package -- <flavour> firefox    any flavour for Firefox (dist/<flavour>-firefox/)
 * Chromium is Chrome, Edge, Brave and Opera: one package for all of them.
 * The flavours this tree packs, and which one it is itself, are in
 * scripts/lib/flavour.mjs. The tree's own flavour is packed as it is, under
 * the plain name; another one is written to dist/ first. */
const TREE = treeFlavour(ROOT);

function main(flavour = TREE, browser = 'chromium') {
  if (!FLAVOURS.includes(flavour)) throw new Error(`Unknown flavour "${flavour}": use ${FLAVOURS.join(' or ')}.`);
  if (!BROWSERS.includes(browser)) throw new Error(`Unknown browser "${browser}": use ${BROWSERS.join(' or ')}.`);
  const version = verifyVersionsMatch();
  verifyShippedPathsExist();

  mkdirSync(DIST_DIR, { recursive: true });
  const asIs = flavour === TREE && browser === 'chromium';
  const sourceDir = asIs ? ROOT : path.join(DIST_DIR, browser === 'chromium' ? flavour : `${flavour}-${browser}`);
  if (!asIs) writeBuildTree(ROOT, sourceDir, SHIPPED_PATHS, { flavour, browser });
  const suffix = `${flavour !== TREE ? '-free' : ''}${browser === 'firefox' ? '-firefox' : ''}`;
  const zipPath = path.join(DIST_DIR, `omniscript-data-inspector${suffix}-${version}.zip`);
  rmSync(zipPath, { force: true });

  // -X drops extra file attributes (macOS resource-fork metadata etc.) so
  // the zip is reproducible across machines.
  execFileSync('zip', ['-r', '-X', zipPath, ...SHIPPED_PATHS], { cwd: sourceDir, stdio: 'inherit' });

  console.log(`\nPacked ${path.relative(ROOT, zipPath)} for version ${version}.`);
}

main(process.argv[2] || TREE, process.argv[3]);
