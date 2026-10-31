'use strict';

/* "What do you want to do?": the questions people open the help with, each a
 * few steps in place and a link to the full guide on the website
 * (docs/guides/<guide>.md). Kept short on purpose: the steps say where to
 * click, the guide says why. Keep these in step with the guides and the tabs. */

import { Features } from '../features.js';

/* Getters, so a step about a gated feature is left out whenever its gate is
 * closed, whatever order the modules loaded in. */
export const TASKS = {
  get list() {
    return [
      {
        question: 'Why is this field hidden?',
        guide: 'why-is-this-field-hidden',
        steps: [
          'Open Structure and type the field\'s name in the filter.',
          'A dimmed row with a closed eye is hidden right now.',
          'Click it: the Visibility tab says which rule hides it and what the data holds.',
          Features.has('structure.whatif') ? 'Try another value in the Is now cell to see what would show it.' : null
        ]
      },
      {
        question: 'Why can\'t I press Next?',
        guide: 'why-cant-i-press-next',
        steps: [
          'Open Structure; [[Current step]] selects the step the script is on.',
          'A ✕ in the Valid column marks a field that would stop Next.',
          Features.has('structure.steps') ? 'Open the step\'s Validation tab for everything that may stop it.' : 'Click a field with a ✕ to see its rule and value.'
        ]
      },
      {
        question: 'Why did this call fail?',
        guide: 'why-did-this-call-fail',
        steps: [
          'Open Calls and use the page; the tab shows ✕ and a count once a call fails.',
          'Tick [[Failed only]], then click the red row.',
          'It opens on Output, where the reason is; Input shows exactly what was sent.'
        ]
      },
      {
        question: 'Where did this value come from?',
        guide: 'where-did-this-value-come-from',
        steps: [
          'Find the key in Data with the filter.',
          Features.has('data.changes') ? 'Tick [[Track changes]], click through the script, then right-click the row: Where is this set?' : 'Right-click the row and choose Show in Structure.',
          Features.has('structure.references')
            ? 'In Structure, Written by lists the Set Values elements that write it.'
            : 'In Structure, the Set Values elements that name it show what they write in their Set Values card.'
        ]
      },
      {
        question: 'What changed in this step?',
        guide: 'compare-two-runs',
        steps: Features.has('data.compare')
          ? [
            'Open Data and tick [[Track changes]] before you click through the step.',
            'Previous change and Next change walk the marked values.',
            '[[Compare data]] → Since this step began puts the two reads side by side.'
          ]
          : [
            'Open Data; values that change flash amber as you use the page.',
            'Open Calls to see what each call sent and returned during the step.'
          ]
      },
      Features.has('calls.test')
        ? {
          question: 'How do I test an Integration Procedure?',
          guide: 'test-an-integration-procedure',
          steps: [
            'Turn on Allow test calls in Settings, under Sending.',
            'Select a call in Calls and press Re-run…, or press New test call….',
            'Edit the input and Send; the answer is listed as a new row.'
          ]
        }
        : null,
      {
        question: 'How do I compare two runs?',
        guide: 'compare-two-runs',
        steps: [
          Features.has('data.compare') ? 'Data: [[Compare data]], Before and After from the last reads.' : null,
          Features.has('calls.compare') ? 'Calls: select a call, press b to set it as baseline, then select another.' : null,
          Features.has('structure.compare-definition') ? 'Structure: More → Compare definition… against an exported definition.' : null,
          Features.has('shell.compare-json') ? 'Any two JSON texts: [[Compare JSON]] at the end of the tab strip.' : null
        ]
      }
    ].filter(Boolean)
      .map((task) => ({ ...task, steps: task.steps.filter(Boolean) }))
      .filter((task) => task.steps.length);
  }
};
