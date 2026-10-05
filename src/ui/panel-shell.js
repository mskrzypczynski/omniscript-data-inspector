'use strict';

/* Panel shell: the tab strip, the help overlay, and telling every tab module
 * when it is shown, hidden, or the whole panel goes on/off screen. Each tab's
 * own data, rendering and polling lives in its own module — this file only
 * coordinates which one is currently on screen.
 *
 * Deliberately not a fourth tab: the help overlay is documentation, not a
 * view of the OmniScript, and it covers only what cannot be worked out by
 * clicking. */

import { DataTab } from './data-tab.js';
import { Structure } from './structure-tab.js';
import { RemoteActions } from './actions-tab.js';
import { Targets } from './targets.js';

/* Edit in two places if you change it: here and popup.html. */
const SUPPORT_URL = 'https://buycoffee.to/mskrz';

const HELP = {
  data: {
    title: 'Data',
    lede: 'The JSON the selected OmniScript is holding right now, re-read on a timer.',
    sections: [['This tab', [
      ['Property', 'Any property name, not just jsonDataStr. Point it at a state object or anything else the component exposes.'],
      ['Amber highlight', 'A value that changed since the previous read. A collapsed branch containing a change is marked with a dot.'],
      ['Reveal element', 'Selects the host in the Elements tab and leaves it on $omni, so you can poke at it in the Console.'],
      ['Auto-refresh', 'Re-reads once a second. Untick it for manual mode, where the data is read only when you press Refresh. Polling stops while the panel is off screen. While you have text selected in the tree, updates wait until you release the selection so it can be copied.'],
      ['Left the page', 'If the OmniScript disappears (for example the page navigated), the last data read stays on screen, marked as stale, until you pick another OmniScript or a new one appears.'],
      ['Tree / Raw', 'Raw shows pretty-printed JSON. If the property is not valid JSON, the raw value is shown with the parse error.']
    ]]]
  },

  structure: {
    title: 'Structure',
    lede: 'Every element the OmniScript is built from, read from its definition and joined to the live data.',
    sections: [['This tab', [
      ['Definition', 'Which property holds the definition. jsonDef by default; change it if your build names it differently.'],
      ['Name', 'Rows read name (label): API name first, then the label in parentheses. In a multi-language script labels and Text Block text are custom-label keys, resolved through scriptHeaderDef.allCustomLabels; a single-language script stores the text on the element. Text Blocks show their text (textKey or text). The detail pane shows the underlying label / text key, and the status bar shows the script language.'],
      ['Glyphs', '▤ step · ⚡ action · ☑ choice · ✎ input · ¶ display · ▦ block · ⊘ validation / set errors / messaging · <> custom component. Hover for the exact type.'],
      ['! ? ↗ ⚠', 'Required · has show/hide conditions (hover for the expression) · calls a Data Mapper or Integration Procedure · a custom-label key the element uses (label, Text Block text, help text or a manually-entered choice option) is missing from allCustomLabels — one missing key breaks a multi-language OmniScript; hover for which.'],
      ['Sections', 'Steps and blocks that contain other elements have a ▾ twisty — click to collapse the section. Everything starts expanded. Collapse all / Expand all act on every section. Collapsing is off while a filter or Actions only is active.'],
      ['Actions only', 'Filters to elements that call something — the script\'s whole integration surface in one list.'],
      ['Value', 'The Value column and Current value tab show the live data. For a radio or select with manual options the stored value is joined with its option label, e.g. US (United States).'],
      ['Visibility tab', 'The element\'s show/hide rule as a readable expression, with the raw definition underneath.'],
      ['Set values', 'For a Set Values element the second tab lists the assignments it writes into the data (field → value or formula) rather than a live value.'],
      ['Validation tab', 'Shown for Set Errors and Messaging / Validation elements: the expression, each message (and whether it fires on a true or false result), and for Set Errors which element the error lands on. Readable summary on top, raw definition underneath.'],
      ['Resizing', 'Drag the divider between the element list and the detail pane to rebalance them; it works whether they sit side by side or stacked. Double-click to reset.'],
      ['Editing in Designer', 'The tree is loaded once. Press Rescan after changing the script to pick up the new definition.']
    ]]]
  },

  actions: {
    title: 'Remote actions',
    lede: 'Apex calls the page makes while you work, decoded. Capture runs whenever the panel is open, whichever tab you are on.',
    sections: [['This tab', [
      ['Naming', 'Data Mappers and Integration Procedures are named by their bundle or key rather than the integration class they share.'],
      ['Batched calls', 'One HTTP request can carry several actions. Each gets its own row, with its own input and output.'],
      ['HTTP vs Result', 'The first pill is the transport, the second is the payload. A 200 with ERROR means Apex returned an error inside a successful response — hover for which rule fired.'],
      ['Started / Took', 'Clock time the request left the browser, and the round trip in milliseconds.'],
      ['OmniStudio only', 'Untick to see every Apex call the page makes, not just OmniStudio traffic.'],
      ['Preserve on reload', 'On by default. Keeps the log across page loads; untick to clear it on every reload. Export writes the visible calls to a JSON file.'],
      ['Resizing', 'Drag the divider between the list and the detail pane to rebalance them, side by side or stacked. Double-click it to reset.']
    ]]]
  },

  common: ['Everywhere', [
    ['Scope bar', 'The OmniScript and Frame pickers apply to every tab. Frame filters the list to one document; All frames searches everything.'],
    ['Nested', 'Child element components inherit the same properties as their OmniScript, so a 40-element script is 40 hosts. Only top-level ones are listed unless you tick this.'],
    ['Rescan', 'Looks for frames and OmniScripts again. Runs automatically every few seconds while the panel is visible.'],
    ['Limits', 'Closed shadow roots and cross-origin frames cannot be read. That is a browser restriction, not a setting.']
  ]]
};

const shellState = { tab: 'data' };
const el = {};

function renderHelp() {
  const content = HELP[shellState.tab] || HELP.data;
  el.helpBody.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = content.title;
  el.helpBody.appendChild(heading);

  const lede = document.createElement('div');
  lede.className = 'lede';
  lede.textContent = content.lede;
  el.helpBody.appendChild(lede);

  content.sections.concat([HELP.common]).forEach((section) => {
    const heading = document.createElement('h3');
    heading.textContent = section[0];
    el.helpBody.appendChild(heading);

    const dl = document.createElement('dl');
    section[1].forEach(([term, description]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      dl.appendChild(dt);
      const dd = document.createElement('dd');
      dd.textContent = description;
      dl.appendChild(dd);
    });
    el.helpBody.appendChild(dl);
  });

  const foot = document.createElement('div');
  foot.className = 'help-foot';

  const note = document.createElement('span');
  note.textContent = 'Unofficial tool · not affiliated with Salesforce';
  foot.appendChild(note);

  const link = document.createElement('a');
  link.href = SUPPORT_URL;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Buy me a coffee ☕';
  foot.appendChild(link);

  el.helpBody.appendChild(foot);
}

function toggleHelp(show) {
  const open = show === undefined ? el.helpOverlay.hidden : show;
  if (open) renderHelp();
  el.helpOverlay.hidden = !open;
  el.helpButton.setAttribute('aria-expanded', String(open));
}

const TABS = ['data', 'structure', 'actions'];

function showTab(name) {
  TABS.forEach((key) => {
    const on = key === name;
    el.tabs[key].button.classList.toggle('is-on', on);
    el.tabs[key].button.setAttribute('aria-selected', String(on));
    el.tabs[key].view.hidden = !on;
  });

  shellState.tab = name;
  if (!el.helpOverlay.hidden) renderHelp();

  if (name !== 'structure') Structure.hide();
  if (name !== 'actions') RemoteActions.hide();

  if (name === 'data') {
    DataTab.show();
  } else {
    DataTab.hide();
    if (name === 'structure') Structure.show();
    else RemoteActions.show();
  }
}

function mountHelp() {
  el.helpOverlay = document.getElementById('help-overlay');
  el.helpBody = document.getElementById('help-body');
  el.helpButton = document.getElementById('help');

  el.helpButton.addEventListener('click', () => toggleHelp());
  document.getElementById('help-close').addEventListener('click', () => toggleHelp(false));

  el.helpOverlay.addEventListener('click', (ev) => {
    if (ev.target === el.helpOverlay) toggleHelp(false);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !el.helpOverlay.hidden) toggleHelp(false);
  });
}

function mountTabs() {
  el.tabs = {
    data: { button: document.getElementById('tab-data'), view: document.getElementById('view-data') },
    structure: { button: document.getElementById('tab-structure'), view: document.getElementById('view-structure') },
    actions: { button: document.getElementById('tab-actions'), view: document.getElementById('view-actions') }
  };

  TABS.forEach((name) => el.tabs[name].button.addEventListener('click', () => showTab(name)));
}

/* Told by devtools.js when the panel is on screen (see devtools.js and
 * CLAUDE.md's injected-function note — this one crosses a page boundary
 * too, though as a plain global rather than a stringified function, since
 * devtools.js calls it directly on the panel window it already holds). */
function mountVisibilityBridge() {
  let panelVisible = true;

  window.OmniPanel = {
    setVisible(visible) {
      if (panelVisible === visible) return;
      panelVisible = visible;
      Targets.setVisible(visible);
      DataTab.setVisible(visible);
    }
  };
}

export function mountPanelShell() {
  mountHelp();
  mountTabs();
  mountVisibilityBridge();
}
