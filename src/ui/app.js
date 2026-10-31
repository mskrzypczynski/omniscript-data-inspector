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
import { mountPanelShell, applyHelpTooltips } from './panel-shell.js';
import { Mask } from './mask-setting.js';
import { applyTheme } from './theme.js';
import { TextSize } from './text-size.js';
import { mountTour } from './tour.js';
import { Settings } from './settings.js';
import { decorateButtons } from './icons.js';
import { mountSessionMode } from './session-mode.js';
import { mountDesignerButton } from './designer-button.js';
import { mountToolbarOverflow } from './toolbar-overflow.js';
import { StatusLine } from './status-line.js';
import { statusScriptName } from '../core/shared/script-identity.js';
import { isFreeBuild } from './free-build.js';
import './json-tree-view.js'; // registers the document-level copy handler

/* Remembered settings (opt-in) are back before any tab reads one. */
await Settings.restore();

/* The stylesheet styles the few places where the Free build lays out
 * differently (no tick column in Calls). */
document.documentElement.dataset.build = isFreeBuild() ? 'free' : 'gated';
applyTheme(document.documentElement, chrome.devtools && chrome.devtools.panels);
TextSize.mount();
/* Toolbar buttons name their icon in panel.html (data-icon); the icon and the
 * .btn-label wrapper are added before any tab reads or sets a button's text. */
decorateButtons();
/* Each control's tooltip is its help entry's short line, set before the tabs
 * mount, so a tooltip a tab sets for its state (paused, disabled because…)
 * is the one that stays. */
applyHelpTooltips();
Mask.mount(document.getElementById('mask-values'));
DataTab.mount();
RemoteActions.mount();
Structure.mount();
mountPanelShell();
mountSessionMode();
/* Narrow panel: each toolbar's deeper-dive controls move into a "…" menu. */
mountToolbarOverflow();

/* Draggable divider between the list and detail panes on both split tabs. */
document.querySelectorAll('.split').forEach((split) => initSplitPane(split));

/* Embedded scripts and Frame sit in the top bar's second row, which Show the
 * Frame row governs (Settings, Data, Reading another page). They are in force only while that row
 * shows: a remembered Embedded scripts is not applied behind a hidden row. */
const frameRowOn = () => Settings.get('showFrameRow') === true;
const nestedBox = document.getElementById('show-nested');
nestedBox.checked = frameRowOn() && Settings.get('showNested');

Targets.mount({
  target: document.getElementById('target'),
  frame: document.getElementById('frame'),
  nested: nestedBox
});

/* When the row goes away, Frame and Embedded scripts go back to All frames / off.
 * Targets keeps the selected script if it is still listed, so this does not
 * disturb the tabs. */
function dropHiddenRowControls() {
  if (frameRowOn()) return;
  if (nestedBox.checked) { nestedBox.checked = false; nestedBox.dispatchEvent(new Event('change')); }
  const frame = document.getElementById('frame');
  if (frame.value !== '') { frame.value = ''; frame.dispatchEvent(new Event('change')); }
}
Settings.onChange(dropHiddenRowControls);

/* Embedded scripts: back to its default (off), and off whenever its row is hidden. */
Settings.provide(() => ({ showNested: nestedBox.checked }));
Settings.onReset((scope) => {
  if (!Settings.inScope(scope, 'showNested')) return;
  const want = frameRowOn() && Settings.get('showNested');
  if (nestedBox.checked !== want) { nestedBox.checked = want; nestedBox.dispatchEvent(new Event('change')); }
});


/* The status bar names the selected script on every tab. */
Targets.subscribe(() => StatusLine.script(statusScriptName(Targets.selected())));

/* Open in Designer appears after the picker once the script's Id is known. */
mountDesignerButton(document.getElementById('open-designer'));


document.getElementById('rescan').addEventListener('click', () => {
  Targets.refresh(() => DataTab.refreshIfActive());
});

/* Every module has registered what it owns: show the count of custom settings. */
Settings.notify();

Targets.start(() => DataTab.read());

/* The first time the panel opens in this browser, a four-step tour. */
mountTour();
