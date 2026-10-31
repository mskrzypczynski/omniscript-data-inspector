'use strict';

/* The small marks of a Structure row, as data: which icon (a name from
 * src/ui/icons.js), what it is called for a screen reader, what it looks like
 * (the word the legend uses, since a tooltip cannot hold a picture) and what it
 * means. The list draws them and the column header's tooltip lists them, from
 * this one table, so a mark cannot be added without its legend line.
 *
 * Pure: no DOM, no chrome.*. */

/* What a row can carry in its Marks cell. `text` marks one drawn as a character, not an icon. */
export const ROW_MARKS = {
  req: { text: '*', looks: '*', name: 'Required', means: 'required' },
  hidden: { icon: 'eye-off', looks: 'closed eye', name: 'Hidden', means: 'hidden by its show rule' },
  cond: { icon: 'diamond', looks: 'diamond', name: 'Has a show rule', means: 'has a show rule and is shown now' },
  act: { icon: 'calls', looks: 'arrows', name: 'Calls an action', means: 'calls a Data Mapper, Integration Procedure or class' },
  missing: { icon: 'alert', looks: 'triangle', name: 'Missing label', means: 'a custom label it uses is missing' },
  type: { icon: 'not-equal', looks: 'unequal sign', name: 'Value type hint', means: 'the value does not fit the element type' },
  override: { icon: 'component', looks: 'cube', name: 'Overridden', means: 'overridden by a custom component' }
};

/* The Valid column: one glyph per row (core/structure/row-verdict.js decides which). The glyph is
 * drawn by the stylesheet as generated content, the same as the Result of the Calls list. */
export const VERDICT_MARKS = {
  good: { text: '✓', looks: 'tick', means: 'passes its rules now' },
  bad: { text: '✕', looks: 'cross', means: 'would stop Next now' },
  neutral: { text: '–', looks: 'dash', means: 'the panel cannot tell' }
};

/* What each family of element looks like in the list (the icons are in core/shared/structure-model.js). */
export const KIND_LOOKS = [
  ['el-step', 'window', 'step'],
  ['el-block', 'brackets', 'block'],
  ['el-input', 'text box', 'input'],
  ['el-choice', 'ticked box', 'choice'],
  ['el-text', 'lines', 'display text'],
  ['el-action', 'bolt', 'action'],
  ['el-error', 'circled !', 'validation, set errors, messaging'],
  ['code', '<>', 'custom component'],
  ['el-other', 'small dot', 'anything else']
];

/* Does the row carry the show-rule mark? A conditional element that is shown
 * now does. One the rule hides shows the closed eye alone, whose tooltip already
 * says which rule hides it; a second mark would only repeat it. (An element
 * that is hidden only by a guess, which the closed eye is not drawn for, keeps
 * the rule mark.) */
export function showsRuleMark(element, certainlyHidden) {
  return !!element.conditional && !certainlyHidden;
}

/* The legend as data, for the popover on the Marks header: groups of
 * { icon | text, looks, means } built from the same tables as the rows, so a
 * mark cannot be drawn without a line here. */
export function legendGroups() {
  return [
    {
      title: 'Valid',
      items: Object.values(VERDICT_MARKS).map((mark) => ({ text: mark.text, looks: mark.looks, means: mark.means }))
    },
    {
      title: 'Marks',
      items: Object.values(ROW_MARKS).map((mark) => ({ icon: mark.icon, text: mark.text, looks: mark.looks, means: mark.means }))
    },
    {
      title: 'Kinds',
      items: KIND_LOOKS.map(([icon, looks, means]) => ({ icon, looks, means }))
    }
  ];
}

/* The tooltip of a hidden mark: "Hidden by its show rule: ...", from the verdict sentence. A
 * parent's rule that hides it says so as it is. */
export function hiddenTitle(headline, showExpr = '') {
  const text = String(headline || '').trim();
  const rule = showExpr ? `\nShown when: ${showExpr}` : ''; // the row has no separate rule mark while it is hidden
  if (!text) return `Hidden right now${rule}`;
  if (/^Hidden because/i.test(text)) return text;
  return `Hidden by its show rule: ${text.replace(/^Hidden:?\s*/i, '')}${rule}`;
}

/* The tooltip of a show-rule mark: "Shown when: <rule>", then the verdict now when there is one. */
export function ruleTitle(showExpr, verdict) {
  const line = showExpr ? `Shown when: ${showExpr}` : 'Has a show rule';
  return verdict ? `${line}\n${verdict}` : line;
}

/* The column header's tooltip: every mark of a row and what it means. */
export function rowLegend() {
  const next = Object.values(VERDICT_MARKS).map((mark) => `${mark.looks} = ${mark.means}`).join(' · ');
  const marks = Object.values(ROW_MARKS).map((mark) => `${mark.looks} = ${mark.means}`).join(' · ');
  const kinds = KIND_LOOKS.map(([, looks, means]) => `${looks} = ${means}`).join(' · ');
  return 'Label from the definition, or the element name when it has none.\n' +
    `Valid column: ${next}\nMarks: ${marks}\nKinds: ${kinds}`;
}
