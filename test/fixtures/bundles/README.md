# Debug bundles as fixtures

Every `*.json` file here is a debug bundle (the file "Save a debug bundle"
writes). `test/core/fixtures.test.js` reads each one, rebuilds the script's
elements from the definition it holds, and runs the rules that judge a script
over it: Problems, what may stop Next, visibility verdicts, chain grouping and
repeats. A bundle must pass without an exception, and a bundle with expected
counts must give them. A demo script proves the code runs; a real bundle proves
it is right.

## demo.json

Built, not saved by hand: `npm run demo-bundle` drives the panel with the
fictional "Account Onboarding" script the store screenshots use (so it needs
Playwright, like `npm run screenshots`) and writes it here. It is the same file
every time. Its counts are written in `fixtures.test.js`; if a rule changes
what it finds, look at why before updating them.

## blocks.json

Written by hand (not saved from a panel) with invented names and plain values,
to cover what the demo script does not: a repeat Block with one empty row, an
Edit Block, a Set Errors with and without a condition, a Messaging element, a
Custom LWC, a Formula, a show rule that rests on that formula's estimate, and a
multi-language header with one custom label missing. Its counts are written in
`fixtures.test.js`, each with the reason it is what it is. It stands in until a
masked bundle of a real script with these parts is added.

## Adding a bundle from a real org

1. In the panel, turn **Mask values** on (top bar) and check the switch
   glows. Open the help (**?**), then **Save a debug bundle** at the foot of the help.
2. Mask values replaces strings and numbers in the data with placeholders. It
   keeps the structure, the keys and **the script's own definition**: element
   names, step names, labels, help texts, custom labels, remote targets. Those
   belong to the org. Open the file and replace every real name with an
   invented, generic one, the same way everywhere (a text editor's replace is
   enough). Also look at `script.label`, the URLs in `calls` and any text in
   `definition.raw` and `definition.headerRaw`. Never commit a real user's
   names, ids, URLs or element names.
3. Save the result here as a short descriptive name, for example
   `managed-package-checkout.json`. Keep the file as it is otherwise: do not
   tidy the structure, the point is that it is what a panel wrote.
4. Run `npm test`. The "runs through every rule" case picks the new file up by
   itself. If it throws, that is a finding about the rule, not a reason to drop
   the file.
5. To pin what the rules find, add a case to `fixtures.test.js` with the counts
   written down and a comment saying what each stands for. A bundle that breaks
   a count is a finding, not a test to loosen.

Bundles from older versions are fine: the readers treat a missing part as
nothing, which is part of what is being tested.
