'use strict';

/* A stand-in "inspected page" for the Structure tab's UI tests. The chrome stub
 * runs every expression the panel sends (hostScan, hostFetch, frameScan) for
 * real inside jsdom, so OmniScript hosts are plain elements in document.body
 * that carry `jsonDef` and `jsonDataStr`. Names here are invented. */

import { jest } from '@jest/globals';
import { mountPanelMarkup } from './panel-fixture.js';

/* hold: queue the answers instead of delivering them, to test the order they
 * arrive in. The expression is still run when it is sent, so the answer is
 * what the page held at that moment. */
export function stubInspectedPage() {
  const held = [];
  const page = {
    evalCount: 0,
    hold: false,
    held,
    navigated: [], // listeners the panel registered for a page navigation
    /* Deliver held answers in the given order (indices into the queue as it is now). */
    release(order) {
      const batch = held.splice(0);
      const chosen = order || batch.map((_, i) => i);
      held.unshift(...batch.filter((_, i) => !chosen.includes(i))); // the rest stay queued
      chosen.forEach((i) => batch[i]());
    }
  };

  global.chrome = {
    devtools: {
      network: { onNavigated: { addListener: (fn) => page.navigated.push(fn) } },
      inspectedWindow: {
        getResources: (callback) => callback([]),
        eval: (expression, a, b) => {
          const callback = typeof a === 'function' ? a : b;
          page.evalCount++;
          let result;
          let exception;
          try {
            result = new Function(`return ${expression}`)();
          } catch (e) {
            exception = { isException: true, value: String(e) };
          }
          const deliver = () => { if (callback) callback(result, exception); };
          if (page.hold) held.push(deliver); else deliver();
        }
      }
    }
  };
  return page;
}

/* An element in the shape flatten() reads. `elements` nests children (a
 * block's fields), `JSONPath` is where its value sits in the data. */
function node(element, index) {
  return {
    name: element.name,
    type: element.type || 'Text',
    indexInParent: index,
    ...(element.JSONPath ? { JSONPath: element.JSONPath } : {}),
    propSetMap: element.propSetMap || {},
    ...(element.elements ? { children: [{ eleArray: element.elements.map(node) }] } : {})
  };
}

/* A definition in the shape flatten() reads: a Step holding the given
 * elements, plus the script's Type/SubType/Language. */
export function definition({ type = 'demo', subType = 'flow', lang = 'English', steps = [], asIndex = 0 } = {}) {
  return {
    bpType: type,
    bpSubType: subType,
    bpLang: lang,
    asIndex,
    children: steps.map((step, i) => ({
      name: step.name,
      type: 'Step',
      indexInParent: i,
      propSetMap: { label: step.label || step.name, ...(step.propSetMap || {}) },
      children: [{ eleArray: (step.elements || []).map(node) }]
    }))
  };
}

/* Puts an OmniScript host on the page and returns it. */
export function addScript({ id, def, data = {}, parent = document.body }) {
  const node = document.createElement('div');
  node.id = id;
  node.jsonDef = JSON.stringify(def);
  node.jsonDataStr = typeof data === 'string' ? data : JSON.stringify(data); // a string is used as written
  parent.appendChild(node);
  return node;
}

/* Boots the real panel modules the Structure tab needs, against the stub page.
 * free: true uses the Free markup and registers no gate. */
export async function bootStructure({ scripts = [], seed, free = false } = {}) {
  jest.resetModules();
  const page = stubInspectedPage();
  mountPanelMarkup({ free });
  scripts.forEach((script) => addScript(script));

  if (!free) await import('../../../src/ui/features.js'); // every gate open, as panel.html boots it

  const mods = {
    Structure: (await import('../../../src/ui/structure-tab.js')).Structure,
    Targets: (await import('../../../src/ui/targets.js')).Targets,
    Shared: (await import('../../../src/ui/shared.js')).Shared,
    Nav: (await import('../../../src/ui/nav.js')).Nav
  };
  if (seed) await seed();

  mods.Structure.mount();
  mods.Targets.mount({
    target: document.getElementById('target'),
    frame: document.getElementById('frame'),
    nested: document.getElementById('show-nested')
  });
  mods.Structure.show();
  await new Promise((resolve) => mods.Targets.start(resolve));
  await tick();
  return { page, ...mods };
}

/* Deliver everything held, including what delivering it sends in turn. */
export function drain(page) {
  let guard = 0;
  while (page.held.length && guard++ < 50) page.release();
}

/* The stub page answers synchronously, so a few microtask turns settle everything,
 * without a real timer (which keeps fake timers usable). */
export const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

export const rowNames = () => [...document.querySelectorAll('#struct-list .el-row')]
  .map((row) => row.textContent);

export function pickScript(index) {
  const select = document.getElementById('target');
  select.value = String(index);
  select.dispatchEvent(new Event('change'));
}

/* The row whose name holds `name`: the name cell, since the Valid column's sentences are text too. */
export function clickRow(name) {
  const row = [...document.querySelectorAll('#struct-list .el-row')]
    .find((candidate) => (candidate.querySelector('.el-name') || candidate).textContent.includes(name));
  row.click();
  return row;
}

export const selectedRowText = () => {
  const row = document.querySelector('#struct-list .el-row.is-selected');
  return row ? row.textContent : null;
};
