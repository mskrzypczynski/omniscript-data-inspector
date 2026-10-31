'use strict';

/* What the settings of an element mean, in a sentence or two for someone who
 * builds OmniScripts in the designer and has never read a definition. Shown
 * beside the name in the Properties tab. Where the panel is not sure of the
 * meaning, the text says so ("as far as the panel knows").
 *
 * Pure: no DOM, no chrome.*. */

export const MAX_DOC_LENGTH = 240;

const UNSURE = '(as far as the panel knows)';

const DOCS = {
  /* What the person sees */
  label: 'The text shown for the element on screen. In a multi-language script it is often a custom-label key, which is looked up in the script\'s custom labels.',
  textKey: 'The custom-label key whose text is shown instead of the typed text, so one script can speak several languages.',
  text: 'The text a Text Block shows, usually HTML. In a multi-language script it is held under a custom-label key instead (see Text key).',
  placeholder: 'Grey hint text shown inside an empty input, such as "Enter your name".',
  helpText: 'A short explanation shown next to the element, often behind a small help icon.',
  helpTextPos: 'Where the help text appears relative to the element, for example above or to the right.',
  instruction: `The line of guidance shown under a step's title, telling the user what to do on it ${UNSURE}.`,
  hideLabel: 'Hides the element\'s label on screen. The element and its value are still there.',
  controlWidth: 'How wide the element is on its row, in columns out of 12: 12 fills the row, 6 is half. Typical values are 12, 6 and 4.',
  inputWidth: `How wide the input itself is inside the element's area, in columns out of 12 ${UNSURE}.`,
  controlType: `How the element is drawn, for example a choice as a dropdown, radio buttons or tiles. The accepted words depend on the element type ${UNSURE}.`,
  HTMLTemplateId: 'The name of a custom HTML template used to draw this element instead of the standard one. Empty means the standard look.',
  lwcComponentOverride: 'The name of a custom Lightning web component that draws this element instead of the standard one.',
  lwcOverride: 'The same as lwcComponentOverride, as a few scripts spell it: the custom Lightning web component that draws this element instead of the standard one.',
  imgId: `The id of the image an Image element shows, a stored document or file ${UNSURE}.`,

  /* When it is there, and whether it can be changed */
  required: 'The user cannot go on until the element holds a value. A required checkbox has to be ticked.',
  readOnly: 'The user can see the value but not change it. The script can still set it.',
  hide: `Keeps the element out of sight while its value stays in the data. A show rule is the way to hide it only sometimes ${UNSURE}.`,
  show: 'The condition under which the element appears. With no rule it is always shown. Open the Visibility tab to see whether it is true right now.',
  conditionType: 'How the show rule is applied: "Show if True" shows the element while the rule is true, "Hide if False" hides it while it fails. Both read the same for most scripts.',
  accessibleInFutureSteps: `Lets later steps read this element's value in their rules and %merge% fields even after the user has moved on ${UNSURE}.`,
  showPersistentComponent: `On a step: whether the script's persistent component, a header or side panel kept on screen, is shown on this step ${UNSURE}.`,
  persistentComponent: `The settings of the persistent component, a panel such as a header or side summary that stays on screen across steps ${UNSURE}.`,
  disOnTplt: `Probably "disable on template": a switch for this element when the script runs in a template ${UNSURE}.`,

  /* Repeating */
  repeat: 'Lets the user add more copies of the element. The data then holds a list instead of a single value.',
  repeatClone: 'When the user adds another copy, the new one starts with the values of the previous one instead of empty.',
  repeatLimit: 'The most copies the user can add. Empty or 0 usually means no limit.',
  rpAddLabel: 'The text of the button that adds another copy of a repeating element, for example "Add another".',
  rpRemoveLabel: 'The text of the button that removes a copy of a repeating element.',

  /* What goes in */
  defaultValue: 'The value the element holds when the script starts, before the user types. May use a %merge% field to take it from the data.',
  mask: 'A pattern the input formats itself to as the user types, for example (999) 999-9999 for a phone number, where 9 stands for a digit.',
  pattern: 'A regular expression the entered text has to match. If it does not, the pattern error text is shown.',
  ptrnErrText: 'The message shown when the entered text does not match the pattern.',
  minLength: 'The fewest characters the text may have.',
  maxLength: 'The most characters the text may have.',
  min: 'The smallest value a number or date may have.',
  max: 'The largest value a number or date may have.',
  step: 'The size of one step of a number input or slider, for example 5 or 0.01.',
  dateFormat: 'How a date is shown to the user, for example MM-dd-yyyy. It affects the screen, not the stored value.',
  modelDateFormat: 'The format in which a date is kept in the data, usually an ISO form such as yyyy-MM-dd.',
  dateType: `Whether a date is kept as text or as a date value in the data ${UNSURE}.`,
  timeFormat: 'How a time is shown to the user and, in most builds, kept in the data, for example HH:mm.',
  expression: 'The formula a Formula element works out, written with %Field% references, for example %Price% * %Quantity%.',
  aggregate: `Only for elements that sum up or otherwise combine values of a repeating group; it names what is combined ${UNSURE}.`,
  index: `A position number the designer keeps for the element; the script does not read it as data ${UNSURE}.`,

  /* Choices */
  options: 'The choices of a dropdown, radio group or multi-select typed in by hand: each has a name (what is stored) and a label or value (what is shown).',
  optionSource: 'Where a choice gets its options from: typed in by hand, read from a picklist or object, or taken from data already in the script.',
  dataJSONPath: 'For a choice whose options come from the data: the path to the list in the data, for example Step:Cars.',

  /* Checks and messages */
  validateExpression: 'A rule or formula that has to hold for the entered value to be accepted. When it fails, the error message is shown and Next is blocked.',
  validateExpressionSubmit: `The same kind of check as the validation expression, run when the user submits instead of while typing ${UNSURE}.`,
  validationRequired: `When the check runs: Step is when the user moves between steps ${UNSURE}. Each message's own type decides whether it blocks Next.`,
  errorMessage: 'The text shown when the element\'s own check fails, in place of the default message.',
  messages: 'The messages a Messaging or Validation element can show, each with a type (Requirement, Error, Warning, Info) and the text.',
  elementErrorMap: 'For a Set Errors element: which element each error message is put on.',
  elementValueMap: 'For a Set Values element: the list of assignments, each a target field and the value or formula to put there.',

  /* Calls */
  bundle: 'The name of the Data Mapper (DataRaptor) the action runs to read or write Salesforce data.',
  integrationProcedureKey: 'The Integration Procedure the action runs, written as Type_SubType.',
  preTransformBundle: 'A Data Mapper that reshapes the request data before the call is made.',
  postTransformBundle: 'A Data Mapper that reshapes the response after the call returns, before it is put into the data.',
  remoteClass: 'The Apex class a Remote Action calls.',
  remoteMethod: 'The method of the Apex class that is called.',
  remoteOptions: 'Extra settings passed to the Remote Action, as keys and values. Typical use is fixed arguments the class expects.',
  sendJSONPath: 'Which part of the data is sent to the call, as a path. Empty sends the whole data.',
  sendJSONNode: 'The name under which the sent data is wrapped in the request, for classes that expect a named node.',
  sendOnly: `Send the data without using the response: nothing is written back into the data ${UNSURE}.`,
  sendOnlyExtraPayload: 'Send only the extra payload and not the rest of the data.',
  responseJSONPath: 'Which part of the response is kept, as a path. Empty keeps the whole response.',
  responseJSONNode: 'Where in the data the kept response is put. Empty merges it in at the top.',
  chainOnStep: `Runs the action as part of moving off its step instead of at its own place in the flow ${UNSURE}.`,
  enableDefaultAbort: 'If the call fails, show the standard failure message and let the user go back or stop, instead of carrying on.',
  failureAbortMessage: 'The message shown when the call fails and the script is stopped.',
  failureGoBackLabel: 'The text of the button that sends the user back to the previous step after a failure.',
  failureNextLabel: 'The text of the button that lets the user go on after a failure.',
  failureAbortLabel: 'The text of the button that ends the script after a failure.',
  redirectPreviousWidth: `The width of the Previous button on a Redirect or action step, in columns out of 12 ${UNSURE}.`,

  /* Steps and navigation */
  allowSave: 'Offers Save for later on this step, so the user can leave and come back to the script.',
  saveLabel: 'The text of the Save for later button.',
  cancelLabel: 'The text of the Cancel button.',
  nextLabel: 'The text of the Next button on this step.',
  previousLabel: 'The text of the Previous button on this step.',
  completeLabel: 'The text of the button that finishes the script on the last step.',
  autoAdvance: 'Moves on to the next step by itself as soon as the user picks a choice, without pressing Next.',
  knowledgeOptions: `Settings for showing Salesforce Knowledge articles on the step ${UNSURE}.`,
  businessCategory: 'A label for the kind of business event the step reports, used for tracking and analytics.',
  businessEvent: 'The name of the business event reported when the user completes the step, used for tracking and analytics.',

  /* Runtime */
  pubsub: `Publishes the step's data so other components on the page can listen to it ${UNSURE}.`,
  bus: `The channel name used when the data is published to other components ${UNSURE}.`,
  ssm: `A flag the designer writes for the runtime. Its meaning is not documented ${UNSURE}, and it can be ignored when reading a script.`
};

export const PROPERTY_DOCS = new Map(Object.entries(DOCS));

/* The sentence for a key, or '' when it is not known. */
export function propertyDoc(key) {
  return PROPERTY_DOCS.get(key) || '';
}

/* The tooltip of a row's name: the key as the definition spells it (when the
 * panel shows a friendlier name) and what it means. */
export function propertyTooltip(key, label) {
  const doc = propertyDoc(key);
  const lead = label !== key ? key : '';
  if (lead && doc) return `${lead}: ${doc}`;
  return lead || doc;
}
