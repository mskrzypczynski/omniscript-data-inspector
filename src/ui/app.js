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
import './json-tree-view.js'; // registers the document-level copy handler

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

document.getElementById('rescan').addEventListener('click', () => {
  Targets.refresh(() => DataTab.refreshIfActive());
});

Targets.start(() => DataTab.read());
