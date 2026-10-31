'use strict';

/* A rule as the Designer defines it, on one line and with no live data: the
 * "As written" row of the Visibility and Validation cards, next to their table,
 * which says what the rule comes to right now.
 *
 * Pure: no DOM, no chrome.*. */

import { describeShow } from '../shared/structure-model.js';

/* A text expression as it is, a group as the readable form (Step1:Email != ""
 * AND (Type = "Business" OR Amount > 1000)). '' when there is nothing to say. */
export function ruleSummary(rule) {
  if (typeof rule === 'string') return rule.replace(/\s+/g, ' ').trim();
  return describeShow(rule);
}
