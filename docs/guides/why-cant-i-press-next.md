---
title: Why can't I press Next?
summary: List what may be stopping Next on the current step: empty required fields, firing Set Errors and validations, and custom components.
order: 3
---

Next is greyed out, or it does nothing, and the screen does not say why. The Structure tab judges the step the script is on against the data right now. It is a best effort, so read what it finds as a short list of suspects.

## Find the step

1. Open the **Structure** tab and pick your OmniScript. [[Follow current step]] is on by default, so the step the script is on stays selected. If you have browsed away, press [[Current step]].
2. Look down the **Valid** column: a ✕ on a field would stop Next now, and the step's ✕ carries their sum. A – means the panel cannot tell, and blank means there is nothing to judge. See [Valid column](reference:structure-valid-column).
3. Open the step's **Validation** tab. It appears while something may stop Next on the step, or while the step holds a custom component. See [Step validation](reference:structure-step-validation).

## Read the step's Validation tab

The tab is a column of cards, judged against the data right now:

1. **Required and empty.** The visible required elements of the step whose value is empty. A required checkbox must be ticked. Fields inside an Edit Block are left out: they are checked when the row is saved.
2. **Validation rules.** Each Set Errors and Messaging / Validation element of the step, with Fails, Passes, Hidden or Can't tell. A failing one is open; the others fold to one line.
3. **Custom components.** Each with Shown or Hidden.

Click a name to select that element and see why it counts. A hidden required field is not listed, because hidden fields do not stop Next. See [Why is this field hidden?](guide:why-is-this-field-hidden).

## Repeat rows

For an element inside a Repeat Block or Edit Block, the detail head shows "Row 1 of 3" with ‹ › buttons. Step through the rows. The step's Validation tab follows the row you chose, and rows count from 1, as in OmniScript paths. See [Repeat rows](reference:structure-repeat-rows).

## Set Errors and validations

Select a Set Errors or Messaging element and open its **Validation** tab. Its card says whether the element fails now, which message it shows or which errors it sets, and the condition as a table: Field, Must be and Is now, with a mark for each condition. A Requirement or Error message, or a firing Set Errors, blocks Next; an Info or Warning message does not. See [Validation tab](reference:structure-validation-tab).

If errors start to fire while you are on another tab, a toast says so, for example "Set Errors fire on Intro: 2". See [Set Errors toast](reference:structure-set-errors-toast).

## What the panel cannot see

- A custom component may carry its own required controls or its own Next and Previous buttons. These cannot be read from the definition, which is why the tab only reminds you of them.
- Server-side checks, and rules the panel cannot evaluate, are not covered.
- A finding that rests only on a formula's estimate is never counted as a failure. See [Formulas](reference:structure-formulas).

If nothing is listed and Next still fails, the reason is probably in a call. Open **Calls** and read [Why did this call fail, and what did it send?](guide:why-did-this-call-fail).
