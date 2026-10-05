'use strict';

/* The readable half of the Validation tab of the Structure detail pane. */

/* The readable half of the Validation tab: what fires, when, and what the
 * user sees. The raw propSetMap is rendered underneath as the source of
 * truth, exactly like the Visibility tab. */
export function renderValidationSummary(validation, container) {
  if (!validation) return;

  function line(className, label, text) {
    const div = document.createElement('div');
    div.className = className;
    if (label) {
      const strong = document.createElement('b');
      strong.textContent = `${label}  `;
      div.appendChild(strong);
    }
    div.appendChild(document.createTextNode(text));
    container.appendChild(div);
  }

  if (validation.kind === 'set-errors') {
    if (validation.triggerExpr) line('cond-expr', 'Sets error when:', validation.triggerExpr);
    else line('cond-expr', 'Sets error:', 'unconditionally while this element is reached');
    validation.errorMap.forEach((m) => line('cond-expr', `Error on ${m.element}:`, `“${m.message}”`));
    if (validation.message) line('cond-expr', 'Message:', `“${validation.message}”`);

    line('valid-note', '', 'Checked ' + (/^step$/i.test(validation.runsOn || 'step')
      ? 'when the user moves between steps.'
      : `on ${validation.runsOn}.`));
    line('valid-note', '', 'While the condition holds, the message is placed on the named ' +
      'element (often on an earlier step) and the user cannot advance; it clears ' +
      'once the condition no longer matches.');
  } else if (validation.kind === 'messaging') {
    if (validation.validateExpr) line('cond-expr', 'Expression:', validation.validateExpr);
    validation.messages.forEach((m) => {
      const suffix = m.condition ? `  —  when ${m.condition}`
        : (m.when === 'true' ? '  —  when the expression is true'
          : m.when === 'false' ? '  —  when the expression is false' : '');
      line('cond-expr', `${m.type || 'message'}:`, `“${m.text || ''}”${suffix}`);
    });
    line('valid-note', '',
      'The element evaluates its expression and shows the matching message in place; ' +
      'a Requirement or Error message also blocks step navigation.');
  }

  if (!container.childElementCount) {
    line('valid-note', '', 'Validation is configured on this element — see the raw definition below.');
  }
}
