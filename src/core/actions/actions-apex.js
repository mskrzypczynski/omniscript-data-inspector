'use strict';

import { nameInfo } from '../shared/actions-model.js';

/* "Copy as Apex": an anonymous-Apex snippet that runs an Integration
 * Procedure or a Data Mapper again with the input (and options) of a captured
 * call, for pasting into the Developer Console. "Copy input" gives the bare
 * input JSON of any call.
 *
 * Best effort. The managed packages and the standard runtime expose the
 * services under different namespaces. An Aura call may carry its namespace;
 * otherwise it is read from the class the call was sent to.
 *
 * Pure: no DOM, no chrome.*. */

const NAMESPACES = ['vlocity_cmt', 'vlocity_ins', 'vlocity_ps', 'omnistudio'];
const DEFAULT_NAMESPACE = 'omnistudio';

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

/* The namespace of the package the call went to: the one the call itself
 * carries (an Aura ApexAction's namespace parameter), else the part of the
 * remote class (or else the Apex class) before the first dot when it is one
 * of the known ones; omnistudio otherwise. A namespace that is not a plain
 * identifier is not trusted, since it ends up in code. */
export function namespaceFor(action) {
  const carried = action && typeof action.namespace === 'string' ? action.namespace.trim() : '';
  if (IDENTIFIER.test(carried)) return carried;
  for (const className of [action && action.remoteClass, action && action.apexClass]) {
    if (typeof className !== 'string' || !className.includes('.')) continue;
    const prefix = className.slice(0, className.indexOf('.')).toLowerCase();
    if (NAMESPACES.includes(prefix)) return prefix;
  }
  return DEFAULT_NAMESPACE;
}

/* The text of an Apex single-quoted string literal. JSON.stringify output is
 * one line already, so only the backslash and the quote need care. */
export function apexString(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/* Compact JSON of a value as an Apex string literal; nothing becomes {}. */
function jsonLiteral(value, mask) {
  const masked = mask(value);
  const empty = masked === undefined || masked === null || masked === '';
  return apexString(empty ? '{}' : JSON.stringify(masked));
}

/* The snippet that runs a call again, or null for a call that has none: an
 * Integration Procedure (named by its key) or a Data Mapper (named by its
 * bundle, which must be known). `mask` turns a value into the value that may
 * leave the panel (identity when masking is off). */
export function apexSnippet(entry, mask = (value) => value) {
  if (!entry) return null;
  const action = entry.action || {};
  if (entry.type === 'IP') {
    /* The key is the method; a call whose name is only Class.method has none. */
    if (entry.nameFrom === 'label' || entry.nameFrom === 'preview' || !entry.name) return null;
    return [
      `Map<String, Object> input = (Map<String, Object>) JSON.deserializeUntyped(${jsonLiteral(action.input, mask)});`,
      `Map<String, Object> options = (Map<String, Object>) JSON.deserializeUntyped(${jsonLiteral(action.options, mask)});`,
      `Object result = ${namespaceFor(action)}.IntegrationProcedureService.runIntegrationService(${apexString(entry.name)}, input, options);`,
      'System.debug(JSON.serializePretty(result));'
    ].join('\n');
  }
  if (entry.type === 'DR') {
    const found = nameInfo(action);
    if (!found.name) return null;
    // A name read from the input is user data: masked like the input beside it.
    const bundle = found.from === 'input' ? String(mask(found.name)) : found.name;
    const ns = namespaceFor(action);
    return [
      `Map<String, Object> input = (Map<String, Object>) JSON.deserializeUntyped(${jsonLiteral(action.input, mask)});`,
      // process() returns a DRProcessResult, which JSON cannot serialise: toJson() is the plain map.
      `${ns}.DRProcessResult result = ${ns}.DRGlobal.process(input, ${apexString(bundle)});`,
      'System.debug(JSON.serializePretty(result.toJson()));'
    ].join('\n');
  }
  return null;
}

/* The bare input of a call as JSON text (nothing becomes {}), for pasting into
 * a test or another tool. */
export function inputText(entry, mask = (value) => value) {
  const masked = mask(entry && entry.action ? entry.action.input : undefined);
  if (masked === undefined || masked === null || masked === '') return '{}';
  return JSON.stringify(masked, null, 2);
}
