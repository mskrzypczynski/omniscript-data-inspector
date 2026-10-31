'use strict';

/* The Data tab's help: what it is, and the entries of its "This tab" section.
 * Each entry is [title, text, { short, keys, more }]: short is the control's
 * tooltip and the entry's one line, text says how to use it, more holds the
 * details for the website's reference page. Keep them in step with what the
 * tab does. */

import { MAX_ROWS } from '../../core/shared/json-tree-model.js';
import { Features } from '../features.js';
import { wordedFor } from './variants.js';

/* The entries that describe a gated feature, and the gate each belongs to: the
 * Free build leaves them out (an entry that only mentions one in passing stays). */
const GATED = {
  'Changes': 'data.changes',
  'Changed only': 'data.changes',
  'Previous change / Next change': 'data.changes',
  'Clear marks': 'data.changes',
  'Where is this set?': 'data.changes',
  'Changes view': 'data.changes',
  'Compare data': 'data.compare',
  'Watch list': 'data.watch',
  'Sizes': 'data.sizes'
};

const shown = ([title]) => !GATED[title] || Features.has(GATED[title]);

/* An entry that stays in Free but names a gated feature in passing is worded
 * without it there (see variants.js). An edit finds its text in the text, the
 * short line or the details of the entry. */
const FREE_WORDING = {
  'Amber highlight': ['data.changes', [[', whether or not [[Track changes]] is on', '']]],
  'Jumping to a row': ['data.changes', [['Next and Previous change, a watched value, a Sizes row, Show in Data from Structure and a log line all take you', 'Show in Data from Structure takes you']]],
  'Buttons on a row': ['shell.bundle', [[' or a loaded bundle is on screen', '']]],
  'Mask values': ['data.changes', [['On screen it also hides the values in the watch list and in its change notices, in the Changes view and in the Where is this set? popover; the tree and the Raw view still show', 'On screen the tree and the Raw view still show']]],
  Views: ['data.sizes', [
    ['Tree, Form, Sizes, Raw or Changes', 'Tree, Form or Raw'],
    [' Sizes shows where the bytes are.', ''],
    [' With [[Track changes]] on, a Changes button is added at the end; the others do not move.', ''],
    ['; Sizes and Changes are a look at the moment and are not, and unticking [[Track changes]] goes back to the Tree from Changes.', '.']
  ]],
  'Form view': ['data.changes', [
    ['The filter box and [[Track changes]] work as in the Tree.', 'The filter box works as in the Tree.'],
    ['an OmniScript path, key=value or $ query selects', 'an OmniScript path or key=value selects'],
    [/ \[\[Track changes\]\] marks a changed row .*? the value it had before\./s, ''],
    ['the Tree row\'s menu: Where is this set?, Show in Structure, copy the value, the path or the merge field, filter, watch, open record.', 'the Tree row\'s menu: Show in Structure, copy the value, the path or the merge field, filter, open record.'],
    [': copy as JSON, copy as a %merge% field, watch, Show in Structure', ': copy as JSON, copy as a %merge% field, Show in Structure']
  ]],
  Filter: ['data.query', [
    [', key=value or a $ query', ' or key=value'],
    [/ A filter that starts with \$ is a \$ query .*?(?= In Raw view)/s, ''],
    [/ A \$ query supports .*$/s, '']
  ]],
  'Expand all / Collapse all': ['data.sizes', [['In Sizes, Raw and Changes there is nothing to open', 'In Raw there is nothing to open']]],
  'Right-click': ['data.changes', [
    ['filter to this key, watch, watch an expression…, show in Structure, Where is this set?, open record', 'filter to this key, show in Structure, open record']
  ]]
};

const worded = (entry) => wordedFor(FREE_WORDING, entry);

const ENTRIES = [
  ['Amber highlight', `Watch the tree while you use the page: a value that changed since the previous read flashes amber. A collapsed branch that holds a change is marked with a dot, so you know where to open.`, {
    short: 'A value that changed since the previous read flashes amber for a few seconds.',
    more: `The flash lasts a few seconds, whether or not [[Track changes]] is on.`
  }],
  ['Jumping to a row', `Next and Previous change, a watched value, a Sizes row, Show in Data from Structure and a log line all take you to a row in the tree. It scrolls into view, opening what hides it, and flashes amber for under two seconds. While it flashes, c copies it.`, {
    short: 'Jumps scroll a row into view, open what hides it and flash it amber.',
    more: `Nothing stays outlined or selected afterwards, so the row then looks like any other. c copies the row only while no other row is focused or under the pointer; once the flash is over, c asks you to point at a row. Hover or Tab to a row to carry on from there.`
  }],
  ['Inspect element', `Shown in the top bar's second row, with Show the Frame row ticked in Settings. After you press it, use $omni in the Console to poke at the element.`, {
    short: `Select the OmniScript's element in the Elements panel and keep it as $omni.`
  }],
  ['Refresh', `The blue main button while [[Auto-refresh]] is off. With [[Auto-refresh]] on, the tab updates itself and Refresh is a plain button. [[Rescan]] in the top bar is different: it looks for scripts and frames again.`, {
    short: 'Re-read the data of the selected script now.',
    more: `It reads the data property of the selected script in full.`
  }],
  ['Auto-refresh', `Untick it for manual mode: the data is read only when you press [[Refresh]] or change the property or script, never by a rescan or by switching tabs. The status bar then says Manual mode. While text is selected in the tree, updates wait so you can copy it.`, {
    short: 'Keep the data live: re-read it about once a second.',
    more: `The rate is Refresh rate in Settings; it slows to every few seconds while nothing changes, and touching the panel brings the fast rate back. Polling stops while the panel is off screen. Updates also wait while the pointer is on a copy button, until you release the selection.`
  }],
  ['Left the page', `If the OmniScript disappears, for example because the page navigated, the last data read stays on screen, marked as stale. Pick another OmniScript, or wait for a new one to appear, to carry on.`, {
    short: 'The last data read stays on screen, marked stale, when the script goes away.'
  }],
  ['Data property', `In Settings (the gear), under Data, in Reading another page; it starts fresh every DevTools session. Click the field to list what the selected element exposes, type to filter ("jsd" finds jsonDataStr), then arrows and Enter to pick. A change is applied and the page is scanned again at once. When no OmniScript is found, see No OmniScript found.`, {
    short: 'Read the data from a property other than jsonDataStr.',
    more: `Any property name works, and a name that is not listed can still be typed. The list shows each value's type. The setting applies to the Data tab and to the scan that lists the OmniScripts in the top bar; the Structure tab's Current values still read jsonDataStr, so a script that keeps its data elsewhere shows nothing there. While it is not jsonDataStr, the Settings gear shows a count and Settings that differ lists it.`
  }],
  ['Buttons on a row', `Hover a row, or move to it with the keyboard, for small icon buttons after its value. The overlapping sheets copy the value as JSON, or the whole branch; % copies a %merge% field. A plus or minus box opens or closes a whole branch. An arrow button on a record Id opens that record in a new tab.`, {
    short: 'Hover a row for icon buttons that copy its value, branch or merge field.',
    more: `The Form's rows have the same buttons, except the plus or minus box. They never make a row taller, and a row you only clicked does not keep them. From the keyboard, Tab from a focused row goes to its first button and Tab again to the next; Shift+Tab comes back. Only the focused row's buttons are in the Tab order. The icon turns into a check mark for a moment once copied. The % button gives a path such as %Step:Rows|2:Code% (the same as Copy as %merge% field in the row menu); it is a path, so [[Mask values]] leaves it as it is. The plus or minus box is the same as Alt+click on the row, and it holds while a filter is on. Dragging to select several rows still copies them as clean indented text. A value is taken for a Salesforce record Id when it is 15 or 18 letters and digits with a digit among the first nine, not only digits; an 18-character Id must also end with its checksum, so a word such as a name is not taken for one. The record button opens the page's own address plus the Id; the panel sends nothing, your browser opens it. The Id stays plain text, so selecting and copying it works as before. The button is not shown when the page's address cannot be read or a loaded bundle is on screen.`
  }],
  ['Changes', `Off by default. Ticked, a Changes bar appears under the toolbar and the view switch gets a Changes view. Changed values keep a bar at the left edge once the amber has faded, until you press [[Clear marks]]. Hover a marked row to see the value it had before. Unticked, the marks and the log are dropped.`, {
    short: 'Mark the values that change and keep a log of them.',
    more: `The Changes bar holds [[Changed only]], Previous change / Next change, [[Clear marks]] and [[Compare data]]. Hover shows the value the row had before its first change since the marks were cleared. Unticked, the bar and the view are hidden; values still flash amber.`
  }],
  ['Changed only', `Narrows the Tree and the Form to the values marked as changed since the marks were cleared. Untick it to see all the data again.`, {
    short: 'Show only the values marked as changed.'
  }],
  ['Previous change / Next change', `They go through the marked values in tree order, open whatever hides them and flash the row. The note beside them says how many values are marked.`, {
    short: 'Jump to the previous or next marked change.',
    keys: 'p / n'
  }],
  ['Clear marks', `Removes the marks and empties the Changes view. Values that change afterwards are marked again.`, {
    short: 'Forget which values changed and empty the Changes view.'
  }],
  ['Where is this set?', `Right-click a row, then Where is this set?. A popover shows the last change it logged, the call that was running then, and the Set Values elements that write the value. The call and each element are links to Calls and Structure. Esc or a click elsewhere closes it.`, {
    short: 'Show what the panel knows about how a value got its current value.',
    more: `The last change is given as time, step and was → now, and only while [[Track changes]] is on. The call is the one that was running, or had ended less than 5 seconds before, when the change was noticed. A row that changed also says, in its tooltip, "Last changed 10:42:03 after Onboarding_GetPlans". Nothing is shown for what is not known, and [[Mask values]] hides the values.`
  }],
  ['Show in Structure button', `Hover a row for the Structure icon, the tab's own. It switches to the Structure tab and selects the element that owns the key, or the nearest parent element. Structure's Show in Data does the reverse.`, {
    short: 'Select the element that owns this key in the Structure tab.'
  }],
  ['Mask values', `While it is on (the switch in the top bar), Export (Copy JSON and Save file), the per-row copy button, copied selections, Structure's value copy and the Calls export replace strings and numbers with <string> and <number>. Keys, structure, empty strings, booleans and null stay. Off each time the panel opens, unless Mask values at start is ticked in Settings.`, {
    short: 'Replace strings and numbers with placeholders in everything that leaves the panel.',
    more: `On screen it also hides the values in the watch list and in its change notices, in the Changes view and in the Where is this set? popover; the tree and the Raw view still show the data itself. Selections copied from the tree and the Raw view are masked the same way. The switch itself is not stored.`
  }],
  ['Watch list', `Hover a row and press the eye icon, or right-click it, Add to watch list, to keep its value in a strip above the tree. Click a name to find it in the tree, × to remove. The bell notifies you when the value changes. The + opens a box for an expression such as Step:Rows|2:Code or Status = "Done".`, {
    short: 'Keep chosen values in a strip above the tree while you work.',
    more: `A long list scrolls inside the strip, which never takes more than about a third of the panel; the + stays in view. With the bell on, a toast says what the value was and what it is now, and the item flashes. Where the rows of a list have a shared Id, Name or key, a watched value stays with its row when rows above it are removed or added; otherwise it stays at its position. If the watched row is gone the item says so. The box also opens from the row menu, Watch an expression…, which starts it with that row's path. An expression is a path such as Step:Rows|2:Code (positions count from 1; a bare name is looked for at any depth), a $ query such as $.Rows[*].Qty (several values are shown as 3 values: a, b, c), or a comparison such as Step:Total > 100, Status = "Done" or Items.length >= 3. Operators are = != < <= > >= and contains; the right side is a number, a quoted text, true, false or null; the left side is a path or $ query, optionally ending in .length (items of a list, characters of a text, keys of an object). A number and a numeric text compare as numbers ("5" > 3 is true), other texts exactly, case included. A comparison shows true (green) or false (amber), and a path that is not there says so. Enter adds the expression and Esc closes the box. An expression has the bell and × like a pinned row. The list is cleared when you pick another OmniScript, unless Remember my settings is ticked: then the watched paths, the expressions and which have the bell on are kept in this browser's extension storage for each script (by its Type/SubType/Language, the last 50 scripts, at most 50 paths and 20 expressions each) and come back when you pick that script again. What is kept is the names and positions in your script and the text of your expressions, never the values; unticking Remember my settings deletes them.`
  }],
  ['Views', `The view switch is first on the toolbar and stays put. Tree is the collapsible tree. Form lists each key as a labelled row. Sizes shows where the bytes are. Raw is the page's own text. With [[Track changes]] on, a Changes button is added at the end; the others do not move.`, {
    short: 'Pick how the data is drawn: Tree, Form, Sizes, Raw or Changes.',
    more: `The view names keep their words at every panel width. The choice of Tree, Form or Raw is kept by Remember my settings (on by default); Sizes and Changes are a look at the moment and are not, and unticking [[Track changes]] goes back to the Tree from Changes. [[Expand all]] and [[Collapse all]] stay in place in every view and are greyed out where there is nothing to open.`
  }],
  ['Tree view', `The view the tab opens in. Every key shows its type, and the twisty opens a branch. Click a row to select it, and hover it for its buttons.`, {
    short: 'Show the data as a collapsible tree, with line numbers that match Raw.'
  }],
  ['Expand all / Collapse all', `They stay in the same place in every view. In Sizes, Raw and Changes there is nothing to open, so they are greyed out. While a filter is active, [[Expand all]] opens every match and [[Collapse all]] closes every branch but the top one.`, {
    short: 'Open every branch of the Tree or Form, or close them to the top level.',
    more: `In a big tree [[Expand all]] opens the first branches and says how many (see Big data). When they are greyed out, their tooltip says to switch to the Tree or the Form.`
  }],
  ['Form view', `Each key is a row with its label and value. An object or a list shows "3 items": click it, or press Enter or → on the row, to open it in place; ← closes it. The filter box and [[Track changes]] work as in the Tree. Right-click a row for the Tree row's menu.`, {
    short: `Show the data as the page's form: a label and a value for each key.`,
    more: `Form lists the data the way the page's form is laid out, with the rows the Structure tab's Current value Form has. A row's label is the label of the element that owns the key, with the element's name dimmed after it. A key with no element of its own (or a script whose definition has not been read) is its own label. A value is plain monospace text. Rows are the Tree's branches, so what is open in the Tree is open in the Form, and [[Expand all]] and [[Collapse all]] work on both. The filter box narrows the rows by label, key or value as it narrows the Tree, with the way down to each match and everything under a key or label that matched; an OmniScript path, key=value or $ query selects the rows the Tree would. [[Track changes]] marks a changed row with the same flash and the bar at the left edge, [[Changed only]] keeps those rows, and Previous change / Next change move through them and open what hides them. Hover a marked row to see the value it had before. Right-click a row, or press the menu key (or Shift+F10) on it, for the Tree row's menu: Where is this set?, Show in Structure, copy the value, the path or the merge field, filter, watch, open record. A row has the Tree's buttons after its value, on hover and for the keyboard (see Buttons on a row): copy as JSON, copy as a %merge% field, watch, Show in Structure and, on a record Id, open the record. [[Mask values]] applies as in the Tree, also to a selection dragged across rows. Like the Tree, the Form pins the open groups the first visible row sits inside at the top while you scroll (see Sticky path). Tab goes to the rows (one at a time is in the tab order); the up and down arrows, Home and End move between them, and c copies the focused row's value. Export (Copy JSON, Save file…) copies or saves the data, not the view. A very long list is drawn up to 400 rows, and a line below the last one says how many are left; filter, or use the Tree or Raw, to reach them.`
  }],
  ['Sizes', `List, the default, ranks the top-level keys by size, each with its share of the whole data. Click a row to drill into its children; click the trail above, or press Esc, to go back. Treemap, the switch at the top right, draws the same keys as areas. Unused lists only the keys no element of the script reads.`, {
    short: 'Show which top-level keys take the most space, as a list or a treemap.',
    more: `Sizes are measured in one pass as compact JSON and measured again only when the data changes. List is a table of the top-level keys, 20 at first, each with the size of everything under it: rank, path (written as in the OmniScript, Step:Rows|3:Code, positions counting from 1; a long path wraps after a colon), a bar as long as its share of the largest, its size and its share of the whole data. The heading says how many are listed (Largest 20 of 143 keys · whole data 123.5 KB). The list is always one level, the same as a drill into Data: a deep value is never mixed in with the top-level keys, you find it by drilling down the biggest bar (the columns stay where they are when you drill). Show 20 more adds the next 20, Show all lists them all (up to 2000), and Show fewer, beside them once more than 20 are listed, goes back to the first 20 (you stay where you drilled, and the first row gets the focus). The number you chose is kept while the panel is open. A row with values under it has a chevron: click the row (or its chevron, or press Enter on it) to drill into that value, and the list becomes its children ranked by size (shares stay shares of the whole data), with a trail above (Data › PlanSelection › AddOns) and the heading naming the value and its size. Hover a row, or move to it with the keyboard, for Show in tree: a small button with the Tree's icon at the end of its path, which switches to the Tree and jumps to that value, so a row with values under it can be shown in the tree without drilling. In the list, click a row that has nothing under it (or press Shift+Enter or Space on any row) to find it in the tree. From the keyboard the list is one stop in the Tab order, with that row's Show in tree button next in line: the arrow keys, Home and End move between its rows, Enter or the right arrow drills into a row that has values under it, and the left arrow or Esc goes up. Click a part of the trail, or press Esc, to go up one level; the treemap uses the same trail, so the list and the treemap are always at the same place. Treemap draws the top-level keys as areas in proportion to their size, each with its largest children inside it (those of at least 2% of it; the rest is one dashed other block). The colours are one blue: each key a step lighter or darker than the one before, the blocks inside it a step darker than their key. A key past the eighth is grey, the keys past the 16 largest are one grey cell, and a key keeps its colour while sizes change. Hover a cell for its path, size and share. Click a top-level cell that has children to zoom into it: its children fill the whole area, each with its own largest children inside, and the trail above (Data › Plan) goes back: click a step, or press Esc to go up one level. You can keep zooming, one level at a time. Percentages stay shares of the whole data. Click a cell that has nothing inside, a child cell or the last part of the trail to find it in the tree; Shift+click does that for any cell. The chart you chose and the place you drilled or zoomed into are kept while the panel is open. Unused, the outlined chip before the chart switch (it shows a check mark while it is on; it is a filter, not a view; it works on the list), shows only the keys no element of the script reads, each with its size, and the heading says how many, how big and what share of the data that is: the dead weight, such as the fields a Data Mapper returns and nothing uses. A key counts as read when an element has its name (exactly, case matters) or a show rule, validation, Set Values target or source, %merge% field in a label or text, or formula runs through it; the keys the platform writes (timeStamp, userId, ContextId, error and the like) are never listed. The data an action sends (sendJSONPath, sendJSONNode) or lands its response in (responseJSONNode, responseJSONPath) counts as read. Inside a step or block each key is judged, rows of a repeat block too; an element's own value (a lookup's object, an action's response) is not taken apart. It is a guide, not proof: something the panel cannot see, such as an action's extra payload or a custom component, may still read a key it lists. The list shows the 50 largest. These are keys of the whole data, so turning Unused on leaves a drill (the trail goes) and turning it off again shows the whole data, not the place you were at. It needs the script's elements: until the Structure tab has loaded them the switch is dimmed, and pressing it fetches them.`
  }],
  ['Changes view', `Shown when [[Track changes]] is on. Each line reads time · path · was → now; hover it for the step. Click a line to see the value before (red) and after (green). The tree icon after the path finds it in the tree. Copy log copies one line per change.`, {
    short: 'The last 200 values that changed, oldest first, with time and path.',
    more: `The log keeps the last 200 values that changed while this tab was collecting (the same time [[Compare data]] keeps its history). Paths are written as in the OmniScript, Step:Rows|2:Field, with positions counting from 1 (|3 is row 3 of the list; hover a path to be told). A row added or removed is one line. An opened line shows the value before (−) and after (+) with the part that differs marked; an object or list is written over several lines and folded after 20, with a more button. An opened line stays open while new changes are added, and a second click (or Enter) closes it. The tree icon right after the path (or t) finds the value in the tree. The values before and after sit in two columns that line up from one line to the next. Up and Down move between lines. [[Mask values]] hides the values on screen and in what is copied. [[Clear marks]] empties the log. The log starts empty each time you pick another OmniScript.`
  }],
  ['Filter', `Type text to narrow the tree; each match is shown with the rows above it. A path such as Step:Rows|2:Field and key=value such as Name=Ada work too. A filter that starts with $ is a $ query such as $.Step.Rows[*].Code or $..Code. If nothing matches, it is searched as plain text. In Raw view it is a text search.`, {
    short: 'Narrow the tree by text, a path such as Step:Rows|2:Field, key=value or a $ query.',
    keys: '/',
    more: `The number after | counts from 1; without it a list is searched in every row. key=value matches at any depth, on the whole value, ignoring case; a path can be the key, and key= alone lists every place the key appears. If a path or key=value finds nothing it is searched as plain text instead. A $ query supports $.Step.Rows[*].Code (every item of a list), $..Code (a key at any depth), $.Rows[2] (one item, counted from 0 as in JSON), $.Rows[-1] (the last), $.Rows[1:3] (items 1 and 2), $.*.Name (every child), and $["a.b"] for a key with dots, spaces or colons in quotes. The status bar says how many matches there are ("3 matches for $…"; "5,000+" when it stopped at its limit). Filters and expressions such as $..[?(@.Qty>1)] are not supported: a $ that does not parse (a lone $, $1,000) is searched as plain text, and one that parses but finds nothing says "Nothing matches $…".`
  }],
  ['Compare data', `In the Changes bar, so [[Track changes]] must be on. Pick Before and After from the last reads to see what was added, removed or changed. Since this step began picks the first read of the current step and the latest. Copy copies the differences as JSON; Load file… adds a JSON file as a snapshot.`, {
    short: 'Compare any two of the last reads of the data, or a JSON file.',
    more: `The last 12 distinct reads of the data (fewer when they are large) are kept in memory whether or not [[Track changes]] is on, and are discarded with the panel or when you pick another script or property. A label reads 12:01:03 · Step2 · 12 s ago, with the step when the Structure tab knows it. The two reads are set side by side (see Side by side): what was added, removed or changed between, say, before and after you pressed Next. Rows of a list are lined up first, by a shared Id, Name or key when every row has one, otherwise by content, so removing one row of three hundred shows one removed row and not a change in every row after it. The head of the comparison counts what changed, was added and was removed. Paths are written as in the OmniScript, Step:Rows|2:Field, with positions counting from 1 (hover the heading). List shows each difference as a block instead: the path first, then for a changed value the value before (red, −) and after (green, +); a value longer than 160 characters is folded around the part that differs, and its more button opens it. Since this step began is greyed out, with the reason shown beside it, when the step is not known or fewer than two reads were made in it. Copy honours [[Mask values]], which also applies to the values shown. Load file… takes a JSON file from your computer (for example data saved earlier with Save file) as a snapshot named file: its-name.json that you can pick as Before or After. It is read in the panel and kept in memory only, like the other snapshots; the last five are kept, and a file that is not valid JSON is refused.`
  }],
  ['Toolbar icons', `Every toolbar button has an icon. When the panel is too narrow for the labels, only the icons are shown, except Refresh and Recording / Paused; hover an icon for what it does. In a narrow panel (DevTools docked to the side) the top bar buttons are icon-only too.`, {
    short: 'In a narrow panel the buttons show only their icons.'
  }],
  ['Right-click', `Right-click a row (the Form's rows too), or press the menu key or Shift+F10 on it, for: copy value, key, path or merge field, filter to this key, watch, watch an expression…, show in Structure, Where is this set?, open record, expand or collapse the branch. The arrow keys move between items, and Esc closes the menu.`, {
    short: `Open a row's menu: copy, filter, open record and more.`,
    more: `The path is written as in the OmniScript (StepA:Rows|2:Code, repeat positions from 1), and the merge field is the same path as %StepA:Rows|2:Code%. Open record works on a record Id: it opens the record in a new tab, and is greyed out as Open record (no page) when there is no page to take the address from. Expand or collapse works on the branch, or on everything inside it. In any menu the up and down arrows wrap, Home and End go to the first and last item, and Esc closes it with the focus back on the row it was opened from.`
  }],
  ['Raw search', `Every match is marked. Enter and Shift+Enter walk the matches, and the status bar counts lines and matches. Long lines wrap. Ctrl/Cmd+C copies exactly the highlighted text; with only a click inside a value, it copies that value.`, {
    short: 'In Raw view the filter box searches the text and marks every match.'
  }],
  ['Copying', `Select a few characters of a value and only those are copied. A selection across several rows is copied as clean indented text. With nothing highlighted, click inside a value (tree or Raw) and copy: you get the whole value, a string without its quotes when the caret is between them. [[Mask values]] applies to all of it.`, {
    short: 'Copy exactly the text you highlight, or the value you clicked in.',
    keys: 'Ctrl/Cmd+C'
  }],
  ['Export data', `The Export button, at the end of the toolbar, opens a menu: Copy JSON and Save file…, which writes omniscript-<time>.json. Both write the page's own text, whatever the view, and replace strings and numbers when [[Mask values]] is on. The file may contain org data, so handle it accordingly. In a narrow panel Export is in the … menu.`, {
    short: 'Copy the data as JSON or save it to a file. Honours Mask values.',
    more: `Both write the page's text in its own key order. A property that is not valid JSON cannot be copied or saved while [[Mask values]] is on.`
  }],
  ['Big data', `A tree of more than ${MAX_ROWS} rows is drawn a window at a time as you scroll, so nothing is cut off. Dragging a selection across rows, or Ctrl/Cmd+A, copies only the rows drawn, and a toast says so (Copied 112 of 41,000 rows). Use the copy button on the branch, or Export, for everything.`, {
    short: 'A tree of many rows is drawn a window at a time as you scroll.',
    more: `[[Expand all]] opens branches, not values, and says how many it opened if there are more than 20,000.`
  }],
  ['Tree / Form / Raw', `Raw lists the keys in the Tree's order (JavaScript puts keys like 10 and 2 first) and keeps every digit as the page wrote it. Export's Copy JSON and Save file… write the page's text in the page's own key order. If the property is not valid JSON, the raw value is shown with the parse error.`, {
    short: `Show the page's own text, one entry per line, with the Tree's line numbers.`,
    more: `The Tree itself shows the parsed value, which also rounds integers above 2^53; when the data holds such integers the status bar says so. If a key is repeated in the data JSON, the parsed value is shown instead.`
  }],
  ['Sticky path', `While you scroll a long tree or the Form, the open branches the first visible row sits inside stay pinned at the top, outermost first, at most three lines: Step, Block, Items. Click one to scroll to that row.`, {
    short: 'The open branches above the first visible row stay pinned at the top.',
    more: `It works for big data drawn a window at a time too. The lines are for the mouse; from the keyboard, ← on a row goes to its parent.`
  }],
  ['Keyboard in the tree', `Tab moves into the rows. Then the arrow keys move between rows, Home and End go to the first and last, → opens a branch or moves into it, ← folds it or moves to the parent, Enter or Space opens and closes it, c copies the row's value, and the context-menu key opens its menu.`, {
    short: 'Move through the rows with the arrow keys, open with Enter, copy with c.',
    more: `Only one row at a time is in the Tab order. With no row focused, c copies the row under the pointer, or the row you have just jumped to for as long as it flashes. A row changed since the marks were cleared announces its previous value (Was: …) to screen readers. Mouse use is unchanged.`
  }]
];

export const DATA_HELP = {
  title: 'Data',
  lede: 'The JSON the selected OmniScript is holding right now, re-read on a timer.',
  /* Read when the help opens, after a build with gates has registered them. */
  get sections() { return [['This tab', ENTRIES.filter(shown).map(worded)]]; }
};

/* The first-time tour of this tab (src/ui/tour.js): at most three steps, each
 * on a real control outside the list, one short sentence that says what to do. */
export const TOUR = [
  { anchor: '#filter', title: 'Find a value', text: 'Type part of a key or a value here to narrow the tree to what matches.' },
  { anchor: '#live', title: 'Freeze the data', text: 'Untick [[Auto-refresh]] to stop the data moving while you read it; [[Refresh]] reads once.' },
  { anchor: '#data-changes', title: 'Watch what changes', text: 'Tick [[Track changes]], then click through the script to see which values move.' }
];
