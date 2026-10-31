---
title: Why is this field hidden?
summary: Find the rule that hides an element and see what the data holds now, condition by condition, in plain words.
order: 2
---

A field you expected is not on the screen. In OmniScript that usually means a show rule is false, or that the field sits inside something hidden. The Structure tab can tell you which, using the data the script holds right now, so you do not have to read the rule JSON.

## Find the rule

1. Open the **Structure** tab and pick your OmniScript in the top bar. Press [[Rescan]] if the list is empty.
2. Type part of the field's name, type or label in the filter box. See [Filter](reference:structure-filter).
3. Look for a dimmed row with a closed eye: it is not shown right now, and the status bar counts these ("2 hidden"). Leave [[Visible only]] (in the [[View]] menu) off, or hidden rows are not listed. See [Hidden elements](reference:structure-hidden-elements).
4. Click the row. When a rule hides the element, the **Visibility** tab opens with the reason. On another detail tab, the grey chip in the head brings you back to it.

If there is no **Visibility** tab, the element has no show rule the panel can see. Children of a hidden element are hidden too, so check the step or block above it: the card then has a **Hidden by** row naming it.

## Read the Visibility card

The tag in the card's header says **Hidden**, **Shown** or **Can't tell**. Hover it for one plain sentence, such as `Hidden: Step:Plan is "Standard", not "Gold"`. Below it is the rule as a table, one row per condition:

- The mark says whether the condition is met now: ● met, ○ not met, ? the panel cannot tell.
- **Field** is what the rule reads. If the script has an element by that name, the name is a link that selects it.
- **Must be** is what the rule wants, for example `= "Gold"`.
- **Is now** is what the data holds. It reads empty or not in data rather than staying blank.

Under each condition the same is said in plain words. A group says what it needs and how it stands, such as "All of these must be true; 1 of 2 is not". The **As written** row ends the card with the rule exactly as the Designer defines it. More in the [Visibility tab](reference:structure-visibility-tab) entry.

## Follow the field back

1. Press **Show in Data** to open the Data tab at the element's value, or choose it in the row menu.
2. If **Is now** says not in data, the data holds nothing at that key yet. A Data Mapper or Set Values element that should have written it has not run, or wrote it somewhere else.
3. To see what a call sent and returned, open the element's **Calls** tab, or read [Where did this value come from?](guide:where-did-this-value-come-from).

## When the panel is unsure

- A **?** means an unusual operator or a formula the panel cannot evaluate. It never guesses.
- **estimated ≈** marks a formula the panel worked out itself. Treat it as a good hint, not a verdict. See [Formulas](reference:structure-formulas).

The panel judges rules against the live data, not the `bShow` flag saved in the definition. If the two disagree, trust the Visibility tab.

Next: if the field is visible but **Next** will not advance, read [Why can't I press Next?](guide:why-cant-i-press-next).
