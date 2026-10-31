#!/usr/bin/env node
/* Compares two folders of PNGs with pixelmatch.
 *
 *   node scripts/compare-screenshots.mjs <expected-dir> <actual-dir> [diff-dir]
 *
 * Exits 1 when any image differs by more than the tolerance (a few pixels of
 * anti-aliasing noise are allowed, a changed layout is not) and writes a diff
 * image per failing file to diff-dir. Dev tooling only; never shipped. */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [expectedDir, actualDir, diffDir] = process.argv.slice(2);
if (!expectedDir || !actualDir) {
  console.error('Usage: compare-screenshots.mjs <expected-dir> <actual-dir> [diff-dir]');
  process.exit(2);
}

/* Share of pixels allowed to differ, and per-pixel colour distance (0-1).
 * The store images (1-…5-…) are held strictly; the feature-* scenes, which
 * document single features and hold dialogs and large inputs whose
 * rendering still varies a little between machines, get a wider margin (the
 * zoomed Text size scene is the widest). */
const MAX_DIFF_RATIO = Number(process.env.SCREENSHOT_MAX_DIFF_RATIO ?? 0.0005);
const FEATURE_MAX_DIFF_RATIO = Number(process.env.SCREENSHOT_FEATURE_MAX_DIFF_RATIO ?? 0.025);
const PIXEL_THRESHOLD = Number(process.env.SCREENSHOT_PIXEL_THRESHOLD ?? 0.1);
const limitFor = (name) => (name.startsWith('feature-') ? FEATURE_MAX_DIFF_RATIO : MAX_DIFF_RATIO);

const files = readdirSync(expectedDir).filter((name) => name.endsWith('.png')).sort();
let failed = 0;
for (const name of files) {
  const actualFile = path.join(actualDir, name);
  if (!existsSync(actualFile)) {
    console.log(`MISSING  ${name}`);
    failed++;
    continue;
  }
  const expected = PNG.sync.read(readFileSync(path.join(expectedDir, name)));
  const actual = PNG.sync.read(readFileSync(actualFile));
  if (expected.width !== actual.width || expected.height !== actual.height) {
    console.log(`SIZE     ${name}: ${expected.width}x${expected.height} vs ${actual.width}x${actual.height}`);
    failed++;
    continue;
  }
  const diff = new PNG({ width: expected.width, height: expected.height });
  const count = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: PIXEL_THRESHOLD });
  const ratio = count / (expected.width * expected.height);
  const ok = ratio <= limitFor(name);
  console.log(`${ok ? 'ok      ' : 'DIFF    '} ${name}: ${count} pixels differ (${(ratio * 100).toFixed(4)}%)`);
  if (!ok) {
    failed++;
    if (diffDir) {
      mkdirSync(diffDir, { recursive: true });
      writeFileSync(path.join(diffDir, name), PNG.sync.write(diff));
    }
  }
}
process.exit(failed ? 1 : 0);
