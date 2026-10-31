'use strict';

/* Boots the real Data tab against the stand-in page of structure-page.js: the
 * scripts are elements in jsdom that carry jsonDataStr, and every expression
 * the panel sends runs for real. Names are invented. */

import { jest } from '@jest/globals';
import { stubInspectedPage, tick } from './structure-page.js';
import { mountPanelMarkup } from './panel-fixture.js';

export function addHost({ id, tag = 'div', data = {}, parent = document.body, def }) {
  const node = document.createElement(tag);
  if (id) node.id = id;
  node.jsonDataStr = typeof data === 'string' ? data : JSON.stringify(data);
  if (def) node.jsonDef = JSON.stringify(def);
  parent.appendChild(node);
  return node;
}

/* `track`: start with Track changes ticked (it is off by default). */
export async function bootData({ hosts = [], track = false } = {}) {
  jest.resetModules();
  const page = stubInspectedPage();
  mountPanelMarkup();
  hosts.forEach((host) => addHost(host));


  const { DataTab } = await import('../../../src/ui/data-tab.js');
  const { Targets } = await import('../../../src/ui/targets.js');
  const { Mask } = await import('../../../src/ui/mask-setting.js');
  const { Shared } = await import('../../../src/ui/shared.js');
  const { Settings } = await import('../../../src/ui/settings.js');
  if (track) Settings.set('dataChanges', true);
  Mask.mount(document.getElementById('mask-values'));
  DataTab.mount();
  Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  DataTab.show();
  await new Promise((resolve) => Targets.start(resolve));
  await tick();
  return { page, DataTab, Targets, Mask, Shared };
}

export const viewport = () => document.getElementById('viewport');

export function pickScript(index) {
  const select = document.getElementById('target');
  select.value = String(index);
  select.dispatchEvent(new Event('change'));
}
