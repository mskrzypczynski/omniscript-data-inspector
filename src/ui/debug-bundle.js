'use strict';

/* "Save a debug bundle", in the settings dialog (Tools row):
 * saves everything the panel shows (the
 * payload and its recent history, the current step, the script's definition,
 * the captured calls, what each tab dumps, the settings and the panel's size)
 * as one JSON file for a bug report. What goes in is decided in
 * core/shared/debug-bundle.js; this only gathers it from the tabs. "Open bundle…"
 * (session.js, session-mode.js) reads such a file back. */

import { buildDebugBundle, bundleFileName } from '../core/shared/debug-bundle.js';
import { Mask } from './mask-setting.js';
import { Targets } from './targets.js';
import { Shared } from './shared.js';
import { Settings } from './settings.js';
import { PayloadHistory } from './payload-history.js';
import { downloadText } from './util.js';
import { toast } from './toast.js';
import { extensionVersion } from './version.js';

/* How big the panel is and which theme it follows: layout bugs depend on both. */
function panelState() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    theme: document.documentElement.dataset.theme || 'os'
  };
}

function gather(now, payload, definition) {
  return {
    now,
    version: extensionVersion(),
    script: Targets.selected(),
    step: Shared.step(),
    payload,
    elements: Shared.elements(),
    definition,
    calls: Shared.calls(),
    onlyOmni: Shared.onlyOmni(),
    masked: Mask.on(),
    settings: Settings.current(),
    panel: panelState(),
    history: PayloadHistory.list(),
    tabs: Shared.dumps(Mask.apply)
  };
}

/* The definition is loaded first when Structure has not read it yet, so the
 * bundle names the steps whichever tab it is saved from. */
export function saveDebugBundle() {
  Shared.ensureElements(() => readFresh((payload) => readDefinition((definition) => writeBundle(payload, definition))));
}

/* The definition as the page holds it, in full (and its header, which carries
 * the labels), so a bundle can be opened later and Structure shown from it.
 * Either is left out when the page gives none. */
function readDefinition(done) {
  if (!Targets.selected()) { done({}); return; }
  const text = (value) => (typeof value === 'string' ? value : null);
  Targets.fetch(Targets.props().def, (raw) => {
    Targets.fetch('scriptHeaderDef', (headerRaw) => done({ raw: text(raw), headerRaw: text(headerRaw) }), { full: true });
  }, { full: true });
}

/* The bundle must hold what the page holds now, not what the Data tab last
 * drew (it may be a second behind, paused, or from another script): one full
 * read of the Data property, with the time it was made. When the page cannot
 * be read, the tab's own copy is used and the bundle says so. */
function readFresh(done) {
  const held = Shared.payload();
  if (!Targets.selected() || !held.prop) { done(held); return; }
  Targets.fetch(held.prop, (value) => {
    if (typeof value !== 'string') {
      done({ ...held, note: 'The page could not be read for this bundle; this is the last payload the Data tab held.' });
      return;
    }
    let data;
    try { data = JSON.parse(value); } catch { data = undefined; }
    done({ prop: held.prop, raw: value, data, readAt: new Date() });
  }, { full: true });
}

function writeBundle(payload, definition) {
  const now = new Date();
  const bundle = buildDebugBundle(gather(now, payload, definition), Mask.apply);
  downloadText(bundleFileName(now), JSON.stringify(bundle, null, 2));
  toast(bundle.masked ? 'Debug bundle saved (masked)' : 'Debug bundle saved');
}
