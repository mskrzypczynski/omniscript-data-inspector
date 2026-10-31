'use strict';

/* Open in Designer: from what the panel knows about the selected script (its
 * definition, its header, the attributes of its host element, the address of
 * the inspected page) to the link that opens that script in the designer.
 * Nothing is sent anywhere; the panel only builds an address and the user
 * opens it.
 *
 * The routes and the host mapping come from the shared kit
 * (kit/core/designer-routes.js, kit/core/org-hosts.js), which OmniStudio
 * Finder uses as well.
 *
 * Pure: no DOM, no chrome.*. */

import { DESIGNER_TEMPLATES } from '../../kit/core/designer-routes.js';
import { lightningHostFor, vfHostFor } from '../../kit/core/org-hosts.js';

/* Core (Lightning-native) OmniStudio keeps the builder on the Lightning
 * domain; the managed packages open their designer through an Aura wrapper
 * (and put the Integration Procedure and DataRaptor designers on Visualforce
 * pages, which the panel has no use for). Only OmniScript links are kept. */
export const BUILTIN_TEMPLATES = {
  native: { osTemplate: DESIGNER_TEMPLATES.native.os },
  managed: { osTemplate: DESIGNER_TEMPLATES.managed.os }
};

/* What each flavour's designer is called, for the button's tooltip. */
const DESIGNER_NAMES = {
  native: 'OmniStudio Builder',
  managed: 'OmniScript Designer'
};

/* The managed packages a host element's tag or class can start with. */
const MANAGED_NAMESPACES = ['vlocity_cmt', 'vlocity_ins', 'vlocity_ps', 'vlocity_hins'];

/* The calls and the definition's own keys name the same packages as the host
 * tag. `omnistudio` is a different case: it is the namespace of the managed
 * OmniStudio package, but core OmniStudio also runs Apex and keys under it, so
 * on its own it says nothing. It counts only together with a second signal
 * (see resolveFlavour). */
const CALL_NAMESPACES = MANAGED_NAMESPACES;
const OMNISTUDIO = 'omnistudio';

/* The namespace Designer (managed) uses when none is typed and none is seen. */
export const DEFAULT_NAMESPACE = OMNISTUDIO;

/* The namespaces the Settings dialog offers, and the values it accepts. */
export const NAMESPACE_CHOICES = Object.freeze(['vlocity_cmt', 'vlocity_ins', 'vlocity_ps', OMNISTUDIO]);
export const DESIGNER_MODES = Object.freeze(['auto', 'native', 'managed']);

/* What Settings calls each mode on its buttons; the list of settings that
 * differ uses the same words, not the stored values. */
export const DESIGNER_MODE_LABELS = Object.freeze({ auto: 'Auto', native: 'Builder (core)', managed: 'Designer (managed)' });

/* A namespace typed in Settings goes into the address, so only what a
 * Salesforce namespace can be gets through: a letter, then letters, digits and
 * single underscores, at most 15 characters, not ending in one. */
export function normalizeNamespace(text) {
  const name = String(text == null ? '' : text).trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,14}$/.test(name) && !name.includes('__') && !name.endsWith('_') ? name : '';
}

/* The keys that can hold a script's Id, in the order they are tried, and the
 * host attributes the page side hands over. */
const ID_KEYS = ['sOmniScriptId', 'omniProcessId', 'OmniProcessId', 'omniScriptId', 'Id'];
const HOST_ID_ATTRIBUTES = ['data-omni-id', 'omniscript-id'];

/* A Salesforce record Id: 15 or 18 letters and digits. Anything else in one of
 * those keys is not an Id the panel can open. */
const RECORD_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

function idIn(source) {
  if (!isObject(source)) return '';
  for (const key of ID_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && RECORD_ID.test(value.trim())) return value.trim();
  }
  return '';
}

/* The script's Id, or '' when none of the sources has one: the definition's
 * root, then the header, then the host element's attributes. */
export function scriptIdFrom(definition, header, hostAttributes) {
  const fromAttributes = () => {
    if (!isObject(hostAttributes)) return '';
    for (const name of HOST_ID_ATTRIBUTES) {
      const value = hostAttributes[name];
      if (typeof value === 'string' && RECORD_ID.test(value.trim())) return value.trim();
    }
    return '';
  };
  return idIn(definition) || idIn(header) || fromAttributes();
}

/* Which package the script runs on, from its host element's tag and class:
 * { flavour: 'managed', namespace } when either starts with a managed
 * namespace, else { flavour: 'native', namespace: '' }. */
export function flavourOf(tag, className) {
  const names = [String(tag || '')].concat(String(className || '').split(/\s+/)).map((name) => name.toLowerCase());
  for (const name of names) {
    const namespace = MANAGED_NAMESPACES.find((prefix) => name.startsWith(prefix));
    if (namespace) return { flavour: 'managed', namespace };
  }
  return { flavour: 'native', namespace: '' };
}

/* The flavour from every signal there is, strongest first: the host element's
 * tag and class, then the namespace in the definition's and header's field
 * names, then the one the captured calls ran on. A wrapper host without a
 * `vlocity_*` tag would otherwise be taken for native. */
export function flavourFor(host, definition, header, calls) {
  const { flavour, namespace } = resolveFlavour({ host, definition, header, calls });
  return { flavour, namespace };
}

/* Is the host element, or the page it sits on, the managed OmniStudio
 * package's? The managed package renders its components in the `omnistudio`
 * namespace (an `omnistudio-` tag, an `omnistudio__` Lightning app in the
 * address); core OmniStudio renders under `c-` or `runtime_omnistudio-`. */
function omnistudioSurface(host, pagePath) {
  if (String(host && host.tag || '').toLowerCase().startsWith('omnistudio-')) return 'host';
  if (/omnistudio__/i.test(String(pagePath || ''))) return 'page';
  return '';
}

/* The designer setting's own shape: a mode and, for managed, a namespace. */
function settingOf(setting) {
  const mode = setting && DESIGNER_MODES.includes(setting.mode) ? setting.mode : 'auto';
  return { mode, namespace: normalizeNamespace(setting && setting.namespace) };
}

/* The part of a definition or header that can name a package: its top-level
 * field names with a prefix (`vlocity_ins__X__c`). Kept instead of the whole
 * record so a page's worth of them can be held in memory cheaply. */
export function namespacedKeysOf(record) {
  const stub = {};
  if (!isObject(record)) return stub;
  Object.keys(record).forEach((key) => { if (key.indexOf('__') > 0) stub[key] = 1; });
  return stub;
}

/* Which designer the ORG uses, and why: { flavour, namespace, why }. The
 * flavour belongs to the origin, never to one script: a script wrapped in a
 * custom `c-` component looks like core while its sibling's host carries the
 * package prefix, and both are in the same org. So every signal from the
 * page counts, and any managed one wins for all its scripts.
 *
 * signals: {
 *   hosts: [{ tag, cls }]   every script host element on the page,
 *   definitions: [record]   every definition and header read (namespacedKeysOf is enough),
 *   calls: [call]           every captured call,
 *   pagePath                the path of the inspected page's address,
 *   setting                 { mode, namespace } from Settings,
 *   previous                what this origin was last taken for, so that it never
 *                           flips back to core once managed was seen
 * }
 * The decision table, in order:
 *   1. The setting: native, or managed (with its namespace, else the one seen,
 *      else omnistudio).
 *   2. Auto: a `vlocity_*` host tag or class on the page, then `vlocity_*` field
 *      names in a definition, then `vlocity_*` calls.
 *   3. Auto: the `omnistudio` namespace in the calls or a definition's keys,
 *      together with an `omnistudio-` host tag or an `omnistudio__` page address.
 *   4. Auto: what the origin was taken for before, if that was managed.
 *   5. Otherwise core.
 * Auto is a best guess; the setting overrides it. */
export function flavourForOrigin({ hosts, definitions, calls, pagePath, setting, previous } = {}) {
  const chosen = settingOf(setting);
  if (chosen.mode === 'native') return { flavour: 'native', namespace: '', why: 'set in Settings' };

  const hostList = (Array.isArray(hosts) ? hosts : []).filter(isObject);
  const defList = Array.isArray(definitions) ? definitions : [];
  const first = (items, pick) => { for (const item of items) { const found = pick(item); if (found) return found; } return ''; };

  const hostNamespace = first(hostList, (host) => flavourOf(host.tag, host.cls).namespace);
  const keysNamespace = first(defList, (record) => namespaceFromKeys(record));
  const callsNamespace = namespaceFromCalls(calls);
  const omniSeen = first(defList, (record) => namespaceFromKeys(record, [OMNISTUDIO])) || namespaceFromCalls(calls, [OMNISTUDIO]);
  const surface = hostList.some((host) => omnistudioSurface(host, '') === 'host') ? 'host' : omnistudioSurface(null, pagePath);

  const auto = (() => {
    if (hostNamespace) return { flavour: 'managed', namespace: hostNamespace, why: 'from a host element on this page' };
    if (keysNamespace) return { flavour: 'managed', namespace: keysNamespace, why: 'from a definition on this page' };
    if (callsNamespace) return { flavour: 'managed', namespace: callsNamespace, why: 'from a call on this page' };
    if (omniSeen && surface) {
      return {
        flavour: 'managed', namespace: OMNISTUDIO,
        why: `from the omnistudio namespace and the ${surface === 'host' ? 'host element' : 'page address'}`
      };
    }
    if (previous && previous.flavour === 'managed' && previous.namespace) return { ...previous };
    return { flavour: 'native', namespace: '', why: 'no managed package seen' };
  })();

  if (chosen.mode === 'auto') return auto;
  /* Managed, set in Settings: the namespace typed there, else the one seen,
   * else the default the Settings field suggests. Never the core Builder: the
   * person asked for the managed designer. */
  const namespace = chosen.namespace || auto.namespace || omniSeen;
  if (namespace) return { flavour: 'managed', namespace, why: 'set in Settings' };
  return { flavour: 'managed', namespace: DEFAULT_NAMESPACE, why: 'set in Settings, with the default namespace' };
}

/* The same decision for one script alone (its own host, definition and header,
 * and the calls): the org-wide one with a single host. */
export function resolveFlavour({ host, definition, header, calls, pagePath, setting, previous } = {}) {
  return flavourForOrigin({
    hosts: host ? [host] : [], definitions: [definition, header], calls, pagePath, setting, previous
  });
}

/* The namespaces the signals name, for the Settings field's suggestions: the
 * ones this page shows first, then the rest of the usual ones. */
export function namespaceSuggestions({ hosts, definitions, calls } = {}) {
  const seen = [];
  const add = (name) => { if (name && !seen.includes(name)) seen.push(name); };
  (Array.isArray(hosts) ? hosts : []).forEach((host) => add(isObject(host) ? flavourOf(host.tag, host.cls).namespace : ''));
  const defs = Array.isArray(definitions) ? definitions : [];
  defs.forEach((record) => add(namespaceFromKeys(record)));
  add(namespaceFromCalls(calls));
  defs.forEach((record) => add(namespaceFromKeys(record, [OMNISTUDIO])));
  add(namespaceFromCalls(calls, [OMNISTUDIO]));
  return seen.concat(NAMESPACE_CHOICES.filter((name) => !seen.includes(name)));
}

/* The namespace a package ships Apex under, as a call or a key spells it, if
 * it is one of the known managed ones ('' otherwise). */
function knownNamespace(text, names = CALL_NAMESPACES) {
  const name = String(text || '').trim().toLowerCase();
  return names.find((namespace) => namespace === name) || '';
}

/* Which managed package the captured calls ran on: the namespace most calls
 * name, from the call's own `namespace` or the prefix of its class
 * (`vlocity_ins.IntegrationProcedureService`). '' when no call names a known
 * one. A wrapper host without a `vlocity_*` tag still reaches Apex through the
 * package, so this is a second signal beside the host element. */
export function namespaceFromCalls(calls, names = CALL_NAMESPACES) {
  if (!Array.isArray(calls)) return '';
  const counts = {};
  for (const call of calls) {
    if (!isObject(call)) continue;
    /* A captured call keeps the decoded request under `action`; a bare
     * { namespace, remoteClass, apexClass } is read the same way. */
    const source = isObject(call.action) ? call.action : call;
    const prefix = (text) => (typeof text === 'string' && text.includes('.') ? text.split('.')[0] : '');
    const found = knownNamespace(source.namespace, names) || knownNamespace(prefix(source.remoteClass), names) || knownNamespace(prefix(source.apexClass), names);
    if (found) counts[found] = (counts[found] || 0) + 1;
  }
  let best = '';
  for (const namespace of Object.keys(counts)) {
    if (!best || counts[namespace] > counts[best]) best = namespace;
  }
  return best;
}

/* The org a host belongs to: its My Domain label, whichever of the org's
 * hosts it is (Lightning, classic, Visualforce with a `--package` suffix). '' for
 * a host that is not an org's own. */
function orgLabelOf(hostname) {
  const host = lightningHostFor(String(hostname || '').toLowerCase());
  const match = host.match(/^([^.]+)\.(?:[^.]+\.)*?(?:lightning\.force\.com|my\.salesforce\.com|my\.salesforce-setup\.com|vf\.force\.com)$/);
  return match ? match[1] : '';
}

/* The captured calls that went to the org of the inspected page. Unless
 * Clear on reload is ticked, the list can hold calls of another org; they say
 * nothing about this one's package. A call whose address cannot be told (no `url`, or
 * one that is not absolute) is kept, and so is every call when the page is not
 * an org's own, since there is nothing to compare with. */
export function callsForOrigin(calls, pageOrigin) {
  if (!Array.isArray(calls)) return [];
  const pageLabel = (() => {
    try { return orgLabelOf(new URL(String(pageOrigin || '')).hostname); } catch { return ''; }
  })();
  if (!pageLabel) return calls;
  return calls.filter((call) => {
    const url = isObject(call) ? call.url : '';
    if (typeof url !== 'string' || !url) return true;
    try {
      const callLabel = orgLabelOf(new URL(url).hostname);
      return !callLabel || callLabel === pageLabel;
    } catch { return true; }
  });
}

/* The managed namespace a record's own field names carry
 * (`vlocity_ins__OmniScriptId__c`), looking only at its top-level keys. '' for
 * a native record, whose keys have no package prefix. */
export function namespaceFromKeys(record, names = CALL_NAMESPACES) {
  if (!isObject(record)) return '';
  for (const key of Object.keys(record)) {
    const at = key.indexOf('__');
    const found = at > 0 ? knownNamespace(key.slice(0, at), names) : '';
    if (found) return found;
  }
  return '';
}

/* Hosts a designer can be opened on. */
const ORG_HOST = /\.(lightning\.force\.com|my\.salesforce\.com|my\.salesforce-setup\.com)$/;

/* The origin to build the link on, from the inspected page's origin: the
 * Lightning host, even when the page is a Visualforce one. null for a page
 * that is not an org's own (an Experience site has no designer). */
export function designerOrigin(pageOrigin) {
  let url;
  try { url = new URL(String(pageOrigin || '')); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  const host = lightningHostFor(url.hostname.toLowerCase());
  return ORG_HOST.test(host) ? `https://${host}` : null;
}

/* Fill a template. {id} is escaped; {ns}, {vfhost} and {now} build the address
 * itself and go in raw. */
export function fillTemplate(template, { id, namespace = '', uiHost = '', now = 0 }) {
  const vfHost = vfHostFor(uiHost, namespace) || uiHost;
  return template
    .replace(/\{id\}/gi, encodeURIComponent(id))
    .replace(/\{ns\}/gi, namespace)
    .replace(/\{vfhost\}/gi, vfHost)
    .replace(/\{now\}/gi, String(now));
}

/* Everything together. input: { definition, header, host: { tag, cls, attrs },
 * pageOrigin, pagePath (the path of the inspected page's address), hosts and
 * definitions (the others on the page), calls (the captured calls), previous
 * (what flavourForOrigin took the origin for before), setting ({ mode, namespace } from
 * Settings), now }. Returns { url, id, flavour, namespace, designer, why } or
 * null when the script has no Id or the page is not an org's. */
export function designerLinkFor({ definition, header, host, hosts, definitions, pageOrigin, pagePath, calls, setting, previous, now = Date.now() }) {
  const id = scriptIdFrom(definition, header, host && host.attrs);
  if (!id) return null;
  const origin = designerOrigin(pageOrigin);
  if (!origin) return null;
  const { flavour, namespace, why } = flavourForOrigin({
    hosts: [...(hosts || []), ...(host ? [host] : [])],
    definitions: [...(definitions || []), definition, header], calls: callsForOrigin(calls, pageOrigin), pagePath, setting, previous
  });
  const path = fillTemplate(BUILTIN_TEMPLATES[flavour].osTemplate, {
    id, namespace, uiHost: origin.replace(/^https:\/\//, ''), now
  });
  return { url: origin + path, id, flavour, namespace, designer: DESIGNER_NAMES[flavour], why };
}

/* The button's tooltip: names the designer, the flavour and why it was chosen. */
export function designerTitle(link) {
  const kind = link.flavour === 'managed' ? `managed package ${link.namespace}` : 'core OmniStudio';
  const why = link.why ? `, ${link.why}` : '';
  return `Open this OmniScript in the ${link.designer} (${kind}${why}), in a new tab`;
}
