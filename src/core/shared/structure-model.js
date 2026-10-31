'use strict';

/* Structure-tab domain model: turning an OmniScript definition (plus its
 * optional scriptHeaderDef header) into a flat list of elements, and reading
 * each element's current value out of the live data JSON.
 *
 * Pure by contract — same input, same output, no DOM, no chrome.*. The
 * Structure tab (src/ui/structure-tab.js) owns the state, the DOM writing,
 * and the polling; this module only ever answers "what does this definition
 * say" and "what is this element's value right now".
 */

import { maskValues, MASK_STRING } from './mask.js';

const CHILD_KEYS = ['eleArray', 'children', 'childrenElements'];

/* Keys of a definition node that can hold what a person typed rather than how
 * the script was designed: the runtime keeps an element's answer in `response`
 * on a loaded script, and a default is a value too. */
const ANSWER_KEYS = new Set(['response', 'defaultValue']);

/* A copy of a definition (or any part of one) with the answers masked, for
 * anything that leaves the panel while Mask values is on: strings and numbers
 * under `response` and `defaultValue` become placeholders, every key stays. */
export function maskDefinitionValues(value, depth = 0) {
  if (!value || typeof value !== 'object') return value;
  /* Too deep to walk: a placeholder, never the branch as it is (it may hold answers). */
  if (depth > 200) return MASK_STRING;
  if (Array.isArray(value)) return value.map((item) => maskDefinitionValues(item, depth + 1));
  const out = {};
  /* defineProperty, not assignment: a "__proto__" key from JSON.parse is an own
   * key, and assigning it would set the prototype and drop the entry. */
  Object.keys(value).forEach((key) => {
    const masked = ANSWER_KEYS.has(key) ? maskValues(value[key]) : maskDefinitionValues(value[key], depth + 1);
    Object.defineProperty(out, key, { value: masked, enumerable: true, writable: true, configurable: true });
  });
  return out;
}

/* A multi-language OmniScript stores every label and Text Block as a custom
 * label *key*; a single-language one stores the text directly on the element.
 * scriptHeaderDef tells us which (bpLang) and holds the key → text map. */
export function makeResolver(header) {
  const labels = (header && header.allCustomLabels) || {};
  return {
    multiLang: !!header && header.bpLang === 'Multi-Language',
    /* Only trust "missing" checks when we actually have the label map. */
    hasLabels: Object.keys(labels).length > 0,
    /* Is the key present in the map at all? (Absence is the breakage.) */
    has(key) {
      return !!key && Object.prototype.hasOwnProperty.call(labels, key);
    },
    /* Resolve a key to its text; '' when absent, tolerant of value shape. */
    key(key) {
      if (!key) return '';
      const value = labels[key];
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') return value.value || value.text || value.label || '';
      return '';
    }
  };
}

export function stripHtml(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim();
}

export function resolveText(text, labelResolver) {
  if (!text || typeof text !== 'string') return text || '';
  return (labelResolver.multiLang && labelResolver.key(text)) || text;
}

export function isTextBlock(node) {
  return /text ?block/i.test(node.type || '');
}

/* The human-readable name for an element: its label, or a Text Block's text. */
export function elementLabel(node, propertySet, labelResolver) {
  if (isTextBlock(node)) {
    if (labelResolver.multiLang && propertySet.textKey) {
      const text = labelResolver.key(propertySet.textKey);
      if (text) return stripHtml(text);
    }
    if (typeof propertySet.text === 'string' && propertySet.text) return stripHtml(propertySet.text);
    if (propertySet.textKey) {
      const text = labelResolver.key(propertySet.textKey);
      if (text) return stripHtml(text);
    }
    return '';
  }
  const raw = propertySet.label || '';
  if (!raw) return '';
  return labelResolver.multiLang ? (labelResolver.key(raw) || raw) : raw;
}

/* The custom-label key the element points at, if any (Text Block uses textKey). */
function labelKeyOf(node, propertySet) {
  return isTextBlock(node) ? (propertySet.textKey || propertySet.label || '') : (propertySet.label || '');
}

/* Dependent / dynamic option lists (DataRaptor, SObject, custom) carry no
 * static labels; only manually entered options do. */
export function hasOptionSource(propertySet) {
  const optionSource = propertySet.optionSource;
  return !!(optionSource && typeof optionSource === 'object' && (optionSource.type || optionSource.source));
}

/* propSetMap string properties that hold user-facing text — a custom-label key
 * in a multi-language script, literal text otherwise. Steps carry the whole
 * navigation set; other element types carry a subset. */
const TEXT_PROPS = [
  'label', 'helpText',
  'completeLabel', 'completeMessage',
  'saveLabel', 'saveMessage',
  'cancelLabel', 'cancelMessage',
  'nextLabel', 'previousLabel',
  'failureAbortLabel', 'failureAbortMessage',
  'failureGoBackLabel', 'failureNextLabel', 'inProgressMessage',
  'redirectNextLabel', 'redirectPreviousLabel',
  'postMessage'
];

function humanize(key) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/* Every spot a multi-language OmniScript keeps a custom-label key: the text
 * properties above, a Text Block's text, and each manual choice option. For
 * radio/select options the label key lives in `value` (the option's stored
 * data is in `name`). */
export function translatableKeys(node, propertySet) {
  const out = [];

  if (isTextBlock(node) && typeof propertySet.textKey === 'string' && propertySet.textKey) {
    out.push({ where: 'text', key: propertySet.textKey });
  }

  TEXT_PROPS.forEach((prop) => {
    if (typeof propertySet[prop] === 'string' && propertySet[prop]) out.push({ where: humanize(prop), key: propertySet[prop] });
  });

  if (Array.isArray(propertySet.messages)) {
    propertySet.messages.forEach((message, i) => {
      if (message && typeof message.text === 'string' && message.text && message.active !== false) {
        out.push({ where: `message ${i + 1}`, key: message.text });
      }
    });
  }

  if (Array.isArray(propertySet.options) && !hasOptionSource(propertySet)) {
    propertySet.options.forEach((option) => {
      if (option && typeof option.value === 'string' && option.value) {
        out.push({ where: `option "${option.name != null ? option.name : '?'}"`, key: option.value });
      }
    });
  }

  return out;
}

/* Custom-label keys the element references that are absent from
 * allCustomLabels — a single one breaks a multi-language OmniScript. */
export function missingLabels(node, propertySet, labelResolver) {
  if (!labelResolver.multiLang || !labelResolver.hasLabels) return [];
  return translatableKeys(node, propertySet).filter((entry) => !labelResolver.has(entry.key));
}

/* For a manual radio/select: { storedValue -> option display text }, so the
 * live value can read "US (United States)" instead of just "US". The option's
 * data is in `name`; its label is in `value` (a custom-label key when
 * multi-lang, literal text otherwise). */
export function optionLabelMap(propertySet, labelResolver) {
  if (!Array.isArray(propertySet.options) || !propertySet.options.length || hasOptionSource(propertySet)) return null;

  const map = {};
  let any = false;
  propertySet.options.forEach((option) => {
    if (!option || option.name == null) return;
    const raw = option.value != null ? String(option.value) : '';
    const text = labelResolver.multiLang ? (labelResolver.key(raw) || raw) : raw;
    if (text) { map[String(option.name)] = text; any = true; }
  });
  return any ? map : null;
}

/* Everything the filter should find an element by, lowercased: its name and
 * type, its label, and every custom-label key it uses together with the text
 * that key resolves to — so typing a word from the screen finds the element
 * even in a multi-language script where the label is only a key. */
function searchTextOf(node, propertySet, label, labelKey, labelResolver) {
  const parts = [node.name, node.type, label, labelKey];
  translatableKeys(node, propertySet).forEach((entry) => {
    parts.push(entry.key);
    const resolved = labelResolver.key(entry.key);
    if (resolved) parts.push(stripHtml(resolved));
  });
  return parts.filter(Boolean).join(' ').toLowerCase();
}

/* The custom Lightning web component that draws an element instead of the
 * standard one: propSetMap.lwcComponentOverride (a tag such as c-my-input or a
 * name such as myInput), or lwcOverride in a few scripts. '' for none. */
export function overrideOf(propertySet) {
  const map = propertySet && typeof propertySet === 'object' ? propertySet : {};
  const found = [map.lwcComponentOverride, map.lwcOverride].find((value) => typeof value === 'string' && value.trim());
  return found ? found.trim() : '';
}

export function flatten(definition, header) {
  const out = [];
  const labelMap = (header && header.labelMap) || {};
  const labelResolver = makeResolver(header);
  /* Some definitions hold the same children twice, once in a node's eleArray
   * and again in its children[].eleArray. Per parent, the elements already
   * listed through an earlier child key; a later key skips an identical one.
   * Two siblings that share a name inside one list are both kept. */
  const listed = new Map();
  const listedUnder = (path) => {
    if (!listed.has(path)) listed.set(path, new Set());
    return listed.get(path);
  };

  function visit(node, depth, path, earlier) {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, depth, path, earlier));
      return;
    }
    if (!node || typeof node !== 'object') return;

    const isElement = typeof node.name === 'string' && typeof node.type === 'string';
    let nextDepth = depth;
    let nextPath = path;

    if (isElement) {
      const identity = `${node.type}\u0000${node.name}\u0000${node.indexInParent}\u0000${node.JSONPath || node.jsonPath || ''}`;
      if (earlier && earlier.has(identity)) return;
      listedUnder(path).add(identity);
      const propertySet = node.propSetMap || {};
      const key = `${path}/${node.name}#${out.length}`;
      const showExpr = describeShow(propertySet.show);
      const label = elementLabel(node, propertySet, labelResolver);
      const labelKey = labelKeyOf(node, propertySet);
      const isSetValues = /set ?values/i.test(node.type || '');
      out.push({
        key,
        parentKey: path,
        hasChildren: false, // filled in after the walk
        name: node.name,
        type: node.type,
        label,
        labelKey,
        lwcId: typeof node.lwcId === 'string' ? node.lwcId : '',
        searchText: searchTextOf(node, propertySet, label, labelKey, labelResolver),
        missingLabels: missingLabels(node, propertySet, labelResolver),
        /* Exact location of the value in the data JSON, best available. */
        jsonPath: node.JSONPath || node.jsonPath || labelMap[node.name] || '',
        depth,
        indexInParent: typeof node.indexInParent === 'number' ? node.indexInParent : null,
        /* The runtime sets bShow false on an element whose show rule is
         * currently false. Absent means "no condition", so only an explicit
         * false counts as hidden. */
        shown: node.bShow !== false,
        category: categoryOf(node.type),
        required: propertySet.required === true,
        conditional: hasShowRules(propertySet.show),
        show: propertySet.show || null,
        showExpr,
        remote: propertySet.remoteClass || propertySet.bundle || propertySet.integrationProcedureKey || '',
        override: overrideOf(propertySet),
        isSetValues,
        setValues: isSetValues ? (propertySet.elementValueMap || null) : null,
        optionLabels: optionLabelMap(propertySet, labelResolver),
        validation: describeValidation(node, propertySet, showExpr, labelResolver),
        node
      });
      nextDepth = depth + 1;
      nextPath = key;
    }

    CHILD_KEYS.forEach((childKey) => {
      if (node[childKey]) visit(node[childKey], nextDepth, nextPath, new Set(listedUnder(nextPath)));
    });
  }

  visit(definition, 0, '', null);

  const parentKeysWithChildren = new Set();
  out.forEach((element) => { if (element.parentKey) parentKeysWithChildren.add(element.parentKey); });
  out.forEach((element) => { element.hasChildren = parentKeysWithChildren.has(element.key); });

  return out;
}

/* True when a show value holds at least one rule. A group with no rules, such
 * as { group: { rules: [] } }, shows the element always, so it is not a
 * condition; a shape this code does not know is still counted as one. */
export function hasShowRules(show) {
  if (!show || typeof show !== 'object' || !Object.keys(show).length) return false;
  const node = show.group && typeof show.group === 'object' ? show.group : show;
  const known = Array.isArray(node.rules) || Array.isArray(node.groups);
  if (!known) return true;
  return countRules(node, 0) > 0;
}

function countRules(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return 0;
  let count = 0;
  (node.rules || []).forEach((rule) => {
    if (rule && typeof rule === 'object') {
      count += (rule.group || rule.rules || rule.groups) ? countRules(rule.group || rule, depth + 1) : 1;
    }
  });
  (node.groups || []).forEach((nested) => { count += countRules(nested && nested.group ? nested.group : nested, depth + 1); });
  return count;
}

/* An icon (a name from src/ui/icons.js; `glyph` is its plain-text stand-in) per family of element, so the shape of a script is legible without
 * reading every type name. Order matters: "Text Block" is a display element,
 * not a text input, and "Email Action" is an action, not an email field. */
const CATEGORIES = [
  { key: 'step', icon: 'el-step', glyph: '▤', label: 'Step',
    test: /^\s*step\s*$/i },
  { key: 'error', icon: 'el-error', glyph: '⊘', label: 'Validation / set errors / messaging',
    test: /set ?errors?|validation|messaging/i },
  { key: 'action', icon: 'el-action', glyph: '⚡', label: 'Action',
    test: /action|dataraptor|data mapper|integration|remote|http|calculation|matrix|pdf|docusign|navigate|response|set values|setvalues|post|extract/i },
  { key: 'choice', icon: 'el-choice', glyph: '☑', label: 'Choice',
    test: /checkbox|select|radio|multi|lookup|type ?ahead|toggle|dropdown/i },
  { key: 'display', icon: 'el-text', glyph: '¶', label: 'Display',
    test: /text block|line ?break|image|disclosure|title|link|html|rich/i },
  { key: 'block', icon: 'el-block', glyph: '▦', label: 'Block',
    test: /block|repeat|group/i },
  { key: 'input', icon: 'el-input', glyph: '✎', label: 'Input',
    test: /text|number|currency|date|time|email|phone|password|url|range|file|signature|slider|formula|aggregate/i },
  { key: 'custom', icon: 'code', glyph: '<>', label: 'Custom component',
    test: /custom|lwc|aura|component/i }
];

export function categoryOf(type) {
  return CATEGORIES.find((category) => category.test.test(type || ''))
    || { key: 'other', icon: 'el-other', glyph: '•', label: 'Element' };
}

/* Turns a propSetMap.show group into something readable, e.g.
 * Step1:Email != "" AND (Type = "Business" OR Amount > 1000). Shape varies,
 * so anything unrecognised falls back to the raw tree in the Visibility tab. */
export function describeShow(show) {
  if (!show || typeof show !== 'object') return '';
  return formatGroup(show.group || show, 0);
}

export function formatGroup(group, depth) {
  if (!group || typeof group !== 'object' || depth > 6) return '';
  const operator = group.operator || group.conditionOp || 'AND';
  const parts = [];

  /* A rules[] entry is usually a leaf { field, condition, data }, but the
   * Designer also nests groups straight into rules as { group: {…} } (or as a
   * bare group object). Recurse on those rather than dropping them. */
  (group.rules || []).forEach((rule) => {
    if (rule && typeof rule === 'object' && (rule.group || rule.rules || rule.groups)) {
      const nested = formatGroup(rule.group || rule, depth + 1);
      if (nested) parts.push(`(${nested})`);
      return;
    }
    const text = formatRule(rule);
    if (text) parts.push(text);
  });

  (group.groups || []).forEach((nestedGroup) => {
    const text = formatGroup(nestedGroup && nestedGroup.group ? nestedGroup.group : nestedGroup, depth + 1);
    if (text) parts.push(`(${text})`);
  });

  return parts.join(` ${operator} `);
}

function firstString(propertySet, keys) {
  for (const key of keys) {
    if (typeof propertySet[key] === 'string' && propertySet[key].trim()) return propertySet[key];
  }
  return '';
}

/* Best-effort read of an element's validation setup, only for the element
 * types that are about validation: Set Errors, and Messaging / Validation
 * (both flagged bMessaging). The raw propSetMap is shown underneath regardless. */
export function describeValidation(node, propertySet, showExpr, labelResolver) {
  const isSetErrors = node.bSetErrors === true || /set ?errors?/i.test(node.type || '');
  const isMessaging = node.bMessaging === true || /messaging|validation/i.test(node.type || '');

  const validation = {
    kind: isSetErrors ? 'set-errors' : (isMessaging ? 'messaging' : ''),
    errorMap: [], runsOn: '', triggerExpr: '', validateExpr: '', message: '', messages: [],
    raw: propertySet, has: isSetErrors || isMessaging
  };
  if (!validation.has) return validation;

  /* Set Errors carries { targetElementName: message } — elementErrorMap. */
  let errorMap = (propertySet.elementErrorMap && typeof propertySet.elementErrorMap === 'object' &&
    !Array.isArray(propertySet.elementErrorMap)) ? propertySet.elementErrorMap : null;
  if (!errorMap) {
    Object.keys(propertySet).forEach((key) => {
      if (!errorMap && /error.?map/i.test(key) &&
          propertySet[key] && typeof propertySet[key] === 'object' && !Array.isArray(propertySet[key])) {
        errorMap = propertySet[key];
      }
    });
  }
  if (errorMap) {
    Object.keys(errorMap).forEach((elementName) => {
      validation.errorMap.push({ element: elementName, message: resolveText(String(errorMap[elementName]), labelResolver) });
    });
  }

  if (typeof propertySet.validationRequired === 'string') validation.runsOn = propertySet.validationRequired;
  if (isSetErrors && showExpr) validation.triggerExpr = showExpr;
  validation.message = resolveText(firstString(propertySet, ['validationMessage', 'errorMessage', 'messageErrorText']), labelResolver);

  /* validateExpression: the expression the element checks. String or a group. */
  const validateExpression = propertySet.validateExpression;
  if (typeof validateExpression === 'string' && validateExpression.trim()) {
    validation.validateExpr = validateExpression.trim();
  } else if (validateExpression && typeof validateExpression === 'object') {
    validation.validateExpr = formatGroup(validateExpression.group || validateExpression, 0);
  }

  const messages = propertySet.messages || propertySet.messageMap;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (!message || typeof message !== 'object' || message.active === false) return;
      const text = resolveText(message.message || message.text || message.messageText || '', labelResolver);
      if (!text) return;
      validation.messages.push({
        type: message.messageType || message.type || 'message',
        text,
        /* value = the expression result this message is shown for. */
        when: message.value === true ? 'true' : (message.value === false ? 'false' : ''),
        condition: describeShow(message.show) ||
          (message.condition ? formatGroup(message.condition.group || message.condition, 0) : '')
      });
    });
  }

  return validation;
}

export function formatRule(rule) {
  if (!rule || typeof rule !== 'object') return '';
  const field = rule.field || rule.name || '';
  const condition = rule.condition || rule.operator || '=';
  const data = rule.data !== undefined ? rule.data : rule.value;
  const value = (data === '' || data === undefined || data === null) ? '""'
    : (typeof data === 'string' ? `"${data}"` : String(data));
  return `${field} ${condition} ${value}`.trim();
}

/* First value in the data whose key matches the element name. OmniScript
 * nests values under step names, so a plain lookup would miss most of them. */
export function valueFor(data, name, depth = 0) {
  if (!data || typeof data !== 'object' || depth > 12) return undefined;
  if (Object.prototype.hasOwnProperty.call(data, name)) return data[name];
  for (const key of Object.keys(data)) {
    const child = data[key];
    if (child && typeof child === 'object') {
      const hit = valueFor(child, name, depth + 1);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/* name -> value for every key in the payload, with the same answer valueFor
 * gives (the first node in depth-first order that owns the key), built once per
 * payload object. Looking up every element by name in a large payload through
 * valueFor walks the whole tree each time; this walks it once. */
const indexes = new WeakMap();

export function valueIndex(data) {
  if (!data || typeof data !== 'object') return new Map();
  let index = indexes.get(data);
  if (!index) {
    index = new Map();
    collectNames(data, index, 0);
    indexes.set(data, index);
  }
  return index;
}

function collectNames(node, index, depth) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  const keys = Object.keys(node);
  keys.forEach((key) => { if (!index.has(key)) index.set(key, node[key]); });
  keys.forEach((key) => {
    if (node[key] && typeof node[key] === 'object') collectNames(node[key], index, depth + 1);
  });
}

export function valueByName(data, name) {
  return valueIndex(data).get(name);
}

export function preview(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    return Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
  }
  const text = String(value);
  return text.length > 40 ? text.slice(0, 40) + '…' : text;
}

export function parseObj(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

/* Walk an OmniScript JSONPath: colon-separated, nested under step names, with
 * a "|N" suffix on repeat-block segments (e.g. "Step:Block|1:Field"). */
export function resolvePath(data, path, strict = false) {
  if (!data || !path) return undefined;
  const segments = String(path).split(':');
  let current = data;
  for (let segment of segments) {
    let repeatIndex = -1;
    const barAt = segment.indexOf('|');
    if (barAt > -1) { repeatIndex = Number(segment.slice(barAt + 1)); segment = segment.slice(0, barAt); }
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
    current = current[segment];
    /* |N counts from 1, like OmniScript's own paths and path-links.js. */
    if (repeatIndex > -1 && Array.isArray(current)) {
      if ((repeatIndex - 1) in current) current = current[repeatIndex - 1];
      else if (strict) return undefined; // a row that is not there is not row 1
      else current = current[0];
    }
  }
  return current;
}

/* A value as a rule or formula sees it: a field name may be wrapped in %…%
 * merge syntax; the exact path is tried first, then the last name anywhere in
 * the data. */
export function lookup(data, reference) {
  const name = String(reference).replace(/^%|%$/g, '');
  const direct = resolvePath(data, name);
  if (direct !== undefined) return direct;
  const last = name.split(':').pop().split('|')[0];
  return last ? valueByName(data, last) : undefined;
}

/* A JSONPath with the repeat position of the named blocks set: rows is
 * { blockName: n }, n counted from 1. Segments of other blocks stay as they are. */
export function withRows(path, rows) {
  return String(path).split(':').map((segment) => {
    const name = segment.split('|')[0];
    return Object.prototype.hasOwnProperty.call(rows, name) ? `${name}|${rows[name]}` : segment;
  }).join(':');
}

/* The element's current value: exact JSONPath first, name search as a fallback. */
export function resolveElementValue(element, data, rows) {
  const path = element.jsonPath && rows ? withRows(element.jsonPath, rows) : element.jsonPath;
  const value = path ? resolvePath(data, path) : undefined;
  return value === undefined ? valueByName(data, element.name) : value;
}

/* The element's value in one row of its repeating blocks, and only there:
 * what the row's own path does not hold is undefined, never another row's
 * value or the first field of that name anywhere in the data. */
export function resolveRowValue(element, data, rows) {
  if (!element.jsonPath) return valueByName(data, element.name);
  return resolvePath(data, withRows(element.jsonPath, rows), true);
}

/* A value for display: a radio/select stores the option's data value, so show
 * "US (United States)" by joining in the option label. Falls back to preview(). */
export function displayValue(element, value) {
  if (element.optionLabels) {
    const withLabel = (raw) => {
      const optionLabel = element.optionLabels[String(raw)];
      return (optionLabel && optionLabel !== String(raw)) ? `${raw} (${optionLabel})` : String(raw);
    };
    if (Array.isArray(value)) return value.map(withLabel).join(', ');
    if (typeof value === 'string' || typeof value === 'number') return withLabel(value);
  }
  return preview(value);
}

/* Which steps have been reached and which actions have run.
 *
 * The runtime stores its position in the definition: `asIndex` is the
 * indexInParent of the active top-level element. Everything at the top level
 * (steps and actions alike) sits in one ordered list, so an element with a
 * lower indexInParent has already been passed, an equal one is where the
 * script is now, and a higher one is still ahead. A passed element whose show
 * condition was false (bShow === false) never actually ran, so it is
 * 'skipped' rather than 'done'.
 *
 * Set Values are tracked too. A top-level one sits in the same ordered list.
 * One inside a step runs when the script reaches that step, so it counts once
 * its top-level ancestor is current or passed. Either way the show rule
 * decides done or skipped: `visibility` (computeVisibility's output) judges it
 * against the live data, and the definition's bShow snapshot is the fallback
 * when the rule cannot be judged or no visibility is given.
 *
 * Without a numeric activeIndex (older builds) it falls back to the data: a
 * step or action whose name is a key in the payload counts as reached (Set
 * Values are not tracked then: their own name is never in the data).
 *
 * Returns { [element.key]: 'done' | 'current' | 'skipped' | 'pending' } for
 * steps, actions and Set Values only. */
export function executionStatus(elements, data, activeIndex, visibility) {
  const out = {};
  const hasData = !!data && typeof data === 'object' && !Array.isArray(data);
  const useIndex = typeof activeIndex === 'number';
  const reached = (element) => hasData && valueByName(data, element.name) !== undefined;
  const byKey = new Map(elements.map((element) => [element.key, element]));
  const wouldShow = (element) => {
    const state = visibility && visibility[element.key];
    return state ? !state.hidden : element.shown;
  };
  /* The top-level element a nested one belongs to, or null when the chain breaks. */
  const topLevelOf = (element) => {
    let node = element;
    while (node && node.depth > 0) node = byKey.get(node.parentKey);
    return node || null;
  };

  /* A Set Values inside a step: ahead of the script until its step is reached. */
  function nestedSetValuesStatus(element) {
    const top = topLevelOf(element);
    if (!top || top.indexInParent === null) return undefined;
    if (top.indexInParent > activeIndex) return 'pending';
    return wouldShow(element) ? 'done' : 'skipped';
  }

  let lastReached = null;
  elements.forEach((element) => {
    const tracked = element.category.key === 'step' || element.category.key === 'action';
    if (!tracked) return;

    if (useIndex) {
      if (element.depth !== 0 || element.indexInParent === null) {
        const nested = element.isSetValues && element.depth > 0 ? nestedSetValuesStatus(element) : undefined;
        if (nested) out[element.key] = nested;
        return;
      }
      if (element.indexInParent > activeIndex) out[element.key] = 'pending';
      else if (element.indexInParent === activeIndex) out[element.key] = 'current';
      else out[element.key] = wouldShow(element) ? 'done' : 'skipped';
    } else if (hasData && !element.isSetValues) {
      out[element.key] = reached(element) ? 'done' : 'pending';
      if (element.category.key === 'step' && reached(element)) lastReached = element;
    }
  });

  if (!useIndex && lastReached) out[lastReached.key] = 'current';
  return out;
}
