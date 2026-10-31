'use strict';

/* A loaded session, seen from the shell: "Open bundle…" (in the settings dialog, beside
 * Save a debug bundle) reads a debug bundle from a file into Session; this
 * module then puts the top bar, the payload history and the controls into
 * session mode and back again. Session itself (session.js) is only the
 * holder; the tabs subscribe to it for their own part.
 *
 * Everything stays read-only: the page is not read while a file is loaded, and
 * nothing here writes to it. */

import { Session } from './session.js';
import { Targets } from './targets.js';
import { PayloadHistory } from './payload-history.js';
import { toast } from './toast.js';
import { decorateButton } from './icons.js';
import { parseBundle, savedAt, sessionHistory } from '../core/shared/session-bundle.js';
import { sessionText } from '../core/actions/actions-import.js';

/* A bundle is plain text; a file far beyond what the panel writes is not one. */
const MAX_BUNDLE_CHARS = 60000000;

/* The controls that read the page, and why each is out of use. */
const LOCKED = [
  ['refresh', 'Not available while a bundle is open: the data is read from the file. Back to live reads the page again.'],
  ['live', 'Not available while a bundle is open: nothing is read from the page. Back to live reads it again.'],
  ['rescan', 'Not available while a bundle is open: the page is not scanned. Back to live looks again.'],
  ['select', 'Not available while a bundle is open: the script is in a file, not on the page.'],
  ['struct-refresh', 'Not available while a bundle is open: the definition is read from the file. Back to live reads the page again.']
];

const originalTitles = new Map();

function lockControls(loaded) {
  LOCKED.forEach(([id, why]) => {
    const node = document.getElementById(id);
    if (!node) return;
    if (loaded) {
      if (!originalTitles.has(id)) originalTitles.set(id, node.title);
      node.disabled = true;
      node.title = why;
    } else {
      node.disabled = false;
      if (originalTitles.has(id)) node.title = originalTitles.get(id);
      originalTitles.delete(id);
    }
  });
}

function barText(bundle) {
  const saved = savedAt(bundle);
  return [sessionText(Session.name()), saved ? `saved ${saved.toLocaleString()}` : '', 'read-only'].filter(Boolean).join(' · ');
}

function paint(bundle) {
  const bar = document.getElementById('session-bar');
  if (bar) {
    bar.hidden = !bundle;
    if (bundle) document.getElementById('session-text').textContent = barText(bundle);
  }
  lockControls(!!bundle);
}

/* The panel goes into session mode, or back. The order matters: the held
 * history is in place before the tabs are told the selection changed (they
 * clear the history then), and on the way out it is given back after. */
function onSession(bundle) {
  if (bundle) {
    PayloadHistory.hold(sessionHistory(bundle));
    Targets.enterSession(bundle, Session.name());
  } else {
    Targets.exitSession();
    PayloadHistory.release();
  }
  paint(bundle);
}

export function mountSessionMode() {
  Session.onChange(onSession);
  const back = document.getElementById('session-back');
  if (back) back.addEventListener('click', () => Session.clear());
  paint(Session.bundle());
}

/* ----------------------------------------------------- opening a file */

function readFileText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

/* The "Open bundle…" button and its hidden file input. A file that is not a
 * debug bundle loads nothing and says why. onLoaded runs after a bundle is
 * loaded (the dialog closes itself, so the panel is seen). */
export function bundleOpenControl(onLoaded = () => {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.id = 'settings-bundle-file';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn';
  button.id = 'settings-open-bundle';
  decorateButton(button, 'upload', 'Open bundle…');
  button.title = 'Open a debug bundle saved earlier: the panel shows its script as it was, read-only, until you go back to live. It is read here and kept in memory only, never sent anywhere.';
  button.addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_BUNDLE_CHARS) { toast(`${file.name} is too large to open`); return; }
    const parsed = parseBundle(await readFileText(file));
    if (!parsed.ok) { toast(parsed.error); return; }
    Session.load(parsed.bundle, file.name);
    toast(`Opened ${file.name}`);
    onLoaded();
  });
  return [button, input];
}
