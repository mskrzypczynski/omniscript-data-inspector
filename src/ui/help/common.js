'use strict';

/* The "Everywhere" section shown on every tab: the top bar, settings,
 * the debug bundle and the rest of the shell. Each entry is [title, text, { short, keys, more }]: what the control
 * does (its tooltip), how to use it, and the details for the website. */

import { Features } from '../features.js';
import { isFreeBuild } from '../free-build.js';
import { helpPointer } from '../pointers.js';
import { wordedFor } from './variants.js';

const ENTRIES = [
  [`No OmniScript found`, `Nothing is listed in the top bar. Try these in order.
- Open a page that runs an OmniScript and let it finish loading.
- Press [[Rescan]], or reload the page with DevTools open.
- Still nothing: see Show the Frame row and Data property in Settings, under Data, in Reading another page.`, {
    short: `What to try when the top bar lists no OmniScript.`,
    more: `The script may sit inside an iframe, or keep its data on another property. The panel also looks again every few seconds. Every frame, document and open shadow root is searched; closed shadow roots cannot be read.
- If the script sits inside an iframe, tick Show the Frame row in Settings, under Data, in Reading another page, and check the Frame picker.
- If the script keeps its data on another property, change the Data property in Settings under Data, in Reading another page. Click the field to list what the script exposes.`
  }],
  [`Theme`, `Change the theme in DevTools. The panel follows at once, even while it is open.`, {
    short: `The panel uses the DevTools theme, light or dark.`
  }],
  [`Help for a control`, `Right-click a button or switch and choose Help: <name>, or press h while it has focus. The help shows only that control's entry, with its name in the filter box. Type in the box, or clear it, to see the rest.`, {
    short: `Open the help at the entry for one control`,
    keys: `h`,
    more: `Works on the buttons and switches of the top bar and of every tab's toolbar ([[Rescan]], [[Mask values]], [[Refresh]], [[Auto-refresh]], [[Track changes]], the views, [[Expand all]], [[Follow current step]], [[Recording]] and so on). Text fields keep the browser's own right-click menu.`
  }],
  [`Searching this help`, `Type in the box at the top of the help. Every section and the shortcut table narrow to the entries that contain all your words, in any order. The box has focus when the help opens. Clear it to see everything again.`, {
    short: `Narrow the help to the entries that contain every word you type.`,
    more: `Esc still closes the help while the box has focus. The search also reads the details that are kept on the website, so a word only they hold still finds its entry.`
  }],
  [`Links to the website`, `In Help, More on the website and Full guide open the product website in a new tab. The panel passes nothing to it beyond the address of the page, and sends nothing from your org.`, {
    short: `More on the website and Full guide open the product website in a new tab.`,
    more: `They are plain links: nothing is read, stored or sent by the panel when you open one. The website holds the details of every entry and a guide for each question under What do you want to do?.`
  }],
  [`Tab order`, `Drag a tab to another place in the strip, or press Alt+Shift+← / → on a focused tab. The 1–3 keys follow the order shown. The order is kept in extension storage between DevTools sessions. Reset, next to Tab order in Settings, puts it back.`, {
    short: `Put the tabs in the order you prefer`,
    keys: `Alt+Shift+← / →`,
    more: `Restore default settings also puts the tabs back in their default order. Code never assumes where a tab is; only the order you see counts.`
  }],
  [`Focus mode`, `On Structure and Calls, press the shortcut or use the grip on the divider between the list and the detail. Press it again, double-click the divider, or press Esc in the detail to bring the list back at its old width. Nothing is stored.`, {
    short: `Hide the list so the detail takes the full width`,
    keys: `Ctrl/Cmd+\\`,
    more: `The divider stays as a thin strip with the grip while the list is hidden. Each tab keeps its own state while the panel is open.`
  }],
  [`Tour`, `A card points at the OmniScript picker, the tab strip, the filter box and the Settings gear the first time the panel opens; each tab adds a short tour of its own. Next tip, Previous tip, Skip and Esc move or close it. Don't show tours stops them all. Only which tours were seen is stored.`, {
    short: `A short walk through the panel, shown the first time you open it.`,
    more: `The card shows the count (such as 2 of 4) and dots. Nothing is dimmed, and the panel stays usable meanwhile.
- Each tab's tour has three tips at most and shows the first time you open that tab. Each tip rings a real control and says what to do with it. A tab tour never starts while another tour or a dialog is open, and never in the same DevTools window as another tour, so the first one appears the next time DevTools opens, one tab each time.
- Every card has a Don't show tours link that stops all of them; Esc skips only the tour on screen.
- Take the tour, at the top of Start here in this help, closes the help and runs the tour of the tab on screen at once, without forgetting which tours were seen.
- Show the tour again, at the end of Start here, and Show tours again, in Settings under General, clear all of that and start the panel tour again.
- The only thing kept is which tours were seen: four yes-or-no flags (tourSeen, tourSeenData, tourSeenStructure and tourSeenActions) in this browser's extension storage, whether or not Remember my settings is on. Nothing is sent anywhere.`
  }],
  [`Text size`, `In Settings, under General, pick S (90%), M (the default), L (112%) or XL (125%). Ctrl/Cmd+= makes the text larger, Ctrl/Cmd+- smaller and Ctrl/Cmd+0 puts it back to M, wherever the focus is in the panel. The size is kept by Remember my settings (on by default).`, {
    short: `Make the text and controls of every tab smaller or larger`,
    keys: `Ctrl/Cmd+= / - / 0`,
    more: `It scales the text and controls of every tab at once. Ctrl++ also makes it larger. DevTools keeps its own shortcuts outside the panel. A size other than M is listed under Settings that differ, and Restore default settings puts it back.`
  }],
  [`Settings`, `The top bar gear, or the , key. A count on it shows how many settings differ.
- General: Text size, Mask values at start, Remember my settings.
- Data: Refresh rate; Reading another page (property names, Frame row).
- Calls: Time format, Slow call threshold, Clear on reload.
- Tools: Debug bundle, Open bundle…, Compare JSON…, Copy report.`, {
    short: `Change how the panel reads and shows things`,
    keys: `,`,
    more: `Settings last until DevTools is closed, and the settings are kept in this browser's extension storage, on this computer, because Remember my settings is on by default; untick it and they are deleted. The tab order, the flags that the tours were seen and the Mask values at start flag are kept either way.
- General: Text size (see its entry), Mask values at start (kept in this browser even with Remember my settings off; turning it off deletes it), Remember my settings (see their entries) and Show tours again (see Tour). Remember my settings, on by default, keeps the settings and the views you last chose, and puts them back the next time DevTools opens. Filters that hide rows (Failed only, Visible only, Actions only) and the property names start fresh every time. Unticking it deletes what was kept.
- Data: Refresh rate sets how often the Data tab reads (see its entry). Under it, the fold Reading another page holds Data property and Definition property, the element properties the Data and Structure tabs read (jsonDataStr and jsonDef by default; see their entries), and Show the Frame row, the top bar's second row (Frame, Embedded scripts, Inspect element), off by default. The fold opens by itself while any of them differs from its default.
- Calls: Time format, Slow call threshold and Clear on reload. All Apex calls is a box in the tab's toolbar only (see the Calls entries); Restore default settings still turns it off. Slow calls are kept by slow: in the tab's filter box.
- Sending: Allow test calls lets Calls send a call you compose to the org of the page (see Test calls). "Test calls run in your org as your user, through the page's own session. An Integration Procedure or a Data Mapper Load can create or change records." The first time, the switch stays off until you press I understand next to that sentence. Off by default, and never kept: it starts off every time DevTools opens.
- Open in Designer: Auto, Builder (core) or Designer (managed) with a namespace; see the Open in Designer entry.
- Settings that differ lists every setting that differs from its default, with its current and default value; Reset puts one back, live. When none differs it says everything is at its default.
- Restore default settings (it asks to confirm) puts all of them back without reloading DevTools: Tree view, the views you last chose, jsonDataStr and jsonDef, Track changes off, Follow current step on, Collapse done steps, Highlight on hover and Visible only off, Embedded scripts off, Clear on reload off, All Apex calls off, Failed only off, Slow call threshold 0 (2000 ms), Time format ms, Open in Designer Auto, Text size M, Auto-refresh on, Refresh rate Normal, Mask values at start off, Allow test calls off and Mask values off.
- It also puts the tabs back in their default order, and keeps Remember my settings (on by default), captured calls, the history of earlier reads, the watch list and filter text.
- Tools: Save a debug bundle, Open bundle…, Compare JSON… and Copy report (see their entries). Compare JSON… compares two JSON texts you paste, side by side.`
  }],
  [`Mask values`, `Tick [[Mask values]] in the top bar (Mask, in a narrow panel). While it is on, strings and numbers are replaced with placeholders in everything that leaves the panel: copies, saved files, exports, Copy report and the debug bundle. Structure and keys are kept. It is off when DevTools opens unless Mask values at start is ticked.`, {
    short: `Replace strings and numbers with placeholders in everything that leaves the panel.`,
    more: `Covered: Copy JSON, Save file, the per-row copy buttons, the Structure value copy, the Calls export, Copy report and the debug bundle. The watch strip, the watch toasts and the lineage view are masked on screen too. The status bar says "Masking copies and exports" while it is on. In the script's definition, which the debug bundle and Structure's Definition JSON export carry, the answers it holds (the response and defaultValue entries) are masked and every key, name and rule is kept; a definition that is not valid JSON is left out of the bundle. The switch itself is never remembered.`
  }],
  [`Mask values at start`, `In Settings, under General; off by default. Ticked, Mask values is on each time DevTools opens, so nothing leaves the panel unmasked until you turn it off. This one setting is kept in this browser even with Remember my settings off; unticking it deletes it.`, {
    short: `Turn Mask values on every time DevTools opens.`,
    more: `The switch can still be turned off while DevTools is open. The kept thing is a yes-or-no flag, like the tour flags; the switch itself is never stored. While it is on, Settings that differ lists it, and Restore default settings turns it off.`
  }],
  [`Refresh rate`, `In Settings, under Data. Fast, Normal (the default) or Gentle sets how often the Data tab re-reads the script while Auto-refresh is on. Gentle suits a busy page. Structure and Calls are not affected.`, {
    short: `Choose how often the Data tab re-reads the script.`,
    more: `Fast: about twice a second, easing to every 2 seconds while nothing changes. Normal: about once a second, easing to every 4 seconds. Gentle: about every 3 seconds, easing to every 8 seconds. Touching the panel or a change in the data brings the quick pace back.`
  }],
  [`Remember my settings`, `In Settings, under General; on by default. Your settings and the views you last chose are kept in this browser's extension storage, on this computer, and put back when DevTools opens. Unticking deletes them. Filters that hide rows and the property names start fresh. Nothing from the data is kept.`, {
    short: `Keep your settings and chosen views between DevTools sessions.`,
    more: `Kept: the settings listed in the dialog, the views you last chose (Data: Tree, Form or Raw, never Sizes or Changes; Structure: the Current value view, the detail tab you picked by hand and Show internal; Calls: the Input, Output or Options tab you picked by hand) and the watch list, per script (paths and expressions, never values). Never kept: data, filter text, captured calls, the history of earlier reads, Mask values, Auto-refresh and Allow test calls. Failed only, Actions only, Visible only, Data property and Definition property start fresh every time; they still count under Settings that differ while changed. Mask values at start is kept on its own, with Remember my settings on or off (see its entry).`
  }],
  [`Top bar`, `The OmniScript picker lists the scripts on the page; the choice applies to every tab. [[Rescan]] looks again. [[Mask values]] applies to everything that leaves the panel. The Frame picker, [[Embedded scripts]] and [[Inspect element]] are in a second row, shown with Show the Frame row in Settings.`, {
    short: `Choose which OmniScript, and which frame, every tab reads.`,
    more: `Scripts are listed by Type/SubType/Language when their definition says (hover for the element), otherwise by element. Frame filters the list to one document; All frames searches everything.`
  }],
  [`Show the Frame row`, `In Settings, under Data, in Reading another page; off by default. Ticked, the top bar keeps its second row: Frame, Embedded scripts and Inspect element. Unticked, the row is hidden and Embedded scripts and Frame go back to off and All frames.`, {
    short: `Show the top bar's second row: Frame, Embedded scripts, Inspect element.`,
    more: `Use it when you work across frames or embedded scripts. A filter you cannot see should not stay in force, which is why hiding the row resets them. It is one of the settings the count on the gear shows when it is on; Remember my settings keeps it, and Restore default settings puts it back.`
  }],
  [`Embedded scripts`, `Tick it in the top bar's second row, shown with Show the Frame row in Settings. Unticked, each script is listed once and embedded ones are left out; ticked, every one is listed. It is in force only while that row shows.`, {
    short: `Also list OmniScripts placed inside another one, and script components.`,
    more: `An OmniScript placed inside another one, and the components inside a script that carry its data, read the same properties as the script around them, so a 40-element script has 40 of them, and several of them can carry the whole definition. Unticked, each script is listed once (by the element holding the most data). Ticked, every one is listed, with its element name when several share a Type/SubType/Language. A row reads "embedded" for an OmniScript inside another one and "component" for a component of a script. The Data status line says "N embedded scripts hidden" only for real embedded OmniScripts; the other components that are left out are counted in its tooltip ("N other components of a listed script hidden"). Hiding the row puts it back to off.`
  }],
  [`Debug bundle`, `Save a debug bundle, in the Tools row of Settings, writes omniscript-debug-<time>.json for a bug report: the settings, the selected script, its data, definition and recent calls, and what each tab shows. Mask values applies to the org data in it. Labels and Set Values text are kept, so check the file before sharing it. Nothing is sent anywhere.`, {
    short: `Save everything the panel shows as one JSON file.`,
    more: `The file holds: the extension version, whether Mask values is on, the size and theme of the panel, every setting, the selected script and the step it is on, the data (read from the page when you press the button, with the time it was read), the last 12 reads of it (time, step and size, with the values), the script's definition as the page holds it (the same text Structure reads) with the number of elements and the names of the steps, the last 50 captured calls, and what each tab is showing (view, filter, selection, counts and the biggest values). Masked: the data, calls and filter text, and the answers in the definition (its response and defaultValue entries). Kept: keys, element and step names, rules and settings, and the rest of the definition's text, such as labels and Set Values. Data that is not valid JSON is included as raw text, or left out while masking (in the history only its length is given). The file is saved on your computer.`
  }],
  [`Copy report`, `Copy report, in the Tools row of Settings, puts a few lines of Markdown on the clipboard: the script, the extension version, the step, the size of the data, the number of Problems, what may stop Next and the last 5 failed calls. Mask values applies to values quoted in a failure reason. Nothing is sent anywhere.`, {
    short: `Copy a few lines of Markdown about the script, for a ticket or a chat.`,
    more: `The script is written as Type/SubType/Language. What may stop Next is the step's Validation list, best effort. The failed calls come with their reasons and times. A line whose fact is not known is left out. Names and counts are kept when masking.`
  }],
  [`Open bundle`, `Open bundle…, in the Tools row of Settings, reads a debug bundle file and shows its script as it was saved, in place of the page. A bar says "Bundle: <file> · read-only" with Back to live. [[Refresh]], [[Auto-refresh]] and [[Rescan]] are out of use meanwhile. The file is kept in memory only; nothing is sent anywhere.`, {
    short: `Open a saved debug bundle in place of the page, read-only.`,
    more: `The top bar lists one entry, "<script> (loaded from <file>)", the Data tab shows the data and its history, Structure the definition and the step it was on, and Calls the calls. The bar under the top bar reads "Bundle: <file> · saved <time> · read-only". Meanwhile nothing is read from the page, and a change on the page is not picked up. Back to live puts the page, its history and the picker back. A bundle saved with Mask values on shows placeholders. A bundle from an earlier version may lack the definition, so Structure is then empty.`
  }],
  [`Compare JSON`, `Press the button at the right of the tab strip, or Ctrl/Cmd+Shift+L. Fill Before and After by typing, pasting, loading a file, or taking the Data JSON or a call. Press Compare (Ctrl/Cmd+Enter) for the Side by side view. Read loosely accepts near-JSON such as an Apex map. Nothing you paste is sent or stored.`, {
    short: `Compare any two JSON texts side by side`,
    keys: `Ctrl/Cmd+Shift+L`,
    more: `It also opens from Compare JSON… in the Tools row of Settings, and it is a dialog the size of the panel with two boxes, Before and After. Mask values, in the dialog's header, is the panel's own switch shown a second time: ticking either ticks both, and it hides the values in the comparison and in every copy, while what you paste is kept as typed (a note by the boxes says so while it is on).
- Views: each box has Text, Tree and Form. Text is the box you type in. Tree is the value as in Data, with its filter, Expand all and Collapse all. Form is a label and a read-only field for each key, lists opening in place. Tree and Form are greyed (Fix the JSON first) while the text does not parse, and Form needs an object or a list. The choice is kept for each box while DevTools is open.
- Tools, in the box's header row: Paste reads the clipboard (when the browser refuses, the box says Paste with Ctrl/Cmd+V instead), Load file… reads a .json file from disk, From the data takes the Data JSON of the selected script, From a call… lists the captured calls, newest first, each with its input and its output, Format indents, Sort keys puts every object's keys in order at every depth, Minify writes one line, Copy copies the text (masked while Mask values is on, from the value, so a box that is not JSON cannot be copied masked) and Clear empties the box. In a narrow box only Paste and Format stay in the row and the rest are in the … menu beside them.
- Status: the header line of each box ends in its status, which is always there, so nothing moves when it changes: Before · 12 keys ✓ when the box parses, After · empty when it has nothing in it, and in red After · ⚠ invalid when it does not, with a thin red bar on the left edge of the box and, under the box, where and what is wrong (Line 3, column 12: A value is missing after the colon.). An empty box is not an error. The check follows a moment after you stop typing. The hint names a key with no colon, single quotes, an unquoted key, a trailing comma, = in place of a colon (an Apex map), a comment, a text before or after the one value, and a value that is not closed.
- Read loosely: when the text is nearly JSON, the line under the box offers Read loosely. It accepts single-quoted texts and keys, unquoted keys, trailing commas, // and /* */ comments, = in place of a colon, unquoted words as texts and (a, b) as a list, which is how a debug log writes an Apex map such as {Name=Ada, Age=36}. The text stays as you typed it, an amber note says what was accepted, and the comparison, the Tree and the Form use the value that was read. Format rewrites the box as JSON. Change a character and the choice lapses. Text that is not even loosely JSON, such as a key with no value, is still refused.
- Compare sets the two boxes Side by side under them, which fold to one line each (Before · 12 keys · edit; click it to edit again). With a box that is empty it only moves the focus to that box, whose status then reads empty (amber, not red); with text that is not JSON the cursor goes to the place where it stops being JSON, and the reason is read out by a screen reader. Swap exchanges the boxes. Clear, next to Swap, empties both and starts over with the focus in Before; the ⊘ button in the line of a folded box empties only that box and opens it for editing.
- Esc or ✕ closes the dialog. What you pasted is kept while DevTools is open, so it is there when you open it again. The file you load is read here and kept in memory only. Nothing is sent or stored.`
  }],
  [`Side by side`, `Before is on the left, After on the right. Amber is a changed value, green an added one, red a removed one. ‹ and › go from one difference to the next. Side by side | List changes the layout, Show unchanged draws the folded lines, and Copy copies the differences as JSON and honours Mask values.`, {
    short: `The Before and After view that every comparison uses.`,
    more: `It is used for a call's Changes and Compare tabs, two debug runs, Compare data and Compare JSON. Each pane is numbered as its own Raw view. An added key or row has a hatched gap on the left; a removed one has the gap on the right. In two long texts the part that differs is marked; a short value, a number, true, false or null is marked whole. Rows of a list are lined up first, by a shared Id, Name or key when every row has one, otherwise by content, so one removed row is one gap. A branch with a difference inside is open; a run of unchanged keys or rows folds to one grey line (… 9 unchanged keys) that opens on a click or Enter, and a click on a branch's line closes or opens it.
- The head is one row when there is room: the title and the counts of what changed, was added and was removed on the left, and on the right one group of tools. In a narrow panel the group wraps below as a whole. The current difference is outlined, and the line under the panes names it (Difference 1 of 11 · Plan changed: "Standard" → "Gold"). The panes scroll together.
- List shows the same differences as blocks, one per path, a value before (red, −) and after (green, +). The choice is kept for each place while DevTools is open. Copy also honours Mask values for the values shown.
- With the panes focused, Up and Down go to the previous and next difference, Left closes a branch and Right opens it, Enter opens a fold, and Home and End go to the first and last difference.
- Where the panes would be narrower than about 640 px they become one: Before's line (−) above After's (+), both marked.`
  }],
  [`More`, `In a panel narrower than 600 px each toolbar moves some controls into the … button at its end. Its menu lists them, a switch showing on or off, and choosing one does what the control does. Widen the panel to bring them back.`, {
    short: `Reach the toolbar controls that do not fit in a narrow panel.`
  }],
  [`Rescan`, `Press it after opening a new OmniScript or changing the page. To re-read the script you already have, use [[Refresh]] on its tab.`, {
    short: `Look for OmniScripts and frames on the page again.`,
    more: `The panel also looks again by itself every few seconds while it is visible, so [[Rescan]] is only needed when you do not want to wait.`
  }],
  [`Open in Designer`, `The icon after the OmniScript picker. It opens the script in the OmniStudio Builder (core) or the OmniScript Designer (managed package), in a new tab; its tooltip says which and why. It shows only when the script's record Id is known. Open in Designer in Settings overrides the guess. The panel only builds the address; nothing is sent.`, {
    short: `Open this OmniScript in its designer, in a new tab.`,
    more: `It is there only when the record Id is known (from the definition or header, or an attribute of the element) and the page is an org's own (Lightning, My Domain or a Visualforce page of it, not an Experience site); it is not shown while a bundle is open. The tooltip reads, for example, "managed package vlocity_cmt, from the calls", or "set in Settings".
- Auto (the default) is a best guess. It takes the script as managed when the element's name or class starts with vlocity_cmt, vlocity_ins, vlocity_ps or vlocity_hins, or the definition's field names or the captured calls to this org name one of them. The omnistudio namespace counts as the managed OmniStudio package only when the calls or the definition use it and the element's name starts with omnistudio- or the page's Lightning app address contains omnistudio__ (core OmniStudio shows up as c- or runtime_omnistudio-).
- In Settings, Open in Designer chooses Auto, Builder (core) or Designer (managed). For managed, a namespace field offers the ones this script shows first, then vlocity_cmt, vlocity_ins, vlocity_ps and omnistudio, and takes one you type; empty uses the one seen, and omnistudio when none was seen. It is kept with Remember my settings.`
  }],
  [`Limits`, `Closed shadow roots and cross-origin frames cannot be read. That is a browser restriction, not a setting.`, {
    short: `What the panel cannot read, whatever the settings.`,
    more: `If a script is not listed, see No OmniScript found.`
  }],
  [`Status bar`, `At the foot: the selected script's name and each tab's status on the left, what is being read on the right.
- Data shows the type, size and last change; Calls shows the number of calls, how many failed, and Recording or Paused.
- At the far right: the extension version, a [[Buy me a coffee]] button (optional; opens buycoffee.to in a new tab, and the panel passes nothing to it).`, {
    short: `See which script is selected and what each tab is doing.`,
    more: `Data: "Type/SubType/Language · 7.2 KB" on the left (the element's tag name stands in for a script without one), then "Live · changed 10:43:31 AM" on the right, with "N matches" while a $ query or a filter in the Raw view is on and "N embedded scripts hidden" when OmniScripts nested in this one are left out. Hover it for the element, the property read, how many scripts are listed and how many other components of a listed script are hidden.
- Calls: "5 calls · 1 failed" (failed only when there is one) and "Recording" or "Paused". It names a choice only when it is not the default: "all Apex calls" (All Apex calls is on), "clears on reload", "failed only", "slow: 800 ms" and "text: …" for the filter box.
- Both read "Bundle: <file>" and Read-only or Not capturing while a debug bundle is open.
- Text that does not fit is cut with … and is in full in the tooltip. The Buy me a coffee button is optional: it opens buycoffee.to in a new tab. In a narrow panel the right side shrinks to the coffee icon and the version. The foot of this help links to the same page.`
  }]
];

/* The gated features' entries show only where the gate is open. The text of
 * an entry is the same in every build. */
const GATED = {
  'Debug bundle': 'shell.bundle',
  'Open bundle': 'shell.bundle',
  'Compare JSON': 'shell.compare-json',
  'Side by side': 'shell.compare-json'
};

/* An entry that stays in Free but names a gated feature in passing is worded
 * without it there (see variants.js). An edit changes whichever part of the
 * entry holds its text: the text, the short line or the details. */
const FREE_WORDING = {
  'Help for a control': ['data.changes', [['[[Auto-refresh]], [[Track changes]], the views', '[[Auto-refresh]], the views']]],
  Settings: ['shell.bundle', [
    ['- Calls: Time format, Slow call threshold, Clear on reload.', '- Calls: Time format, Clear on reload.'],
    ['\n- Tools: Debug bundle, Open bundle…, Compare JSON…, Copy report.', '\n- Tools: Copy report.'],
    [/- Calls: Time format, Slow call threshold and Clear on reload\. .*? in the tab's filter box\./s, '- Calls: Time format and Clear on reload.'],
    [/\n- Sending: .*? every time DevTools opens\./s, ''],
    ['Track changes off, ', ''],
    ['Follow current step on, Collapse done steps, Highlight', 'Follow current step on, Highlight'],
    ['All Apex calls off, Failed only off, Slow call threshold 0 (2000 ms), Time format ms', 'Failed only off, Time format ms'],
    ['Mask values at start off, Allow test calls off and Mask values off.', 'Mask values at start off and Mask values off.'],
    ['captured calls, the history of earlier reads, the watch list and filter text', 'captured calls and filter text'],
    [/- Tools: Save a debug bundle, .*? side by side\./s, '- Tools: Copy report (see its entry).'],
    ['(Failed only, Visible only, Actions only)', '(Failed only, Visible only)']
  ]],
  'Mask values': ['shell.bundle', [
    [', Copy report and the debug bundle.', ' and Copy report.'],
    [', Copy report and the debug bundle. The watch strip, the watch toasts and the lineage view are masked on screen too.', ' and Copy report.'],
    [/ In the script's definition, which the debug bundle .*? is left out of the bundle\./s, '']
  ]],
  'Remember my settings': ['data.watch', [
    ['(Data: Tree, Form or Raw, never Sizes or Changes;', '(Data: Tree, Form or Raw;'],
    [' and the watch list, per script (paths and expressions, never values)', ''],
    ['Never kept: data, filter text, captured calls, the history of earlier reads, Mask values, Auto-refresh and Allow test calls. Failed only, Actions only, Visible only, Data property and Definition property start fresh every time; they still count under Settings that differ while changed.', 'Never kept: data, filter text, captured calls, Mask values and Auto-refresh. Failed only, Visible only, Data property and Definition property start fresh every time; they still count under Settings that differ while changed.']
  ]],
  'Copy report': ['structure.problems', [
    [', the number of Problems, what may stop Next and the last 5', ' and the last 5'],
    [" What may stop Next is the step's Validation list, best effort.", '']
  ]],
  'Open in Designer': ['shell.bundle', [['; it is not shown while a bundle is open.', '.']]],
  'Status bar': ['data.query', [
    ['while a $ query or a filter in the Raw view is on', 'while a filter in the Raw view is on'],
    ['"all Apex calls" (All Apex calls is on), "clears on reload", "failed only", "slow: 800 ms" and "text: …"', '"clears on reload", "failed only" and "text: …"'],
    ['\n- Both read "Bundle: <file>" and Read-only or Not capturing while a debug bundle is open.', '']
  ]]
};

/* Only the Free build has the Buy me a coffee button and its link in the foot of the help. */
const NO_COFFEE_STATUS_BAR = ['no.such.gate', [
  [', a [[Buy me a coffee]] button (optional; opens buycoffee.to in a new tab, and the panel passes nothing to it)', ''],
  [' The Buy me a coffee button is optional: it opens buycoffee.to in a new tab. In a narrow panel the right side shrinks to the coffee icon and the version. The foot of this help links to the same page.', ' In a narrow panel the right side shrinks to the version.']
]];

const worded = (entry) => {
  const out = wordedFor(FREE_WORDING, entry);
  return out[0] === 'Status bar' && !isFreeBuild() ? wordedFor({ 'Status bar': NO_COFFEE_STATUS_BAR }, out) : out;
};

/* [heading, entries]: the entries are read when the help opens, after a
 * build with gates has registered them, whatever order the modules loaded in. */
export const COMMON_HELP = Object.defineProperty(['Everywhere'], 1, {
  enumerable: true,
  get: () => ENTRIES
    .filter(([title]) => !GATED[title] || Features.has(GATED[title]))
    .map(worded)
    .concat(helpPointer())
});
