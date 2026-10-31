'use strict';

/* The Calls tab's help. Each entry is [title, text, { short, keys, more }]
 * (see src/core/shared/help-entry.js); keep them in step with what the tab does. */

import { Features } from '../features.js';
import { wordedFor } from './variants.js';

/* The entries that describe a gated feature, by title and the gate that carries
 * it; the Free build leaves them out. */
const GATED_ENTRIES = {
  'Slow calls': 'calls.analysis',
  'Oversized input': 'calls.analysis',
  'All Apex calls': 'calls.analysis',
  Compare: 'calls.compare',
  'Select calls': 'calls.select',
  'Copy as Apex': 'calls.apex',
  'Test calls': 'calls.test',
  'Re-run': 'calls.test',
  'Debug tab': 'calls.debug',
  Changes: 'calls.changes',
  'Opened bundle': 'shell.bundle'
};

const carried = ([title]) => !GATED_ENTRIES[title] || Features.has(GATED_ENTRIES[title]);

/* An entry that stays in Free but names a gated feature in passing is worded
 * without it there (see variants.js). */
const FREE_WORDING = {
  'Time format': ['calls.compare', [
    [', the line under a call\'s name, the comparison heading and the selection bar with its segments.', ' and the line under a call\'s name.'],
    [' The slow-call threshold is always in milliseconds.', '']
  ]],
  'Filter box': ['calls.analysis', [['\n- slow:800 keeps calls of 800 ms or more (see Slow calls).', '']]],
  'Tab badge': ['calls.analysis', [
    [' (slow: too)', ''],
    [', which is OmniStudio\'s calls unless [[All Apex calls]] is ticked, and shows', ', which is OmniStudio\'s calls, and shows']
  ]],
  'Raw view': ['shell.bundle', [['; a call loaded from a debug bundle says "Not kept"', '']]],
  'Started / Took': ['calls.analysis', [[/ A call that took at least as long as the Slow call threshold.*$/s, '']]],
  'Recording / Paused': ['calls.test', [
    [' A test call you send is never left out, but sending is out of use while paused.', ''],
    [' It is out of use while a debug bundle is loaded.', '']
  ]],
  'Row menu': ['calls.compare', [[/\(honours \[\[Mask values\]\]\), Show raw \(see Raw view\), Re-run….*?summary bar/s, '(honours [[Mask values]]) and Show raw (see Raw view)']]],
  'Mask values': ['calls.compare', [
    ['Export, Show raw, the comparisons, the failure text', 'Export, Show raw, the failure text'],
    [', Copy report, Export and Copy as Apex.', ', Copy report and Export.']
  ]],
  'Chained procedures': ['calls.select', [[' The box on a chain ticks all its calls, and the summary bar counts calls.', '']]],
  'Batched calls': ['calls.select', [[' The selection bar counts the request once.', '']]],
  'Export calls': ['calls.select', [
    ['Write the selected calls, or the visible ones, to a JSON file.', 'Write the visible calls to a JSON file.'],
    ['writes the ticked calls, or the visible calls when none is ticked,', 'writes the visible calls,']
  ]],
  'Clear list': ['shell.bundle', [['It is out of use while a bundle is open.', '']]]
};

const worded = (entry) => wordedFor(FREE_WORDING, entry);

export const ACTIONS_HELP = {
  title: 'Calls',
  lede: 'Apex calls the page makes while you work, decoded. Capture runs whenever the panel is open, whichever tab you are on.',
  /* Read when the help opens, after a build with gates has registered them. */
  get sections() {
    return [['This tab', [
    ['Time format', 'In Settings (the gear), under Calls, the Time format switch picks ms (the default, "1,240 ms") or s ("1.2 s", "1m 12s"; under a second stays in ms). Reset next to it puts it back to ms.', {
      short: 'Choose whether call times are written in milliseconds or seconds.',
      more: 'It applies to the Took column and its tooltip, the line under a call\'s name, the comparison heading and the selection bar with its segments. Restore default settings also puts it back to ms. The slow-call threshold is always in milliseconds.'
    }],
    ['Failed only', 'Tick it, next to the filter box, to list only failed calls. The tab badge turns red as soon as any call failed, whatever this says.', {
      short: 'Show only the calls the row marks as failed.'
    }],
    ['Slow calls', 'Type slow:800 in the filter box to keep calls that took 800 ms or more. slow: alone uses the Slow call threshold from Settings (the gear, under Calls), or 2000 ms when that is empty or 0. It combines with words and the other prefixes.', {
      short: 'Keep the calls whose round trip took at least a given time.',
      more: 'The status bar says "slow: 800 ms" while it is in the box. When a threshold is set in Settings, calls at least that slow also get their Took in amber, and a slow call\'s detail says where its time went (2 s when no threshold is set).'
    }],
    ['Filter box', 'Plain words match the call\'s name (class, method, bundle or key). Prefixes combine with words and with each other:\n- in:text searches input, options and output.\n- url:text matches the request URL.\n- step:text matches the script\'s step (step:"Order Review" for spaces).\n- slow:800 keeps calls of 800 ms or more (see Slow calls).\n- repeat: keeps repeated calls.', {
      short: 'Narrow the calls by name, or with a prefix such as in: or url:.',
      keys: '/',
      more: 'in:text finds calls whose input, options or output hold the text, as a key or a value, and shows the hit under the name. step:text keeps the calls made while the script was on a step whose name or key holds the text. repeat: (or repeats) keeps only the calls that repeat an earlier one and the calls they repeat, and takes no text. With [[Mask values]] on, in: matches keys only. The tooltip of the box lists every prefix.'
    }],
    ['Compare', 'Press Compare with previous (or d) on a call to see what changed in its input, options and output against the earlier call to the same place. Shift+D uses the last one that did not fail. For any other baseline, Ctrl/Cmd-click a call or press b, then open the call to compare. Stop comparing ends it.', {
      short: 'Show what changed in input, options and output against another call.',
      keys: 'd',
      more: 'A failed call gets a Compare with last success button when that is a different call. A call with two ways to compare (a re-run also has its original) shows them as one Compare ▾ menu. A Compare tab appears in the detail pane while a baseline is set; its first line gives the time and duration of both calls and the difference ("Before 10:42:20 (410 ms) → After 10:42:40 (470 ms) · +60 ms"; hover it for how the baseline was chosen). Stop comparing beside it clears the baseline, and so do b or Clear baseline on the baseline call. The Input, Options and Output of the two calls are set Side by side (see Side by side); a part with no difference is one line ("Input, options and output are identical") with no panes. When both calls are debug runs of one kind, their steps come first (see Debug tab).'
    }],
    ['Select calls', 'Tick the box at the start of a call (Shift-click for a range, or press x on a focused call). A bar above the list adds them up: count, total time, span, average, slowest call and failures. Under it, one segment per request; click one to select the call. The box in the header ticks every visible call.', {
      short: 'Tick calls to add up their time in a summary bar.',
      keys: 'x',
      more: 'Example line: "3 calls · total 1,835 ms · span 36,240 ms · avg 612 ms · slowest Name 1,240 ms · 1 failed". Total is the time the calls added up to; span is the clock time from the first start to the last end (calls overlap). The slowest call\'s name is a button that selects it. Segments are as wide as the request took and coloured by kind (a key names the kinds when there are several); hover one for its name, time and share. Failed requests have a red line under them. The boxes show when the pointer or focus is on a row, on ticked rows, and on every row once any is ticked; Select for total time / Unselect in the row menu does the same for one call. Ticks follow the call, not the row, so they survive new calls and filters; [[Clear list]], a reload with Clear on reload on, and the 500-call cap drop them. Copy summary copies the line as text. Calls that travelled in one request share its time, so the bar adds each request up once ("4 calls in 2 requests"). Times follow the Time format.'
    }],
    ['Tab badge', 'The number on the Calls tab is grey and counts the calls in view. It turns red and reads "✕ 2" as soon as any call failed, so a failure shows from the other tabs. Hover it for the counts.', {
      short: 'Counts the calls in view; turns red with a cross when any call failed.',
      more: 'The cross and the number mean it does not rest on the colour. The tooltip says which it is ("2 failed calls of 12 captured", "12 calls in view"). A filter in the filter box (slow: too) or [[Failed only]] does not hide a failure from the badge or turn it off: it counts every call the list may show, which is OmniStudio\'s calls unless [[All Apex calls]] is ticked, and shows 0 in grey while a filter hides all of them. It is absent only while nothing is captured.'
    }],
    ['Copy as Apex', 'On an Integration Procedure or Data Mapper call, press the </> button in the detail pane and paste into the Developer Console. The snippet runs the call again with its input (and options). Method signatures differ between versions, so treat it as a starting point. Honours [[Mask values]].', {
      short: 'Copy an anonymous Apex snippet that runs this call again.',
      more: 'It is the last of the head buttons, after Show in Structure and Copy input; in a pane under 480 px, Copy input and it are one Copy ▾ menu in the same order. The snippet holds the input (and, for a procedure, the options) as JSON strings, then IntegrationProcedureService.runIntegrationService(key, input, options), or for a Data Mapper DRGlobal.process(input, bundle), whose DRProcessResult is printed through result.toJson(). The namespace is taken from the call: omnistudio for the core package, vlocity_cmt, vlocity_ins or vlocity_ps for the managed packages, defaulting to omnistudio; both methods exist in each. [[Mask values]] replaces strings and numbers in what is copied.'
    }],
    ['Test calls', 'Off until you turn on Allow test calls under Sending in Settings (off again at every DevTools start). New test call… composes a call. It goes to your org, as your user, through the page\'s session; an Integration Procedure or a Data Mapper Load can create or change records. Nothing is sent until you press Send (Ctrl/Cmd+Enter).', {
      short: 'Compose a call and send it to the org of the page, as your user.',
      more: 'Nothing else in the panel sends anything. The first time, press I understand next to the notice in Settings. With it off, the only traces are the greyed New test call… button (its tooltip says to turn on Allow test calls in Settings) and a greyed row-menu item. While a bundle is open the controls are out of use ("Not available while a bundle is open"), and so are they while Recording is paused ("Recording is paused": the answer could not be listed).\n- Re-run… (after Copy as Apex in a call\'s detail head, or in its row menu) opens the form with that call\'s input and options. Re-run as it was… (row menu) asks "Send Account_Fetch again as it was?" in a toast with a Send button (it goes after 8 s); only that Send sends the call, unchanged, and it is asked every time. New test call… (or the … menu in a narrow panel) starts from the latest Integration Procedure or Data Mapper call and asks for a name. Put "isDebug": true in the Options box of an Integration Procedure re-run to get its debug run on a Debug tab without the designer (see Debug tab); the answer is bigger and slower, and the call still runs for real.\n- The panel never sends by itself, and a press sends one call, however often you press.\n- What goes out is the last request of that kind the page made (its Aura, LWR or REST request; a re-run needs one of its own kind), with your edits to the input and options, one call in it, and a header that marks it as a test call. It goes to the origin of the selected script\'s own frame and nowhere else. The answer is listed at once as a row with a test tag, and, for a re-run, a re-run tag whose tooltip names the time of the original (click it to select that call); Took is the time the page measured for the request itself. Re-run as it was… selects the new row and says "Listed: HTTP 200, 640 ms"; when a filter keeps the row out, the list says "The call you sent is listed but hidden by [[Failed only]]" with Show all, which clears every filter. An answer over 2 MB is listed with no body and the chip "answer cut at 2 MB" (the Network tab has all of it, and when the network stream hands the panel the whole answer it replaces that row). Compare with original, in the detail head, shows what changed. Nothing of the answer is written into the script\'s data or the page\'s elements: its text waits in one variable of the page until the panel has read it, at most a minute, and is deleted then (also when the panel gives up waiting).\n- [[Mask values]] cannot apply to what you send (the form says so); copies and exports of the result stay masked.\n- It needs a call to copy from: if no OmniStudio call was captured on this page yet, run a step of the script first.'
    }],
    ['Re-run', 'Re-run… (in a call\'s detail or its row menu) opens the form with that call\'s input and options. Edit them, then press Send (Ctrl/Cmd+Enter). The call runs in your org as your user and can change records. Re-run as it was… asks first, then sends the call unchanged. Both need Allow test calls (see [[Test calls]]).', {
      short: 'Send an earlier call again from a form, with your edits.',
      more: 'The form shows, from the top: the kind and name of the call and, for a re-run, "re-run of 10:42:03", with the reminder that it runs in your org as your user and can change records; the name (an Integration Procedure\'s Type_SubType key, or a Data Mapper bundle) when it has one; Input, a JSON box with its parse error and position under it (Send waits until it is valid), with Format, From the data… and From a call… (takes the input of another captured call of the same kind, this one\'s own included); Options, folded, "Options (3 keys)", checked the same way (a REST call sends only the input, and the fold says "not sent"); Request, folded: the class, method, namespace and endpoint of the request, copied from a captured call, editable to correct a wrong guess. A REST call\'s endpoint follows the name until you edit the Endpoint field. For a New test call with no call of that kind captured yet, the class and method are a guess from the package\'s namespace, and the fold says so and starts open.\n- From the data… opens a picker under the bar: the nodes of the data JSON, Whole data JSON first, each with its OmniScript path and its size ("12 keys", "3 items" or a short look at the value; [[Mask values]] masks the previews), and a filter box that matches paths and values. Tick the nodes the call reads, and each shows an as field with the key it will have in the input: its own key, or for a re-run the input key that holds the same value ("sent as AccountDetails"); a dotted name such as Context.Account nests the node. Add to input (Ctrl/Cmd+Enter) merges the ticked nodes into the JSON in the box, Replace input makes the box hold them alone, and two nodes with one name wait until one is renamed. Esc or Close puts the picker away, and the names you gave a procedure come back ticked the next time you open the picker for it while DevTools is open.\n- Send and Close stay at the foot of the form. Close, the ✕ in the corner, or Esc closes the form: it does not cancel a call already sent, which still lands in the list, and what you typed is kept for that call until DevTools closes, so Re-run… on it brings your edits back. After Send the form says "Sent · waiting for the answer…" and closes onto the row when the answer is listed. If there is none after 60 s it says "No answer after 60 s; the call may still be running on the server. The row will appear if it answers.", and Send stays out of use until you edit the call or close the form. Choosing another call in the list also closes the form.\n- A designer preview (see Debug tab) is re-run the same way: the form is titled "Debug run of" and the name, has no Request fold and sends the designer\'s own remoting call with your input; the answer opens on its Debug tab.'
    }],
    ['Debug tab', 'A Preview in the Integration Procedure or Data Mapper designer (open in the inspected tab, Recording on), or a call with "isDebug": true, opens on a Debug tab with the outcome, times and steps. Click a step\'s number to open its input, options and output. The View picker switches between overview, full data JSON, response, input and log.', {
      short: 'Show a debug run step by step: outcome, times, response and log.',
      more: 'A designer preview is listed as an IP or DR call (named after the Data Mapper; an Integration Procedure preview is named "IP preview · " and its record Id, because the request carries only the Id) and counts as an OmniStudio call, so it shows without [[All Apex calls]]. A procedure that a page calls with isDebug: true answers with the same run and opens on the Debug tab too, named after the procedure (a REST call carries no options, so it cannot ask for one; see [[Test calls]] to ask for one yourself). A debug run opens on a Debug tab, first in the strip, whatever tab you picked on other calls.\n- Overview: one line with the outcome (Succeeded or Failed, the same verdict as the call\'s Result; an answer with no debug run in it says "No debug information in the answer"), the total and CPU time and, for a procedure, the number of steps, for a Data Mapper the interface type and the response type. A procedure has a table of its steps in run order with element, type, status, time, CPU time and a bar for the share of the slowest step. Click a step\'s number to open its input, options and output as trees in place (what you opened stays open), or its name to go to the element\'s own view. A status with "warning" in it is shown as a note, not a failure; an element that Succeeded carries no tag (its status is in the cell\'s tooltip); an element that did not run, such as one behind a conditional block whose condition was false, reads Skipped in grey with no time and no bar and is never the slowest. A failed step is shaded and read as failed by a screen reader, and the slowest step has a slowest tag beside its time. Then come the Response (open) and the Original input (closed). A Data Mapper shows its Output, and Errors and Created objects when there are any. Last is the debug log, one line each with its offset from the first line (hover for the full time); query lines are in monospace with a Copy that copies the SOQL. A log of more than 30 lines starts folded, with its count.\n- View picker: the Overview, the Full data JSON (the whole run as one tree, its root named after where the answer holds it, fullDataJson or IPResult, with its own line numbers; the Raw view shows the answer as the page sent it, so its lines differ), the Response, the Original input, the Debug log, or one element of a procedure in run order. A Data Mapper has its Output, Errors and Created objects when there are any, the Debug log and the Full response. An option is offered only when the answer has that part, the choice is kept for each call, and an element that left nothing says so. An element\'s view is one tree with four roots: input, options, output and debug (the rest of its block).\n- Debug log view: every line at full height under one line of totals (lines, queries, the time in queries and the time in the server), with Queries, Timing and Info chips that show only those lines (press more than one to add them, press again to undo; a chip is there only while the log has such lines). The head line of a procedure also gives the number of queries and the time they took.\n- Tools: the filter box narrows the view shown (steps by name, type or status, the log by its text, a tree by its keys and values). [[Expand all]] and [[Collapse all]] act on the open trees. Copy copies the view shown (on the Overview the run as JSON; on the log the lines in view), masked while [[Mask values]] is on; a view with nothing to copy says so. Copy as table copies the steps in view (number, element, type, status, elapsed, CPU) as a Markdown table that holds no value of the run; its toast says "N of M rows". With [[Mask values]] on a type or status stays only when it is one of the usual words (Succeeded, Failed, Skipped, Set Values, HTTP Action and the like); anything else shows as a placeholder.\n- Comparing: two debug runs of one kind in the Compare tab get their steps side by side above the rest: one row per element in the first run\'s order, with its status and time in each run, the difference (after minus before, tagged slower or faster from 20% and 10 ms), the CPU difference (hidden on a narrow pane) and a totals row. Before is the baseline and after the call on show (the line above the table gives their times). A status shows only when an element did not simply succeed in both runs; a dash marks the side of an element that did not run, and an element skipped in one run and run in the other is tagged ran or skipped. The heading counts the steps that differ by status or a tagged time, says when the order changed or only the total differs, and the table scrolls sideways as a region you can reach with the keyboard. Under it, two procedure runs compare their Original input and Response (from the runs, not the whole answers, whose logs differ in every time) and the Options, each Side by side (see Side by side); two Data Mapper runs compare their Input, Options and Output.\n- [[Mask values]]: the log keeps only lines of a known kind (queries, counts and times), with the literals and Ids in a query hidden; any other line shows as its kind and a placeholder, and copy and export mask the values as the trees do. Counts, times, names and statuses stay. A saved debug bundle still loads into a Debug tab with the steps and times, the values shown as placeholders.\n- A run with a failed step or a reported error is marked as failed in the list.\n- Re-run… and Re-run as it was… of a designer preview need Allow test calls (see [[Test calls]]) and the designer\'s own page in the inspected tab, because the remoting context (csrf, vid and authorization) is issued to that page; when the designer is a frame, pick that frame in the top bar first (Show the Frame row). From a running OmniScript the panel cannot send a designer preview, and New test call… does not offer one. A procedure called with isDebug is re-run as any other call, with its options as you leave them, so the new answer is a debug run again.'
    }],
    ['Copy input', 'The { } button in a call\'s detail pane copies the bare input as JSON, ready to paste into a test or another tool. Honours [[Mask values]].', {
      short: 'Copy the call\'s input as JSON.'
    }],
    ['Raw view', 'Right-click a call and choose Show raw. The detail pane shows the request as the page sent it and the answer as it came back, each with its own Copy. Fields that look like credentials show as <hidden>. Back, or Esc, returns to the call.', {
      short: 'Show the request and the answer exactly as they went over the wire.',
      more: 'The request is the Aura action, or the LWR, REST or Visualforce body. Each side is numbered, wrapped text; JSON is laid out for reading. The answer is kept only up to 20 KB, and when it was longer the view says "Cut at 20 KB"; a call loaded from a debug bundle says "Not kept". Fields that look like a credential (a token, csrf value, authorization, session, cookie or API key, in the request and in the answer) are shown as <hidden> and counted in a note, with [[Mask values]] on or off; [[Mask values]] replaces every other value in what is shown and copied. Text that is not JSON cannot be masked, so it is not shown while [[Mask values]] is on (an Aura error answer is laid out like any JSON; an answer cut at 20 KB cannot be masked). Choosing another call also returns to the detail. A chain\'s row has no row menu and no request of its own: open one of its calls, then right-click it.'
    }],
    ['Trees in the call detail', 'Right-click a row of the Input, Options or Output tree to copy its value, key, OmniScript path or %merge% field, or to open or close the branch. Copied values honour [[Mask values]].', {
      short: 'Copy a value, key, path or merge field from a call\'s tree.',
      more: 'A section the page sent as JSON inside a string is decoded, and one that is plain text says so instead of showing a tree. [[Expand all]] and [[Collapse all]] appear only where there is a tree, and Copy only where there is something to copy.'
    }],
    ['Changes', 'Open the Changes tab of a call. It sets the last data JSON read before the call ended against the first read within 5 s after it, Side by side (see Side by side). Copy copies the differences and honours [[Mask values]].', {
      short: 'Show how the script\'s data JSON changed because of the call.',
      more: 'It works from any tab, because the panel keeps the recent data JSON reads as long as DevTools shows it. If nothing was read in those 5 s, the tab says that, and says so plainly when the panel was not reading the data JSON at the time. The two reads are titled in one line each: Before: 10:44:30 (2 s before the call ended) and After: 10:44:32 (0.1 s after). When the read before the call is more than 30 s older, a muted line above them says May include earlier changes; its tooltip gives the reason.'
    }],
    ['Show in Structure', 'When an element of the script makes this call, the detail pane offers this button. It selects the element in the Structure tab. Structure\'s Calls tab lists the calls for the element it shows.', {
      short: 'Select the element that made this call in the Structure tab.'
    }],
    ['Naming', 'Data Mappers and Integration Procedures are named by their bundle or key, not by the integration class they share.', {
      short: 'How calls to Data Mappers and Integration Procedures are named.'
    }],
    ['Batched calls', 'Each action gets its own row, with its own input and output. The actions share the request\'s time, so each row carries a small ×3 tag and the Took cell holds only the time. The selection bar counts the request once.', {
      short: 'One HTTP request can carry several actions; each is listed as its own row.',
      more: 'The ×3 tag\'s tooltip says "One request shared by 3 actions: the time is the whole request\'s". A list under 760 px shows up to three short tags (about 20 characters in all), then a +N whose tooltip names the rest; when it is too narrow for the tags (under 560 px) the ×3 follows the time instead.'
    }],
    ['Repeated calls', 'A call to the same procedure or method with the same input and options as an earlier call, started within 5 s of it, carries an amber "repeat ×2" tag. A double-fired action or a re-render loop in a script usually causes this. repeat: in the filter box keeps only repeated calls and the ones they repeat.', {
      short: 'Tags a call that repeats an earlier call\'s input within 5 seconds.',
      more: 'The tag counts up (×3 for the third, and so on) and its tooltip names the time of the first call. The tab badge\'s tooltip adds "· 3 repeated". The calls of one chained procedure are never repeats of each other. When a repeat sent byte-identical input (same keys in the same order) and the call just before it succeeded, the first lines of its detail pane add a muted "Same input as the call at 10:42:03 (Succeeded)"; click it to select that call. After a failure no such line shows, because sending the same input again is then a retry.'
    }],
    ['Oversized input', 'A call with 100 KB or more of input carries an amber "Input 1.2 MB" tag in the detail pane (red from 1 MB). A Data Mapper or procedure usually needs only a few keys; sendJSONPath or sendJSONNode on the action limit what is sent. The Input tab lists the largest keys; click one to open it.', {
      short: 'Flags calls that sent 100 KB or more of input.',
      more: 'Size is the compact JSON of the input; the options are not counted. The Input tab starts with "12 keys · 3.4 KB" and, for a large input, "Largest: Account 80%, Items 15%, …": the five top-level keys that hold most of it, each a link that opens that key in the tree. When ticked calls include large ones, the selection bar ends with "2 calls over 100 KB of input". The list rows carry no chip, to stay calm. The size is measured in the panel from what the page sent; nothing is read or sent elsewhere.'
    }],
    ['Chained procedures', 'A chainable Integration Procedure runs as several calls. They show as one row, "⛓ Name", with a "chain · 3 calls" tag, the time of all of them and the result of the last. The chevron (or the Right and Left arrow keys) opens its calls. Select the row to see the first call\'s Input and the last call\'s Output.', {
      short: 'Lists the calls of one chainable Integration Procedure as a single row.',
      more: 'The first call carries the chainable (or queueableChainable) option, its answer often says the chain goes on, and the page calls the same procedure again shortly after. The row\'s result is red when any call failed. Opened calls are named "call 1 of 3", "call 2 of 3" and so on, with their time where the Started column is gone, and without the chain tag. A call that only asks to be chainable (outside a chain, or one that could not be joined) carries the small tag chainable, or queueable chain for queueableChainable; "chain · 3 calls" is only for the group. The tag\'s tooltip says one chainable procedure ran as 3 calls and the time is the sum. Open one of its calls and the detail head says "call 2 of 3 in a chain", a link that selects the chain. The row\'s Calls tab says "This procedure ran as 3 calls in a chain", adds "the server answered \'continue\' after each but the last" only when the answers did say so (a chain found by the chainable option and a shared input or token says that instead), and lists every call with its time, duration and result; a click opens that call. "stopped early" means the last answer said the chain goes on and nothing followed within 30 s. The box on a chain ticks all its calls, and the summary bar counts calls. Filters apply to the calls, so a chain shows while any call matches. Export writes the calls with a chainId.\n- Calls are joined when they go to the same procedure and the earlier answer says the chain goes on (the next call starts within 30 s), or the answer says nothing and the earlier call was chainable (the next call starts within 5 s). A call that started before the earlier one ended is never part of the chain, and calls to other places in between do not break a chain. Which answers say "goes on" is a best guess (vlcStatus such as InProgress or Queued, or a continuation id); an answer in another shape falls back to the option flag, so a real chain may show as separate rows.'
    }],
    ['Opened bundle', 'After Open bundle… (Tools row in Settings), the bundle\'s calls replace the list, with the same filters, details, comparison, chains and export. Nothing the page does is captured meanwhile, and Recording is out of use. Back to live brings the live calls back as they were.', {
      short: 'A debug bundle\'s calls take the list\'s place, read-only.',
      more: 'The bar under the top bar says "Bundle: <file> · saved <time> · read-only", and the status bar of this tab says "Bundle: <file>" with the count of calls and, on the right, Not capturing. The Recording button shows Paused, and [[Clear list]] is out of use. Back to live restores your selection, ticks, open chains and Recording choice. A bundle keeps each call\'s input, options, output and verdict, but not the response size, the timing breakdown or the raw text of an unreadable answer, so those are blank. A bundle saved with [[Mask values]] on holds placeholders, not values.'
    }],
    ['HTTP vs Result', 'Result, the last column, is what the answer says: ✓ green for succeeded, ✕ red for failed, – grey when nothing useful came back. Hover it for the word and the HTTP status, which is the transport. A 200 with Failed means Apex returned an error inside a successful response.', {
      short: 'Result shows what the answer says; hover it for the HTTP status.',
      more: 'The glyph is a second cue besides the colour. Hover for which rule fired; the detail line then says "HTTP 200 · Failed", and Aura\'s own state word is in the Raw view. The words are Succeeded, Failed, No response and No body. A call counts as failed, too, when no response came back (No response, in grey: aborted or offline), when the response is not JSON or an Aura system error, or when the session expired (client out of sync). A 2xx with an empty body shows No body in grey and is not counted as failed: DevTools hands back an empty body when it no longer holds the content. The Output tab then shows the raw text that came back, unless [[Mask values]] is on.'
    }],
    ['Started / Took', 'Started is the clock time the request left the browser. Took is the round trip, left blank when the browser could not measure it. Hover Took to see where the time went: the server\'s share and the time before the request was away.', {
      short: 'Started is when the request left; Took is its round trip.',
      more: 'Took is in milliseconds unless Time format says otherwise. Its tooltip gives the round trip, the server\'s share (waiting for the first byte plus download) and the time before the request was away (blocked, DNS, connect, send). A call that took at least as long as the Slow call threshold in Settings (2 s when it is 0) also says it in words in its detail pane, under the first line: "Waited 1,840 ms for the server, received in 20 ms", written in the Time format. It is left out for a fast call, for a chain, and for a call loaded from a file, which keeps no timings.'
    }],
    ['Step', 'The step is in the call\'s tooltip and the first line of its detail pane. step:text in the filter box keeps the calls made on a matching step. It is known only while Structure has been following the script.', {
      short: 'The OmniScript step the script was on when a call started.'
    }],
    ['All Apex calls', 'Off by default, so the list shows only OmniStudio\'s calls (Data Mappers, Integration Procedures and OmniStudio Apex). Tick it, right after the filter box, to see every Apex call the page makes. The status bar says "all Apex calls" while it is on.', {
      short: 'Show every Apex call the page makes, not only OmniStudio\'s.',
      more: 'The status bar names a changed choice so it is never in force unseen; the default goes unsaid. When the filters leave no call to show, the list says "No calls match…" with Clear filter, which drops every filter while DevTools is open (Settings keeps what you chose). Copy report and the debug bundle follow this choice: with [[All Apex calls]] off they list only OmniStudio\'s calls.'
    }],
    ['Recording / Paused', 'The button reads Recording (red dot) while the panel captures calls, and Paused when it does not. Click it to switch. Calls made while paused are not captured, and an empty list says so. The status bar shows the same state.', {
      short: 'Capture calls, or pause capturing; click to switch.',
      more: 'Its tooltip says what a click does ("Capturing calls. Click to pause." or "Not capturing. Click to resume."). A test call you send is never left out, but sending is out of use while paused. It is out of use while a debug bundle is loaded.'
    }],
    ['Failed calls', 'A call the row marks as failed opens on its Output tab, and its failure banner shows up to three lines before Show more. A tab you chose yourself stays chosen as you move between calls.', {
      short: 'A failed call opens on its Output tab, where the reason is.'
    }],
    ['Row menu', 'Right-click a call for Copy name, Copy input (honours [[Mask values]]), Show raw (see Raw view), Re-run… and Re-run as it was… (see [[Test calls]]), Compare with previous, Set as baseline (Clear baseline on the baseline) and Select for total time / Unselect for the summary bar.', {
      short: 'Right-click a call for its copy, compare, re-run and select actions.',
      more: 'The call the menu is open for is outlined while it is open.'
    }],
    ['Empty list', 'Calls are captured only while DevTools is open. Use Reload page to capture from the start and catch what the page does while loading. While capture is paused the list says so.', {
      short: 'Why the list may be empty, and how to catch calls made while loading.'
    }],
    ['Mask values', 'With the top bar\'s [[Mask values]] on, Export, Show raw, the comparisons, the failure text and the in: hit lines replace strings and numbers with placeholders, as the trees do. Mask values at start in Settings turns it on every time the panel opens.', {
      short: 'Replace strings and numbers with placeholders in what the Calls tab shows and exports.',
      more: 'The raw text of an undecodable response is hidden. A Data Mapper name that was read from the call\'s input (not from its options) counts as a value and is masked too, in Copy name, Copy report, Export and Copy as Apex.'
    }],
    ['Clear list', 'Removes every captured call at once; new calls start a new list. Click it before you repeat a step, so only the new calls are listed. Settings are not touched. Clear on reload does the same on every page load.', {
      short: 'Remove every captured call from the list.',
      more: 'It is out of use while a bundle is open.'
    }],
    ['Clear on reload', 'In Settings (the gear), under Calls. Off by default, so captured calls are kept across page loads. Tick it to start a new list on every reload; the status bar says "clears on reload" while it is on.', {
      short: 'Start a new list of calls on every page load.',
      more: 'The list keeps the last 500 calls, and at most 200 of them that are not OmniStudio\'s, which go first, so a busy page cannot push the script\'s own calls out; when older OmniStudio calls are dropped the status bar says so.'
    }],
    ['Export calls', 'Export, in the toolbar, writes the ticked calls, or the visible calls when none is ticked, to a JSON file. It may contain org data, so handle it accordingly. Honours [[Mask values]].', {
      short: 'Write the selected calls, or the visible ones, to a JSON file.',
      more: 'Each call is written with its URL, whether it failed and why, and the request it travelled in.'
    }],
    ['REST calls', 'POST calls to an Integration Procedure\'s REST endpoint (/services/apexrest/…/integrationprocedure/Type_SubType) are listed as Integration Procedures, named by the key in the URL.', {
      short: 'POST calls to an Integration Procedure\'s REST endpoint are listed as procedures.'
    }],
    ['Resizing', 'Drag the divider between the list and the detail pane to rebalance them, side by side or stacked. Double-click it to reset.', {
      short: 'Drag the divider between list and detail pane; double-click resets it.'
    }]
  ].filter(carried).map(worded)]];
  }
};

/* The first-time tour of this tab (src/ui/tour.js): at most three steps, each
 * on a real control outside the list, one short sentence that says what to do. */
export const TOUR = [
  { anchor: '#log-record', title: 'Recording', text: 'Calls are captured while it reads [[Recording]]; click to pause, and again to resume.' },
  { anchor: '#log-filter', title: 'Narrow the calls', text: 'Type a class or method here; start with in: to search inputs and outputs too.' },
  { anchor: '#log-clear', title: 'Start fresh', text: 'Click [[Clear list]] before you repeat a step, so only the new calls are listed.' }
];
