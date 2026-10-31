'use strict';

/* The words of a rule table, in plain language: a condition is true now, false
 * now, or the panel can't tell (it needs a formula or an operator it does not
 * evaluate). A group of conditions says which of them decide it. Nothing here
 * says "holds" or "cannot be judged".
 *
 * Pure: no DOM, no chrome.*. */

/* ok is true, false, or null (can't tell). */
export const kindOf = (ok) => (ok === true ? 'true' : ok === false ? 'false' : 'unknown');

/* The mark of a condition line and the words after it: "✓ true now", "✗ false now", "? can't tell". */
export const RESULT_WORDS = {
  true: { glyph: '✓', words: 'true now' },
  false: { glyph: '✗', words: 'false now' },
  unknown: { glyph: '?', words: "can't tell" }
};

/* The line of a group: always the rule as defined, ALL of these are true / ANY
 * of these is true. Whether it holds is the mark drawn before it (✓, ✗ or ?),
 * so a failing group and a holding one read alike except for the mark. */
export function groupHeadline(operator) {
  return operator === 'OR' ? 'ANY of these is true' : 'ALL of these are true';
}

/* "(1 of 2 are false)" for ALL of, "(1 of 2 is true)" for ANY of: the count
 * that decides the group. `fails` and `holds` are the children counted false and true. */
export function rollUp(node) {
  if (!node.total) return 'no rules';
  const all = node.operator !== 'OR';
  const count = all ? node.fails : node.holds;
  const verb = count === 1 ? 'is' : 'are';
  return `(${count} of ${node.total} ${verb} ${all ? 'false' : 'true'})`;
}
