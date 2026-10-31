'use strict';

/* Frames and OmniScript hosts, discovered once and shared by every tab.
 *
 * Both tabs used to keep their own frame index and their own element list,
 * which is why they kept disagreeing about what was on the page. This module
 * owns both: it enumerates every frame, lists the hosts in each, and publishes
 * one selection that the Data and Structure tabs both read.
 */

import { signature, shortFrame, formatBytes, scriptHosts, hiddenHostCounts, reconcileSelection } from '../core/shared/targets-model.js';
import { sessionAnswer, sessionAsIndex, sessionHost } from '../core/shared/session-bundle.js';
import { createPoller } from './util.js';
import { createPayloadFeed } from './payload-feed.js';
import { Settings } from './settings.js';
import { Page } from './page.js';

/* ---------------------------------------------------------- page side */

/* Lists elements exposing either property, in one pass per frame. The index
 * of a host in this list is the handle the fetchers use, so both functions
 * must enumerate in exactly the same order.
 *
 * Stringified into the inspected page (see CONTRIBUTING.md): it may not close over
 * this module's scope or call anything defined outside its own body — the
 * page only ever receives this function's source text. hostScan and
 * hostFetch must keep enumerating identically; do not "clean up" the
 * duplication between them. */
export function hostScan(DATA_PROP, DEF_PROP) {
  try {
    /* Every child element component inherits the same properties, so one
     * forty-element OmniScript is forty hosts. A low cap silently truncated
     * the list before reaching a second console tab's script. hostFetch must
     * use the identical limit, or the indices the two return stop matching. */
    const MAX_HOSTS = 400;
    const hosts = [];

    /* The few attributes that can hold the script's record Id (for Open in
     * Designer); the host's tag name and class say which package it is from.
     * Nothing else is taken from the element. */
    const ID_ATTRIBUTES = ['data-omni-id', 'omniscript-id'];
    const idAttributes = (node) => {
      const found = {};
      ID_ATTRIBUTES.forEach((name) => {
        let value;
        try { value = node.getAttribute(name); } catch { value = null; }
        if (typeof value === 'string' && value && value.length <= 40) found[name] = value;
      });
      return found;
    };

    const read = (node, prop) => {
      let value;
      try { value = node[prop]; } catch { return null; }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return null; }
      }
      return null;
    };

    const label = (node) => {
      let text = node.tagName.toLowerCase();
      if (node.id) text += '#' + node.id;
      else if (node.className && typeof node.className === 'string') {
        const first = node.className.trim().split(/\s+/)[0];
        if (first) text += '.' + first;
      }
      return text;
    };

    /* Type/SubType/Language, the name people know a script by, read off the
     * definition without parsing all of it when it is a string. */
    const scriptKey = (node) => {
      let def;
      try { def = node[DEF_PROP]; } catch { return ''; }
      const field = (name) => {
        if (def && typeof def === 'object') return typeof def[name] === 'string' ? def[name] : '';
        if (typeof def !== 'string') return '';
        const match = def.match(new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
        return match ? match[1] : '';
      };
      const parts = [field('bpType'), field('bpSubType'), field('bpLang')];
      return parts.some(Boolean) ? parts.join('/') : '';
    };

    /* Whether the definition a node exposes is a whole OmniScript (true) or
     * one element's definition (false), so a script with forty elements is not
     * counted as forty embedded scripts; undefined when it cannot be told. A whole
     * script has a bpType and bpSubType pair, an omniProcessType, or top-level
     * children that are steps; an element has a type and a propSetMap. A string
     * is only searched for those keys, not parsed: this runs on every host of
     * every scan. */
    const scriptKind = (node) => {
      let def;
      try { def = node[DEF_PROP]; } catch { return undefined; }
      if (def && typeof def === 'object') {
        if ((typeof def.bpType === 'string' && typeof def.bpSubType === 'string') || typeof def.omniProcessType === 'string') return true;
        if (Array.isArray(def.children) && def.children.some((child) => child && child.type === 'Step')) return true;
        if (typeof def.type === 'string' && def.propSetMap && typeof def.propSetMap === 'object') return false;
        return undefined;
      }
      if (typeof def !== 'string') return undefined;
      if (/"bpType"\s*:\s*"/.test(def) && /"bpSubType"\s*:\s*"/.test(def)) return true;
      if (/"omniProcessType"\s*:\s*"/.test(def)) return true;
      if (/"propSetMap"\s*:/.test(def) && /"type"\s*:\s*"/.test(def)) return false;
      return undefined;
    };

    /* Whether a node exposes a value, without serialising it: hostFetch runs
     * the same test on every read, and stringifying forty copies of the
     * payload just to see they exist was most of its cost. hostFetch must use
     * an identical test. */
    const has = (node, prop) => {
      let value;
      try { value = node[prop]; } catch { return false; }
      return typeof value === 'string' ? value.length > 0 : !!value && typeof value === 'object';
    };

    const walk = (root) => {
      let nodes;
      try { nodes = root.querySelectorAll('*'); } catch { return; }
      for (const node of nodes) {
        if (hosts.length < MAX_HOSTS) {
          const hasDef = !!DEF_PROP && has(node, DEF_PROP);
          if (has(node, DATA_PROP) || hasDef) {
            const data = read(node, DATA_PROP);
            const def = hasDef ? read(node, DEF_PROP) : null;
            hosts.push({
              node,
              label: label(node),
              tag: node.tagName.toLowerCase(),
              cls: typeof node.className === 'string' ? node.className.slice(0, 120) : '',
              attrs: idAttributes(node),
              key: hasDef ? scriptKey(node) : '',
              script: hasDef ? scriptKind(node) : undefined,
              dataLen: data ? data.length : 0,
              defLen: def ? def.length : 0
            });
          }
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        if (node.tagName === 'IFRAME') {
          try { if (node.contentDocument) walk(node.contentDocument); } catch { /* cross-origin */ }
        }
      }
    };

    walk(document);

    /* Child element components inherit the same @api properties, so a script
     * with forty elements yields forty hosts. The one that matters is the one
     * with no ancestor exposing the property — checked by walking up through
     * shadow roots and iframe boundaries, since tag names vary by package. */
    const nodes = hosts.map((host) => host.node);

    const parentOf = (node) => {
      if (!node) return null;
      if (node.host) return node.host; // shadow root
      if (node.parentNode) return node.parentNode;
      if (node.nodeType === 9) { // document in an iframe
        try { return node.defaultView && node.defaultView.frameElement; } catch { return null; }
      }
      return null;
    };

    hosts.forEach((host) => {
      let parent = parentOf(host.node);
      let guard = 0;
      host.top = true;
      while (parent && guard++ < 200) {
        if (nodes.indexOf(parent) !== -1) { host.top = false; break; }
        parent = parentOf(parent);
      }
    });

    const hints = [];
    if (!hosts.length) {
      (function scan(root) {
        let nodes;
        try { nodes = root.querySelectorAll('*'); } catch { return; }
        for (const node of nodes) {
          if (hints.length < 3 && node.tagName.toLowerCase().indexOf('omniscript') > -1) {
            const names = {};
            let proto = Object.getPrototypeOf(node);
            let guard = 0;
            while (proto && guard++ < 6) {
              const propertyNames = Object.getOwnPropertyNames(proto);
              for (const propertyName of propertyNames) {
                if (/json|data|def/i.test(propertyName)) names[propertyName] = 1;
              }
              proto = Object.getPrototypeOf(proto);
            }
            hints.push({ tag: label(node), props: Object.keys(names).slice(0, 24) });
          }
          if (node.shadowRoot) scan(node.shadowRoot);
          if (node.tagName === 'IFRAME') {
            try { if (node.contentDocument) scan(node.contentDocument); } catch { /* cross-origin */ }
          }
        }
      })(document);
    }

    window.__omniHosts = hosts.map((host) => host.node);

    return {
      ok: true,
      hints,
      truncated: hosts.length >= MAX_HOSTS,
      hosts: hosts.map((host) => ({
        label: host.label, tag: host.tag, cls: host.cls, attrs: host.attrs,
        key: host.key, script: host.script, dataLen: host.dataLen, defLen: host.defLen, top: !!host.top
      }))
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), hosts: [], hints: [] };
  }
}

/* Reads one property off one host. `missing` says the index no longer points
 * at a host, so the panel re-enumerates.
 *
 * Optional extras, all ignored when omitted (the old four-argument call still
 * returns the whole value):
 *  - SIG: the "length:hash" the panel already holds for this value. When the
 *    value hashes to the same signature the answer is { unchanged: true } and
 *    the string never crosses the bridge. The hash is a copy of
 *    src/core/data/payload-sig.js; keep the two identical.
 *  - PEEK_PROP / PEEK_FIELD: also return one top-level field of another
 *    property (the definition's asIndex) as `peek`, saving a round trip.
 *
 * Same self-containment rule as hostScan, and must enumerate identically to
 * it — see the comment there. Writes nothing to the page apart from the
 * existing window.__omniHosts / __omniPeekCache. */
export function hostFetch(DATA_PROP, DEF_PROP, IDX, WANTED, SIG, PEEK_PROP, PEEK_FIELD, EXPECT_LABEL, EXPECT_KEY) {
  try {
    const MAX_HOSTS = 400; // must match hostScan
    const hosts = [];

    /* Same text as hostScan's label(): the identity check below compares the
     * two, so keep them identical. */
    const label = (node) => {
      let text = node.tagName.toLowerCase();
      if (node.id) text += '#' + node.id;
      else if (node.className && typeof node.className === 'string') {
        const first = node.className.trim().split(/\s+/)[0];
        if (first) text += '.' + first;
      }
      return text;
    };

    const read = (node, prop) => {
      let value;
      try { value = node[prop]; } catch { return null; }
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        try { return JSON.stringify(value); } catch { return null; }
      }
      return null;
    };

    const has = (node, prop) => { // must match hostScan
      let value;
      try { value = node[prop]; } catch { return false; }
      return typeof value === 'string' ? value.length > 0 : !!value && typeof value === 'object';
    };

    /* Same text as hostScan's scriptKey(): Type/SubType/Language. Two scripts
     * on one page often share an element name, so the label alone cannot tell
     * that the list shifted under us. */
    const scriptKey = (node) => {
      if (!DEF_PROP || !has(node, DEF_PROP)) return '';
      let def;
      try { def = node[DEF_PROP]; } catch { return ''; }
      const field = (name) => {
        if (def && typeof def === 'object') return typeof def[name] === 'string' ? def[name] : '';
        if (typeof def !== 'string') return '';
        const match = def.match(new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
        return match ? match[1] : '';
      };
      const parts = [field('bpType'), field('bpSubType'), field('bpLang')];
      return parts.some(Boolean) ? parts.join('/') : '';
    };

    const walk = (root) => {
      let nodes;
      try { nodes = root.querySelectorAll('*'); } catch { return; }
      for (const node of nodes) {
        if (hosts.length < MAX_HOSTS) {
          if (has(node, DATA_PROP) || (DEF_PROP && has(node, DEF_PROP))) hosts.push(node);
        }
        if (node.shadowRoot) walk(node.shadowRoot);
        if (node.tagName === 'IFRAME') {
          try { if (node.contentDocument) walk(node.contentDocument); } catch { /* cross-origin */ }
        }
      }
    };

    walk(document);
    window.__omniHosts = hosts;

    const node = hosts[IDX];
    if (!node) return { ok: true, missing: true, value: null };

    /* The list shifted since the panel scanned (another script rendered a
     * child above this one): index IDX is now someone else's host. Answer
     * "missing" so the panel rescans rather than show that script's data. */
    const nodeLabel = label(node);
    if (EXPECT_LABEL && nodeLabel !== EXPECT_LABEL) {
      return { ok: true, missing: true, value: null, label: nodeLabel };
    }
    /* Two scripts often share a label; the key (Type/SubType/Language) tells
     * them apart. null means the caller has no key to compare. */
    if (typeof EXPECT_KEY === 'string' && scriptKey(node) !== EXPECT_KEY) {
      return { ok: true, missing: true, value: null, label: nodeLabel };
    }

    let peek;
    if (PEEK_PROP) {
      try {
        let source = node[PEEK_PROP];
        if (typeof source === 'string') {
          const cache = window.__omniPeekCache;
          if (cache && cache.idx === IDX && cache.prop === PEEK_PROP && cache.raw === source) {
            source = cache.parsed;
          } else {
            const parsed = JSON.parse(source);
            window.__omniPeekCache = { idx: IDX, prop: PEEK_PROP, raw: source, parsed };
            source = parsed;
          }
        }
        const field = source && typeof source === 'object' ? source[PEEK_FIELD] : null;
        peek = field === undefined ? null : field;
      } catch { peek = null; }
    }

    const value = read(node, WANTED);
    if (typeof value !== 'string') {
      return { ok: true, missing: false, value, peek, label: nodeLabel };
    }

    let hash = 0x811c9dc5; // FNV-1a, 32-bit, over UTF-16 code units
    for (let i = 0; i < value.length; i++) {
      hash = Math.imul(hash ^ value.charCodeAt(i), 0x01000193);
    }
    const sig = value.length.toString(16) + ':' + (hash >>> 0).toString(16);

    if (SIG && SIG === sig) {
      return { ok: true, missing: false, unchanged: true, sig, peek, label: nodeLabel };
    }
    return { ok: true, missing: false, value, sig, peek, label: nodeLabel };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* Names of the properties the host at IDX exposes, for the property picker.
 * Walks the prototype chain up to (not including) the generic DOM base classes,
 * since @api properties live on the component's prototype as accessors.
 *
 * Same self-containment rule as hostScan; relies on window.__omniHosts, which
 * hostScan and hostFetch both refresh. */
export function hostProps(IDX, DEF_PROP, EXPECT_LABEL, EXPECT_KEY) {
  try {
    const node = window.__omniHosts && window.__omniHosts[IDX];
    if (!node) return { ok: true, props: [] };

    /* The list can have shifted since the panel scanned: refuse to list the
     * properties of a different script. Same label/key text as hostScan. */
    if (EXPECT_LABEL || typeof EXPECT_KEY === 'string') {
      let text = node.tagName.toLowerCase();
      if (node.id) text += '#' + node.id;
      else if (node.className && typeof node.className === 'string') {
        const first = node.className.trim().split(/\s+/)[0];
        if (first) text += '.' + first;
      }
      if (EXPECT_LABEL && text !== EXPECT_LABEL) return { ok: true, props: [], missing: true };
      if (typeof EXPECT_KEY === 'string') {
        let def;
        try { def = DEF_PROP ? node[DEF_PROP] : null; } catch { def = null; }
        const field = (name) => {
          if (def && typeof def === 'object') return typeof def[name] === 'string' ? def[name] : '';
          if (typeof def !== 'string') return '';
          const match = def.match(new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
          return match ? match[1] : '';
        };
        const parts = [field('bpType'), field('bpSubType'), field('bpLang')];
        const key = parts.some(Boolean) ? parts.join('/') : '';
        if (key !== EXPECT_KEY) return { ok: true, props: [], missing: true };
      }
    }

    const seen = {};
    const props = [];
    let target = node;
    let guard = 0;

    while (target && guard++ < 12 && target !== Object.prototype && target !== HTMLElement.prototype &&
           target !== Element.prototype && target !== Node.prototype) {
      Object.getOwnPropertyNames(target).forEach((name) => {
        if (seen[name] || name === 'constructor' || name.charAt(0) === '_' || name.charAt(0) === '$') return;
        seen[name] = true;

        let type;
        try {
          const value = node[name];
          if (typeof value === 'function') return;
          type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
        } catch { type = 'error'; }
        props.push({ name, type });
      });
      target = Object.getPrototypeOf(target);
    }

    props.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, props: props.slice(0, 500) };
  } catch {
    return { ok: false, props: [] };
  }
}

/* Outlines the component of one script element on the page for a couple of
 * seconds, found by the lwcId the definition records (matched against the
 * element's attributes and lwcId property), falling back to the element's
 * name in the usual name attributes. Searches the host and every open shadow
 * root under it. Same self-containment rule as hostScan; relies on
 * window.__omniHosts. Returns { ok, found, visible }. */
export function hostHighlight(IDX, LWCID, NAME, SHOW, DEF_PROP, EXPECT_LABEL, EXPECT_KEY) {
  try {
    const ID = '__omni_inspector_outline';
    const old = document.getElementById(ID);
    if (old) old.remove();
    if (!SHOW) return { ok: true, found: false, visible: false };

    const root = window.__omniHosts && window.__omniHosts[IDX];
    if (!root) return { ok: true, found: false, visible: false };

    /* Never outline inside a different script than the one selected: the
     * list may have shifted since the last scan. Same label/key text as
     * hostScan. */
    if (EXPECT_LABEL || typeof EXPECT_KEY === 'string') {
      let text = root.tagName.toLowerCase();
      if (root.id) text += '#' + root.id;
      else if (root.className && typeof root.className === 'string') {
        const first = root.className.trim().split(/\s+/)[0];
        if (first) text += '.' + first;
      }
      if (EXPECT_LABEL && text !== EXPECT_LABEL) return { ok: true, found: false, visible: false, missing: true };
      if (typeof EXPECT_KEY === 'string') {
        let def;
        try { def = DEF_PROP ? root[DEF_PROP] : null; } catch { def = null; }
        const field = (name) => {
          if (def && typeof def === 'object') return typeof def[name] === 'string' ? def[name] : '';
          if (typeof def !== 'string') return '';
          const match = def.match(new RegExp('"' + name + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
          return match ? match[1] : '';
        };
        const parts = [field('bpType'), field('bpSubType'), field('bpLang')];
        const key = parts.some(Boolean) ? parts.join('/') : '';
        if (key !== EXPECT_KEY) return { ok: true, found: false, visible: false, missing: true };
      }
    }

    const NAME_ATTRS = ['data-omni-key', 'data-name', 'data-element-name', 'name'];
    const search = (test) => {
      const stack = [root];
      let visited = 0;
      while (stack.length && visited++ < 30000) {
        const node = stack.pop();
        if (node.nodeType === 1 && test(node)) return node;
        const children = node.children ? Array.prototype.slice.call(node.children) : [];
        if (node.shadowRoot) children.push.apply(children, Array.prototype.slice.call(node.shadowRoot.children));
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
      return null;
    };

    let found = LWCID ? search((node) => {
      if (node.lwcId === LWCID) return true;
      for (let i = 0; i < node.attributes.length; i++) if (node.attributes[i].value === LWCID) return true;
      return false;
    }) : null;
    if (!found && NAME) {
      found = search((node) => NAME_ATTRS.some((attr) => node.getAttribute(attr) === NAME));
    }
    if (!found) return { ok: true, found: false, visible: false };

    if (found.scrollIntoView) found.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = found.getBoundingClientRect();
    if (!rect.width && !rect.height) return { ok: true, found: true, visible: false };

    const box = document.createElement('div');
    box.id = ID;
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;' +
      'outline:2px solid #1a73e8;background:rgba(26,115,232,0.18);' +
      `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2500);
    return { ok: true, found: true, visible: true };
  } catch {
    return { ok: false, found: false, visible: false };
  }
}

/* Asks the script to go back STEPS steps (Structure's row menu, Advanced), even
 * when its Previous button is hidden (the designer hides it by giving it no
 * width). Each hop finds the Previous button in the host and its open shadow
 * roots, a button or [role=button] whose text, aria-label, title, name, id or
 * data-* value says previous / prev / back (in that order of preference),
 * and clicks it without asking whether it can be seen; with no such button it
 * sends the bubbling, composed 'omniactionbtn' event the script's own buttons
 * use, { type: 'prev' }. The first hop happens now, the others a moment apart so
 * the page can settle (at most 10 hops in all). Changes which step the page
 * shows, never the data. Same self-containment rule as hostScan; relies on
 * window.__omniHosts. Returns { ok, how: 'button' | 'event' | 'none', detail }
 * for the first hop. */
export function hostNavigate(IDX, STEPS) {
  try {
    const root = window.__omniHosts && window.__omniHosts[IDX];
    if (!root) return { ok: false, how: 'none', detail: 'script not found' };
    const hops = Math.max(1, Math.min(10, Math.floor(Number(STEPS)) || 1));

    const named = (text) => /(^|[^A-Za-z])(previous|prev|back)(?![A-Za-z])/i.test(String(text || '').replace(/([a-z])([A-Z])/g, '$1 $2'));
    const readers = [
      (node) => { const text = (node.textContent || '').trim(); return text.length <= 40 ? text : ''; },
      (node) => node.getAttribute('aria-label'),
      (node) => node.getAttribute('title'),
      (node) => node.getAttribute('name'),
      (node) => node.id,
      (node) => {
        for (let i = 0; i < node.attributes.length; i++) {
          const attr = node.attributes[i];
          if (attr.name.indexOf('data-') === 0 && named(attr.value)) return attr.value;
        }
        return '';
      }
    ];

    const buttons = () => {
      const found = [];
      const stack = [root];
      let visited = 0;
      while (stack.length && visited++ < 30000) {
        const node = stack.pop();
        if (node.nodeType === 1 && (node.tagName === 'BUTTON' || node.getAttribute('role') === 'button')) found.push(node);
        const children = node.children ? Array.prototype.slice.call(node.children) : [];
        if (node.shadowRoot) children.push.apply(children, Array.prototype.slice.call(node.shadowRoot.children));
        for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
      }
      return found;
    };

    const hop = () => {
      const candidates = buttons();
      for (let r = 0; r < readers.length; r++) {
        const button = candidates.find((node) => named(readers[r](node)));
        if (button) {
          button.click(); // hidden by width or style is the point: it is not asked whether it shows
          return { ok: true, how: 'button', detail: (button.textContent || button.id || '').trim().slice(0, 40) };
        }
      }
      try {
        const inside = (root.shadowRoot && root.shadowRoot.firstElementChild) || root;
        inside.dispatchEvent(new CustomEvent('omniactionbtn', { bubbles: true, composed: true, detail: { type: 'prev' } }));
        return { ok: true, how: 'event', detail: 'omniactionbtn prev' };
      } catch {
        return { ok: false, how: 'none', detail: 'no Previous button and the event could not be sent' };
      }
    };

    const first = hop();
    const later = (left) => {
      if (left < 1) return;
      setTimeout(() => { hop(); later(left - 1); }, 700);
    };
    if (first.ok) later(hops - 1);
    return first;
  } catch {
    return { ok: false, how: 'none', detail: 'failed' };
  }
}

/* Sends one request from the inspected page, with the page's own session
 * (credentials: 'include'), for a test call the user composed and asked to
 * send. This is the only place the panel calls fetch in the page. A page
 * cannot be waited on from an eval, so the call starts here and returns at
 * once; the outcome is kept under TOKEN for hostSendResult.
 *
 * What the page holds meanwhile: the answer's text (up to 2 MB, cut there and
 * flagged) sits in window.__omniInspectorSends[TOKEN] until the panel reads it,
 * which deletes it, or until the panel gives up (hostSendResult with FORGET),
 * at most about a minute. The box never keeps more than 5 finished entries.
 * `ms` is the time the fetch took, measured here until the text is read, so the
 * panel does not count its own polling. Same self-containment rule as hostScan.
 * REQ: { url, method, headers (a plain object), body }. */
export function hostSend(REQ, TOKEN) {
  try {
    const box = window.__omniInspectorSends || (window.__omniInspectorSends = {});
    const KEEP = 5;
    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    let cancelled = false;
    box[TOKEN] = { done: false, cancel: () => { cancelled = true; } };
    /* Oldest finished entries go first; one still running is never dropped. */
    Object.keys(box).forEach((key) => {
      if (Object.keys(box).length > KEEP && key !== TOKEN && box[key] && box[key].done) delete box[key];
    });
    const init = { method: REQ.method || 'POST', headers: REQ.headers || {}, credentials: 'include' };
    if (REQ.body !== undefined && REQ.body !== null && init.method !== 'GET' && init.method !== 'HEAD') init.body = REQ.body;
    const LIMIT = 2 * 1024 * 1024;
    const started = now();
    const finish = (outcome) => {
      if (cancelled) return; // the panel stopped waiting: nothing is kept for it
      box[TOKEN] = { done: true, ms: Math.max(0, Math.round(now() - started)), ...outcome };
    };
    fetch(REQ.url, init).then(
      (response) => (typeof response.text === 'function' ? response.text() : Promise.resolve('')).then(
        (text) => finish({ ok: response.ok, status: response.status, text: text.length > LIMIT ? text.slice(0, LIMIT) : text, truncated: text.length > LIMIT }),
        () => finish({ ok: response.ok, status: response.status, text: '', truncated: false })
      ),
      (error) => finish({ ok: false, status: 0, error: String(error && error.message ? error.message : error) })
    );
    return { ok: true, started: true };
  } catch (error) {
    return { ok: false, started: false, error: String(error && error.message ? error.message : error) };
  }
}

/* The outcome of a hostSend: { done: false } while it runs, then { done, ok,
 * status, text?, truncated?, ms?, error? } once, after which it is forgotten.
 * With FORGET the panel stops waiting: the entry is deleted, and the answer, if
 * it still comes, is not kept. Reads, never sends. */
export function hostSendResult(TOKEN, FORGET) {
  try {
    const box = window.__omniInspectorSends || {};
    const found = box[TOKEN];
    if (FORGET) {
      if (found && typeof found.cancel === 'function') found.cancel();
      delete box[TOKEN];
      return { done: true, ok: false, status: 0, error: 'forgotten' };
    }
    if (!found) return { done: true, ok: false, status: 0, error: 'unknown send' };
    if (!found.done) return { done: false };
    delete box[TOKEN];
    const out = { done: true };
    ['ok', 'status', 'text', 'truncated', 'ms', 'error'].forEach((key) => { if (found[key] !== undefined) out[key] = found[key]; });
    return out;
  } catch {
    return { done: true, ok: false, status: 0, error: 'unreadable' };
  }
}

/* Same self-containment rule as hostScan. */
function frameScan() {
  try {
    const out = [];
    const frames = document.querySelectorAll('iframe');
    for (const frame of frames) {
      const url = frame.src || '';
      if (url && url.indexOf('about:') !== 0 && out.indexOf(url) === -1) out.push(url);
    }
    return { ok: true, frames: out };
  } catch {
    return { ok: false, frames: [] };
  }
}

/* ------------------------------------------------------------- state */

const state = {
  dataProp: 'jsonDataStr',
  defProp: 'jsonDef',
  frames: [''],
  frameFilter: '', // '' means every frame
  showNested: false,
  truncated: false,
  hosts: [],
  selected: 0,
  remembered: null, // the host last selected, kept while a scan finds none
  reselected: false,
  hints: [],
  visible: true,
  /* While a debug bundle is loaded: { bundle, name, live }. `live` is what the
   * top bar held before, put back by exitSession. */
  session: null,
  dirty: { target: false, frame: false }
};

const listeners = [];
const el = {};
let sendSeq = 0;

function notify(reason) {
  listeners.forEach((listener) => {
    try { listener(reason); } catch (e) { console.warn('Top bar subscriber failed:', e); } // one bad subscriber must not break the others
  });
}

/* ---------------------------------------------------------- discovery */

function evalOnInspectedPage(frame, expression, callback) {
  Page.eval(expression, { frame }, callback);
}

function discoverFrames(done) {
  const urls = [];

  const add = (url) => {
    if (!url || url.indexOf('about:') === 0) return;
    if (urls.indexOf(url) === -1 && urls.length < 12) urls.push(url);
  };

  /* A browser that runs expressions in the top document only (Firefox) has
   * one frame to offer: All frames, which is the top document. */
  if (!Page.can.frames) {
    state.frames = [''];
    state.frameFilter = '';
    renderFrames();
    done();
    return;
  }

  Page.documentUrls((documents) => {
    documents.forEach(add);
    Page.eval(`(${frameScan.toString()})()`, (result) => {
      ((result && result.frames) || []).forEach(add);
      state.frames = [''].concat(urls);
      if (state.frameFilter && state.frames.indexOf(state.frameFilter) === -1) {
        state.frameFilter = '';
      }
      renderFrames();
      done();
    });
  });
}

/* Enumerates hosts in every frame and merges them into one list. */
function scanHosts(done) {
  const frames = state.frames;
  const expression = `(${hostScan.toString()})(${JSON.stringify(state.dataProp)},${JSON.stringify(state.defProp)})`;
  const collected = [];
  let hints = [];
  let truncated = false;
  let i = 0;

  function step() {
    if (i >= frames.length) { finish(); return; }
    const frame = frames[i];
    evalOnInspectedPage(frame, expression, (result) => {
      if (result && result.ok) {
        (result.hosts || []).forEach((host, local) => {
          collected.push({
            index: collected.length,
            label: host.label,
            tag: host.tag || '',
            cls: host.cls || '',
            attrs: host.attrs || {},
            key: host.key || '',
            frame,
            local,
            dataLen: host.dataLen,
            defLen: host.defLen,
            top: host.top,
            script: typeof host.script === 'boolean' ? host.script : undefined
          });
        });
        if (result.truncated) truncated = true;
        if (!hints.length && result.hints && result.hints.length) hints = result.hints;
      }
      i++;
      step();
    });
  }

  function finish() {
    const changed = signature(collected) !== signature(state.hosts);
    /* While the page lists nothing (loading, re-rendering) the host last
     * selected is remembered, so the script that comes back is recognised. */
    const before = state.hosts.length ? state.hosts : (state.remembered ? [state.remembered] : []);
    const { index, lost } = reconcileSelection(before, state.hosts.length ? state.selected : 0, collected,
      { showNested: state.showNested });

    if (changed) feed.clear(); // indices may have shifted
    state.hosts = collected;
    state.hints = hints;
    state.truncated = truncated;
    state.selected = index;
    if (collected[index]) state.remembered = collected[index];

    renderTargets();
    /* A different script is selected now: tabs must start afresh, not carry
     * the old payload, marks and history over to it. */
    if (lost) notify('selection'); else if (changed) notify('hosts');
    done();
  }

  step();
}

function refresh(done) {
  /* A loaded session is a file: there is nothing on the page to look for. */
  if (state.session) { (done || (() => {}))(); return; }
  discoverFrames(() => scanHosts(() => (done || (() => {}))()));
}

const rescan = createPoller({ ms: 5000, canRun: () => state.visible && !state.session, task: refresh });

/* ---------------------------------------------------------- rendering */

function visibleHosts() {
  if (state.session) return state.hosts;
  const inFrame = state.hosts.filter((host) => !state.frameFilter || host.frame === state.frameFilter);
  return state.showNested ? inFrame : scriptHosts(inFrame);
}

/* What the picker leaves out while Embedded scripts is off, in the frame shown:
 * nested hosts that are whole OmniScripts, and the others (element components
 * and repeats of a script already listed). Nothing is left out with it on. */
function hiddenCounts() {
  if (state.session || state.showNested) return { scripts: 0, others: 0 };
  const inFrame = state.hosts.filter((host) => !state.frameFilter || host.frame === state.frameFilter);
  return hiddenHostCounts(inFrame);
}

function nestedCount() {
  return hiddenCounts().scripts;
}

function elementHostCount() {
  return hiddenCounts().others;
}

function renderTargets() {
  if (!el.target) return;
  if (document.activeElement === el.target) { state.dirty.target = true; return; }

  const hosts = visibleHosts();
  /* Must include each host's index, not just its label/frame: a hidden
   * nested host appearing or disappearing elsewhere in the scan shifts every
   * later host's global index (see scanHosts) without changing this list's
   * labels or frames. Skipping the rebuild here would leave stale
   * option.value attributes in the DOM — clicking one would then select
   * whatever host now sits at that old index, not the one on screen. */
  const sig = `${hosts.map((host) => `${host.index}:${host.key}:${host.label}@${host.frame}${host.caption || ''}`).join('|')}#${state.selected}`;
  if (sig === el.target.dataset.sig) return;
  el.target.dataset.sig = sig;
  el.target.textContent = '';

  if (!hosts.length) {
    const none = document.createElement('option');
    none.textContent = 'no OmniScript found';
    el.target.appendChild(none);
    el.target.disabled = true;
    return;
  }

  el.target.disabled = hosts.length < 2;
  const multiFrame = state.frames.length > 1;
  /* With Embedded scripts on, one script's hosts share a key; the element name
   * tells them apart. */
  const keyCount = {};
  hosts.forEach((host) => { if (host.key) keyCount[host.key] = (keyCount[host.key] || 0) + 1; });
  hosts.forEach((host) => {
    const option = document.createElement('option');
    option.value = String(host.index);
    if (host.session) {
      option.textContent = host.caption;
      option.title = `${host.caption}\nRead from a debug bundle, not from the page.\ndata ${formatBytes(host.dataLen)} · definition ${host.defLen ? formatBytes(host.defLen) : 'none'}`;
      el.target.appendChild(option);
      return;
    }
    option.textContent = (host.key ? host.key + (keyCount[host.key] > 1 ? '  ·  ' + host.label : '') : host.label) +
      (multiFrame && host.frame ? '  ·  ' + shortFrame(host.frame) : '') +
      (host.top ? '' : host.script === false ? '  · component' : '  · embedded') +
      (host.defLen ? '' : '  · data only');
    option.title = (host.key ? host.label + '\n' : '') + (host.frame || 'top frame') +
      '\n' + (host.top ? 'Top-level OmniScript' : host.script === false ? 'A component of another script' : 'Embedded in another OmniScript') +
      '\ndata ' + formatBytes(host.dataLen) + ' · definition ' + (host.defLen ? formatBytes(host.defLen) : 'none');
    el.target.appendChild(option);
  });
  el.target.value = String(state.selected);
}

function renderFrames() {
  if (!el.frame) return;
  if (document.activeElement === el.frame) { state.dirty.frame = true; return; }

  const sig = state.frames.join('|');
  if (sig !== el.frame.dataset.sig) {
    el.frame.dataset.sig = sig;
    el.frame.textContent = '';
    state.frames.forEach((url) => {
      const option = document.createElement('option');
      option.value = url;
      option.textContent = url ? shortFrame(url) : 'All frames';
      option.title = url || 'Every document on the page';
      el.frame.appendChild(option);
    });
    el.frame.disabled = state.frames.length < 2;
  }
  el.frame.value = state.frameFilter;
}

/* ------------------------------------------------------------- public */

function selected() {
  return state.hosts[state.selected] || null;
}

/* Every read goes through the shared feed: the page is asked with the
 * signature of what we already hold and answers "unchanged" instead of the
 * string. opts.maxAge (ms) skips the page altogether when the same value was
 * read that recently, e.g. by the other tab. opts.peek = { prop, field } asks
 * for one field of another property in the same round trip; callback gets it
 * as a third argument. opts.full sends no signature, so the page returns the
 * whole string: a manual Refresh never trusts the hash. */
const feed = createPayloadFeed();

function feedKey(host, which) {
  return `${host.frame}\u0000${host.local}\u0000${state.dataProp}\u0000${state.defProp}\u0000${which}`;
}

function fetchProperty(which, callback, opts = {}) {
  const host = selected();
  if (!host) { callback(null, null); return; }

  if (state.session) { answerFromSession(which, callback, opts.peek || null); return; }

  const key = feedKey(host, which);
  const held = opts.full ? null : feed.get(key);
  const peek = opts.peek || null;

  if (held && opts.maxAge && feed.fresh(key, opts.maxAge, !!peek)) {
    callback(held.value, null, held.peek);
    return;
  }

  const expression = `(${hostFetch.toString()})(` +
    `${JSON.stringify(state.dataProp)},` +
    `${JSON.stringify(state.defProp)},` +
    `${JSON.stringify(host.local)},` +
    `${JSON.stringify(which)},` +
    `${JSON.stringify(held ? held.sig : '')},` +
    `${peek ? JSON.stringify(peek.prop) : 'null'},${peek ? JSON.stringify(peek.field) : 'null'},` +
    `${JSON.stringify(host.label)},${JSON.stringify(host.key || '')})`;

  evalOnInspectedPage(host.frame, expression, (result, exception) => {
    if (exception || !result || !result.ok) { callback(null, exception || result); return; }
    /* Host count moved under us: re-enumerate rather than keep reading an
     * index that now points at something else. */
    if (result.missing || (result.label !== undefined && result.label !== host.label)) { feed.clear(); refresh(() => callback(null, null)); return; }

    if (result.unchanged) {
      /* The entry can be gone by now (a rescan, new properties or a
       * navigation cleared the feed): there is nothing to answer "unchanged"
       * with, so ask once more for the whole string. */
      const current = feed.get(key);
      if (!current) {
        if (!opts.full) fetchProperty(which, callback, { ...opts, full: true });
        else callback(null, null);
        return;
      }
      feed.touch(key, result.peek);
      callback(current.value, null, result.peek !== undefined ? result.peek : current.peek);
      return;
    }
    if (typeof result.value === 'string') {
      feed.put(key, { value: result.value, sig: result.sig, peek: result.peek });
    } else {
      feed.drop(key);
    }
    callback(result.value, null, result.peek);
  });
}

/* A loaded session answers from its bundle, never from the page. The answer
 * is asynchronous like the page's, so callers cannot tell the difference. The
 * third argument is the step (asIndex) when it was asked for. */
function answerFromSession(which, callback, peek) {
  const { bundle } = state.session;
  const value = sessionAnswer(bundle, which, { data: state.dataProp, def: state.defProp });
  const index = peek ? sessionAsIndex(bundle) : undefined;
  Promise.resolve().then(() => callback(value, null, index));
}

/* Load a debug bundle in place of the page: one picker entry, no scanning, no
 * polling. What was on the top bar is kept for exitSession. Tabs are told it
 * is a new selection, so each starts afresh on the bundle. */
function enterSession(bundle, name) {
  if (!state.session) {
    state.session = {
      bundle, name,
      live: {
        hosts: state.hosts, selected: state.selected, remembered: state.remembered, frames: state.frames,
        frameFilter: state.frameFilter, truncated: state.truncated, hints: state.hints
      }
    };
  }
  state.session.bundle = bundle;
  state.session.name = name;
  rescan.stop();
  feed.clear();
  const host = sessionHost(bundle, name);
  Object.assign(state, {
    hosts: [host], selected: 0, remembered: host, frameFilter: '', truncated: false, hints: []
  });
  paintSessionControls();
  if (el.target) el.target.dataset.sig = '';
  renderTargets();
  notify('selection');
}

/* Back to the page: what the top bar held is restored, then looked at again
 * in the background, and the tabs read the page afresh. */
function exitSession() {
  if (!state.session) return;
  const { live } = state.session;
  state.session = null;
  Object.assign(state, live);
  feed.clear();
  paintSessionControls();
  if (el.target) el.target.dataset.sig = '';
  renderTargets();
  renderFrames();
  notify('selection');
  refresh(() => {});
  rescan.start();
}

/* The Frame and Embedded scripts controls mean nothing for a file. */
function paintSessionControls() {
  const loaded = !!state.session;
  if (el.frame) el.frame.disabled = loaded || state.frames.length < 2;
  if (el.nested) el.nested.disabled = loaded;
}

/* The origin of the inspected page itself (the top document), for building a
 * link to the org. '' when it cannot be read. */
function pageOrigin(callback) {
  if (state.session) { callback(''); return; }
  Page.eval('location.origin', (result, exception) => {
    callback(!exception && typeof result === 'string' ? result : '');
  });
}

/* The path of the inspected page's address (no query, no fragment), for
 * telling a Lightning app by name. '' when it cannot be read. */
function pagePath(callback) {
  if (state.session) { callback(''); return; }
  Page.eval('location.pathname', (result, exception) => {
    callback(!exception && typeof result === 'string' ? result : '');
  });
}

function listProps(callback) {
  const host = selected();
  if (!host || state.session) { callback([]); return; }
  const expression = `(${hostProps.toString()})(${JSON.stringify(host.local)},${JSON.stringify(state.defProp)},` +
    `${JSON.stringify(host.label)},${JSON.stringify(host.key || '')})`;
  evalOnInspectedPage(host.frame, expression, (result) => {
    if (result && result.missing) { feed.clear(); refresh(() => callback([])); return; }
    callback(result && result.ok ? result.props : []);
  });
}

/* Outline (or clear the outline of) a script element on the page. The
 * callback receives whether the element was found. */
function highlight(element, show, callback) {
  const host = selected();
  if (!host || state.session) { callback(false); return; }
  const expression = `(${hostHighlight.toString()})(${JSON.stringify(host.local)},` +
    `${JSON.stringify(element.lwcId || '')},${JSON.stringify(element.name || '')},${show ? 'true' : 'false'},` +
    `${JSON.stringify(state.defProp)},${JSON.stringify(host.label)},${JSON.stringify(host.key || '')})`;
  evalOnInspectedPage(host.frame, expression, (result) => {
    if (result && result.missing) { feed.clear(); refresh(() => callback(false)); return; }
    callback(!!(result && result.ok && result.found));
  });
}

/* The origin of the document the selected script runs in: the one a test call
 * is sent from, and the one its model request must have come from. '' when it
 * cannot be read. (pageOrigin is the top document's, for links to the org.) */
function sendOrigin(callback) {
  const host = selected();
  if (state.session) { callback(''); return; }
  evalOnInspectedPage(host ? host.frame : '', 'location.origin', (result, exception) => {
    callback(!exception && typeof result === 'string' ? result : '');
  });
}

/* Sends a composed request from the page (hostSend) and reports how it went:
 * callback({ ok, status, text, truncated, ms, error?, gaveUp? }) once the page
 * has the answer. After 60 s without one the panel stops waiting: the page is
 * told to forget the send (nothing of the answer is kept there), and the
 * callback gets gaveUp, since the call itself may still be running. A loaded
 * session has no page to send through. The frame is the selected script's, so
 * the request goes out from the document the script runs in. */
function send(request, callback) {
  const host = selected();
  if (state.session) { callback({ ok: false, status: 0, error: 'Not available while a bundle is open' }); return; }
  const token = `s${++sendSeq}-${Date.now().toString(36)}`;
  const frame = host ? host.frame : '';
  const started = `(${hostSend.toString()})(${JSON.stringify(request)},${JSON.stringify(token)})`;
  evalOnInspectedPage(frame, started, (result, exception) => {
    if (exception || !result || !result.ok) {
      callback({ ok: false, status: 0, error: (result && result.error) || 'The page could not start the call' });
      return;
    }
    const poll = (tries) => {
      evalOnInspectedPage(frame, `(${hostSendResult.toString()})(${JSON.stringify(token)})`, (outcome) => {
        if (outcome && outcome.done) {
          callback({
            ok: !!outcome.ok, status: outcome.status || 0, error: outcome.error, text: typeof outcome.text === 'string' ? outcome.text : '',
            truncated: outcome.truncated === true, ms: typeof outcome.ms === 'number' ? outcome.ms : undefined
          });
          return;
        }
        if (tries <= 0) {
          evalOnInspectedPage(frame, `(${hostSendResult.toString()})(${JSON.stringify(token)},true)`, () => {});
          callback({ ok: false, status: 0, gaveUp: true, error: 'no answer within 60 s; the call may still be running on the server' });
          return;
        }
        setTimeout(() => poll(tries - 1), 250);
      });
    };
    poll(240);
  });
}

/* Asks the selected script to go back `hops` steps (hostNavigate). The callback
 * receives { ok, how, detail }. */
function navigate(hops, callback) {
  const host = selected();
  if (!host || state.session) { callback({ ok: false, how: 'none', detail: 'no script' }); return; }
  const expression = `(${hostNavigate.toString()})(${JSON.stringify(host.local)},${JSON.stringify(hops)})`;
  evalOnInspectedPage(host.frame, expression, (result) => {
    callback(result && result.ok ? result : { ok: false, how: 'none', detail: (result && result.detail) || 'no answer' });
  });
}

/* After the list of hosts narrows or widens: keep the selected script when it
 * is still listed, otherwise move to the first one. Only the second case is a
 * new 'selection' that tabs must reset for; changing the list alone ('list')
 * leaves their state, pins and history alone. */
function keepOrReselect() {
  const hosts = visibleHosts();
  state.reselected = false;
  if (hosts.length && !hosts.some((host) => host.index === state.selected)) {
    state.selected = hosts[0].index;
    state.reselected = true;
  }
}

function mount(nodes) {
  el.target = nodes.target;
  el.frame = nodes.frame;
  el.nested = nodes.nested;

  /* Firefox reads the top document only: there is no frame to pick. */
  if (el.frame && !Page.can.frames) {
    const field = el.frame.closest('label') || el.frame;
    field.hidden = true;
  }

  /* The box (restored by the caller) is the truth, as for the tabs' toggles. */
  if (el.nested) state.showNested = el.nested.checked;

  if (el.nested) {
    el.nested.addEventListener('change', () => {
      state.showNested = el.nested.checked;
      Settings.set('showNested', state.showNested);
      el.target.dataset.sig = '';
      keepOrReselect();
      renderTargets();
      notify(state.reselected ? 'selection' : 'list');
    });
  }

  el.target.addEventListener('change', () => {
    state.selected = Number(el.target.value) || 0;
    notify('selection');
  });

  el.target.addEventListener('blur', () => {
    if (!state.dirty.target) return;
    state.dirty.target = false;
    renderTargets();
  });

  el.frame.addEventListener('change', () => {
    state.frameFilter = el.frame.value;
    keepOrReselect();
    renderTargets();
    notify(state.reselected ? 'selection' : 'list');
  });

  el.frame.addEventListener('blur', () => {
    if (!state.dirty.frame) return;
    state.dirty.frame = false;
    renderFrames();
  });

  Page.onNavigated(() => {
    /* The file stays; the page behind it starts over, as it would have. */
    if (state.session) {
      state.session.live = { hosts: [], selected: 0, remembered: null, frames: [''], frameFilter: '', truncated: false, hints: [] };
      return;
    }
    state.frames = [''];
    state.frameFilter = '';
    state.hosts = [];
    state.selected = 0;
    state.remembered = null;
    feed.clear();
    refresh(() => notify('navigated'));
  });
}

export const Targets = {
  mount,
  refresh,
  enterSession,
  exitSession,
  /* The loaded bundle's file name, or null while the page is read. */
  sessionName: () => (state.session ? state.session.name : null),
  fetch: fetchProperty,
  listProps,
  pageOrigin,
  sendOrigin,
  pagePath,
  highlight,
  navigate,
  send,
  evalOn: evalOnInspectedPage,
  selected,
  props: () => ({ data: state.dataProp, def: state.defProp }),
  hosts: () => state.hosts,
  visibleHosts,
  nestedCount,
  elementHostCount,
  truncated: () => state.truncated,
  frames: () => state.frames,
  hints: () => state.hints,
  frameLabel: shortFrame,
  subscribe: (fn) => listeners.push(fn),
  setVisible: (visible) => {
    state.visible = visible;
    if (visible) rescan.now(); else rescan.stop();
  },
  /* Before the first scan: adopt the current property names without rescanning. */
  initProps: (dataProp, defProp) => {
    if (dataProp) state.dataProp = dataProp;
    if (defProp) state.defProp = defProp;
  },
  setProps: (dataProp, defProp) => {
    if (dataProp) state.dataProp = dataProp;
    if (defProp) state.defProp = defProp;
    feed.clear();
    refresh(() => notify('props'));
  },
  start: (done) => refresh(() => { rescan.start(); (done || (() => {}))(); })
};
