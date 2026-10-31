'use strict';

/* A loaded session: a debug bundle opened in the panel instead of a live
 * page. While one is loaded, the top bar answers reads from the bundle
 * (targets.js), Calls lists its calls, Structure takes its
 * definition and step visits, and polling stops. Everything is read-only;
 * "Back to live" clears it.
 *
 * Owned by the shell; the tabs only read it and subscribe. */

let bundle = null;
let name = '';
const listeners = [];

function notify() {
  listeners.forEach((fn) => { try { fn(bundle); } catch (error) { console.warn('Session listener failed', error); } });
}

export const Session = {
  /* bundle: the parsed debug bundle (core/shared/debug-bundle.js shape); name: the
   * file it came from, for the status bar. */
  load(parsed, fileName = '') {
    bundle = parsed;
    name = fileName;
    notify();
  },
  clear() {
    if (!bundle) return;
    bundle = null;
    name = '';
    notify();
  },
  active: () => bundle !== null,
  bundle: () => bundle,
  name: () => name,
  /* fn(bundle | null) after every load or clear. */
  onChange: (fn) => listeners.push(fn)
};
