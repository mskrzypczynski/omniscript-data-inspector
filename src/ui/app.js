'use strict';

/* Composition root: the single module panel.html loads. It wires the tab
 * modules to their DOM and to each other, and starts the first read. Nothing
 * here is worth unit-testing on its own — it is glue, not a decision — but
 * test/wiring.test.js imports it under jsdom to prove the module graph
 * resolves and the panel boots without a thrown or missing import. */

import { DataTab } from './data-tab.js';
import { Structure } from './structure-tab.js';
import { RemoteActions } from './actions-tab.js';
import { Targets } from './targets.js';
import { initSplitPane } from './split.js';
import { mountPanelShell } from './panel-shell.js';
import { Mask } from './mask-setting.js';
import { Advanced } from './advanced.js';
import { applyTheme } from './theme.js';
import './json-tree-view.js'; // registers the document-level copy handler

applyTheme(document.documentElement, chrome.devtools && chrome.devtools.panels);
Advanced.mount(document.getElementById('advanced'));
Mask.mount(document.getElementById('mask-values'));
DataTab.mount();
RemoteActions.mount();
Structure.mount();
mountPanelShell();

/* Draggable divider between the list and detail panes on both split tabs. */
document.querySelectorAll('.split').forEach((split) => initSplitPane(split));

Targets.mount({
  target: document.getElementById('target'),
  frame: document.getElementById('frame'),
  nested: document.getElementById('show-nested')
});

/* Frame and Nested are advanced controls: when Advanced goes off they go back
 * to All frames / off. Targets keeps the selected script if it is still listed,
 * so this does not disturb the tabs. */
Advanced.subscribe((on) => {
  if (on) return;
  const nested = document.getElementById('show-nested');
  if (nested.checked) { nested.checked = false; nested.dispatchEvent(new Event('change')); }
  const frame = document.getElementById('frame');
  if (frame.value !== '') { frame.value = ''; frame.dispatchEvent(new Event('change')); }
});

document.getElementById('rescan').addEventListener('click', () => {
  Targets.refresh(() => DataTab.refreshIfActive());
});

Targets.start(() => DataTab.read());
