#!/usr/bin/env node
'use strict';

/* Builds the static documentation pages from the panel's own help.
 *
 *   npm run docs -- <out-dir>
 *
 * Writes <out-dir>/reference.html and reference.md, and a page per guide in
 * docs/guides/ under <out-dir>/guides/. The pages link the product website's
 * stylesheet (../style.css), so <out-dir> is meant to be copied into the
 * website's omniscript-data-inspector/ folder. The build stops when a guide
 * links a help entry that no longer exists. Dev tooling only; never shipped,
 * and it changes nothing under src/.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorsOf, loadHelp } from './lib/docs-help.mjs';
import { checkGuides, loadGuides, renderGuideHtml, renderGuideIndexHtml } from './lib/docs-guides.mjs';
import { renderReferenceHtml, renderReferenceMarkdown } from './lib/docs-reference.mjs';

function write(outDir, name, text) {
  const file = path.join(outDir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

/* Returns the files written (relative to outDir). */
export async function buildDocs(outDir) {
  const model = await loadHelp();
  const guides = loadGuides();
  const problems = checkGuides(guides, anchorsOf(model));
  if (problems.length) throw new Error(`The guides do not match the help:\n  ${problems.join('\n  ')}`);

  const files = ['reference.html', 'reference.md', 'guides/index.html', ...guides.map((guide) => `guides/${guide.slug}.html`)];
  write(outDir, 'reference.html', renderReferenceHtml(model));
  write(outDir, 'reference.md', renderReferenceMarkdown(model));
  write(outDir, 'guides/index.html', renderGuideIndexHtml(guides, model.version));
  guides.forEach((guide) => write(outDir, `guides/${guide.slug}.html`, renderGuideHtml(guide, model.version)));
  return files;
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('Usage: npm run docs -- <out-dir>');
  const files = await buildDocs(path.resolve(outDir));
  console.log(`Wrote ${files.length} files to ${path.resolve(outDir)}:\n  ${files.join('\n  ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
