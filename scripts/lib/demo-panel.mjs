/* The demo panel shared by the store-image scripts and the debug-bundle
 * script: a static server for this repository, a fictional "Account
 * Onboarding" OmniScript, fake remote calls, and a stub of chrome.devtools
 * that is injected before the panel boots. All demo data is invented.
 * Dev tooling only; never shipped. */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WIDTH = 1280;
export const HEIGHT = 800;

/* ---------------------------------------------------------- static server */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf'
};

/* The fonts every render uses, whatever the machine has installed, so the
 * committed screenshots and a CI render agree pixel for pixel. Served from
 * scripts/lib/fonts (see its README); the extension itself keeps the
 * system fonts. */
const FONT_FACES = [
  ['Inter', 'Inter-Regular.otf', 400], ['Inter', 'Inter-Medium.otf', 500],
  ['Inter', 'Inter-SemiBold.otf', 600], ['Inter', 'Inter-Bold.otf', 700],
  ['DejaVu Sans Mono', 'DejaVuSansMono.ttf', 400], ['DejaVu Sans Mono', 'DejaVuSansMono-Bold.ttf', 700]
].map(([family, file, weight]) =>
  `@font-face { font-family: "${family}"; src: url("/scripts/lib/fonts/${file}"); font-weight: ${weight}; font-display: block; }`
).join('\n');
export const RENDER_FONTS_CSS = `${FONT_FACES}
:root { --mono: "DejaVu Sans Mono", monospace; --sans: "Inter", sans-serif; }
html, body, button, input, select, textarea, .notice, .tour-card, .toast, [class*="chip"], .tag { font-family: "Inter", sans-serif; }`;

/* Loads the render fonts into a page and waits until they are usable. Each
 * face is loaded explicitly: document.fonts.ready alone resolves at once when
 * no text has asked for a font yet, and a fast capture then draws the
 * machine's fallback font instead. */
export async function useRenderFonts(page) {
  await page.addStyleTag({ content: RENDER_FONTS_CSS });
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((face) => face.load()));
    await document.fonts.ready;
  });
}

export function serve() {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(ROOT, urlPath === '/' ? 'panel.html' : urlPath);
    if (!file.startsWith(ROOT + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
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

/* ------------------------------------------------------------- demo data */

/* A fictional "Account Onboarding" OmniScript, paused on the Plan Selection
 * step. Top-level indexInParent: 0 data mapper, 1-4 steps, 5 procedure. */
const field = (name, type, path, indexInParent, propSetMap = {}, extra = {}) => ({
  name, type, JSONPath: path, indexInParent, lwcId: `lwc${name}`, bShow: true, propSetMap, ...extra
});

const planRule = {
  group: { operator: 'AND', rules: [{ field: 'PlanSelection:Plan', condition: '=', data: 'Gold' }] }
};

export const DEFINITION = {
  bpType: 'Account',
  bpSubType: 'Onboarding',
  bpLang: 'English',
  versionNumber: 3,
  isActive: true,
  asIndex: 3,
  children: [
    field('DRExtract_Account', 'DataRaptor Extract Action', 'DRExtract_Account', 0, {
      label: 'Load account', bundle: 'DRExtract_Account'
    }),
    field('ContactDetails', 'Step', 'ContactDetails', 1, { label: 'Contact Details' }, {
      eleArray: [
        field('FirstName', 'Text', 'ContactDetails:FirstName', 0, { label: 'First name', required: true }),
        field('LastName', 'Text', 'ContactDetails:LastName', 1, { label: 'Last name', required: true }),
        field('Email', 'Email', 'ContactDetails:Email', 2, { label: 'Email address', required: true }),
        field('Phone', 'Telephone', 'ContactDetails:Phone', 3, {
          label: 'Phone number', controlWidth: 6, mask: '(999) 999-9999', repeat: true, repeatLimit: 3
        }),
        field('MarketingOptIn', 'Checkbox', 'ContactDetails:MarketingOptIn', 4, { label: 'Send me product news' })
      ]
    }),
    field('Address', 'Step', 'Address', 2, { label: 'Address' }, {
      eleArray: [
        field('Street', 'Text', 'Address:Street', 0, { label: 'Street', required: true }),
        field('City', 'Text', 'Address:City', 1, { label: 'City', required: true }),
        field('Postcode', 'Text', 'Address:Postcode', 2, { label: 'Postcode', required: true }),
        field('Country', 'Select', 'Address:Country', 3, {
          label: 'Country',
          options: [{ name: 'GB', value: 'United Kingdom' }, { name: 'IE', value: 'Ireland' }]
        })
      ]
    }),
    field('PlanSelection', 'Step', 'PlanSelection', 3, { label: 'Plan Selection' }, {
      eleArray: [
        field('Plan', 'Radio', 'PlanSelection:Plan', 0, {
          label: 'Choose a plan',
          required: true,
          options: [
            { name: 'Basic', value: 'Basic' },
            { name: 'Standard', value: 'Standard' },
            { name: 'Gold', value: 'Gold' }
          ]
        }),
        field('BillingCycle', 'Select', 'PlanSelection:BillingCycle', 1, {
          label: 'Billing cycle',
          options: [{ name: 'Monthly', value: 'Monthly' }, { name: 'Annual', value: 'Annual' }]
        }),
        field('AddOns', 'Multi-select', 'PlanSelection:AddOns', 2, {
          label: 'Add-ons',
          options: [
            { name: 'Priority support', value: 'Priority support' },
            { name: 'Extra storage', value: 'Extra storage' },
            { name: 'Extended warranty', value: 'Extended warranty' }
          ]
        }),
        field('PromoCode', 'Text', 'PlanSelection:PromoCode', 3,
          { label: 'Promo code', show: planRule }, { bShow: false }),
        field('GoldNote', 'Text Block', 'PlanSelection:GoldNote', 4,
          { text: 'Gold plans include a named advisor.', show: planRule }, { bShow: false })
      ]
    }),
    field('Review', 'Step', 'Review', 4, { label: 'Review' }, {
      eleArray: [
        field('ReviewNote', 'Text Block', 'Review:ReviewNote', 0, { text: 'Please check your details before you submit.' }),
        field('TermsAccepted', 'Checkbox', 'Review:TermsAccepted', 1, { label: 'I accept the terms', required: true })
      ]
    }),
    field('Onboarding_SaveApplication', 'Integration Procedure Action', 'Onboarding_SaveApplication', 5, {
      label: 'Save application', integrationProcedureKey: 'Onboarding_SaveApplication'
    })
  ]
};

export const INITIAL_DATA = {
  ContextId: 'EXAMPLE-0001',
  timeStamp: '2025-01-15T10:42:07.000Z',
  DRExtract_Account: { Account: { Name: 'Alex Example', Segment: 'Consumer', Status: 'Prospect' } },
  ContactDetails: {
    FirstName: 'Alex',
    LastName: 'Example',
    Email: 'alex.example@example.com',
    Phone: '+44 20 7946 0000',
    MarketingOptIn: true
  },
  Address: { Street: '1 Sample Street', City: 'Exampleton', Postcode: 'EX1 2MP', Country: 'GB' },
  PlanSelection: { Plan: 'Standard', BillingCycle: 'Monthly', AddOns: ['Priority support', 'Extra storage'] },
  Review: { TermsAccepted: false }
};

/* What the customer does while the Data tab is open: two values change and
 * one key appears, so the changed marks have something to show. */
export function applyChange(data) {
  const next = JSON.parse(JSON.stringify(data));
  next.PlanSelection.BillingCycle = 'Annual';
  next.PlanSelection.AddOns.push('Extended warranty');
  next.PlanSelection.QuoteTotal = 249.0;
  next.timeStamp = '2025-01-15T10:42:31.000Z';
  return next;
}

const LONG_ERROR = 'Validation failed in Onboarding_SaveApplication: the email domain example.com is not accepted ' +
  'for the Standard plan; Address.Postcode "EX1 2MP" does not match the selected country (GB); ' +
  'ContactDetails.Phone must be in E.164 format; Review.TermsAccepted must be true before an application can be saved. ' +
  'No records were created. Correct the listed fields and submit again.';

export const AURA = 'aura://ApexActionController/ACTION$execute';
const IP_CLASS = 'omnistudio.IntegrationProcedureService';
const DR_CLASS = 'omnistudio.DefaultDROmniScript';

/* Remote calls as the stub's network feed describes them (the stub turns each
 * into a HAR-like entry with an Aura body). */
export const CALLS = [
  {
    sClassName: DR_CLASS, sMethodName: 'invokeInboundDR',
    options: { bundle: 'DRExtract_Account', chainable: false },
    input: { ContextId: 'EXAMPLE-0001' },
    output: { Account: { Name: 'Alex Example', Segment: 'Consumer', Status: 'Prospect' }, error: 'OK' },
    ms: 142, second: 3
  },
  {
    sClassName: IP_CLASS, sMethodName: 'Onboarding_ValidateAddress',
    options: { chainable: true },
    input: { Street: '1 Sample Street', City: 'Exampleton', Postcode: 'EX1 2MP', Country: 'GB' },
    output: { IPResult: { Valid: true, Normalised: '1 Sample Street, Exampleton EX1 2MP' }, error: 'OK' },
    ms: 380, second: 12
  },
  {
    sClassName: IP_CLASS, sMethodName: 'Onboarding_GetPlans',
    options: { ignoreCache: true },
    input: { Country: 'GB', Segment: 'Consumer' },
    output: { IPResult: { Plans: [{ Id: 'Basic', Price: 9 }, { Id: 'Standard', Price: 19 }, { Id: 'Gold', Price: 39 }] }, error: 'OK' },
    ms: 215, second: 21
  },
  {
    sClassName: DR_CLASS, sMethodName: 'invokeInboundDR',
    options: { bundle: 'DRExtract_Account' },
    input: { ContextId: 'EXAMPLE-0001', Refresh: true },
    output: { Account: { Name: 'Alex Example', Segment: 'Consumer', Status: 'Prospect' }, error: 'OK' },
    ms: 118, second: 34
  },
  {
    sClassName: IP_CLASS, sMethodName: 'Onboarding_SaveApplication',
    options: { queueableChainable: false },
    input: {
      ContactDetails: { FirstName: 'Alex', LastName: 'Example', Email: 'alex.example@example.com', Phone: '+44 20 7946 0000' },
      Address: { Street: '1 Sample Street', City: 'Exampleton', Postcode: 'EX1 2MP', Country: 'GB' },
      PlanSelection: { Plan: 'Standard', BillingCycle: 'Annual', AddOns: ['Priority support', 'Extra storage'] },
      Review: { TermsAccepted: false }
    },
    output: { IPResult: { success: false, Step: 'ValidateApplication', error: LONG_ERROR } },
    ms: 1240, second: 47
  }
];

/* ------------------------------------------------- chrome.devtools stub */

/* Runs in the page before the panel's modules. Self-contained on purpose: it
 * is stringified into addInitScript. cfg = { theme, data, def, calls, noHost }:
 * noHost leaves the fake page without an OmniScript, for the empty states. */
export function installStub(cfg) {
  const state = { data: cfg.data, def: cfg.def };
  const listeners = { finished: [], navigated: [] };
  let frame = null;

  /* The fake page: one hidden iframe holding a host element whose
   * jsonDataStr / jsonDef are live getters over `state`. The panel's own
   * page-side functions are evaluated inside that iframe's window, so
   * `document` and `window` in them are the iframe's. */
  function pageFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
    document.documentElement.appendChild(frame);
    const doc = frame.contentDocument;
    if (cfg.noHost) return frame;
    const host = doc.createElement('c-omniscript-account-onboarding');
    Object.defineProperty(host, 'jsonDataStr', { get: () => JSON.stringify(state.data), enumerable: true });
    Object.defineProperty(host, 'jsonDef', { get: () => JSON.stringify(state.def), enumerable: true });
    doc.body.appendChild(host);
    return frame;
  }

  function evaluate(expression, second, third) {
    const callback = typeof second === 'function' ? second : third;
    let result;
    let exception;
    try {
      result = pageFrame().contentWindow.eval(expression);
      /* The real bridge hands back JSON-like data, not live objects. */
      result = result === undefined ? undefined : JSON.parse(JSON.stringify(result));
    } catch (error) {
      exception = { isException: true, value: String(error) };
    }
    if (callback) setTimeout(() => callback(result, exception), 0);
  }

  window.chrome = window.chrome || {};
  window.chrome.devtools = {
    panels: { themeName: cfg.theme, setThemeChangeHandler() {} },
    network: {
      onRequestFinished: { addListener: (fn) => listeners.finished.push(fn) },
      onNavigated: { addListener: (fn) => listeners.navigated.push(fn) }
    },
    inspectedWindow: {
      tabId: 1,
      reload() {},
      getResources: (callback) => setTimeout(() => callback([]), 0),
      eval: evaluate
    }
  };

  function networkEntry(call, index) {
    const id = `${index + 1};a`;
    const message = JSON.stringify({
      actions: [{
        id,
        descriptor: cfg.auraDescriptor,
        params: {
          classname: call.sClassName,
          method: 'invokeMethod',
          params: {
            sClassName: call.sClassName,
            sMethodName: call.sMethodName,
            input: JSON.stringify(call.input),
            options: JSON.stringify(call.options)
          }
        }
      }]
    });
    const action = { id, state: call.error ? 'ERROR' : 'SUCCESS', returnValue: { returnValue: call.output } };
    if (call.error) action.error = [{ message: call.error }];
    const body = `while(1);${JSON.stringify({ actions: [action] })}`;
    return {
      request: {
        url: 'https://example.my.site.com/aura?r=' + (index + 1),
        method: 'POST',
        postData: { text: new URLSearchParams({ message }).toString() }
      },
      response: { status: 200, bodySize: body.length },
      time: call.ms,
      timings: call.timings, // optional HAR timings, for a scene about slow calls
      startedDateTime: new Date(2025, 0, 15, 10, 42, call.second).toISOString(),
      getContent: (callback) => callback(body)
    };
  }

  window.__stub = {
    setData: (data) => { state.data = data; },
    getData: () => JSON.parse(JSON.stringify(state.data)),
    fireCalls: () => cfg.calls.forEach((call, index) => {
      listeners.finished.forEach((listener) => listener(networkEntry(call, index)));
    }),
    /* One more call, described like the ones in CALLS, for a scene that needs
     * a call the five store images must not show. */
    fireCall: (call, index) => listeners.finished.forEach((listener) => listener(networkEntry(call, index)))
  };
}


/* ------------------------------------------------------------ the panel */

export async function openPanel(browser, port, { theme = 'default', width = WIDTH, height = HEIGHT, colorScheme = 'light', data = INITIAL_DATA, init = null, noScript = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC'
  });
  const page = await context.newPage();
  /* A frozen clock keeps the times and "n s ago" labels the panel prints
   * identical from run to run, so the images can be compared pixel by pixel. */
  await page.clock.setFixedTime(new Date('2025-01-15T10:43:31Z'));
  page.on('pageerror', (error) => console.warn('  page error:', error.message));
  await page.addInitScript(`(${installStub.toString()})(${JSON.stringify({
    theme, data, def: DEFINITION, calls: CALLS, auraDescriptor: AURA, noHost: noScript
  })})`);
  /* A script to run before the panel boots, after the chrome.devtools stub
   * (a scene that needs chrome.storage adds its own). */
  if (init) await page.addInitScript(init);
  await page.goto(`http://127.0.0.1:${port}/panel.html`);
  await useRenderFonts(page);
  if (noScript) {
    /* A page with no OmniScript: the first scan has finished once the status bar stops looking. */
    await page.waitForFunction(() => !/Looking for/.test(document.getElementById('status-left').textContent));
    return { context, page };
  }
  await page.waitForFunction(() => document.getElementById('target').textContent.includes('Account/Onboarding/English'));
  await page.waitForSelector('#viewport .row');
  if (await page.isVisible('#tip')) await page.click('#tip-close');
  await page.evaluate(() => window.__stub.fireCalls());
  return { context, page };
}
