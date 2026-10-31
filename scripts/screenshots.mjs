#!/usr/bin/env node
'use strict';

/* Renders the Chrome Web Store screenshots from the real panel.
 *
 *   npm run screenshots
 *
 * Writes store/screenshots/*.png, each exactly 1280x800, 24-bit RGB (no alpha).
 *
 * How it works: a tiny static server (ES modules do not load from file://)
 * serves this repository, and a headless Chromium opens panel.html at the
 * DevTools-docked size. Before the panel boots, a stub of chrome.devtools is
 * injected (see installStub). Its inspectedWindow.eval really runs the
 * panel's own page-side functions (hostScan / hostFetch / hostProps /
 * frameScan from src/ui/targets.js) against a fake OmniScript host element in
 * a hidden same-origin iframe, so the panel reads demo data exactly as it
 * reads a live page. network.onRequestFinished is fed fake Aura entries.
 *
 * Every scene is driven with real clicks and typing on the real element ids.
 * All demo data below is fictional.
 *
 * The demo script and the chrome.devtools stub live in lib/demo-panel.mjs.
 *
 * Playwright is not a dependency of this project: it is resolved at run time
 * (NODE_PATH, then the global npm root) and Chromium is the one already
 * installed for it. If it cannot be found the script says so and stops.
 *
 * The images show the build this tree is: a scene that needs a feature gate
 * (src/core/shared/features.js) lists it under `needs` and is rendered only
 * where the build carries it; a scene for a build without it lists it under
 * `without`. A tree of another flavour than Free carries every gate
 * (scripts/lib/flavour.mjs), the Free build none.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { treeFlavour } from './lib/flavour.mjs';
import { flattenPng, launch, loadPlaywright } from './lib/store-assets.mjs';
import { DEFINITION, HEIGHT, INITIAL_DATA, ROOT, WIDTH, applyChange, openPanel, serve } from './lib/demo-panel.mjs';

const OUT_DIR = path.join(ROOT, 'store', 'screenshots');

/* Does this build carry the gate? See the note at the top. */
const CARRIED = treeFlavour(ROOT) !== 'free';
const carries = () => CARRIED;
const renders = (scene) => (scene.needs || []).every(carries) && !(scene.without || []).some(carries);

/* ---------------------------------------------------------------- scenes */

/* Mouse over a row shows hover chrome, and a pointer left over a button looks
 * like a stuck state: park it in the empty corner of the status bar. */
async function parkMouse(page) {
  await page.mouse.move(WIDTH - 2, HEIGHT - 2);
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
}


async function save(page, name, { keepMouse = false } = {}) {
  /* keepMouse: a scene that shows a hover or an open menu leaves the pointer where it is. */
  if (!keepMouse) await parkMouse(page);
  await page.waitForTimeout(200);
  const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  const flat = flattenPng(png, [255, 255, 255]);
  const file = path.join(OUT_DIR, name);
  writeFileSync(file, flat);
  console.log(`  ${path.relative(ROOT, file)}`);
}

/* Opens a closed tree branch by clicking its row, as a person would. The
 * tree redraws after each click, so the row is looked up again every time. */
async function openBranch(page, keyText) {
  const closed = page.locator('#viewport .row', {
    has: page.locator('.k', { hasText: new RegExp(`^${keyText}$`) })
  }).filter({ has: page.locator('.twisty', { hasText: '▸' }) }).first();
  if (await closed.count()) await closed.locator('.k').click();
}

async function openTab(page, id, viewSelector) {
  await page.click(id);
  await page.waitForSelector(viewSelector, { state: 'visible' });
}

async function changeValues(page) {
  await page.evaluate((source) => {
    const apply = new Function(`return (${source})`)();
    window.__stub.setData(apply(window.__stub.getData()));
  }, applyChange.toString());
  await page.waitForSelector('#viewport .is-changed');
}

/* Expand all only exists on a detail tab that draws a JSON tree; the Visibility
 * tab has none, so the scene must not wait for a button that is hidden. */
async function expandIfShown(page) {
  const button = page.locator('#struct-detail button:has-text("Expand all"):visible');
  if (await button.count()) await button.first().click();
}

/* A scene that needs different data than the five store images show starts
 * from a copy of the demo data with its own change applied. */
const demoData = (change) => change(JSON.parse(JSON.stringify(INITIAL_DATA)));

/* A scene that needs a Visualforce remoting call (a designer preview) fires
 * its own network entry: the stub keeps the listeners where the scene can
 * reach them. Invented names, Ids and values throughout. */
const KEEP_LISTENERS = `(() => {
  const network = window.chrome.devtools.network.onRequestFinished;
  const add = network.addListener;
  window.__finished = [];
  network.addListener = (fn) => { window.__finished.push(fn); add(fn); };
})()`;

async function fireVisualforce(page, { call, result, ms, second, extra = {} }) {
  await page.evaluate(({ call: sent, result: answer, ms: took, second: at, extra: more }) => {
    const text = JSON.stringify([{ statusCode: 200, type: 'rpc', tid: sent.tid, ref: false, action: sent.action, method: sent.method, result: JSON.stringify(answer), ...more }]);
    const entry = {
      request: { url: 'https://example.my.site.com/apexremote', method: 'POST', headers: [{ name: 'Content-Type', value: 'application/json' }], postData: { text: JSON.stringify(sent) } },
      response: { status: 200, bodySize: text.length },
      time: took,
      startedDateTime: new Date(2025, 0, 15, 10, 42, at).toISOString(),
      getContent: (callback) => callback(text)
    };
    window.__finished.forEach((listener) => listener(entry));
  }, { call, result, ms, second, extra });
}

const PREVIEW_CTX = { csrf: 'EXAMPLE-CSRF-0001', vid: '06600000000EXAM', ns: 'omnistudio', ver: 66, authorization: 'EXAMPLE-AUTH-0001' };

/* A preview of the Integration Procedure Onboarding_Quote, as the designer's Preview button sends it. */
const IP_PREVIEW = {
  call: {
    action: 'omnistudio.OmniScriptDesignerController', method: 'testIntegrationProcedure',
    data: ['a0A000000000001AAA', '{"ContextId":"001000000000001AAA","Country":"GB"}', { isDebug: true, chainable: false, ignoreCache: true }],
    type: 'rpc', tid: 12, ctx: PREVIEW_CTX
  },
  result: {
    fullDataJson: {
      originalInput: { ContextId: '001000000000001AAA', Country: 'GB' },
      response: { total: 120, currency: 'GBP', rating: 'A' },
      executionSequence: ['GetAccount', 'SetTotals', 'CallRating'],
      elapsedTimeActual: 410,
      elapsedTimeCPU: 95,
      debugLog: [
        '2025-01-15T10:42:20.000Z: Run started',
        "2025-01-15T10:42:20.037Z: Query: SELECT Id, Name FROM Account WHERE Id = '001000000000001AAA'",
        '2025-01-15T10:42:20.052Z: Query results found: 1',
        '2025-01-15T10:42:20.060Z: Query time: 14',
        '2025-01-15T10:42:20.410Z: Time in Server: 410'
      ],
      GetAccount: { Name: 'Example Ltd', Address: { City: 'Exampleton' } },
      GetAccountDebug: { Status: 'Success', Type: 'DataRaptor Extract Action', ElapsedTime: 120, ElapsedTimeCPU: 30, Input: { accountId: '001000000000001AAA' }, Options: { bundle: 'ExampleGetAccount' } },
      SetTotals: { total: 120 },
      SetTotalsDebug: { Status: 'Success', Type: 'Set Values', ElapsedTime: 10, ElapsedTimeCPU: 2, Input: {}, Options: {} },
      CallRating: { rating: 'A' },
      CallRatingDebug: { Status: 'Success', Type: 'HTTP Action', ElapsedTime: 240, ElapsedTimeCPU: 60, Input: { name: 'Example Ltd' }, Options: { method: 'POST' } }
    }
  },
  ms: 410,
  second: 20
};

/* The same procedure run again, later: one step slower, one faster, and a step the first run did not have. */
const IP_PREVIEW_LATER = (() => {
  const data = IP_PREVIEW.result.fullDataJson;
  return {
    ...IP_PREVIEW,
    call: { ...IP_PREVIEW.call, tid: 13 },
    result: {
      fullDataJson: {
        ...data,
        executionSequence: [...data.executionSequence, 'AuditLog'],
        elapsedTimeActual: 470,
        elapsedTimeCPU: 110,
        GetAccountDebug: { ...data.GetAccountDebug, ElapsedTime: 60, ElapsedTimeCPU: 15 },
        CallRatingDebug: { ...data.CallRatingDebug, ElapsedTime: 360, ElapsedTimeCPU: 90 },
        AuditLog: { logged: true },
        AuditLogDebug: { Status: 'Success', Type: 'Set Values', ElapsedTime: 20, ElapsedTimeCPU: 5, Input: {}, Options: {} }
      }
    },
    ms: 470,
    second: 40
  };
})();

const SCENES = [
  {
    file: '1-data-tree.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      for (const key of ['Account', 'AddOns']) await openBranch(page, key);
      await changeValues(page);
      await openBranch(page, 'AddOns');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: '2-structure.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-list .el-row:has(.el-name:has-text("PromoCode"))');
      await page.click('#struct-detail .seg-btn:has-text("Visibility")');
      await expandIfShown(page);
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: '3-remote-actions.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      /* Tick the Integration Procedure calls so the summary bar adds up their time. */
      if (carries('calls.select')) {
        const ticks = page.locator('#log-list .log-row:not(.log-head):has(.tag-ip) .log-check');
        for (let i = 0; i < await ticks.count(); i++) await ticks.nth(i).click();
      }
      await page.click('#log-list .log-row.is-failed');
      const banner = page.locator('#log-detail .detail-error');
      await banner.waitFor();
      await banner.click();
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: '4-compare-payloads.png',
    needs: ['data.changes', 'data.compare'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      /* Compare data lives in the Changes bar, which Track changes opens. */
      await page.check('#data-changes');
      await changeValues(page);
      await page.click('#compare-toggle');
      await page.waitForSelector('#compare-panel:not([hidden])');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* What may stop Next on the step the script is on: its Validation tab,
     * with the required Plan left empty. */
    file: '4-step-validation.png',
    without: ['data.compare'],
    async run(browser, port) {
      const data = demoData((d) => { d.PlanSelection.Plan = ''; return d; });
      const { context, page } = await openPanel(browser, port, { data });
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-current');
      await page.waitForSelector('#struct-list .el-row.is-selected');
      await page.click('#struct-detail .seg-btn:has-text("Validation")');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: '5-dark-structure.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { theme: 'dark' });
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-current');
      await page.waitForSelector('#struct-list .el-row.is-selected');
      await expandIfShown(page);
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-actions-oversized.png',
    needs: ['calls.analysis'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      /* A call that sends the script's whole data: the demo list stays as it is
       * and the call is fed in here. Its input is about 1.2 MB, mostly one key. */
      await page.evaluate(() => {
        const line = (n) => ({ Id: `EX-${n}`, Label: 'Sample line item', Quantity: n % 7, Note: 'x'.repeat(60) });
        window.__stub.fireCall({
          sClassName: 'omnistudio.IntegrationProcedureService', sMethodName: 'Onboarding_PriceBasket',
          options: { chainable: false },
          input: {
            Basket: Array.from({ length: 8200 }, (_, n) => line(n)),
            Customer: { Name: 'Alex Example', Segment: 'Consumer' },
            Quote: Array.from({ length: 1400 }, (_, n) => line(n)),
            Country: 'GB'
          },
          output: { IPResult: { Total: 1234 }, error: 'OK' },
          ms: 910, second: 55
        }, 20);
      });
      await page.click('#log-list .log-row:has-text("Onboarding_PriceBasket")');
      await page.waitForSelector('#log-detail .size-chip');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-data-open-record.png',
    async run(browser, port) {
      const data = demoData((d) => { d.DRExtract_Account.Account.Id = '0015g00000AbCdEAAV'; return d; });
      const { context, page } = await openPanel(browser, port, { data });
      for (const key of ['DRExtract_Account', 'Account']) await openBranch(page, key);
      const row = page.locator('#viewport .row:has(.k:text-is("Id"))').first();
      await row.hover();
      await row.click({ button: 'right', position: { x: 520, y: 8 } });
      await page.waitForSelector('.ctx-menu');
      /* The menu opens under the pointer; move back onto the row to show its buttons. */
      await row.hover({ position: { x: 300, y: 8 } });
      await save(page, this.file, { keepMouse: true });
      await context.close();
    }
  },
  {
    file: 'feature-data-query.png',
    needs: ['data.query'],
    async run(browser, port) {
      const data = demoData((d) => {
        d.Cart = { Items: [{ Code: 'SKU-100', Qty: 2 }, { Code: 'SKU-200', Qty: 1 }, { Code: 'SKU-300', Qty: 5 }] };
        d.PlanSelection.Extra = { Code: 'PLAN-PLUS' };
        return d;
      });
      const { context, page } = await openPanel(browser, port, { data });
      await page.fill('#filter', '$..Code');
      await page.waitForSelector('#viewport .row .k:text-is("Code")');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-structure-property-docs.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-list .el-row:has(.el-name:has-text("Phone"))');
      await page.click('#struct-detail .seg-btn:has-text("Properties")');
      /* The i after a name opens what the setting means under its row. */
      await page.click('#struct-detail .prop-info[data-key="controlWidth"]');
      await page.click('#struct-detail .prop-info[data-key="repeatLimit"]');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* Focus mode: the list is hidden with the shortcut, so the detail pane has
     * the whole width; the grip on the divider is the way back. */
    file: 'feature-shell-focus.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-list .el-row:has(.el-name:has-text("PromoCode"))');
      await page.click('#struct-detail .seg-btn:has-text("Visibility")');
      await expandIfShown(page);
      await page.keyboard.press('Control+\\');
      await page.waitForSelector('#view-structure .split.is-focus');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-actions-same-input.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      /* The page asks for the same quote twice in a row, with the same input. */
      await page.evaluate(() => {
        const quote = (second) => ({
          sClassName: 'omnistudio.IntegrationProcedureService', sMethodName: 'Onboarding_RecalcQuote',
          options: { chainable: false },
          input: { PlanSelection: { Plan: 'Standard', BillingCycle: 'Annual' }, Country: 'GB' },
          output: { IPResult: { Total: 228 }, error: 'OK' },
          ms: 260, second
        });
        window.__stub.fireCall(quote(56), 20);
        window.__stub.fireCall(quote(57), 21);
      });
      await page.click('#log-list .log-row:has-text("Onboarding_RecalcQuote") >> nth=1');
      await page.waitForSelector('#log-detail .detail-same');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* Text size: Ctrl+= twice takes the panel from M to L to XL, every tab with it;
     * the gear opens the Settings, where the switch reads XL. */
    file: 'feature-shell-text-size.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      for (const key of ['Account', 'AddOns']) await openBranch(page, key);
      await page.keyboard.press('Control+=');
      await page.keyboard.press('Control+=');
      await page.waitForFunction(() => document.documentElement.dataset.textSize === 'XL');
      await page.click('#settings');
      await page.waitForSelector('#settings-text-size .seg-btn.is-on:has-text("XL")');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-data-unused.png',
    needs: ['data.sizes'],
    async run(browser, port) {
      const filler = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`);
      const data = demoData((d) => {
        d.PrefillSource = { Accounts: filler(14, 'Example account'), Region: 'North', Notes: filler(6, 'Imported note') };
        d.Address.LegacyRef = 'REF-2019-000451';
        d.ContactDetails.OldPhones = filler(4, '+44 20 7946 01');
        return d;
      });
      const { context, page } = await openPanel(browser, port, { data });
      await page.click('#view-sizes');
      await page.waitForSelector('#viewport .sizes-unused');
      /* The switch asks for the script's elements the first time it is pressed. */
      await page.click('.sizes-unused');
      await page.waitForSelector('.sizes-unused[aria-pressed="true"]');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-data-sizes-drill.png',
    needs: ['data.sizes'],
    async run(browser, port) {
      const filler = (n, word) => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`);
      const data = demoData((d) => {
        d.PrefillSource = { Accounts: filler(14, 'Example account'), Region: 'North', Notes: filler(6, 'Imported note') };
        return d;
      });
      const { context, page } = await openPanel(browser, port, { data });
      await page.click('#view-sizes');
      await page.waitForSelector('#viewport .size-drill');
      /* Drill into the largest key: its children by size, with the trail above. */
      await page.click('.size-row[data-path="PrefillSource"] .size-drill');
      await page.waitForSelector('#viewport .sizes-crumbs');
      /* The pointer rests on the first row, which shows its Show in tree button. */
      await page.hover('#viewport .size-row');
      await save(page, this.file, { keepMouse: true });
      await context.close();
    }
  },
  {
    file: 'feature-actions-slow-cause.png',
    needs: ['calls.analysis'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      /* A call that took 2.6 s, nearly all of it waiting for the server. */
      await page.evaluate(() => {
        window.__stub.fireCall({
          sClassName: 'omnistudio.IntegrationProcedureService', sMethodName: 'Onboarding_CreditCheck',
          options: { chainable: false },
          input: { ContextId: 'EXAMPLE-0001', Country: 'GB' },
          output: { IPResult: { Score: 712 }, error: 'OK' },
          ms: 2650, second: 58,
          timings: { blocked: 4, dns: -1, connect: -1, send: 1, wait: 2610, receive: 34 }
        }, 20);
      });
      await page.click('#log-list .log-row:has-text("Onboarding_CreditCheck")');
      await page.waitForSelector('#log-detail .detail-slow');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* A test call: Allow test calls on (accepted in Settings), the form open
     * from Re-run… on a demo call, with the input edited. */
    file: 'feature-actions-test-call.png',
    needs: ['calls.test'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await page.click('#settings');
      await page.waitForSelector('#settings-allow-test-calls');
      await page.click('#settings-allow-test-calls');
      await page.click('#settings-test-ack');
      await page.waitForSelector('#settings-allow-test-calls:checked');
      await page.click('#settings-close');
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      await page.evaluate(() => {
        window.__stub.fireCall({
          sClassName: 'omnistudio.IntegrationProcedureService', sMethodName: 'Onboarding_CreditCheck',
          options: { chainable: false },
          input: { ContextId: 'EXAMPLE-0001', Country: 'GB' },
          output: { IPResult: { Score: 712 }, error: 'OK' },
          ms: 640, second: 58
        }, 20);
      });
      await page.click('#log-list .log-row:has-text("Onboarding_CreditCheck")');
      await page.click('#detail-rerun');
      await page.waitForSelector('#test-input');
      await page.fill('#test-input', '{\n  "ContextId": "EXAMPLE-0001",\n  "Country": "DE"\n}');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* A designer's Preview of an Integration Procedure, on its Debug tab with
     * one step open. */
    file: 'feature-actions-debug-run.png',
    needs: ['calls.debug'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { init: KEEP_LISTENERS });
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      await fireVisualforce(page, IP_PREVIEW);
      await page.click('#log-list .log-row:has-text("IP preview")');
      await page.waitForSelector('#log-detail .debug-steps');
      await page.click('#log-detail .debug-step[data-step="GetAccount"] .debug-step-btn');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* The Debug log view of a preview: the totals line, the Queries chip
     * pressed, the query lines with their Copy. */
    file: 'feature-actions-debug-log.png',
    needs: ['calls.debug'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { init: KEEP_LISTENERS });
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      const data = IP_PREVIEW.result.fullDataJson;
      await fireVisualforce(page, {
        ...IP_PREVIEW,
        result: {
          fullDataJson: {
            ...data,
            debugLog: [
              '2025-01-15T10:42:20.000Z: Run started',
              "2025-01-15T10:42:20.037Z: Query: SELECT Id, Name FROM Account WHERE Id = '001000000000001AAA'",
              '2025-01-15T10:42:20.052Z: Query results found: 1',
              '2025-01-15T10:42:20.060Z: Query time: 14',
              '2025-01-15T10:42:20.075Z: Set total from the account',
              "2025-01-15T10:42:20.120Z: Query: SELECT Id, Rating FROM Contact WHERE AccountId = '001000000000001AAA'",
              '2025-01-15T10:42:20.151Z: Query results found: 3',
              '2025-01-15T10:42:20.158Z: Query time: 31',
              '2025-01-15T10:42:20.410Z: Time in Server: 410'
            ]
          }
        }
      });
      await page.click('#log-list .log-row:has-text("IP preview")');
      await page.waitForSelector('#log-detail #debug-view-select');
      await page.selectOption('#debug-view-select', 'log');
      await page.click('#log-detail .debug-chip:has-text("Queries")');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* Two Previews of one Integration Procedure compared: run A the baseline,
     * run B the call on show, the steps side by side with their delta. */
    file: 'feature-actions-debug-compare.png',
    needs: ['calls.debug', 'calls.compare'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { init: KEEP_LISTENERS });
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      await fireVisualforce(page, IP_PREVIEW);
      await fireVisualforce(page, IP_PREVIEW_LATER);
      const keys = await page.$$eval('#log-list .log-row:not(.log-head)', (rows) => rows
        .filter((row) => row.textContent.includes('IP preview')).map((row) => Number(row.dataset.rowKey)).sort((a, b) => a - b));
      await page.click(`#log-list .log-row[data-row-key="${keys[1]}"]`);
      await page.click(`#log-list .log-row[data-row-key="${keys[0]}"]`, { modifiers: ['Control'] });
      await page.click('#log-detail .seg-btn:has-text("Compare")');
      await page.waitForSelector('#log-detail .debug-cmp');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* Show raw… on a Visualforce call: the request context and any credential
     * in the answer show as <hidden>. */
    file: 'feature-actions-raw-view.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { init: KEEP_LISTENERS });
      await openTab(page, '#tab-actions', '#log-list .log-row:not(.log-head)');
      await fireVisualforce(page, {
        call: {
          action: 'omnistudio.DRMapperControllerFoundation', method: 'drPreviewExecute',
          data: [{ bundleName: 'ExampleGetAccount', inputType: 'JSON', interfaceType: 'Extract', objectList: '{"accountId":"001000000000001AAA"}', debug: true }],
          type: 'rpc', tid: 24, ctx: PREVIEW_CTX
        },
        result: { ActualTime: 48, CpuTime: 20, returnResultsData: { Account: [{ Name: 'Example Ltd' }] }, responseType: 'JSON', hasErrors: false, sessionId: 'EXAMPLE-SESSION-0001' },
        ms: 48,
        second: 21
      });
      await page.click('#log-list .log-row:has-text("ExampleGetAccount")', { button: 'right' });
      await page.click('.ctx-menu .ctx-item:has-text("Show raw")');
      await page.waitForSelector('#log-detail .raw-pane');
      // The answer's own <hidden> field is lower in the pane than the request's.
      await page.locator('#log-detail .raw-part').nth(1).scrollIntoViewIfNeeded();
      await page.evaluate(() => { const pane = document.querySelector('#log-detail .raw-pane'); pane.scrollTop = pane.scrollHeight; document.getElementById('log-detail').scrollTop = 400; });
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* The Settings dialog with a couple of settings changed: the gear shows the
     * count, the list says what differs, and the Tools row is at the foot. */
    file: 'feature-shell-settings.png',
    needs: ['calls.analysis'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      /* All Apex calls is a setting; Track changes and the view are ways of
       * looking, so they would not show on the gear. */
      await page.click('#tab-actions');
      await page.check('#log-show-all');
      await page.waitForSelector('#settings .custom-count:not([hidden])');
      await page.click('#settings');
      await page.waitForSelector('#settings-body tr[data-setting]');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-structure-summary.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      /* Follow current step has the current step selected; Esc on the list clears it. */
      await page.click('#struct-list .el-row:has(.el-name:has-text("Plan"))');
      await page.press('#struct-list .el-row.is-selected', 'Escape');
      await page.waitForSelector('#struct-detail .summary-table');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* The right-click menu of a Structure row: copy its name or path, show it in
     * Data, open or fold the branch. */
    file: 'feature-structure-row-menu.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
      await page.click('#struct-list .el-row:has(.el-name:has-text("PlanSelection"))', { button: 'right' });
      await page.waitForSelector('.ctx-menu .ctx-item');
      await save(page, this.file, { keepMouse: true });
      await context.close();
    }
  },
  {
    /* A page with no OmniScript: the Structure tab says so in one line, with the
     * toolbar switched off and no detail pane. */
    file: 'feature-structure-empty.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { noScript: true });
      await openTab(page, '#tab-structure', '.struct-empty');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* A Set Errors element whose message is a formula: the Validation tab shows
     * what it comes to for this data (estimated, with the text it quotes), the
     * formula in its fold, and the Rule card open. The element is added to the
     * demo script for this scene only. */
    file: 'feature-structure-formula-message.png',
    async run(browser, port) {
      const review = DEFINITION.children.find((child) => child.name === 'Review');
      const added = {
        name: 'CheckTerms', type: 'Set Errors', JSONPath: 'Review:CheckTerms', indexInParent: 2, lwcId: 'lwcCheckTerms', bShow: true,
        propSetMap: {
          elementErrorMap: { TermsAccepted: '="Please accept the terms, " & %ContactDetails:FirstName% & "."' },
          show: { group: { operator: 'AND', rules: [{ field: 'Review:TermsAccepted', condition: '=', data: false }] } }
        }
      };
      review.eleArray.push(added);
      try {
        const { context, page } = await openPanel(browser, port);
        await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
        await page.click('#struct-list .el-row:has(.el-name:has-text("CheckTerms"))');
        await page.click('#struct-detail .seg-btn:has-text("Validation")');
        await page.click('#struct-detail .msg-formula > summary');
        await save(page, this.file);
        await context.close();
      } finally {
        review.eleArray.pop();
      }
    }
  },
  {
    /* A Set Values element on its Set Values tab: one row per assignment with the target
     * (a link to Data), the expression as written, what it comes to now (≈ for a formula)
     * and what the target holds, and "differs" where they disagree. The element is added to
     * the demo script for this scene only. */
    file: 'feature-structure-set-values.png',
    async run(browser, port) {
      const review = DEFINITION.children.find((child) => child.name === 'Review');
      const added = {
        name: 'SetDefaults', type: 'Set Values', JSONPath: 'Review:SetDefaults', indexInParent: 2, lwcId: 'lwcSetDefaults', bShow: true,
        propSetMap: {
          elementValueMap: {
            'PlanSelection:BillingCycle': 'Annual',
            'PlanSelection:PromoCode': '=IF(%PlanSelection:Plan% = "Gold", "WELCOME10", "NONE")',
            'Address:Country': 'GB',
            'Review:Summary': '%ContactDetails:FirstName% %ContactDetails:LastName%'
          }
        }
      };
      review.eleArray.push(added);
      try {
        const { context, page } = await openPanel(browser, port);
        await openTab(page, '#tab-structure', '#struct-list .el-row:not(.el-head)');
        await page.click('#struct-list .el-row:has(.el-name:has-text("SetDefaults"))');
        await page.waitForSelector('#struct-detail .fc-card[data-card="set-values"] tbody tr');
        await save(page, this.file);
        await context.close();
      } finally {
        review.eleArray.pop();
      }
    }
  },
  {
    /* A page with no OmniScript: the Data tab says so in one line, with the
     * controls that need data switched off. */
    file: 'feature-data-empty.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port, { noScript: true });
      await page.waitForSelector('.data-empty');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* A filter that finds nothing: the same one-line card as on the other tabs. */
    file: 'feature-data-no-match.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await page.fill('#filter', 'zzz');
      await page.waitForSelector('.no-match-card');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    file: 'feature-data-watch-expr.png',
    needs: ['data.watch'],
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await openBranch(page, 'PlanSelection');
      /* Pin a row with its eye button; the + at the end of the strip then
       * takes expressions. */
      const plan = page.locator('#viewport .row:has(.k:text-is("Plan"))').first();
      await plan.hover();
      await plan.locator('.row-copy[aria-label^="Watch this value"]').click();
      const expressions = ['PlanSelection:AddOns.length >= 2', 'Review:TermsAccepted = true', '$.ContactDetails.*'];
      for (const [at, text] of expressions.entries()) {
        await page.click('.watch-add');
        await page.fill('.watch-input', text);
        await page.press('.watch-input', 'Enter');
        await page.waitForFunction((count) => document.querySelectorAll('#watch .watch-item').length === count, at + 2);
      }
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* The first-run tour: an empty extension storage means the panel has not
     * been opened here before, so the card starts; one Next takes it to the
     * tab strip. */
    file: 'feature-shell-tour.png',
    async run(browser, port) {
      const init = `window.chrome = window.chrome || {};
        window.chrome.storage = { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } };`;
      const { context, page } = await openPanel(browser, port, { init });
      await page.waitForSelector('.tour-card');
      await page.click('.tour-card [data-move="next"]');
      await page.waitForSelector('.tour-card .tour-title:has-text("Tabs")');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* A tab's own tour: the panel tour was seen and so was the Data tab's, so
     * opening Structure for the first time starts its three-step tour. */
    file: 'feature-shell-tab-tour.png',
    async run(browser, port) {
      const init = `window.chrome = window.chrome || {};
        const kept = { tourSeen: true, tourSeenData: true };
        window.chrome.storage = { local: {
          get: async (key) => Object.fromEntries([].concat(key).filter((name) => name in kept).map((name) => [name, kept[name]])),
          set: async (values) => Object.assign(kept, values), remove: async () => {} } };`;
      const { context, page } = await openPanel(browser, port, { init });
      await page.click('#tab-structure');
      await page.waitForSelector('.tour-card');
      await save(page, this.file);
      await context.close();
    }
  },
  {
    /* Settings, Open in Designer: the choice of designer, with the namespace
     * field that managed adds. */
    file: 'feature-shell-designer-setting.png',
    async run(browser, port) {
      const { context, page } = await openPanel(browser, port);
      await page.click('#settings');
      await page.click('[data-seg="settings-designer:managed"]');
      await page.fill('#settings-designer-ns', 'vlocity_cmt');
      await page.press('#settings-designer-ns', 'Enter');
      await page.waitForSelector('#settings-designer-ns');
      await save(page, this.file);
      await context.close();
    }
  }
];

/* ------------------------------------------------------------------ main */

async function main() {
  const only = process.argv.slice(2);
  const { chromium } = loadPlaywright();
  /* A run of some scenes leaves the other images where they are. */
  if (!only.length) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const { server, port } = await serve();
  const browser = await launch(chromium);
  try {
    for (const scene of SCENES.filter(renders)) {
      if (only.length && !only.some((name) => scene.file.includes(name))) continue;
      console.log(scene.file);
      await scene.run(browser, port);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
