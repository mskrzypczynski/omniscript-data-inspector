'use strict';

/* Shared jsdom fixtures for the UI integration tests: the real panel.html
 * markup (so tests exercise the actual ids and structure the app expects),
 * and a minimal stub of the chrome.devtools APIs the tab modules call while
 * mounting. Not a code-loading shim like the old vm-sandbox helper — Jest
 * imports the real ES modules natively; this only sets up the DOM and the
 * one global (`chrome`) that jsdom does not provide.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePanelHtml } from '../../../scripts/lib/flavour.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const panelHtml = fs.readFileSync(path.join(ROOT, 'panel.html'), 'utf8');

/* The markup of panel.html as it is by default; pass { free: true } for the
 * Free build's (scripts/lib/flavour.mjs), and then boot src/ui/app.js. */
export function mountPanelMarkup({ free = false } = {}) {
  const html = free ? freePanelHtml(panelHtml) : panelHtml;
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

/* Settings are in memory, so a fresh module registry (jest.resetModules) is a
 * fresh install. Call this after resetModules and before importing app.js to
 * start a test with some settings already changed. */
export async function seedSettings(values = {}) {
  const { Settings } = await import('../../../src/ui/settings.js');
  Object.entries(values).forEach(([key, value]) => Settings.set(key, value));
}

/* Returns the listener arrays so a test can fire a fake network event by
 * calling the function the module under test registered. */
export function stubChromeDevtools() {
  const listeners = { onRequestFinished: [], onNavigated: [] };

  global.chrome = {
    devtools: {
      network: {
        onRequestFinished: { addListener: (fn) => listeners.onRequestFinished.push(fn) },
        onNavigated: { addListener: (fn) => listeners.onNavigated.push(fn) }
      },
      inspectedWindow: {
        reload: () => {},
        getResources: (callback) => callback([]),
        eval: (expression, optionsOrCallback, maybeCallback) => {
          const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
          if (callback) callback({ ok: true, frames: [], hosts: [], hints: [] }, undefined);
        }
      }
    }
  };

  return listeners;
}
