'use strict';

/* "Open in Designer", the top bar button after the script picker. It is there
 * only while the selected script's Id was found (in its definition, its header
 * or an attribute of its host element) and the page is an org's own, and opens
 * the designer in a new tab. What the link is, and whether there is one, is
 * decided in core/shared/designer-link.js. Nothing is sent anywhere: the panel builds
 * an address and the browser opens it when the button is pressed.
 *
 * It reads two properties of the host once per change of script (the feed
 * answers repeats from memory); the page is not written to. */

import { Targets } from './targets.js';
import { Shared } from './shared.js';
import { Settings } from './settings.js';
import { designerLinkFor, designerTitle, namespaceSuggestions, namespacedKeysOf, callsForOrigin } from '../core/shared/designer-link.js';

const FRESH_MS = 60000; // the Id does not change while a script is open

/* The flavour belongs to the org, not to a script: what was learned about an
 * origin (the field names of every definition read on it, and the managed
 * package it was last taken for, so it never flips back to core) is kept here
 * in memory for the session, per origin. */
const origins = new Map();
function originState(origin) {
  if (!origins.has(origin)) origins.set(origin, { definitions: new Map(), previous: null });
  return origins.get(origin);
}

/* What the link was last built from, for the Settings dialog's namespace
 * suggestions (the namespaces this page shows come first). */
let lastInputs = null;
export function seenNamespaces() {
  if (!lastInputs) return namespaceSuggestions({});
  return namespaceSuggestions({
    hosts: Targets.hosts(), definitions: [...originState(lastInputs.pageOrigin).definitions.values()],
    calls: callsForOrigin(Shared.calls(), lastInputs.pageOrigin)
  });
}

/* The setting in force: Auto unless Settings says otherwise. */
const settingNow = () => ({ mode: Settings.get('designerMode'), namespace: Settings.get('designerNs') });

/* What makes two links the same button: all but the time stamp a managed link
 * carries, which is renewed on every press anyway. */
const sigOf = (link) => (link ? [link.id, link.flavour, link.namespace, link.designer, link.why, link.url.replace(/uid=\d+/, '')].join('|') : '');

function parseObject(text) {
  if (typeof text !== 'string' || !text) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch { return null; }
}

export function mountDesignerButton(button) {
  let link = null;
  let token = 0; // a newer request makes an older answer stale
  let inputs = null; // what the link was last built from, to build it again on a press
  let parsed = { definitionText: null, headerText: null, definition: null, header: null };

  const paint = (next) => {
    const same = sigOf(next) === sigOf(link);
    link = next; // the newest time stamp, even when nothing is redrawn
    if (same) return;
    button.hidden = !next;
    if (!next) return;
    const title = designerTitle(next);
    button.title = title;
    button.setAttribute('aria-label', title);
  };

  /* The definition and header, parsed again only when their text changed. */
  const objectsFor = (definitionText, headerText) => {
    if (parsed.definitionText !== definitionText) {
      parsed = { ...parsed, definitionText, definition: parseObject(definitionText) };
    }
    if (parsed.headerText !== headerText) {
      parsed = { ...parsed, headerText, header: parseObject(headerText) };
    }
    return parsed;
  };

  /* The captured calls are a hint to the flavour and arrive after the script
   * is picked, so they are read whenever the link is built. */
  const build = () => {
    if (!inputs) return null;
    const known = originState(inputs.pageOrigin);
    const setting = settingNow();
    const made = designerLinkFor({
      ...inputs, hosts: Targets.hosts(), definitions: [...known.definitions.values()],
      calls: Shared.calls(), setting, previous: known.previous, now: Date.now()
    });
    /* Once the org is taken for managed from what the page showed, it stays so
     * (only the setting changes that). */
    if (made && setting.mode === 'auto' && made.flavour === 'managed') {
      known.previous = { flavour: 'managed', namespace: made.namespace, why: made.why };
    }
    return made;
  };

  const update = () => {
    const mine = ++token;
    const host = Targets.selected();
    if (!host || host.session || Targets.sessionName()) { inputs = null; lastInputs = null; paint(null); return; }

    Targets.fetch(Targets.props().def, (definitionText) => {
      if (mine !== token) return;
      Targets.fetch('scriptHeaderDef', (headerText) => {
        if (mine !== token) return;
        Targets.pageOrigin((origin) => {
          if (mine !== token) return;
          Targets.pagePath((pagePath) => {
            if (mine !== token) return;
            const { definition, header } = objectsFor(definitionText, headerText);
            inputs = { definition, header, host, pageOrigin: origin, pagePath };
            lastInputs = inputs;
            const known = originState(origin).definitions;
            known.set(`${host.frame || ''}|${host.key || host.label || host.index}|d`, namespacedKeysOf(definition));
            known.set(`${host.frame || ''}|${host.key || host.label || host.index}|h`, namespacedKeysOf(header));
            /* A fresh time makes each press a new uid for the managed wrapper. */
            paint(build());
          });
        });
      }, { maxAge: FRESH_MS });
    }, { maxAge: FRESH_MS });
  };

  /* Calls captured since the script was picked may be new signals: the tooltip
   * is worked out again when it is about to be read. */
  const refresh = () => { if (inputs && link) paint(build() || link); };
  button.addEventListener('pointerenter', refresh);
  button.addEventListener('focus', refresh);

  button.addEventListener('click', () => {
    if (!link) return;
    /* Built again, so calls captured since the script was picked count; the
     * uid in a managed link is the time of the press. */
    paint(build() || link);
    window.open(link.url, '_blank', 'noopener');
  });

  /* A change in Settings changes the link without another read of the page. */
  Settings.provide(() => ({ designerMode: Settings.get('designerMode'), designerNs: Settings.get('designerNs') }));
  Settings.onChange(() => { if (inputs) paint(build()); });

  Targets.subscribe(update);
  update();
}
