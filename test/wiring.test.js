'use strict';

/* The extension has no build step: panel.html loads one ES module and the
 * browser's module graph resolves every `import` from there. There is no
 * script order to get wrong any more, but there is still one failure mode
 * worth catching here rather than in a blank panel: a typo'd import path, or
 * a tab module that throws while wiring itself to the DOM it expects.
 *
 * This mounts the real panel.html markup in jsdom, stubs the chrome.devtools
 * APIs the tab modules call while mounting, and imports the real entry
 * module — proving the whole graph resolves and every mount() runs clean.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const panelHtml = fs.readFileSync(path.join(ROOT, 'panel.html'), 'utf8');

describe('panel.html', () => {
  it('loads exactly one ES module as its entry point', () => {
    const moduleScripts = [...panelHtml.matchAll(/<script type="module" src="([^"]+)">/g)];
    expect(moduleScripts).toHaveLength(1);

    const [, entryPath] = moduleScripts[0];
    expect(fs.existsSync(path.join(ROOT, entryPath))).toBe(true);
  });

  it('loads no legacy <script src> tags — everything goes through the module graph', () => {
    const classicScripts = [...panelHtml.matchAll(/<script src="([^"]+)">/g)];
    expect(classicScripts).toEqual([]);
  });
});

describe('the app module', () => {
  function stubChromeDevtools() {
    global.chrome = {
      devtools: {
        network: {
          onRequestFinished: { addListener: () => {} },
          onNavigated: { addListener: () => {} }
        },
        inspectedWindow: {
          getResources: (callback) => callback([]),
          eval: (expression, optionsOrCallback, maybeCallback) => {
            const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
            if (callback) callback({ ok: true, frames: [], hosts: [], hints: [] }, undefined);
          }
        }
      }
    };
  }

  function mountPanelMarkup() {
    const body = panelHtml.match(/<body>([\s\S]*)<\/body>/)[1]
      .replace(/<script[\s\S]*?<\/script>/g, '');
    document.body.innerHTML = body;
  }

  it('boots without throwing, given the real panel markup', async () => {
    stubChromeDevtools();
    mountPanelMarkup();

    await expect(import('../src/ui/app.js')).resolves.toBeDefined();

    // devtools.js calls window.OmniPanel.setVisible when the panel is shown
    // or hidden — the entry module must still publish that bridge.
    expect(typeof window.OmniPanel).toBe('object');
    expect(typeof window.OmniPanel.setVisible).toBe('function');
  });
});
