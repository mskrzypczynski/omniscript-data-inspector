'use strict';

/* The Data tab and Settings: which settings this tab owns (the property, the
 * view, Auto-refresh, Track changes), and how "Restore default settings" puts
 * them back. The setters belong to the tab, which redraws and reads. */

import { Mask } from '../mask-setting.js';
import { Settings, DEFAULTS, SESSION_DEFAULTS } from '../settings.js';
import { viewToOpen } from '../../core/shared/remembered-views.js';

/* state: the tab's state. set: { view(view, redraw), prop(value),
 * trackChanges(on, remember), live(on) }. render(): a full redraw. */
export function installDataSettings({ state, set, render }) {
  /* The view that counts is the one Settings keeps (Tree, Form or Raw, clicked by
   * hand), not the one on screen: Sizes and Changes are a look at the moment,
   * and Show in tree flips to Tree without choosing it. */
  const keptView = () => viewToOpen('dataView', Settings.get('dataView'), 'tree');

  /* "Restore default settings": put the controls and the state of the settings
   * this tab owns back to what Settings (or the session default) says. Captured
   * payload history, pins and filter text are left alone. scope names one
   * setting, or is undefined for all of them. */
  function apply(scope) {
    const want = (name) => Settings.inScope(scope, name);
    let redraw = false;

    if (want('dataView')) {
      const view = keptView();
      if (state.view !== view) { set.view(view, false); redraw = true; }
    }
    if (redraw) render();

    if (want('dataProp')) {
      const prop = Settings.get('dataProp').trim() || DEFAULTS.dataProp;
      if (prop !== state.prop) set.prop(prop);
    }
    if (want('dataChanges') && state.trackChanges !== Settings.get('dataChanges')) set.trackChanges(Settings.get('dataChanges'), false);
    if (want('dataLive') && state.live !== SESSION_DEFAULTS.dataLive) set.live(SESSION_DEFAULTS.dataLive);
  }

  Settings.provide(() => ({
    dataProp: state.prop, dataView: keptView(), dataLive: state.live,
    dataChanges: state.trackChanges, refreshRate: Settings.get('refreshRate')
  }));
  Settings.onReset(apply);

  /* The change log and the watch list show values, so Mask values redraws them. */
  let drawnMask = Mask.on();
  Settings.onChange(() => {
    if (Mask.on() === drawnMask) return;
    drawnMask = Mask.on();
    if (state.view === 'changes' || state.pins.length || (state.exprs && state.exprs.length)) render();
  });
}
