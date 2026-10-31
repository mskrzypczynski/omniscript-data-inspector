'use strict';

/* Real fixtures: every debug bundle in test/fixtures/bundles/ (saved with Mask
 * values on; see the README there) goes through the rules that judge a script:
 * Problems, what may stop Next, visibility verdicts, chain grouping and
 * repeats. Each must run without an exception and give the counts it is
 * expected to. A bundle that breaks a count is a finding, not a number to
 * loosen. demo.json is built by npm run demo-bundle from the screenshots'
 * fictional script, so its counts are written down below. */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBundle, definitionTexts, payloadText, sessionAsIndex } from '../../src/core/shared/session-bundle.js';
import { flatten, parseObj, executionStatus } from '../../src/core/shared/structure-model.js';
import { computeVisibility, explainVisibility } from '../../src/core/structure/visibility.js';
import { lintDefinition, countProblems } from '../../src/core/structure/lint.js';
import { stepStoppers, validationRules } from '../../src/core/structure/step-validation.js';
import { createEstimator, formulaOf } from '../../src/core/structure/formula-values.js';
import { liveMessaging, liveSetErrors } from '../../src/core/structure/live-validation.js';
import { diffDefinitions } from '../../src/core/structure/definition-diff.js';
import { overriddenElements } from '../../src/core/structure/overrides.js';
import { callWiring } from '../../src/core/structure/call-wiring.js';
import { elementTables, optionsFinding } from '../../src/core/structure/element-tables.js';
import { createReferences } from '../../src/core/shared/references.js';
import { formRows, hasFormView, MAX_FORM_ROWS } from '../../src/core/structure/form-rows.js';
import { resolveElementValue } from '../../src/core/shared/structure-model.js';
import { valueMismatch } from '../../src/core/structure/value-types.js';
import { bundleCallRows, recordsFromExport } from '../../src/core/actions/actions-import.js';
import { groupChains } from '../../src/core/actions/actions-chains.js';
import { findRepeats } from '../../src/core/actions/actions-repeats.js';

const DIR = new URL('../fixtures/bundles/', import.meta.url);
const files = readdirSync(fileURLToPath(DIR)).filter((name) => name.endsWith('.json')).sort();

/* Runs every rule over one bundle and counts what each found. Besides the
 * counts it checks what must hold for any script: the definition compared with
 * itself differs nowhere, and with its last element left out it gains one. */
function judge(text) {
  const parsed = parseBundle(text);
  expect(parsed.ok).toBe(true);
  const { bundle } = parsed;

  const { raw, headerRaw } = definitionTexts(bundle);
  const header = parseObj(headerRaw);
  const dataText = payloadText(bundle);
  const data = dataText ? JSON.parse(dataText) : undefined;

  const counts = { elements: 0, steps: 0, problems: 0, notes: 0, hidden: 0, hiddenByRule: 0, verdicts: 0, stoppers: 0, estimatedStoppers: 0, customComponents: 0, overridden: 0, formulas: 0, liveBlocking: 0, unjudgedSetErrors: 0, wired: 0,
    tables: 0, optionsFindings: 0,
    calls: 0, failedCalls: 0, chains: 0, repeats: 0 };

  if (raw) {
    const elements = flatten(JSON.parse(raw), header);
    const byKey = Object.fromEntries(elements.map((element) => [element.key, element]));
    const visibility = computeVisibility(elements, data);
    const progress = executionStatus(elements, data, sessionAsIndex(bundle), visibility);
    expect(Object.keys(progress).length).toBeLessThanOrEqual(elements.length);

    counts.elements = elements.length;
    counts.steps = elements.filter((element) => element.category.key === 'step').length;
    counts.overridden = overriddenElements(elements).length;

    const problems = lintDefinition(elements, header, data);
    counts.problems = countProblems(problems);
    counts.notes = problems.length - counts.problems;

    counts.hidden = elements.filter((element) => visibility[element.key].hidden).length;
    counts.hiddenByRule = elements.filter((element) => visibility[element.key].ownHidden).length;
    elements.forEach((element) => {
      const why = explainVisibility(element, visibility, byKey);
      expect(typeof why.headline).toBe('string');
      counts.verdicts += 1;
    });

    elements.filter((element) => element.category.key === 'step').forEach((step) => {
      const stoppers = stepStoppers(elements, step.key, data, visibility);
      counts.stoppers += stoppers.count;
      counts.estimatedStoppers += stoppers.estimated.length;
      counts.customComponents += stoppers.custom.length;
      /* The step's Validation tab lists every rule; the ones that fail are what may stop Next. */
      const rules = validationRules(elements, step.key, data, visibility);
      expect(rules.filter((rule) => rule.verdict === 'fails' && !rule.estimated).map((rule) => rule.elementKey))
        .toEqual(stoppers.firing.map((item) => item.elementKey));
      expect(rules.filter((rule) => rule.verdict === 'fails' && rule.estimated).map((rule) => rule.elementKey))
        .toEqual(stoppers.estimated.filter((item) => item.kind !== 'required').map((item) => item.elementKey));
    });

    /* Formulas, live validation, call wiring and the definition diff. */
    const estimator = createEstimator(elements, data);
    elements.forEach((element) => {
      if (formulaOf(element) && estimator.estimate(element).ok) counts.formulas += 1;
      const validation = element.validation;
      if (validation && validation.kind === 'messaging') {
        const live = liveMessaging(validation, data, estimator);
        if (live.blocks) counts.liveBlocking += 1;
      } else if (validation && validation.kind === 'set-errors') {
        const live = liveSetErrors(validation, visibility[element.key]);
        if (live.blocks) counts.liveBlocking += 1;
        if (live.state === 'unknown') counts.unjudgedSetErrors += 1;
      }
      if (callWiring(element)) counts.wired += 1;
    });

    /* The cards of the detail pane (Set Values, Options, Formula, Merge fields, Additional input):
     * every row of a table has a cell for each column, every labelled row a label and a value,
     * and a finding is a value that is none of the options. */
    const refs = createReferences(elements);
    elements.forEach((element) => {
      ['value', 'options', 'props', 'calls'].forEach((tab) => {
        elementTables({ tab, element, data, refs, rows: {}, estimator }).forEach((table) => {
          table.rows.forEach((row) => {
            if (table.layout === 'rows') expect(row.heading !== undefined || (!!row.label && !!row.value)).toBe(true);
            else expect(row.cells).toHaveLength(table.columns.length);
          });
          counts.tables += 1;
        });
      });
      if (optionsFinding(element, data, {})) counts.optionsFindings += 1;

      /* The Form view of a step or a block, every group open: it never throws and stays within its cap. */
      const value = resolveElementValue(element, data, {});
      if (hasFormView(element, value)) {
        const form = formRows(element, value, elements, () => true);
        expect(form.rows.length).toBeLessThanOrEqual(MAX_FORM_ROWS);
        form.rows.forEach((row) => expect(typeof row.label).toBe('string'));
      }
    });

    const same = diffDefinitions(elements, elements);
    expect(same.total).toBe(0);
    expect(same.unchanged).toBe(elements.length);
    if (elements.length) {
      const grown = diffDefinitions(elements.slice(0, -1), elements);
      expect(grown.added).toHaveLength(1);
    }
  }

  const entries = recordsFromExport(bundleCallRows(bundle));
  const chains = groupChains(entries);
  counts.calls = entries.length;
  counts.failedCalls = entries.filter((entry) => entry.failure).length;
  counts.chains = chains.length;
  counts.repeats = findRepeats(entries, undefined, chains).size;
  return counts;
}

describe('the bundles in test/fixtures/bundles', () => {
  it('has at least the demo bundle', () => {
    expect(files).toContain('demo.json');
  });

  it.each(files)('%s runs through every rule without an exception', (name) => {
    const counts = judge(readFileSync(new URL(name, DIR), 'utf8'));
    expect(counts.elements).toBeGreaterThanOrEqual(0);
    expect(counts.verdicts).toBe(counts.elements);
    expect(counts.hiddenByRule).toBeLessThanOrEqual(counts.hidden);
  });

  /* The counts for demo.json. They change only with the demo script in
   * scripts/lib/demo-panel.mjs or with a rule: look at which before updating. */
  it('gives the demo bundle the counts it is known to have', () => {
    expect(judge(readFileSync(new URL('demo.json', DIR), 'utf8'))).toEqual({
      elements: 22, // a Data Mapper action, 4 steps with 16 fields between them, an Integration Procedure action
      steps: 4,
      problems: 0,
      notes: 0,
      hidden: 2, // Promo code and Gold note, shown only for the Gold plan
      hiddenByRule: 2,
      verdicts: 22,
      stoppers: 1, // "I accept the terms" on the Review step is required and not ticked
      estimatedStoppers: 0,
      customComponents: 0,
      overridden: 0,
      formulas: 0,
      liveBlocking: 0,
      unjudgedSetErrors: 0,
      wired: 2, // the Data Mapper action and the Integration Procedure action
      tables: 4, // the Options of Country, Plan, Billing cycle and Add-ons
      optionsFindings: 0, // the bundle was saved with Mask values on: which option the data holds cannot be told
      calls: 5,
      failedCalls: 1, // Onboarding_SaveApplication
      chains: 0,
      repeats: 0
    });
  });
});

describe('demo.json: saved with Mask values on', () => {
  /* The placeholders that stand in for answers are not answers: no element is
   * told its value is none of its options, not a number or not a date. */
  it('raises no value hint for a placeholder', () => {
    const { bundle } = parseBundle(readFileSync(new URL('demo.json', DIR), 'utf8'));
    const { raw, headerRaw } = definitionTexts(bundle);
    const data = JSON.parse(payloadText(bundle));
    const elements = flatten(JSON.parse(raw), parseObj(headerRaw));
    const masked = elements.filter((element) => ['<string>', '<number>'].includes(resolveElementValue(element, data, {})));
    expect(masked.length).toBeGreaterThan(0);
    masked.forEach((element) => expect(valueMismatch(element, resolveElementValue(element, data, {}))).toBeNull());
  });
});

describe('blocks.json: a hand-written script with every kind of block and check', () => {
  /* Built by hand with invented names (see the README there), so each count is
   * one the script was written to give. */
  it('gives the counts it was written to give', () => {
    expect(judge(readFileSync(new URL('blocks.json', DIR), 'utf8'))).toEqual({
      elements: 28, // 3 top-level items (2 steps, an Integration Procedure action) and 25 elements between them
      steps: 2,
      problems: 1, // the label key CL_Nickname is missing from allCustomLabels
      notes: 0,
      hidden: 3, // Senior note and Existing cover (both by the estimate of a formula), Age check (its rule does not hold)
      hiddenByRule: 3,
      verdicts: 28,
      stoppers: 5, // a dependant's name empty in row 2 of the repeat Block; a dependant's email missing from row 3 (not borrowed from row 1); a rider name empty in row 2 of the first policy (a Block inside a Block); Consent not ticked; the Messaging Requirement that follows from it. The Guardian, required only under 10, is empty in rows 2 and 3 where it is hidden: not counted
      estimatedStoppers: 1, // Existing cover is required and empty, but only if the formula's estimate (Age doubled = 82) is right
      customComponents: 3, // Risk widget, and the two standard elements a custom component overrides (their own validation may stop Next)
      overridden: 2, // Postcode lookup (lwcComponentOverride, a tag) and Newsletter toggle (lwcOverride, a name)
      formulas: 1, // Age doubled
      liveBlocking: 1, // the Messaging Requirement; the Set Errors without a condition is not judged
      unjudgedSetErrors: 1, // Always check has no condition
      wired: 1, // Price quote
      tables: 3, // the Options of Plan, the Formula card of Age doubled, the Additional input of Price quote
      optionsFindings: 0, // Plan holds Basic, which is an option
      calls: 0,
      failedCalls: 0,
      chains: 0,
      repeats: 0
    });
  });
});
