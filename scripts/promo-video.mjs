#!/usr/bin/env node
'use strict';

/* Films the promo video of the Free build from the real panel.
 *
 *   npm run promo-video -- [--out dir] [--tmp dir] [--only main,store,loop]
 *
 * Writes to --out (default dist/promo-video/, which git ignores):
 *   promo-1080p.mp4      1920x1080, the video for YouTube and the store listing
 *   promo-1280x800.mp4   1280x800, the store screenshot size
 *   promo-loop.mp4/.webm a short muted loop for the website (1280x720)
 *   poster.png           the first frame with the panel and its first caption
 *   frames/*.png         one still per scene of the 1080p video, for review
 * The videos are silent; they are release assets, like the store screenshots,
 * and are never committed.
 *
 * How it works: the Free tree is built from this repository exactly as the
 * Free package is (scripts/lib/flavour.mjs), so no gated control can appear,
 * and it is opened with the invented "Account Onboarding" demo script of
 * scripts/lib/demo-panel.mjs. scripts/lib/promo-film.mjs then plays the
 * storyboard below as real clicks and typing, one frame at a time on its own
 * clock, with a synthetic cursor and caption cards drawn over the panel, and
 * pipes the frames to ffmpeg. The caption and end-card words are in
 * store/video/captions.json.
 *
 * Sizes: the 1080p video lays the panel out at 1280x720 CSS pixels and draws
 * it at device scale factor 1.5. The panel keeps the same layout as the store
 * screenshots (1280 wide) and its text is drawn at 1.5x, crisp rather than
 * scaled up; a 1920x1080 viewport at 1x would show the panel's 12-13 px text
 * too small for a video.
 *
 * Needs Playwright (found as for npm run screenshots) and ffmpeg on the PATH
 * (or FFMPEG=/path/to/ffmpeg).
 */

/* Functions passed to page.evaluate run in the panel page. */
/* global window, document */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPlaywright } from './lib/store-assets.mjs';
import { ROOT } from './lib/demo-panel.mjs';
import { buildFreeTree, launchBrowser, openFreePanel, serveTree, until } from './lib/promo-panel.mjs';
import { Film, ffmpegSink } from './lib/promo-film.mjs';

const FPS = 30;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || (FFMPEG.includes('/') ? path.join(path.dirname(FFMPEG), 'ffprobe') : 'ffprobe');
const WORDS = JSON.parse(readFileSync(path.join(ROOT, 'store', 'video', 'captions.json'), 'utf8'));
const C = WORDS.captions;

/* Controls that only a build with its gates open draws. The Free tree has
 * none of them; the film checks before it starts, so a gated control can
 * never be filmed. */
const GATED_IDS = ['data-changes', 'view-sizes', 'view-changes', 'compare-json', 'compare-toggle', 'watch',
  'struct-problems', 'struct-more', 'log-show-all', 'log-new-call', 'log-selection', 'session-bar'];

/* Where the cursor rests at the start (and, in the loop, at the end). */
const REST = [560, 650];

/* ------------------------------------------------------------ scenes */

const sel = {
  account: '#viewport .row:has(.k:text-is("Account")) .k',
  filter: '#filter',
  form: '#view-form',
  raw: '#view-raw',
  tree: '#view-tree',
  structureTab: '#tab-structure',
  promo: '#struct-list .el-row:has(.el-name:has-text("PromoCode"))',
  visibility: '#struct-detail .fc-card[data-card="visibility"]',
  isNow: '#struct-detail .fc-card[data-card="visibility"] tbody tr.fc-main .fc-col-now .fc-mono',
  planLink: '#struct-detail .fc-card[data-card="visibility"] .fc-link',
  showInData: '#struct-detail button:has-text("Show in Data")',
  callsTab: '#tab-actions',
  failed: '#log-list .log-row.is-failed',
  error: '#log-detail .detail-error',
  errorToggle: '#log-detail .detail-error-toggle'
};

const visible = (selector) => (page) => until(page, selector);

async function dataScenes(film, stills) {
  film.caption(C.data);
  stills('01-data-tree', 1.2);
  await film.hold(2.2);

  film.caption(C.branch);
  await film.click(sel.account, { settle: visible('#viewport .row:has(.k:text-is("Segment"))') });
  await film.hold(1.4);

  film.caption(C.filter);
  await film.click(sel.filter, { x: 120 });
  await film.type('Exampleton');
  stills('02-data-filter', 0.6);
  await film.hold(1.6);
  /* The search box's own clear button, at its right end. */
  const box = await film.page.locator(sel.filter).boundingBox();
  await film.click([box.x + box.width - 14, box.y + box.height / 2], { settle: visible(sel.account) });
  await film.hold(0.5);

  film.caption(C.views);
  await film.click(sel.form, { settle: visible('#view-form[aria-pressed="true"]') });
  stills('03-data-form', 0.8);
  await film.hold(1.5);
  await film.click(sel.raw);
  await film.hold(1.4);
  await film.click(sel.tree, { settle: visible(sel.account) });
  await film.hold(0.6);
}

async function structureScenes(film, stills, { jump = true } = {}) {
  film.caption(C.structure);
  await film.click(sel.structureTab, { settle: visible('#struct-list .el-row:not(.el-head)') });
  await film.hold(1.8);

  film.caption(C.hidden);
  await film.click(sel.promo, { x: 140, settle: visible(sel.visibility) });
  /* Rest just after the value the rule reads now. */
  const isNow = await film.page.locator(sel.isNow).first().boundingBox();
  await film.move([isNow.x + isNow.width + 14, isNow.y + isNow.height * 0.75]);
  stills('04-structure-visibility', 0.4);
  await film.hold(2.2);
  if (!jump) return;

  film.caption(C.showInData);
  await film.click(sel.planLink, { settle: visible('#struct-detail :text("Plan (Choose a plan)")') });
  await film.hold(0.8);
  await film.click(sel.showInData, { settle: visible('#view-data:not([hidden]) #viewport .row') });
  /* The row it landed on flashes; the cursor waits, then leaves the tree. */
  stills('05-show-in-data', 0.25);
  await film.hold(1.2);
  const last = await film.page.locator('#viewport .row').last().boundingBox();
  await film.move([last.x + 150, last.y + last.height + 28]);
  await film.hold(0.9);
}

async function callsScenes(film, stills, { showMore = true } = {}) {
  film.caption(C.calls);
  await film.click(sel.callsTab, { settle: visible(sel.failed) });
  await film.hold(1.6);

  film.caption(C.failed);
  await film.move(sel.failed, { x: 230 });
  stills('06-calls-failed', 0.8);
  await film.hold(1.6);

  film.caption(C.detail);
  await film.click(sel.failed, { x: 230, settle: visible(sel.error) });
  await film.hold(0.6);
  if (!showMore) {
    await film.hold(1.2);
    return;
  }
  /* Show more opens the whole message. */
  await film.click(sel.errorToggle, { x: 18 });
  /* Then out of the text, to the empty space under the Output. */
  const output = await film.page.locator('#log-detail .row').last().boundingBox();
  await film.move([output.x + output.width * 0.7, output.y + output.height + 36]);
  stills('07-calls-detail', 0.8);
  await film.hold(2.0);
}

async function themeScene(film, stills) {
  film.caption(C.theme);
  await film.dissolve((page) => page.evaluate(() => window.__setDevToolsTheme('dark')), 0.7);
  stills('08-dark', 0.6);
  await film.hold(1.8);
}

/* The full video: Data, Structure, Calls, the theme, the end card. */
async function fullStoryboard(film, stills) {
  await dataScenes(film, stills);
  await structureScenes(film, stills);
  await callsScenes(film, stills);
  await themeScene(film, stills);
  film.caption(null);
  await film.hold(0.2);
  stills('09-end-card', 1.4);
  await film.endCard(3.0);
}

/* The website loop: one beat per tab, then back to the first frame. */
async function loopStoryboard(film, stills, first) {
  film.caption(C.data);
  await film.hold(2.4);
  await structureScenes(film, stills, { jump: false });
  await film.hold(0.2);
  await callsScenes(film, stills, { showMore: false });
  film.caption(null);
  await film.move(REST, { seconds: 0.9 });
  await film.fadeToStill(first, 0.6);
  /* A few frames on the still itself, so the encoder settles on it. */
  await film.hold(0.3);
}

/* ------------------------------------------------------------- renders */

const H264 = (crf, extra = [], preset = 'slow') => ['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-movflags', '+faststart', '-an', ...extra];

const RENDERS = {
  main: { width: 1280, height: 720, scale: 1.5, file: 'promo-1080p.mp4', args: H264(20), stills: true, story: 'full' },
  store: { width: 1280, height: 800, scale: 1, file: 'promo-1280x800.mp4', args: H264(20), stills: false, story: 'full' },
  loop: { width: 1280, height: 720, scale: 1, file: 'loop-master.mp4', args: H264(8, [], 'medium'), tmp: true, stills: false, story: 'loop' }
};

async function render(browser, port, name, spec, dirs) {
  const { context, page } = await openFreePanel(browser, port, spec);
  const present = await page.evaluate((ids) => ids.filter((id) => document.getElementById(id)), GATED_IDS);
  if (present.length) throw new Error(`Gated controls in the Free panel: ${present.join(', ')}`);

  const output = path.join(spec.tmp ? dirs.tmp : dirs.out, spec.file);
  const sink = ffmpegSink(FFMPEG, FPS, [...spec.args, output]);
  const film = await Film.start(page, { fps: FPS, sink, width: spec.width, height: spec.height, end: WORDS.end });
  film.cursor.x = REST[0];
  film.cursor.y = REST[1];
  await page.mouse.move(REST[0], REST[1]);
  const stills = (label, after) => {
    if (spec.stills) film.still(path.join(dirs.out, 'frames', `${label}.png`), after);
  };
  if (spec.stills) film.still(path.join(dirs.out, 'poster.png'), 0.6);

  if (spec.story === 'loop') await loopStoryboard(film, stills, await film.panelSnapshot());
  else await fullStoryboard(film, stills);

  const { frames, seconds } = await film.finish();
  await context.close();
  console.log(`  ${name}: ${frames} frames, ${seconds.toFixed(2)} s -> ${output}`);
  return output;
}

/* The website loop from its master: small H.264 and VP9 files. */
function encodeLoop(master, out) {
  const mp4 = path.join(out, 'promo-loop.mp4');
  const webm = path.join(out, 'promo-loop.webm');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, ...H264(21, ['-tune', 'stillimage']), mp4], { stdio: 'inherit' });
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', master, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an', webm], { stdio: 'inherit' });
}

function report(out) {
  const files = ['promo-1080p.mp4', 'promo-1280x800.mp4', 'promo-loop.mp4', 'promo-loop.webm', 'poster.png'];
  for (const file of files) {
    const full = path.join(out, file);
    if (!existsSync(full)) continue;
    let duration = '';
    try {
      const probe = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height',
        '-of', 'default=noprint_wrappers=1:nokey=1', full], { encoding: 'utf8' }).trim().split('\n');
      duration = file.endsWith('.png') ? `${probe[0]}x${probe[1]}` : `${probe[0]}x${probe[1]}, ${Number(probe[2]).toFixed(2)} s`;
    } catch { /* ffprobe is optional */ }
    console.log(`  ${file}: ${(statSync(full).size / 1024 / 1024).toFixed(2)} MB ${duration}`);
  }
}

function parseArgs(argv) {
  const args = { out: path.join(ROOT, 'dist', 'promo-video'), tmp: path.join(os.tmpdir(), 'odi-promo-video'), only: Object.keys(RENDERS) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = path.resolve(argv[++i]);
    else if (argv[i] === '--tmp') args.tmp = path.resolve(argv[++i]);
    else if (argv[i] === '--only') args.only = argv[++i].split(',');
    else throw new Error(`Unknown argument ${argv[i]}. Use --out dir, --tmp dir, --only main,store,loop.`);
  }
  const unknown = args.only.filter((name) => !RENDERS[name]);
  if (unknown.length) throw new Error(`Unknown render ${unknown.join(', ')}: use ${Object.keys(RENDERS).join(', ')}.`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = loadPlaywright();
  mkdirSync(args.out, { recursive: true });
  mkdirSync(args.tmp, { recursive: true });
  if (args.only.includes('main')) {
    rmSync(path.join(args.out, 'frames'), { recursive: true, force: true });
    mkdirSync(path.join(args.out, 'frames'), { recursive: true });
  }
  const tree = buildFreeTree(path.join(args.tmp, 'free'));
  const { server, port } = await serveTree(tree);
  const browser = await launchBrowser(chromium);
  try {
    for (const name of args.only) {
      const output = await render(browser, port, name, RENDERS[name], args);
      if (name === 'loop') encodeLoop(output, args.out);
    }
  } finally {
    await browser.close();
    server.close();
  }
  report(args.out);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
