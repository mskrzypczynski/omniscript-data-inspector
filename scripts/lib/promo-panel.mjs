/* The Free panel for the promo video: the Free tree built from this
 * repository (scripts/lib/flavour.mjs), served by a small static server, and
 * opened with the demo script and the chrome.devtools stub of
 * lib/demo-panel.mjs at any viewport size and device scale factor. All demo
 * data is invented. Dev tooling only; never shipped. */

/* Functions passed to page.evaluate run in the panel page. */
/* global window, document */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { FREE_ENTRY, treeFlavour, writeFreeTree } from './flavour.mjs';
import { AURA, CALLS, DEFINITION, INITIAL_DATA, ROOT, installStub, useRenderFonts } from './demo-panel.mjs';
import { RENDER_ARGS } from './store-assets.mjs';

/* What the Free package ships (scripts/package-extension.mjs). */
const SHIPPED_PATHS = ['manifest.json', 'devtools.html', 'devtools.js', 'panel.html', 'panel.css', 'popup.html', 'icons', 'src', 'LICENSE'];

/* The fonts every render uses live in the repository, not in the package. */
const FONTS_URL = '/scripts/lib/fonts/';

export function buildFreeTree(out) {
  writeFreeTree(ROOT, out, SHIPPED_PATHS);
  /* A sanity check that the tree really is Free: the Free entry, no gated code. */
  const panel = readFileSync(path.join(out, 'panel.html'), 'utf8');
  if (!panel.includes(FREE_ENTRY) || treeFlavour(out) !== 'free') {
    throw new Error(`${out} is not a Free tree: its panel does not load the Free entry alone.`);
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf'
};

/* Serves the Free tree, and the render fonts from the repository. */
export function serveTree(dir) {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = urlPath.startsWith(FONTS_URL) ? ROOT : dir;
    const file = path.join(base, urlPath === '/' ? 'panel.html' : urlPath);
    if (!file.startsWith(base + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/* Playwright's own Chromium when it matches, else the installed Chrome. */
export async function launchBrowser(chromium) {
  try {
    return await chromium.launch({ args: RENDER_ARGS });
  } catch {
    return chromium.launch({ channel: 'chrome', args: RENDER_ARGS });
  }
}

/* The stub keeps DevTools' theme handler, so a scene can switch the theme as
 * DevTools would when the user changes it. */
const KEEP_THEME_HANDLER = `(() => {
  const panels = window.chrome.devtools.panels;
  panels.setThemeChangeHandler = (fn) => { window.__setDevToolsTheme = fn; };
})()`;

/* The panel tour and the tab tours count as seen, so no card covers the
 * panel; nothing else is stored. */
const SEEN_TOURS = `(() => {
  const kept = { tourSeen: true, tourSeenData: true, tourSeenStructure: true, tourSeenActions: true };
  window.chrome.storage = { local: {
    get: async (key) => {
      if (key == null) return { ...kept };
      const names = typeof key === 'string' ? [key] : Array.isArray(key) ? key : Object.keys(key);
      return Object.fromEntries(names.filter((name) => name in kept).map((name) => [name, kept[name]]));
    },
    set: async (values) => { Object.assign(kept, values); },
    remove: async () => {}
  } };
})()`;

/* The panel's timers run on a fake clock that only the film moves (one
 * frame at a time), so the panel's own timing (a flash, a debounce, a poll)
 * plays out in film time. Waiting for the panel therefore moves its clock on
 * in small steps until what is waited for is there. */
export async function until(page, what, { step = 50, tries = 200 } = {}) {
  const check = typeof what === 'string'
    ? () => page.locator(what).first().isVisible()
    : () => page.evaluate(what);
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await page.clock.runFor(step);
  }
  throw new Error(`The panel never showed ${typeof what === 'string' ? what : what.toString()}`);
}

export async function openFreePanel(browser, port, { width, height, scale = 1 }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: 'light',
    /* The film drives the panel's animations on its own clock. */
    reducedMotion: 'no-preference',
    locale: 'en-US',
    timezoneId: 'UTC'
  });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2025-01-15T10:43:31Z') });
  page.on('pageerror', (error) => console.warn('  page error:', error.message));
  await page.addInitScript(`(${installStub.toString()})(${JSON.stringify({
    theme: 'default', data: INITIAL_DATA, def: DEFINITION, calls: CALLS, auraDescriptor: AURA, noHost: false
  })})`);
  await page.addInitScript(KEEP_THEME_HANDLER);
  await page.addInitScript(SEEN_TOURS);
  await page.goto(`http://127.0.0.1:${port}/panel.html`);
  await useRenderFonts(page);
  await until(page, () => document.getElementById('target').textContent.includes('Account/Onboarding/English'));
  await until(page, '#viewport .row');
  if (await page.isVisible('#tip')) await page.click('#tip-close');
  await page.evaluate(() => window.__stub.fireCalls());
  await page.clock.runFor(500);
  return { context, page };
}
