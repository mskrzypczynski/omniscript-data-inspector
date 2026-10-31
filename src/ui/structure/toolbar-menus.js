'use strict';

/* The Structure toolbar's two menu buttons. View holds the switches that change
 * which elements the list shows (Actions only, Collapse done steps, Highlight
 * on hover, Visible only) and says how many are on. More holds the deeper-dive
 * views and files (Timeline, Compare definition, Export). What each holds, and
 * when, is decided in core/structure/toolbar-menus.js. */

import { openContextMenu } from '../context-menu.js';
import { Features } from '../features.js';
import { Settings } from '../settings.js';
import {
  viewOptions, viewCount, viewButtonTitle, moreEntries
} from '../../core/structure/toolbar-menus.js';
import { exportItems } from './export-menu.js';

const byId = (id) => document.getElementById(id);

/* Under the button, whichever way it was pressed. Passing the button on as
 * currentTarget lets the shared menu keep its aria-expanded true while open. */
function openUnder(ev, items) {
  const button = ev.currentTarget;
  const box = button.getBoundingClientRect();
  openContextMenu({
    clientX: box.left, clientY: box.bottom, type: ev.type, detail: ev.detail, currentTarget: button
  }, items);
}

/* state: the tab's. settings: createStructureSettings' setters. compare:
 * createCompareControls' { toggleTimeline, pickFile }. render(): the tab's full
 * redraw; scrollTop of the list returns to the start when the rows change. */
export function createToolbarMenus({ state, settings, compare, render }) {
  const values = () => ({
    actionsOnly: state.actionsOnly,
    autoCollapse: state.autoCollapse,
    hover: state.hover,
    visibleOnly: state.visibleOnly
  });
  const options = () => viewOptions(Features.has, values());

  /* One action per switch: change the state, remember it where Settings keeps it. */
  const toggles = {
    actionsOnly: () => {
      state.actionsOnly = !state.actionsOnly;
      render();
      byId('struct-list').scrollTop = 0;
    },
    autoCollapse: () => {
      settings.setAutoCollapse(!state.autoCollapse);
      Settings.set('structAutoCollapse', state.autoCollapse);
    },
    hover: () => {
      settings.setHover(!state.hover);
      Settings.set('structHover', state.hover);
    },
    visibleOnly: () => {
      settings.setVisibleOnly(!state.visibleOnly);
      Settings.set('structVisibleOnly', state.visibleOnly);
    }
  };

  /* The button says how many switches are on, so a filtered list is never a
   * surprise. Text only: it runs on every redraw. */
  function updateView() {
    const button = byId('struct-view');
    if (!button) return;
    const now = options();
    const count = viewCount(now);
    const badge = button.querySelector('.menu-count');
    const text = count ? String(count) : '';
    if (badge.textContent !== text) badge.textContent = text;
    badge.hidden = count === 0;
    button.classList.toggle('is-on', count > 0);
    button.title = viewButtonTitle(now);
    button.setAttribute('aria-label', count ? `View, ${count} on` : 'View');
  }

  function openView(ev) {
    openUnder(ev, options().map((option) => ({
      label: option.label,
      title: option.title,
      checked: option.checked,
      action: () => { toggles[option.key](); updateView(); }
    })));
  }

  /* The More button is drawn only while its menu would hold something. */
  function updateMore() {
    const button = byId('struct-more');
    if (button) button.hidden = moreEntries(Features.has).length === 0;
  }

  function moreItems() {
    const items = [];
    const entries = moreEntries(Features.has);
    if (entries.includes('timeline')) {
      items.push({
        label: 'Timeline', checked: state.showTimeline,
        title: 'List each visit to a step, with the time spent and the calls made.',
        action: compare.toggleTimeline
      });
    }
    if (entries.includes('compare')) {
      items.push({
        label: 'Compare definition…',
        title: 'Compare the script now with a saved definition file or debug bundle.',
        action: compare.pickFile
      });
    }
    if (entries.includes('export')) {
      if (items.length) items.push('-');
      items.push(...exportItems(state));
    }
    return items;
  }

  function mount() {
    const view = byId('struct-view');
    view.addEventListener('click', openView);
    const more = byId('struct-more');
    if (more) more.addEventListener('click', (ev) => openUnder(ev, moreItems()));
    updateView();
    updateMore();
  }

  return { mount, updateView, updateMore };
}
