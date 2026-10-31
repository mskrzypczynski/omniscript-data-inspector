/* The builds this tree packs: the Free one, which is the tree as it is. Its
 * pages and manifest are already the Free ones, so nothing is derived; a
 * build for another browser is a copy with that browser's manifest. */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { browserManifest } from './browsers.mjs';

export const FREE_ENTRY = '<script type="module" src="src/ui/app.js"></script>';

/* The flavours `npm run package -- <flavour>` packs here. */
export const FLAVOURS = ['free'];

/* The add-on id Firefox signs and updates by. It never changes once the
 * listing exists. */
export const GECKO_IDS = { free: 'omniscript-data-inspector@mskrz.com' };

/* No module registers a gate here: every gate stays closed. */
export const GATE_REGISTER = null;

/* No extra words to keep out of the texts here. */
export const EDITION_WORDS = [];

/* Which build a source tree is: this one is the Free build. */
export const treeFlavour = () => 'free';

/* Any HTML page of the extension as the Free build has it: as it is. */
export const freeHtml = (html) => html;

/* panel.html as the Free build has it: as it is, once it loads the Free entry. */
export function freePanelHtml(html) {
  if (!html.includes(FREE_ENTRY)) throw new Error(`panel.html does not load ${FREE_ENTRY}`);
  return html;
}

/* Copies the listed paths of root into out, with the manifest of the browser. */
export function writeBuildTree(root, out, paths, { flavour = 'free', browser = 'chromium' } = {}) {
  if (!FLAVOURS.includes(flavour)) throw new Error(`Unknown flavour "${flavour}": use ${FLAVOURS.join(' or ')}.`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  paths.filter((relative) => existsSync(path.join(root, relative))).forEach((relative) => {
    cpSync(path.join(root, relative), path.join(out, relative), { recursive: true });
  });
  const manifestPath = path.join(out, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, `${JSON.stringify(browserManifest(manifest, browser, GECKO_IDS[flavour]), null, 2)}\n`);
  }
}

/* Copies the listed paths of root into out as the Free tree. */
export function writeFreeTree(root, out, paths) {
  writeBuildTree(root, out, paths);
}
