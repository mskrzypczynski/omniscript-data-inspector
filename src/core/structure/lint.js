'use strict';

/* Definition lint: things in an OmniScript's definition that are provably
 * wrong. A problem is only reported when it cannot be explained by something
 * the script does at run time, so a healthy script shows none.
 *
 * Always wrong (errors and warnings): names used twice, Set Errors aimed at a name that is no
 * element, a show group with no rules, a custom label missing from
 * allCustomLabels. A name in a rule, a %merge% field or a Set Values target
 * is only reported, as a note, when it is neither an element nor a key in the
 * live data, and is not something that only exists at run time: a formula
 * (=...), a $ reference, a path through an element (the response nodes of an
 * action, e.g. IPResult:Name). Without data those names are not judged at
 * all. Notes are not counted as problems: see countProblems.
 *
 * Pure: no DOM, no chrome.*. */

import { createReferences, assignmentsOf, ruleReferences, mergeFields, referenceSegments } from '../shared/references.js';
import { hasShowRules, resolveText, makeResolver, resolvePath, valueIndex } from '../shared/structure-model.js';
import { structureSignature } from './definition-change.js';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2, note: 3 };

/* A note is judged against the live data, not the definition: a name that is
 * not in the data yet may be filled in later by a Data Mapper, an Integration
 * Procedure or a Set Values. Errors and warnings are provable from the
 * definition alone. */
export const isNote = (problem) => problem.severity === 'note';

/* What the toolbar chip counts: everything except the notes. */
export function countProblems(problems) {
  return problems.filter((problem) => !isNote(problem)).length;
}

function propertySetOf(element) {
  return (element.node && element.node.propSetMap && typeof element.node.propSetMap === 'object') ? element.node.propSetMap : {};
}

/* The texts of an element that may carry %merge% fields, with where each is. */
function mergeSources(element, resolver) {
  const propertySet = propertySetOf(element);
  const out = [];
  if (element.label) out.push(['its label', element.label]);
  if (typeof propertySet.helpText === 'string' && propertySet.helpText) {
    out.push(['its help text', resolveText(propertySet.helpText, resolver)]);
  }
  if (typeof propertySet.expression === 'string') out.push(['its formula', propertySet.expression]);
  if (element.isSetValues) {
    assignmentsOf(element).forEach(({ target, expression }) => out.push([`the value set on ${target}`, expression]));
  }
  if (element.validation && element.validation.has) {
    element.validation.messages.forEach((message) => out.push(['a validation message', message.text]));
    element.validation.errorMap.forEach((entry) => out.push([`the error on ${entry.element}`, entry.message]));
  }
  return out;
}

/* Is this name provably nothing? `strict` does not take a Set Values target
 * as an existing node (used when judging those targets themselves). */
function createJudge(refs, data) {
  const judged = !!data && typeof data === 'object';
  const keys = judged ? valueIndex(data) : null;
  return (ref, strict = false) => {
    if (!judged) return false;
    const text = String(ref === undefined || ref === null ? '' : ref).trim();
    if (!text || text.startsWith('=') || text.startsWith('$') || /^%.*%$/.test(text)) return false;
    const hit = refs.resolve(text, { strict });
    if (hit.element || hit.external) return false;
    const parts = referenceSegments(text);
    /* A qualified path can always be filled later, by an action's response or
     * a Set Values; only a bare name that is nowhere can be called wrong. */
    if (text.includes(':') || text.includes('|')) return false;
    if (resolvePath(data, text) !== undefined) return false;
    return !keys.has(parts[parts.length - 1]);
  };
}

export function lintDefinition(elements, header, data) {
  const problems = [];
  const refs = createReferences(elements);
  const resolver = makeResolver(header);
  const unknown = createJudge(refs, data);
  const add = (element, severity, code, message) => {
    problems.push({ elementKey: element.key, severity, code, message });
  };
  const seen = new Set();
  const addOnce = (element, severity, code, message) => {
    const id = `${element.key}\u0000${code}\u0000${message}`;
    if (seen.has(id)) return;
    seen.add(id);
    add(element, severity, code, message);
  };

  /* Names used twice. The first keeps the name; each later one is reported. */
  const firstByName = new Map();
  elements.forEach((element) => {
    if (!firstByName.has(element.name)) { firstByName.set(element.name, element); return; }
    add(element, 'error', 'duplicate-name',
      `The name “${element.name}” is already used by another ${firstByName.get(element.name).type}; ` +
      'data and rules can only tell one of them apart by its place');
  });

  elements.forEach((element) => {
    const propertySet = propertySetOf(element);

    /* Show rules and validation expressions: fields that name nothing. */
    const groups = [['Its show rule', element.show]];
    if (propertySet.validateExpression && typeof propertySet.validateExpression === 'object') {
      groups.push(['Its validation expression', propertySet.validateExpression]);
    }
    groups.forEach(([where, group]) => {
      if (!group) return;
      const found = ruleReferences(group);
      found.fields.forEach((field) => {
        if (unknown(field)) addOnce(element, 'note', 'rule-field-missing', `${where} uses “${field}”, which is neither an element nor a key in the data`);
      });
      found.merges.forEach((merge) => {
        if (unknown(merge)) addOnce(element, 'note', 'merge-field-missing', `${where} uses %${merge}%, which is neither an element nor a key in the data`);
      });
    });

    /* A show group with no rules in it. */
    if (propertySet.show && typeof propertySet.show === 'object' &&
        Object.keys(propertySet.show).length && !hasShowRules(propertySet.show)) {
      add(element, 'warning', 'empty-show', 'Has a show rule with no conditions in it, so it is always shown');
    }

    /* Set Errors: elements the errors are put on. */
    if (element.validation && element.validation.kind === 'set-errors') {
      element.validation.errorMap.forEach((entry) => {
        const hit = refs.resolve(entry.element);
        if (!hit.element && !hit.external) addOnce(element, 'error', 'error-target-missing', `Sets an error on “${entry.element}”, which is not an element of this script`);
      });
    }

    /* Set Values targets are never reported: creating a new node is what a
     * Set Values is for, so a target that exists nowhere yet is not wrong. */

    /* %merge% fields in labels, help text and formulas. */
    mergeSources(element, resolver).forEach(([where, text]) => {
      mergeFields(text).forEach((merge) => {
        if (unknown(merge)) addOnce(element, 'note', 'merge-field-missing', `Uses %${merge}% in ${where}, which is neither an element nor a key in the data`);
      });
    });

    /* Custom labels the multi-language script cannot resolve. */
    element.missingLabels.forEach((missing) => {
      add(element, 'error', 'missing-label', `Custom label “${missing.key}” (${missing.where}) is missing from allCustomLabels`);
    });
  });

  return problems;
}

/* Errors first, then warnings, then notes, keeping script order within each. */
export function sortProblems(problems) {
  return problems
    .map((problem, i) => [problem, i])
    .sort((a, b) => (SEVERITY_ORDER[a[0].severity] - SEVERITY_ORDER[b[0].severity]) || (a[1] - b[1]))
    .map(([problem]) => problem);
}

/* lintDefinition behind a cache. It runs again when the definition (what
 * structureSignature sees, plus the missing labels) or the data object
 * changes; a run that finds the same problems hands back the same array, so a
 * poll that changes nothing costs the caller nothing. */
export function createLintCache() {
  let key = null;
  let seenData = null;
  let problems = [];
  let text = '[]';
  return (elements, header, data) => {
    const next = `${structureSignature(elements)}\u0000${elements.map((e) => e.missingLabels.length).join('')}`;
    if (next === key && data === seenData) return problems;
    key = next;
    seenData = data;
    const found = lintDefinition(elements, header, data);
    const foundText = JSON.stringify(found);
    if (foundText !== text) { text = foundText; problems = found; }
    return problems;
  };
}
