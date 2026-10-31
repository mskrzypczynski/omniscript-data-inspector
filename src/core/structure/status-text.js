'use strict';

/* What the status bar says on the Structure tab, in plain words:
 *   Plan Selection (step 4 of 5) · 22 elements · 2 hidden
 * The property the definition was read from and the index the active step came
 * from are not in the line; they go in its tooltip.
 *
 * Pure: no DOM, no chrome.*. */

const plural = (count, one, many) => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

/* { name, number, of } for the step the script is on among the script's steps,
 * or null when it is on none (or the definition does not say). */
export function stepPosition(elements, current) {
  if (!current) return null;
  const steps = elements.filter((element) => element.category.key === 'step');
  const index = steps.findIndex((step) => step.key === current.key);
  if (index < 0) return null;
  return { name: current.label || current.name, number: index + 1, of: steps.length };
}

/* The left side. `shown` is how many elements the filters let through, `total`
 * all of them, `hidden` those the rules hide for certain. Counts that are zero
 * are left out. */
export function statusLeft({ total, shown, hidden, step }) {
  if (!total) return 'No definition loaded';
  const parts = [];
  if (step) parts.push(`${step.name} (step ${step.number} of ${step.of})`);
  parts.push(shown === total
    ? plural(total, 'element', 'elements')
    : `${shown.toLocaleString('en-US')} of ${plural(total, 'element', 'elements')}`);
  if (hidden) parts.push(`${hidden.toLocaleString('en-US')} hidden`);
  return parts.join(' · ');
}

/* The tooltip: where the figures come from, with the property names. */
export function statusTitle({ defProp, activeIndex, hidden }) {
  const lines = [`Read from the ${defProp} property of the script.`];
  lines.push(activeIndex === null || activeIndex === undefined
    ? 'The definition did not say which step the script is on.'
    : `The step is read from the definition's asIndex (${activeIndex}).`);
  if (hidden) lines.push('Hidden: elements whose show rules are false now, or whose parent is hidden. A rule the panel can\'t tell about is not counted.');
  return lines.join('\n');
}
