'use strict';

/* Buttons that take the payload out of the panel: copy, save, and exposing
 * the host element as $omni in the page console. Masking is applied by
 * payloadText, so everything that leaves honours the switch. */

import { payloadText } from '../../core/shared/mask.js';
import { Mask } from '../mask-setting.js';
import { Targets } from '../targets.js';
import { copyWithToast } from '../clipboard.js';
import { downloadText, flashText } from '../util.js';
import { toast } from '../toast.js';

function currentText(state) {
  return payloadText(state, Mask.on());
}

/* The Export menu's two entries. The menu closes when one is chosen, so the
 * answer is a toast, not a flash on a button. */
export function copyPayload(state) {
  const text = currentText(state);
  if (text === null) { toast('Not valid JSON'); return; }
  copyWithToast(text, 'Copied Data JSON');
}

export function downloadPayload(state) {
  const text = currentText(state);
  if (text === null) { toast('Not valid JSON'); return; }
  if (!text) return;
  downloadText(`omniscript-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, text);
}

export function revealElement(button) {
  const host = Targets.selected();
  if (!host || host.session) return; // a loaded file has no element on the page
  const expression = '(function(i){ try { window.$omni = window.__omniHosts[i];' +
    ' if (typeof inspect === "function") inspect(window.$omni); return true; }' +
    ' catch(e){ return String(e); } })(' + JSON.stringify(host.local) + ')';
  Targets.evalOn(host.frame, expression, () => flashText(button, 'Exposed as $omni'));
}
