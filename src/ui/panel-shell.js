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
import { Nav } from './nav.js';

/* Edit in two places if you change it: here and popup.html. */
const SUPPORT_URL = 'https://buycoffee.to/mskrz';

const SHORTCUT_TEXT = '/ focus the filter · 1 2 3 switch tab · n p next / previous change (Data) · d compare a call with the previous one (Remote actions) · c copy the value under the pointer, the selected element\'s value or the selected call · ? this help. Ignored while typing in a field.';

const HELP = {
  data: {
    title: 'Data',
    lede: 'The JSON the selected OmniScript is holding right now, re-read on a timer.',
    sections: [['This tab', [
      ['Property', 'Any property name, not just jsonDataStr. Click the field to list what the selected element exposes (with each value\'s type), type to fuzzy-filter ("jsd" finds jsonDataStr), arrows and Enter to pick. A name that is not listed can still be typed.'],
      ['Amber highlight', 'A value that changed since the previous read. A collapsed branch containing a change is marked with a dot.'],
      ['Reveal element', 'Selects the host in the Elements tab and leaves it on $omni, so you can poke at it in the Console.'],
      ['Auto-refresh', 'Re-reads once a second. Untick it for manual mode, where the data is read only when you press Refresh. Polling stops while the panel is off screen. While you have text selected in the tree or the pointer is on a copy button, updates wait until you release the selection so it can be copied.'],
      ['Left the page', 'When the page navigates, everything read from it is discarded: the data, marks, compare history, watch list and the Structure tab\'s definition. If the OmniScript disappears without a navigation (for example the script finished), the last data read stays on screen, marked as stale, until you pick another OmniScript or a new one appears. Remote actions calls are kept across reloads while Preserve on reload is ticked, and cleared when it is not.'],
      ['Copy value button', 'Hover a row in any tree for copy value: the value as JSON (strings keep their quotes), or the whole branch. Dragging to select several rows still copies them as clean indented text.'],
      ['Changes', 'Under Advanced. Amber fades after a few seconds, so changed values also stay marked with a bar at the left edge until you press Clear marks. Changed only lists just those values. Prev / Next jump between them in tree order and open whatever hides them. Hover a marked row to see the value it had before its first change since the marks were cleared.'],
      ['in structure button', 'Hover a row for in structure: switches to the Structure tab and selects the element that owns that key (or the nearest parent element). Structure\'s Show in Data does the reverse.'],
      ['Mask values', 'The switch in the scope bar. While it is on, Copy JSON, Save file, the per-row copy value button, Structure\'s value copy and the Remote actions export replace strings and numbers with <string> and <number>. Keys, structure, empty strings, booleans and null are kept. Dragging to select text and copying it is masked the same way, in the tree and the Raw view. Off every time the panel opens; it is not stored.'],
      ['Watch list', 'Hover a row and press watch (or right-click, Add to watch list) to keep its value in a strip above the tree while you scroll or step through the script. Click a name to find it in the tree, × to remove. The list is cleared when you pick another OmniScript.'],
      ['Compare payloads', 'The last 20 distinct payloads read are kept in memory (and discarded with the panel). Compare payloads diffs any two of them: what was added, removed or changed between, say, before and after you pressed Next. Copy diff honours Mask values.'],
      ['Right-click', 'A row\'s menu: copy value, key or the OmniScript path (StepA:Rows|2:Code, repeat positions from 1), filter to this key, watch, show in Structure, expand or collapse the branch.'],
      ['Raw search', 'In Raw view the filter box searches the text: every match is marked, Enter and Shift+Enter walk them, and the status bar counts lines and matches. Wrap folds long lines.'],
      ['Big payloads', 'A tree of more than 4000 rows is drawn a window at a time as you scroll, so nothing is cut off. Dragging a selection across rows copies only the rows currently drawn; use copy value on the branch, or Copy JSON, for everything.'],
      ['Tree / Raw', 'Raw shows pretty-printed JSON. If the property is not valid JSON, the raw value is shown with the parse error.']
    ]]]
  },

  structure: {
    title: 'Structure',
    lede: 'Every element the OmniScript is built from, read from its definition and joined to the live data.',
    sections: [['This tab', [
      ['Definition', 'Which property holds the definition. jsonDef by default; click the field for the same fuzzy property list as the Data tab.'],
      ['Filter', 'Matches the element name, type and label, and also every custom-label key the element uses together with the text it resolves to — so a word from the screen finds the element even when the label is only a key.'],
      ['Highlight on page', 'The detail pane\'s button (or the Highlight on hover switch) outlines the element\'s component on the inspected page for a couple of seconds, found through the lwcId in the definition. Best effort: it needs an open shadow root and an element that carries that id, and says so when it cannot find one.'],
      ['Collapse done steps', 'Folds each step once the script has passed it and opens it again if the script comes back. Anything you fold or unfold by hand is left as you set it.'],
      ['Calls tab', 'For an element that calls a Data Mapper or Integration Procedure, lists the matching calls captured in Remote actions with time, result and duration. Click one to open it there.'],
      ['Name', 'Rows read name (label): API name first, then the label in parentheses. In a multi-language script labels and Text Block text are custom-label keys, resolved through scriptHeaderDef.allCustomLabels; a single-language script stores the text on the element. Text Blocks show their text (textKey or text). The detail pane shows the underlying label / text key, and the status bar shows the script language.'],
      ['Glyphs', '▤ step · ⚡ action · ☑ choice · ✎ input · ¶ display · ▦ block · ⊘ validation / set errors / messaging · <> custom component. Hover for the exact type.'],
      ['! ? ↗ ⚠', 'Required · has show/hide conditions (hover for the expression) · calls a Data Mapper or Integration Procedure · a custom-label key the element uses (label, Text Block text, help text or a manually-entered choice option) is missing from allCustomLabels — one missing key breaks a multi-language OmniScript; hover for which.'],
      ['Sections', 'Steps and blocks that contain other elements have a ▾ twisty — click to collapse the section. Everything starts expanded. Collapse all / Expand all act on every section. Collapsing is off while a filter or Actions only is active.'],
      ['✓ ● –', 'The narrow column at the left edge of the Structure list: ✓ already passed, ● where the script is now, – passed without running because its show condition was false; ones still ahead are dimmed. Read from the definition (asIndex against each element\'s indexInParent) and only for top-level steps and actions.'],
      ['Follow step', 'Keeps the current step selected as the script moves on, so the detail pane always shows where you are. Filters are left alone.'],
      ['Hidden elements', 'A dimmed row with ◌ is not shown right now. Its show rules are evaluated against the live data (not the definition\'s bShow, which is only a snapshot from when the definition was read), and the detail pane says which rule fails and what the field holds, e.g. Step:Type = "x" is false (currently "y"). Children of a hidden element are hidden too. Visible only filters them out. Rules the tool cannot judge (unusual operators, formulas) fall back to bShow.'],
      ['Show in Data', 'Opens the Data tab at the selected element\'s value, found through its JSONPath. Data\'s in structure row button does the reverse.'],
      ['Current step', 'Selects and scrolls to the step the OmniScript is on now. The status bar shows the asIndex it was read from; "active step: unknown" means the definition did not expose one.'],
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
      ['Advanced', 'The Advanced switch in the scope bar shows Nested next to it; Errors only, Slower than and OmniStudio only on Remote actions; on Data the Changes row and Reveal element; on Structure Follow step, Collapse done steps, Highlight on hover and Visible only. Turning it off puts those back to their defaults.'],
      ['Errors only / Slower than', 'Errors only keeps the calls the row marks as failed. Slower than keeps calls whose round trip was at least that many milliseconds, and marks their Took in amber. 0 or empty turns the threshold off.'],
      ['Compare', 'Press d to diff the selected call against the last earlier call to the same place: what changed in the input, options and output. Ctrl/Cmd-click another row instead to pick any call as the baseline. A Compare tab appears in the detail pane while a baseline is set.'],
      ['Show in Structure', 'When an element of the script makes this call, the detail pane offers a button that selects it in the Structure tab. Structure\'s Calls tab lists the calls for the element it shows.'],
      ['Naming', 'Data Mappers and Integration Procedures are named by their bundle or key rather than the integration class they share.'],
      ['Batched calls', 'One HTTP request can carry several actions. Each gets its own row, with its own input and output.'],
      ['HTTP vs Result', 'The first pill is the transport, the second is the payload. A 200 with ERROR means Apex returned an error inside a successful response — hover for which rule fired.'],
      ['Started / Took', 'Clock time the request left the browser, and the round trip in milliseconds.'],
      ['OmniStudio only', 'Untick to see every Apex call the page makes, not just OmniStudio traffic.'],
      ['Mask values', 'With the scope bar\'s Mask values on, Export replaces strings and numbers in inputs, outputs and errors with placeholders.'],
      ['Preserve on reload', 'On by default. Keeps the log across page loads; untick to clear it on every reload. Export writes the visible calls to a JSON file.'],
      ['Resizing', 'Drag the divider between the list and the detail pane to rebalance them, side by side or stacked. Double-click it to reset.']
    ]]]
  },

  common: ['Everywhere', [
    ['Theme', 'Follows the DevTools theme (light or dark), including when you change it while the panel is open.'],
    ['Keyboard', SHORTCUT_TEXT],
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

function typingTarget(target) {
  if (!target || !target.tagName) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

/* Single-key shortcuts, ignored while typing and with any modifier held so
 * they never fight DevTools' own. */
function mountShortcuts() {
  const tabModule = () => ({ data: DataTab, structure: Structure, actions: RemoteActions }[shellState.tab]);

  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typingTarget(ev.target)) return;

    switch (ev.key) {
      case '/': ev.preventDefault(); tabModule().focusFilter(); break;
      case '?': ev.preventDefault(); toggleHelp(); break;
      case '1': showTab('data'); break;
      case '2': showTab('structure'); break;
      case '3': showTab('actions'); break;
      case 'c': tabModule().copySelected(); break;
      case 'd': if (shellState.tab === 'actions') RemoteActions.compareWithPrevious(); break;
      case 'n': if (shellState.tab === 'data') DataTab.step(1); break;
      case 'p': if (shellState.tab === 'data') DataTab.step(-1); break;
      default: break;
    }
  });
}

function mountTabs() {
  el.tabs = {
    data: { button: document.getElementById('tab-data'), view: document.getElementById('view-data') },
    structure: { button: document.getElementById('tab-structure'), view: document.getElementById('view-structure') },
    actions: { button: document.getElementById('tab-actions'), view: document.getElementById('view-actions') }
  };

  TABS.forEach((name) => el.tabs[name].button.addEventListener('click', () => showTab(name)));
  Nav.setTabSwitcher(showTab);
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
      Structure.setVisible(visible);
    }
  };
}

export function mountPanelShell() {
  mountHelp();
  mountTabs();
  mountShortcuts();
  mountVisibilityBridge();
}
