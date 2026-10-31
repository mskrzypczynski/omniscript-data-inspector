'use strict';

/* What a Set Values element will write, judged from the live data: each
 * assignment as `target ← expression`, with %merge% fields replaced by what
 * the data holds now, next to what the target holds now.
 *
 * Best effort: a formula (a value starting with "=") is evaluated with
 * evaluateFormula and shown as an estimate (≈); one that cannot be evaluated is
 * "can't tell", so it can never be called different.
 *
 * Pure: no DOM, no chrome.*. */

import { assignmentsOf } from '../shared/references.js';
import { lookup, compare } from './visibility.js';
import { resolveElementValue } from '../shared/structure-model.js';
import { notEvaluatedText } from './formula.js';
import { reader, resolveExpression, fieldsRead } from './expression-values.js';
import { textCell, valueCell, unknownCell, fieldCell } from './table-model.js';
import { differsTag } from './fact-words.js';

/* [{ target, targetKey, expression, text, isFormula, missing, resolved,
 *    current, differs }]
 *   text      — the expression with the fields it names filled in
 *   missing   — fields that hold nothing in the data
 *   resolved  — the value it would write, or undefined when that cannot be
 *               told (a formula that does not evaluate, a missing field)
 *   estimated — resolved comes from a formula's estimate
 *   formulaReason — why a formula could not be evaluated ('' otherwise)
 *   current   — what the target holds now (undefined when nothing)
 *   differs   — true / false when resolved and current can be compared, else null
 * `refs` is createReferences()'s result; `rows` picks repeat rows ({ block: n });
 * `estimator` (createEstimator) lets a formula read a Formula element the data
 * holds nothing for yet. */
export function resolveAssignments(element, data, refs, rows, estimator) {
  const read = reader(data, refs, rows, estimator);

  return assignmentsOf(element).map(({ target, expression }) => {
    const { text, missing, isFormula, resolved, estimated, formulaReason } = resolveExpression(expression, read);

    const targetHit = refs.resolve(target).element;
    const current = !read.hasData ? undefined
      : (targetHit ? resolveElementValue(targetHit, data, rows) : undefined) ?? lookup(data, target);

    let differs = null;
    if (read.hasData && resolved !== undefined) {
      const same = compare(current, '=', resolved);
      differs = same === null ? null : !same;
    }

    return {
      target, targetKey: targetHit ? targetHit.key : null, expression, text,
      isFormula, missing, resolved, estimated, formulaReason, current, differs
    };
  });
}

const TARGET_TITLE = 'Where the value is written';

/* The cell of "Computed value": the value, ≈ when a formula's estimate, "can't tell" when
 * it cannot be told (a formula that does not evaluate, a field with no value yet,
 * no data read). A literal or a merge field filled in from the data is exact, not
 * an estimate. */
function comesToCell(item, hasData) {
  if (item.isFormula && item.estimated) {
    return valueCell(item.resolved, { estimated: true, title: 'Estimated from the formula, best effort: the script itself decides what it writes.' });
  }
  if (item.isFormula) return unknownCell(item.formulaReason ? notEvaluatedText(item.formulaReason) : 'The formula could not be evaluated');
  if (item.missing.length) return unknownCell(`No value yet for ${item.missing.map((ref) => `%${ref}%`).join(', ')}`);
  if (!hasData) return unknownCell('No data was read');
  // A literal is the definition's own text, not the data's: a masked copy keeps it.
  return valueCell(item.resolved, { data: fieldsRead(item.expression).length > 0 });
}

/* What the target holds now, tagged "differs" when it is not what the expression comes to. */
function holdsCell(item) {
  const cell = valueCell(item.current);
  if (item.differs) cell.tag = differsTag({ estimated: item.estimated });
  return cell;
}

/* The Set Values card: one row per assignment, as Target / Expression / Computed value /
 * Current value. A target is shown by its element's name, the path as written in its
 * tooltip. A row whose exact result differs from what its target holds is toned
 * 'differs'; its Current value carries the "differs" tag either way. `refs`, `rows` and `estimator` are resolveAssignments's. */
export function setValuesTable(element, data, refs, rows, estimator) {
  const hasData = data !== undefined && data !== null && typeof data === 'object';
  const items = resolveAssignments(element, data, refs, rows, estimator);
  return {
    id: 'set-values',
    title: 'Set Values',
    tip: 'What this element writes into the data, and what each target holds now.',
    layout: 'table',
    columns: [
      { id: 'target', label: 'Target' }, { id: 'expression', label: 'Expression' },
      { id: 'comes-to', label: 'Computed value' }, { id: 'holds', label: 'Current value' }
    ],
    rows: items.map((item) => ({
      // An estimate is no ground to tone a row: only an exact value that differs is amber.
      tone: item.differs && !item.estimated ? 'differs' : '',
      cells: [
        fieldCell(item.target, { refs, data }, { title: TARGET_TITLE }),
        textCell(item.expression, { title: 'As written in the definition' }),
        comesToCell(item, hasData),
        hasData ? holdsCell(item) : unknownCell('No data was read')
      ]
    })),
    empty: 'This element sets no values.'
  };
}
