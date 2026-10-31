# Changelog

Each release lists what a person using the panel will see, grouped by tab. The
newest release is first.

## 2.0.0 (next)

Licence: GPL-3.0.

This release collects everything that is new or changed since 1.5.1, the last
published version.

### Everywhere

- The toolbar popup shows the steps for the browser it runs in: the {=} OmniScript tab next to Elements and Console in Chrome, Edge and other Chromium browsers, next to Inspector and Console in Firefox (under » when DevTools hides it), with the DevTools shortcut for Windows, Linux and Mac. In Firefox it adds that the panel reads the top document only.
- The names of controls in the help, the tours and the guides (Rescan, Refresh, Auto-refresh and so on) are drawn as small button-like chips, so it is clear which word is a button. The reference page on the website draws them the same way.
- The tour's filter step says what the filter of the tab on screen takes (a path or key=value on Data; override: on Structure; in:, url:, step: and repeat: on Calls) instead of pointing at a `?` key that does nothing.
- The help key is `h` (not `?`): Chrome DevTools keeps `?` and F1 for its own settings, so the panel never saw them. It works when the focus is not in a text field; the `?` button still opens the help.
- Runs in Firefox (and browsers built on it, such as Zen, LibreWolf and Floorp) as well as in Chrome, Edge and other Chromium browsers. In Firefox the panel reads the top document of the page only, so the Frame picker is not there and a script inside a frame from another site is not listed. The same storage permission and nothing sent, in every browser.
- The Remote actions tab is now called Calls, because it lists every Data Mapper, Integration Procedure and Remote Action call and not only the Remote Action element. A tab order saved under the old name still opens in the same order.
- Settings have a dialog of their own, behind a gear in the top bar (shortcut: `,`), grouped General, Data, Calls and Open in Designer. The gear carries a count while any setting differs from its default; Settings that differ lists each one with Reset, and Restore default settings puts them all back without reloading DevTools. Data property, Definition property and Show the Frame row sit in a "Reading another page" fold that opens by itself while one of them is changed.
- Remember my settings (in Settings, on by default) keeps the settings and the views you last chose in this browser's extension storage and puts them back when DevTools opens. Preferences only: never data, values, filters or calls. Failed only, Visible only and the Data and Definition property names start fresh in every session, so a filter left on never hides rows the next day. Unticking it deletes what was kept.
- Mask values at start (in Settings, off by default) turns the Mask values switch on each time DevTools opens. The flag is kept on its own whether or not Remember my settings is on; unticking it deletes it. The switch itself is still never stored. Mask values covers everything that leaves the panel: copies, saved files, exports, failure texts and Copy report.
- Text size: S, M, L or XL in Settings, and Ctrl/Cmd + = / - / 0 inside the panel, scale every tab at once.
- Refresh rate (in Settings, under Data): Fast, Normal (the default) or Gentle sets how often the Data tab re-reads while Auto-refresh is on.
- Open in Designer: an icon after the OmniScript picker opens the selected script in its designer in a new tab, the OmniStudio Builder for core OmniStudio, the OmniScript Designer for a managed package. The guess is made once for the whole org and can be forced in Settings (Auto, Builder (core), Designer (managed) with a namespace). The panel only builds the address.
- Copy report (in Settings, under Tools) puts a few lines of Markdown on the clipboard for a ticket: the script, the extension version, the step it is on, the size of the data and the last failed calls with their reasons.
- Help is written at three depths: each control has one plain line, which is also its tooltip; "how" opens a few sentences in place; "More on the website" opens the rest on the reference page. Help opens with "What do you want to do?", a few common questions with their steps and a link to a full guide. The filter box narrows entries and shortcuts to the ones that contain every word. Right-click a control and choose Help: name, or press `h` on it, to open its entry alone.
- Documentation on the product site: a searchable reference of every help entry, and task guides (get started, why a field is hidden, why Next will not advance, why a call failed, what changed in a step, where a value came from, what the panel keeps, how to report a problem).
- A short tour the first time the panel opens, and one for each tab the first time you open it: a few tips, each ringing a real control. Don't show tours stops them all; Show tours again in Settings starts them over. Only which tours were seen is stored.
- Tabs can be dragged, or moved with Alt+Shift+arrows; the order is kept and the 1–3 keys follow it.
- Focus mode: Ctrl+\ (Cmd+\ on a Mac), or the grip on the divider, hides the list on Structure and Calls so the detail takes the full width.
- A narrow panel keeps working down to 340 px: each toolbar moves its deeper-dive controls into a … menu at its end, and the top bar wraps onto two rows.
- The top bar: Rescan has its own icon, the Settings gear and `?` sit at its right edge, and the Frame picker, Embedded scripts (formerly Child scripts) and Inspect element sit in a second row shown with Show the Frame row in Settings.
- With no OmniScript on the page, the first screen says in one line what to do, and More help opens a No OmniScript found entry with the things to try.
- Status bar: each tab's own counts, the selected script as Type/SubType/Language, the extension version, and a Buy me a coffee button that opens buycoffee.to.
- Colour is never the only cue, the theme colours meet contrast minimums in light and dark, every list header stays in view while the list scrolls, and context menus work from the keyboard.

### Data

- Form is a new view of the data, between Tree and Raw: each key is a row with the label of the element that owns it and the element's name dimmed after it, and a list or object opens in place. The view you last chose comes back with Remember my settings.
- A value that changed since the previous read flashes amber for a few seconds, and a collapsed branch that holds a change is marked with a dot, so you know where to open.
- The filter box takes an OmniScript path (Step:Rows|2:Field) and key=value as well as text; a search that finds nothing says so in one line with Clear filter.
- Right-click a row (or press the menu key) to copy its value, key, path or %merge% field, filter to the key, show it in Structure, open the record behind an Id or open or close the branch. The same buttons appear on a row on hover and keyboard focus.
- A value that is a record Id gets an Open record button, which opens the record in a new tab from the page's own address.
- Copy JSON and Save file are one Export menu, and both write the page's own text, in its key order and with every digit of long numbers.
- While you scroll, the open branches the first visible row sits inside stay pinned at the top; click one to scroll to its row.
- Big data is drawn a window at a time as you scroll, so nothing is cut off; a drag or Ctrl/Cmd+A over a long tree says how many rows were copied.
- The tree works from the keyboard (arrows, Home, End, Enter, c), and Alt+click opens or closes a branch with everything inside it.
- Expand all and Collapse all stay in place in every view, greyed out where they do nothing.
- Reading a large data JSON is much faster, and a read caught mid-write no longer loses what the next good read brings.

### Structure

- Every fact of the detail pane is a card: Current value, Formula, Set Values, Options, Merge fields, Additional input, Visibility and Validation, each with its verdict as a tag and a Copy button that honours Mask values.
- The Current value tab comes first: a simple value with a quiet type hint, and for a step or a block a Form | Tree | Raw switch that opens on Form.
- The Visibility card judges the show rule against the live data: Hidden, Shown or Can't tell, then one row per condition with whether it is met now (● met, ○ not met, ? can't tell), the Field, what it Must be and what it Is now, in plain words, and the rule as written. The status bar counts the hidden elements.
- The Valid column marks what would stop Next now (✕), what the panel cannot tell (–) and, on a step, ✓ when nothing does. The step's Validation tab lists what may stop Next: required fields still empty (row by row in a repeat block), validations and Set Errors with their verdicts, and the step's custom components.
- A Messaging, Validation or Set Errors element has a Validation tab: whether it fails now, the message it shows or the errors it sets, and its condition as a table. A toast says when Set Errors start to fire on the current step while another tab is showing.
- Formulas in show rules, Set Values and Formula elements are worked out as estimates, marked ≈ (estimated), and never counted as a failure; one the panel cannot work out says can't tell.
- A Set Values element's tab has one row per assignment: the Target, the Expression as written, the Computed value it gives now and the Current value the target holds, with an amber differs tag on a mismatch.
- Select, Radio, Multi-select, Lookup and Type Ahead elements that list their options get an Options tab, with a tick on the option the data holds and an amber No match tag when it holds none of them.
- A Properties tab shows an element's settings under plain names; hover one, or click its small i, for what it means. Keys the runtime uses for itself sit behind Show internal.
- The Calls tab of an action says what it Sends and its Response node, read from its settings, lists its extra input with what it comes to now, and lists the matching captured calls.
- With no element selected, the detail pane summarises the script: Type/SubType/Language, element counts by kind, what it calls, overridden elements and custom labels.
- Elements a custom Lightning web component overrides are marked, and the filter takes override: to list them.
- Repeat Block and Edit Block elements show one row at a time (Row 1 of 3) and the tabs follow it.
- Value type hints: an amber mark when the live value does not have the shape its type promises.
- The list is easier to read: an icon per kind of element, a Marks column for required, hidden, show rule, calls, override and missing label, sections that fold with their counts, the step the script is on tinted, and its row pinned while you scroll.
- The toolbar is one row: Refresh, Current step, Follow current step, the filter, View (Highlight on hover, Visible only), Expand all and Collapse all. Right-click a row for Copy name, Copy OmniScript path, Show in Data, Highlight on page, and Expand or Collapse this branch.
- Editing in the Designer redraws the tab by itself, keeping your selection and folds.

### Calls

- A chainable Integration Procedure that ran as several calls is one row with a "chain · 3 calls" tag; open it to see each call.
- A call with the same input and options as one a few seconds before carries a "repeat ×2" tag.
- The filter box takes in: (inputs, options and outputs), url:, step: and repeat: as well as names.
- Show raw, in a call's right-click menu, shows the request as the page sent it and the answer as it came back; fields that look like credentials are hidden.
- Copy input (the { } button) copies a call's bare input as JSON.
- A call with no usable response, a session that expired or an Aura system error counts as failed; a failed call opens on its Output, where the reason is.
- The tab badge is grey and counts the calls in view; it turns red and counts the failed calls as soon as any failed, whatever the filters say.
- Recording / Paused: the toolbar button says whether calls are captured; click it to pause and resume.
- Clear on reload (in Settings, off by default) starts a new list on every page load; otherwise the list is kept across reloads.
- Time format (in Settings): exact milliseconds, or seconds and minutes.
- Took shows the round trip; hover it for where the time went.
- POST calls to an Integration Procedure's REST endpoint are listed as Integration Procedures.
- Every row is one line: the type tag, the name, its tags, the time and the Result glyph (✓, ✕, –), with the word and the HTTP status in its tooltip.
- The detail trees have the same right-click menu as Data.

### Under the hood

- The extension is licensed under the GPL-3.0.
- The code in src/core is split by tab (data, structure, actions and shared), panel.css is in sections by component, and the help text is in src/ui/help.
- CI compares the store screenshots with the committed ones on every pull request, runs axe-core over every tab in both themes, keeps performance budgets for a 3 MB data JSON and a 500-call list, and builds and lints the Firefox package.
- Bug reports use an issue form that asks for the version, the package flavour and the Copy report text.
