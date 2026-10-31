'use strict';

/* Panel shell: the tab strip, the help and settings dialogs, and telling every tab module
 * when it is shown, hidden, or the whole panel goes on/off screen. Each tab's
 * own data, rendering and polling lives in its own module — this file only
 * coordinates which one is currently on screen.
 *
 * Deliberately not a tab of its own: the help overlay is documentation, not a
 * view of the OmniScript, and it covers only what cannot be worked out by
 * clicking. */

import { DataTab } from './data-tab.js';
import { Structure } from './structure-tab.js';
import { RemoteActions } from './actions-tab.js';
import { TabOrder } from './tab-order.js';
import { Targets } from './targets.js';
import { Nav } from './nav.js';
import { mountLiveStatus } from './live-status.js';
import { filterSections, queryWords, sectionsTitled, helpMenuLabel } from '../core/shared/help-filter.js';
import { orderEntriesByControls } from '../core/shared/help-order.js';
import { openContextMenu } from './context-menu.js';
import { foldHelp } from '../core/shared/help-text.js';
import { appendMarked, setMarked } from './chip-text.js';
import { entryParts, tooltipOf, referenceLink, guideLink } from '../core/shared/help-entry.js';
import { START } from './help/start.js';
import { TASKS } from './help/tasks.js';
import { shortcuts } from './help/shortcuts.js';
import { DATA_HELP } from './help/data.js';
import { STRUCTURE_HELP } from './help/structure.js';
import { ACTIONS_HELP } from './help/actions.js';
import { COMMON_HELP } from './help/common.js';
import { extensionVersion } from './version.js';
import { mountSettingsOverlay } from './settings-panel.js';
import { createOverlay } from './overlay.js';
import { restartTour, startTabTour } from './tour.js';
import { openCompareJson } from './compare-json.js';
import { isCompareJsonKey } from '../core/shared/shell-keys.js';
import { Features } from './features.js';
import { isFreeBuild } from './free-build.js';
import { coffeeMenuPointer, startHerePointer } from './pointers.js';

/* The status bar's button and the foot of the help both open this address in
 * a new tab, and only when clicked; the panel passes nothing to it. */
const SUPPORT = { label: 'Buy me a coffee', url: 'https://buycoffee.to/mskrz' };

/* The help text lives in help/*.js; this file keeps the overlay itself. */
const HELP = { data: DATA_HELP, structure: STRUCTURE_HELP, actions: ACTIONS_HELP, common: COMMON_HELP };

/* helpEntry: the title of the one entry the help is narrowed to (opened from a
 * control), or null. */
const shellState = { tab: 'data', helpQuery: '', helpEntry: null, keysOpen: false };
const el = {};

function shortcutTable(rows) {
  const table = document.createElement('table');
  table.className = 'keys';
  rows.forEach(([keys, text]) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    keys.forEach((key, at) => {
      if (at) th.appendChild(document.createTextNode(' '));
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      th.appendChild(kbd);
    });
    const td = document.createElement('td');
    setMarked(td, text);
    tr.append(th, td);
    table.appendChild(tr);
  });
  const note = document.createElement('caption');
  note.textContent = 'Single keys; ignored while typing in a field.';
  note.style.captionSide = 'bottom';
  note.style.textAlign = 'left';
  table.appendChild(note);
  return table;
}

/* One entry's text. A long one shows its first sentence and a "more" toggle
 * (the rest is in the page, so the page's find and the help filter both reach
 * it); while the help is being filtered the whole text is shown, since the
 * words that matched may be in the folded part. */
function describe(dd, text, filtering) {
  if (text.includes('\n')) { describeLines(dd, text); return; }
  const { head, rest } = filtering ? { head: text, rest: '' } : foldHelp(text);
  if (!rest) { setMarked(dd, text); return; }

  const first = document.createElement('span');
  setMarked(first, head);
  const more = document.createElement('span');
  more.className = 'help-rest';
  setMarked(more, ` ${rest}`);
  more.hidden = true;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'help-more';
  toggle.textContent = 'more';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const open = more.hidden;
    more.hidden = !open;
    toggle.textContent = open ? 'less' : 'more';
    toggle.setAttribute('aria-expanded', String(open));
  });
  dd.append(first, more, ' ', toggle);
}

/* A link to the website that opens in a new tab; the panel passes nothing to
 * the site beyond the address. */
function siteLink(href, text, label) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.className = 'help-site';
  link.textContent = text;
  if (label) link.setAttribute('aria-label', label);
  return link;
}

/* A layered entry: its one line, then "How" opens the text in place, and the
 * details stay on the website, one link away. While the help is filtered (or
 * narrowed to this entry) the text is shown at once. */
function describeLayered(dd, parts, open, tab) {
  dd.classList.add('help-layered');
  const line = document.createElement('div');
  line.className = 'help-short';
  line.textContent = parts.short;
  if (parts.keys) {
    const kbd = document.createElement('kbd');
    kbd.textContent = parts.keys;
    line.append(' ', kbd);
  }
  dd.appendChild(line);
  const body = document.createElement('div');
  body.className = 'help-body-text';
  if (parts.text.includes('\n')) describeLines(body, parts.text);
  else setMarked(body, parts.text);
  if (parts.more) {
    body.append(' ', siteLink(referenceLink(tab, parts.title), 'More on the website ↗', `More about ${parts.title} on the website (opens a new tab)`));
  }
  if (!parts.text) return;
  body.hidden = !open;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'help-more';
  toggle.textContent = open ? 'less' : 'how';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.addEventListener('click', () => {
    const show = body.hidden;
    body.hidden = !show;
    toggle.textContent = show ? 'less' : 'how';
    toggle.setAttribute('aria-expanded', String(show));
  });
  line.append(' ', toggle);
  dd.appendChild(body);
}

/* "What do you want to do?": each question folds open to a few steps and a
 * link to its full guide on the website. */
function tasksBox() {
  const tasks = TASKS.list;
  if (!tasks.length) return null;
  const box = document.createElement('div');
  box.className = 'help-tasks';
  const heading = document.createElement('h3');
  heading.textContent = 'What do you want to do?';
  box.appendChild(heading);
  tasks.forEach((task) => {
    const item = document.createElement('details');
    item.className = 'help-task';
    const summary = document.createElement('summary');
    summary.textContent = task.question;
    const steps = document.createElement('ol');
    task.steps.forEach((step) => {
      const li = document.createElement('li');
      setMarked(li, step);
      steps.appendChild(li);
    });
    item.append(summary, steps, siteLink(guideLink(task.guide), 'Full guide ↗', `Full guide: ${task.question} (opens a new tab)`));
    box.appendChild(item);
  });
  return box;
}

/* An entry with several facts is written one per line: the first line is the
 * lead, each later one a bullet ("- " is dropped). Short lines are easier to
 * scan than one paragraph, and they are never folded. */
function describeLines(dd, text) {
  const [lead, ...items] = text.split('\n').map((line) => line.trim()).filter(Boolean);
  appendMarked(dd, lead);
  const list = document.createElement('ul');
  list.className = 'help-list';
  items.forEach((line) => {
    const li = document.createElement('li');
    setMarked(li, line.replace(/^-\s+/, ''));
    list.appendChild(li);
  });
  dd.appendChild(list);
}

/* The Keys section when the help is not being filtered: a heading that is a
 * button, with the table behind it. Closed at first; open or closed stays as
 * it was left while the panel is open. */
function foldedKeys(section) {
  const wrap = document.createElement('div');
  wrap.className = 'help-keys';
  const heading = document.createElement('h3');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'help-keys-toggle';
  toggle.id = 'help-keys-toggle';
  toggle.textContent = section[0];
  toggle.title = 'Show or hide the keyboard shortcuts';
  toggle.setAttribute('aria-controls', 'help-keys-body');
  heading.appendChild(toggle);
  const body = document.createElement('div');
  body.id = 'help-keys-body';
  section[1].forEach(([, rows]) => body.appendChild(shortcutTable(rows)));
  const paint = () => {
    toggle.setAttribute('aria-expanded', String(shellState.keysOpen));
    body.hidden = !shellState.keysOpen;
  };
  toggle.addEventListener('click', () => { shellState.keysOpen = !shellState.keysOpen; paint(); });
  paint();
  wrap.append(heading, body);
  return wrap;
}

function startHere(tab) {
  const items = START[tab];
  if (!items) return null;
  const box = document.createElement('div');
  box.className = 'help-start';
  const heading = document.createElement('h3');
  heading.textContent = 'Start here';
  /* This tab's tour, on demand: the first thing in the list, since it is
   * the quickest way to see where the controls are. */
  const take = document.createElement('button');
  take.type = 'button';
  take.className = 'help-more help-tour help-take-tour';
  take.id = 'help-take-tour';
  take.textContent = 'Take the tour';
  take.title = 'Close the help and walk through this tab, a few tips at a time';
  take.addEventListener('click', () => { toggleHelp(false); startTabTour(shellState.tab); });
  const list = document.createElement('ol');
  items.forEach((text) => {
    const li = document.createElement('li');
    setMarked(li, text);
    list.appendChild(li);
  });
  const tour = document.createElement('button');
  tour.type = 'button';
  tour.className = 'help-more help-tour';
  tour.id = 'help-tour';
  tour.textContent = 'Show the tour again';
  tour.title = 'Close the help and show all the tours again';
  tour.addEventListener('click', () => { toggleHelp(false); restartTour(); });
  const pointer = startHerePointer();
  if (pointer) list.appendChild(pointer);
  box.append(heading, take, list, tour);
  return box;
}

/* Where to look for a control's entry: this tab's sections, the shared ones,
 * then the other tabs' (a control such as Definition property is on the scope
 * bar whichever tab is open). */
function entryGroups(content) {
  const others = Object.keys(HELP).filter((key) => key !== 'common' && HELP[key] !== content).map((key) => HELP[key].sections);
  return [content.sections, [HELP.common]].concat(others);
}

/* The controls of the open tab as they stand on screen: the top bar, then the
 * tab's own view. A control in the top bar's second row (Frame, Embedded
 * scripts, Inspect element) is a rarely used one, so its entry comes last. */
function controlsOnScreen(tab) {
  const scope = document.querySelector('.scope');
  const view = document.getElementById(`view-${tab}`);
  const nodes = [...(scope ? scope.querySelectorAll('[data-help]') : []), ...(view ? view.querySelectorAll('[data-help]') : [])];
  // A button inside a notice (Change data property) is passing help, not a control of the tab.
  return nodes.filter((node) => !node.closest('.notice'))
    .map((node) => ({ help: node.getAttribute('data-help'), advanced: !!node.closest('.scope-extra, .adv') }));
}

function renderHelp() {
  const content = HELP[shellState.tab] || HELP.data;
  const controls = controlsOnScreen(shellState.tab);
  const ordered = content.sections.map(([heading, entries]) => [heading, orderEntriesByControls(entries, controls)]);
  el.helpBody.textContent = '';

  const heading = document.createElement('h2');
  heading.textContent = content.title;
  el.helpBody.appendChild(heading);

  const lede = document.createElement('div');
  lede.className = 'lede';
  lede.textContent = content.lede;
  el.helpBody.appendChild(lede);

  const filtering = queryWords(shellState.helpQuery).length > 0 || !!shellState.helpEntry;
  if (!filtering) {
    const tasks = tasksBox();
    if (tasks) el.helpBody.appendChild(tasks);
    const start = startHere(shellState.tab);
    if (start) el.helpBody.appendChild(start);
  }

  /* Start here is first; the keys follow, folded until asked for. */
  const keys = ['Keys', [['Keyboard', shortcuts()]]];
  const shown = shellState.helpEntry
    ? sectionsTitled(shellState.helpEntry, entryGroups(content))
    : filterSections(shellState.helpQuery, [keys].concat(ordered, [HELP.common]));

  shown.forEach((section) => {
    if (section === keys && !filtering) { el.helpBody.appendChild(foldedKeys(section)); return; }
    const title = document.createElement('h3');
    title.textContent = section[0];
    el.helpBody.appendChild(title);

    const dl = document.createElement('dl');
    const tabOfSection = section === HELP.common ? 'common' : shellState.tab;
    section[1].forEach((entry) => {
      const [term, description] = entry;
      if (Array.isArray(description)) {
        /* A table of keys is not a term and its text. */
        el.helpBody.appendChild(shortcutTable(description));
        return;
      }
      const dt = document.createElement('dt');
      dt.textContent = term;
      dl.appendChild(dt);
      const dd = document.createElement('dd');
      const parts = entryParts(entry);
      if (parts.layered) describeLayered(dd, parts, filtering, tabOfSection);
      else describe(dd, description, filtering);
      dl.appendChild(dd);
    });
    if (dl.childElementCount) el.helpBody.appendChild(dl);
  });

  /* The footer only belongs to the unfiltered help. */
  if (filtering) {
    if (!shown.length) {
      const none = document.createElement('p');
      none.className = 'help-empty';
      none.setAttribute('role', 'status');
      none.textContent = 'No help matches';
      el.helpBody.appendChild(none);
    }
    return;
  }

  const foot = document.createElement('div');
  foot.className = 'help-foot';

  const note = document.createElement('span');
  note.textContent = 'Unofficial tool · not affiliated with Salesforce';
  foot.appendChild(note);

  /* Only the Free build has Buy me a coffee. */
  if (!isFreeBuild()) { el.helpBody.appendChild(foot); return; }

  const coffee = document.createElement('span');
  coffee.className = 'help-coffee';
  const link = document.createElement('a');
  link.href = SUPPORT.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = SUPPORT.label;
  coffee.append(link, ' ☕');
  foot.appendChild(coffee);

  el.helpBody.appendChild(foot);
}

function setHelpQuery(text) {
  shellState.helpQuery = text;
  shellState.helpEntry = null;
  el.helpSearch.value = text;
}

function toggleHelp(show, options) {
  el.help.toggle(show, options);
}

/* The settings dialog and the help are never both open: the comma and h keys
 * swap one for the other, without the focus passing through the control that
 * opened the first. */
function toggleSettings(show) {
  if (show !== false && el.help.isOpen()) toggleHelp(false, { restoreFocus: false });
  el.settings.toggle(show);
}

/* Compare JSON opens in place of the help or the settings, like the Settings
 * button of its own does, from the button at the end of the tab strip and from
 * Ctrl/Cmd+Shift+L. */
function openCompare() {
  if (!Features.has('shell.compare-json')) return;
  if (el.help.isOpen()) toggleHelp(false, { restoreFocus: false });
  if (el.settings.isOpen()) el.settings.close({ restoreFocus: false });
  openCompareJson();
}

/* Opens the help narrowed to the entry titled `title`; the filter box shows
 * the title, and typing or clearing it brings the rest back. */
function openHelpFor(title) {
  if (el.settings.isOpen()) el.settings.close({ restoreFocus: false });
  toggleHelp(true);
  shellState.helpEntry = title;
  el.helpSearch.value = title;
  renderHelp();
  el.helpBody.scrollTop = 0;
}

/* The control a help request is about: the nearest element that names its
 * entry with data-help. */
function helpTitleOf(node) {
  const control = node && node.closest ? node.closest('[data-help]') : null;
  return control ? control.getAttribute('data-help') : null;
}

/* Right-click on a toolbar or top-bar control: a one-item menu. Fields you
 * type in keep the browser's own menu (paste, copy). */
function mountControlHelp() {
  document.addEventListener('contextmenu', (ev) => {
    if (ev.defaultPrevented || el.help.isOpen() || el.settings.isOpen()) return;
    const title = helpTitleOf(ev.target);
    if (!title || typingTarget(ev.target)) return;
    ev.preventDefault();
    openContextMenu(ev, [{ label: helpMenuLabel(title), action: () => openHelpFor(title) }]);
  });
}

/* Every control that names a layered entry takes its tooltip from the entry's
 * short line, so the tooltip and the help never say different things. The
 * title goes on the control itself when it is a wrapper (a label around a
 * checkbox keeps it on the label, as written). A control whose entry is not
 * layered keeps the title it was written with. */
export function applyHelpTooltips(root = document) {
  const index = (entries) => {
    const map = new Map();
    entries.forEach((entry) => {
      const key = String(entry[0]).trim().toLowerCase();
      if (!map.has(key)) map.set(key, entry);
    });
    return map;
  };
  const tabEntries = (help) => index(help.sections.flatMap(([, entries]) => entries));
  const byTab = { data: tabEntries(HELP.data), structure: tabEntries(HELP.structure), actions: tabEntries(HELP.actions) };
  const common = index(HELP.common[1]);
  /* A title several tabs use (Refresh, Filter) means the entry of the tab the
   * control is on; the top bar and the dialogs read the shared help first. */
  const lookOrder = (tab) => (tab ? [byTab[tab], common] : [common]).concat(Object.values(byTab));
  root.querySelectorAll('[data-help]').forEach((node) => {
    /* A control that names its own tooltip (one of a pair sharing an entry,
     * such as Expand all and Collapse all) keeps it. */
    if (node.hasAttribute('data-own-title')) return;
    const view = node.closest('[id^="view-"]');
    const tab = view ? view.id.slice('view-'.length) : null;
    const key = node.getAttribute('data-help').trim().toLowerCase();
    const source = lookOrder(byTab[tab] ? tab : null).find((map) => map.has(key));
    const tooltip = source ? tooltipOf(source.get(key)) : '';
    if (tooltip) node.title = tooltip;
  });
}

const TABS = ['data', 'structure', 'actions']; // every tab, whatever order they are shown in

function showTab(name) {
  TABS.forEach((key) => {
    const on = key === name;
    el.tabs[key].button.classList.toggle('is-on', on);
    el.tabs[key].button.setAttribute('aria-selected', String(on));
    el.tabs[key].button.tabIndex = on ? 0 : -1;
    el.tabs[key].view.hidden = !on;
  });

  shellState.tab = name;
  if (el.help.isOpen()) renderHelp();

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
  el.helpCard = el.helpOverlay.querySelector('.help-card');
  el.helpSearch = document.getElementById('help-search');

  el.helpSearch.addEventListener('input', () => {
    shellState.helpQuery = el.helpSearch.value;
    shellState.helpEntry = null;
    renderHelp();
  });

  /* The filter box stays at the top while the body scrolls under it; it gets
   * a shadow once there is something scrolled behind it. */
  el.helpCard.addEventListener('scroll', () => {
    el.helpCard.classList.toggle('is-scrolled', el.helpCard.scrollTop > 0);
  });

  el.help = createOverlay({
    overlay: el.helpOverlay,
    card: el.helpCard,
    button: el.helpButton,
    closeButton: document.getElementById('help-close'),
    onOpen: (wasOpen) => {
      if (!wasOpen) setHelpQuery('');
      renderHelp();
    },
    initialFocus: () => el.helpSearch
  });
  el.settings = mountSettingsOverlay();
}

/* Only fields you type into count: a focused checkbox or button (what is left
 * after clicking one) must not turn the shortcuts off. */
const TEXT_INPUTS = /^(text|search|number|email|url|password|tel|)$/;

function typingTarget(target) {
  if (!target || !target.tagName) return false;
  if (target.tagName === 'INPUT') return TEXT_INPUTS.test(target.type || '');
  return /^(TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

/* Single-key shortcuts, ignored while typing and with any modifier held so
 * they never fight DevTools' own. */
function mountShortcuts() {
  const tabModule = () => ({ data: DataTab, structure: Structure, actions: RemoteActions }[shellState.tab]);

  /* A chord, so it works while typing too. */
  const compareButton = document.getElementById('compare-json');
  document.addEventListener('keydown', (ev) => {
    if (!Features.has('shell.compare-json') || !isCompareJsonKey(ev) || (compareButton && !compareButton.isConnected)) return;
    ev.preventDefault();
    openCompare();
  });
  if (compareButton) compareButton.addEventListener('click', openCompare);

  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || typingTarget(ev.target)) return;
    // Behind an open dialog only ? and , (which swap or close it) are live.
    if ((el.help.isOpen() || el.settings.isOpen()) && ev.key !== 'h' && ev.key !== ',') return;

    switch (ev.key) {
      case '/': ev.preventDefault(); tabModule().focusFilter(); break;
      case 'h': {
        ev.preventDefault();
        const title = el.help.isOpen() ? null : helpTitleOf(ev.target);
        if (title) openHelpFor(title);
        else {
          if (el.settings.isOpen()) el.settings.close({ restoreFocus: false });
          toggleHelp();
        }
        break;
      }
      case ',': ev.preventDefault(); toggleSettings(); break;
      case '1': case '2': case '3': showTab(TabOrder.order()[Number(ev.key) - 1]); break;
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

  /* WAI-ARIA tabs: arrows / Home / End move between tabs (activating as they
   * go) and only the active tab is in the Tab order. */
  document.querySelector('[role="tablist"]').addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const shown = TabOrder.order();
    const at = shown.indexOf(shown.find((name) => el.tabs[name].button === document.activeElement));
    if (at < 0) return;
    const next = {
      ArrowRight: (at + 1) % shown.length,
      ArrowLeft: (at + shown.length - 1) % shown.length,
      Home: 0,
      End: shown.length - 1
    }[ev.key];
    if (next === undefined) return;
    ev.preventDefault();
    showTab(shown[next]);
    el.tabs[shown[next]].button.focus();
  });
  Nav.setTabSwitcher(showTab);
  TabOrder.mount(document.querySelector('[role="tablist"]'));
}

/* Told by devtools.js when the panel is on screen (see devtools.js and
 * CONTRIBUTING.md's injected-function note — this one crosses a page boundary
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

/* The right of the status bar: the extension's version and the coffee
 * button, which opens the same address as the foot of the help. The version
 * is left out where the manifest cannot be read. */
const openSupport = () => window.open(SUPPORT.url, '_blank', 'noopener');

/* One address needs no menu: the button opens it. Only when the build adds
 * more items (coffeeMenuPointer) is there a menu, placed at the pointer or,
 * from the keyboard, over the button. */
function onSupport(ev, button) {
  const more = coffeeMenuPointer();
  if (!more.length) { openSupport(); return; }
  const rect = button.getBoundingClientRect();
  const at = ev.detail ? ev : { clientX: rect.left, clientY: rect.top, type: 'keydown', detail: 0 };
  openContextMenu(at, [{ label: SUPPORT.label, title: `Open ${SUPPORT.url} in a new tab`, action: openSupport }].concat(more));
}

function mountStatusMeta() {
  const version = document.getElementById('status-version');
  const coffee = document.getElementById('status-coffee');
  /* Only the Free build has Buy me a coffee. */
  if (coffee && !isFreeBuild()) coffee.remove();
  else if (coffee) {
    if (coffeeMenuPointer().length) coffee.setAttribute('aria-haspopup', 'menu');
    coffee.addEventListener('click', (ev) => onSupport(ev, coffee));
  }
  const number = extensionVersion();
  if (version && number) {
    version.textContent = `v${number}`;
    version.hidden = false;
  }
}

export function mountPanelShell() {
  mountStatusMeta();
  mountHelp();
  mountTabs();
  mountShortcuts();
  mountControlHelp();
  mountVisibilityBridge();
  mountLiveStatus(document.getElementById('status-live'),
    [document.getElementById('status-left'), document.getElementById('status-right')]);
}
