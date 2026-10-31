#!/usr/bin/env node
'use strict';

/* Runs axe-core over the real panel, tab by tab, in the light and the dark
 * theme, and fails on a serious or critical violation.
 *
 *   npm run a11y
 *
 * The panel is the one the screenshots use (scripts/lib/demo-panel.mjs): a
 * demo script, fake calls and a stub of chrome.devtools in headless Chromium.
 * axe-core is a dev dependency; Playwright is resolved at run time, as for the
 * screenshots. Known false positives are listed with a reason each in
 * scripts/a11y-allow.json: { "rule": "...", "selector": "...", "reason": "..." },
 * where the selector must be part of the node's target. Dev tooling only.
 * A view that needs a feature gate lists it under `needs` and is audited only
 * where the build carries it, as in screenshots.mjs: a tree of another
 * flavour than Free carries every gate, the Free build none. */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeFlavour } from './lib/flavour.mjs';
import { launch, loadPlaywright } from './lib/store-assets.mjs';
import { openPanel, serve } from './lib/demo-panel.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const BLOCKING = new Set(['serious', 'critical']);
const CARRIED = treeFlavour(ROOT) !== 'free';
const inBuild = (view) => !(view.needs || []).length || CARRIED;

/* The allow entry that covers a violation: the same rule, on a node whose
 * target contains the entry's selector. */
export function allowedBy(allow, rule, target) {
  return allow.find((entry) => entry.rule === rule && (!entry.selector || target.includes(entry.selector))) || null;
}

/* The violations to fail on, from axe's result: [{ rule, impact, target, summary }].
 * `used` collects the allow entries that covered something. */
export function blockingViolations(violations, allow, used = new Set()) {
  const found = [];
  violations.filter((violation) => BLOCKING.has(violation.impact)).forEach((violation) => {
    violation.nodes.forEach((node) => {
      const target = Array.isArray(node.target) ? node.target.join(' ') : String(node.target);
      const entry = allowedBy(allow, violation.id, target);
      if (entry) { used.add(entry); return; }
      found.push({ rule: violation.id, impact: violation.impact, target, summary: violation.help });
    });
  });
  return found;
}

/* Two Previews of one Integration Procedure, as the designer's Preview button
 * sends them (invented names and Ids): the Debug tab and the comparison of the
 * two need calls to show. The panel's network listeners are kept by an init
 * script so a test can feed them. */
const KEEP_LISTENERS = `(() => {
  const network = window.chrome.devtools.network.onRequestFinished;
  const add = network.addListener;
  window.__finished = [];
  network.addListener = (fn) => { window.__finished.push(fn); add(fn); };
})()`;

const PREVIEW_CTX = { csrf: 'EXAMPLE-CSRF-0001', vid: '06600000000EXAM', ns: 'omnistudio', ver: 66, authorization: 'EXAMPLE-AUTH-0001' };

function previewRun({ tid, second, slower }) {
  const block = (status, type, ms, cpu) => ({ Status: status, Type: type, ElapsedTime: ms, ElapsedTimeCPU: cpu, Input: { accountId: '001000000000001AAA' }, Options: {} });
  return {
    call: {
      action: 'omnistudio.OmniScriptDesignerController', method: 'testIntegrationProcedure',
      data: ['a0A000000000001AAA', '{"ContextId":"001000000000001AAA"}', { isDebug: true, chainable: false, ignoreCache: true }],
      type: 'rpc', tid, ctx: PREVIEW_CTX
    },
    result: {
      fullDataJson: {
        originalInput: { ContextId: '001000000000001AAA' },
        response: { total: 120 },
        executionSequence: slower ? ['GetAccount', 'SetTotals', 'CallRating', 'AuditLog'] : ['GetAccount', 'SetTotals', 'CallRating'],
        elapsedTimeActual: slower ? 470 : 410,
        elapsedTimeCPU: 95,
        debugLog: [
          '2025-01-15T10:42:20.000Z: Run started',
          "2025-01-15T10:42:20.037Z: Query: SELECT Id, Name FROM Account WHERE Id = '001000000000001AAA'",
          '2025-01-15T10:42:20.052Z: Query results found: 1',
          '2025-01-15T10:42:20.060Z: Query time: 14',
          '2025-01-15T10:42:20.410Z: Time in Server: 410'
        ],
        GetAccount: { Name: 'Example Ltd' },
        GetAccountDebug: block('Success', 'DataRaptor Extract Action', slower ? 60 : 120, 30),
        SetTotals: { total: 120 },
        SetTotalsDebug: block('Success', 'Set Values', 10, 2),
        CallRating: { rating: 'A' },
        CallRatingDebug: block('Success', 'HTTP Action', slower ? 360 : 240, 60),
        ...(slower ? { AuditLog: { logged: true }, AuditLogDebug: block('Success', 'Set Values', 20, 5), Notify: null, NotifyStatus: false } : {})
      }
    },
    ms: slower ? 470 : 410,
    second
  };
}

async function fireDebugRuns(page) {
  if (await page.evaluate(() => window.__debugRuns === true)) return;
  for (const run of [previewRun({ tid: 12, second: 20, slower: false }), previewRun({ tid: 13, second: 40, slower: true })]) {
    await page.evaluate(({ call, result, ms, second }) => {
      const text = JSON.stringify([{ statusCode: 200, type: 'rpc', tid: call.tid, ref: false, action: call.action, method: call.method, result: JSON.stringify(result) }]);
      const entry = {
        request: { url: 'https://example.my.site.com/apexremote', method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: JSON.stringify(call) } },
        response: { status: 200, bodySize: text.length },
        time: ms,
        startedDateTime: new Date(2025, 0, 15, 10, 42, second).toISOString(),
        getContent: (callback) => callback(text)
      };
      window.__finished.forEach((listener) => listener(entry));
    }, run);
  }
  await page.evaluate(() => { window.__debugRuns = true; });
}

/* The Debug tab of the newer preview, on the Overview. */
async function openDebugRun(page) {
  await page.click('#tab-actions');
  await page.waitForSelector('#log-list .log-row:not(.log-head)');
  await fireDebugRuns(page);
  const keys = await page.$$eval('#log-list .log-row:not(.log-head)', (rows) => rows
    .filter((row) => row.textContent.includes('IP preview')).map((row) => Number(row.dataset.rowKey)).sort((a, b) => a - b));
  await page.click(`#log-list .log-row[data-row-key="${keys[1]}"]`);
  await page.waitForSelector('#log-detail #debug-view-select');
  return keys;
}

/* The Debug tab in its views, and the comparison of the two previews. */
const DEBUG_TABS = [
  {
    name: 'Calls / Debug overview',
    needs: ['calls.debug'],
    async show(page) {
      await openDebugRun(page);
      await page.selectOption('#debug-view-select', 'overview');
      await page.waitForSelector('#log-detail .debug-steps');
    }
  },
  {
    name: 'Calls / Debug log',
    needs: ['calls.debug'],
    async show(page) {
      await openDebugRun(page);
      await page.selectOption('#debug-view-select', 'log');
      await page.click('#log-detail .debug-chip:has-text("Queries")');
      await page.waitForSelector('#log-detail .debug-lines');
    }
  },
  {
    name: 'Calls / Debug element',
    needs: ['calls.debug'],
    async show(page) {
      await openDebugRun(page);
      await page.selectOption('#debug-view-select', 'step:0');
      await page.waitForSelector('#log-detail .debug-body [role="tree"]');
    }
  },
  {
    /* The older preview as the baseline: the table of both runs side by side. */
    name: 'Calls / Compare two debug runs',
    needs: ['calls.debug', 'calls.compare'],
    async show(page) {
      const keys = await openDebugRun(page);
      await page.click(`#log-list .log-row[data-row-key="${keys[0]}"]`, { modifiers: ['Control'] });
      await page.click('#log-detail .seg-btn:has-text("Compare")');
      await page.waitForSelector('#log-detail .debug-cmp');
    }
  }
];

/* The three tabs, the Data tab's Sizes view and the Settings dialog, each
 * opened and given something to show first. They run in this order, each
 * leaving the page as the next one needs it (Settings is last). */
const TABS = [
  { name: 'Data', async show(page) { /* the Data tab is open after openPanel */ await page.waitForSelector('#viewport .row'); } },
  {
    name: 'Data / Sizes',
    needs: ['data.sizes'],
    async show(page) {
      await page.click('#view-sizes');
      await page.waitForSelector('#viewport .size-row');
    }
  },
  {
    name: 'Structure',
    async show(page) {
      await page.click('#tab-structure');
      await page.waitForSelector('#struct-list .el-row:not(.el-head)');
      await page.click('#struct-list .el-row:has(.el-name:has-text("PromoCode"))');
    }
  },
  {
    name: 'Calls',
    async show(page) {
      await page.click('#tab-actions');
      await page.waitForSelector('#log-list .log-row:not(.log-head)');
      await page.click('#log-list .log-row.is-failed');
    }
  },
  ...DEBUG_TABS,
  {
    /* Show raw… on the failed call: the request and the answer, two blocks that scroll. */
    name: 'Calls / Raw view',
    async show(page) {
      await page.click('#tab-actions');
      await page.click('#log-list .log-row.is-failed', { button: 'right' });
      await page.click('.ctx-menu .ctx-item:has-text("Show raw")');
      await page.waitForSelector('#log-detail .raw-pane');
    }
  },
  {
    /* The dialog with a property picker open: its listbox is part of the page. */
    name: 'Settings',
    async show(page) {
      await page.click('#settings');
      /* The property fields sit in the Reading another page fold. */
      await page.click('#settings-reading > summary');
      await page.waitForSelector('#settings-data-prop');
      await page.click('#settings-data-prop');
      await page.waitForSelector('.prop-menu:not([hidden])');
    }
  }
];

async function audit(browser, port, scheme, allow, used, { tabs = TABS, width, label = '' } = {}) {
  /* DevTools tells the panel its theme; "dark" is how it says so. */
  const { context, page } = await openPanel(browser, port, {
    colorScheme: scheme, theme: scheme === 'dark' ? 'dark' : 'default', init: KEEP_LISTENERS, ...(width ? { width } : {})
  });
  const results = [];
  try {
    for (const tab of tabs.filter(inBuild)) {
      await tab.show(page);
      await page.waitForTimeout(150);
      await page.addScriptTag({ path: AXE });
      const outcome = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
      blockingViolations(outcome.violations, allow, used).forEach((violation) => results.push({ tab: `${tab.name}${label}`, scheme, ...violation }));
    }
  } finally {
    await context.close();
  }
  return results;
}

async function main() {
  const allow = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'a11y-allow.json'), 'utf8')).allow || [];
  const { chromium } = loadPlaywright();
  const { server, port } = await serve();
  const browser = await launch(chromium);
  let results = [];
  const used = new Set();
  try {
    for (const scheme of ['light', 'dark']) {
      results = results.concat(await audit(browser, port, scheme, allow, used));
      /* The Debug views and the comparison table scroll or drop columns when the pane is narrow: audit them at 480 px as well. */
      if (DEBUG_TABS.some(inBuild)) results = results.concat(await audit(browser, port, scheme, allow, used, { tabs: DEBUG_TABS, width: 480, label: ' (480 px)' }));
    }
  } finally {
    await browser.close();
    server.close();
  }
  /* Only a note: what axe finds can differ a little between machines. */
  allow.filter((entry) => !used.has(entry)).forEach((entry) => {
    console.log(`note  scripts/a11y-allow.json: "${entry.rule}" on "${entry.selector || ''}" matched nothing; remove it if it is fixed`);
  });

  if (!results.length) {
    console.log(`ok  no serious or critical accessibility violations (${TABS.filter(inBuild).map((tab) => tab.name).join(', ')}; light and dark)`);
    return;
  }
  results.forEach((r) => console.log(`${r.impact.toUpperCase().padEnd(8)} ${r.tab} / ${r.scheme}: ${r.rule} (${r.summary})\n         ${r.target}`));
  console.log(`\n${results.length} violation${results.length === 1 ? '' : 's'}. A false positive goes into scripts/a11y-allow.json with a reason.`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
