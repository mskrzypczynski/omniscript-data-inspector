'use strict';

/* The Structure tab's help. Each entry is [title, text, { short, keys, more }]
 * (see src/core/shared/help-entry.js): short is the control's tooltip and the
 * entry's line in the help, text is how to use it, more goes to the website.
 * Keep them in step with what the tab does. */

import { Features } from '../features.js';
import { wordedFor } from './variants.js';

/* The entries of a gated feature, by the gate that opens it: the help lists them
 * only in a build that has the feature (Free shows none of them). */
const GATE_OF = {
  'Go to an earlier step': 'structure.steps',
  'Collapse done steps': 'structure.steps',
  'May stop Next count': 'structure.steps',
  Timeline: 'structure.timeline',
  'Step timing': 'structure.timeline',
  Problems: 'structure.problems',
  'What if': 'structure.whatif',
  'Compare definition': 'structure.compare-definition',
  Export: 'structure.export',
  'Depends on / Used by / Written by': 'structure.references',
  'Actions only': 'structure.references'
};

const SECTIONS = [['This tab', [
    ['Definition property', 'Set it in Settings (the gear), under Data, in Reading another page, next to Data property. It starts fresh every DevTools session. The default is jsonDef. Click the field to pick from the properties the script exposes. A change applies at once and the page is scanned again.', {
      short: 'Choose which element property holds the OmniScript definition.',
      more: 'The field is not in the Structure toolbar. It offers the same fuzzy list of properties as the Data tab. The Settings gear in the top bar counts it while it is not jsonDef. When no script is found, the list says so in one line with a [[Rescan]] button and a More help link, the toolbar controls are greyed out and the detail pane is folded away until a script turns up.'
    }],
    ['Refresh', 'Use it after you edit the script in the Designer, when you do not want to wait for the automatic read. It does not read the data JSON; the Data tab\'s Refresh does that. [[Rescan]] at the top looks for scripts and frames instead.', {
      short: 'Read the definition and custom labels again; your selection and folds stay.',
      more: 'It keeps its text when the toolbar is narrow, and is the one toolbar button that works while no script is found. The definition is also read again about every six seconds while this tab is open (see Editing in Designer).'
    }],
    ['View', 'Switches: Actions only, Collapse done steps, Highlight on hover and Visible only. A tick marks one that is on; all start off. The button shows how many are on, so a shortened list is never a surprise. Arrow keys move, Enter or Space toggles, Esc closes the menu.', {
      short: 'Switches that narrow the list or change how it behaves.',
      more: 'Collapse done steps and Highlight on hover are kept by Remember my settings and put back by Restore default settings; Visible only and Actions only start fresh every session, and Restore default settings turns Visible only off.'
    }],
    ['More menu', 'Holds Timeline (ticked while the pane shows it), Compare definition… and the four Export items. An item is listed only when your edition has it, and the button is not drawn when the menu would be empty.', {
      short: 'Deeper views and files: Timeline, Compare definition and Export.'
    }],
    ['Row menu', 'Right-click a row, or press the menu key on it: Copy name, Copy OmniScript path, Show in Data, Highlight on page, Expand this branch or Collapse this branch (step or block) and Select this row. Right-clicking alone does not select. On a step it may also offer Go back on page or Go to this step on page.', {
      short: 'Right-click a row for actions on that element.',
      more: 'The row is outlined while the menu is open. Copy OmniScript path reads the element\'s JSONPath property, or the names from its step down. Highlight on page works for a step, field or block; an action or validation is not drawn on the page. Expand this branch and Collapse this branch open or fold the step or block and every section inside it. See Go to an earlier step.'
    }],
    ['Go to an earlier step', 'Open the row menu of a step the script has passed and choose Go to this step on page; on the step the script is on it reads Go back on page. The head of the selected step has the same button. It acts on the inspected page, not in the panel. A script may refuse, so check the page.', {
      short: 'Ask the running script to go back to this step, as its Previous button does.',
      more: 'It presses the script\'s own Previous button, whether or not the button can be seen, so it works even when the designer hides it (by setting the step\'s Previous Width to 0). When it finds none, the panel sends the script the same event its own buttons use. It only goes backwards: a later step and the current step are not offered Go to this step on page, steps the script skipped are not counted, and a trip of more than 10 steps is not offered. It changes which step the page shows, never the data. If the step has not changed a few seconds later, nothing happened and the status bar says so (Could not go back: the script has no Previous button and ignored the request). Otherwise the status bar says Asked the script to go back N steps, and [[Follow current step]] picks up the new step as usual.'
    }],
    ['Filter', 'Type part of a name, type or label. A word from the screen also finds an element whose label is only a custom-label key. The steps and blocks above a match stay in the list, dimmed. To list only the elements a custom Lightning web component overrides, type override:, or override:name for one component.', {
      short: 'Find elements by name, type, label or label text.',
      keys: '/',
      more: 'It matches every custom-label key an element uses together with the text it resolves to. If the element you selected is filtered out, the detail pane says so. For override:name, the c-my-input tag and the myInput name both match.'
    }],
    ['Highlight on page', 'Use the detail pane\'s button, or turn on Highlight on hover in the View menu. The outline lasts a couple of seconds. It is best effort and says so when it cannot find the component.', {
      short: 'Outline the element\'s component on the inspected page for a moment.',
      more: 'The component is found through the lwcId in the definition. It needs an open shadow root and an element that carries that id.'
    }],
    ['Collapse done steps', 'Turn it on in the View menu. A step opens again if the script comes back to it. Anything you fold or unfold by hand stays as you set it. Turning it off opens the steps it folded.', {
      short: 'Fold each step once the script has passed it.'
    }],
    ['Calls tab', 'For an element that calls a Data Mapper, Integration Procedure or class, the tab starts with Sends and Response node, read from its settings, then On failure when set, and the name of what it calls. Below are the matching calls captured in Calls; click one to open it there. The tab is there before any call was captured.', {
      short: 'Show what an element sends, where the answer lands and its matching captured calls.',
      more: 'Sends is sendJSONPath, with sendJSONNode and the extra payload; the whole data when no path is set; only the extra payload when sendOnlyExtraPayload is on. Response node is responseJSONNode, with responseJSONPath; when none is set it says none set and that the answer lands in the data root, the top level of the data. The place in the data is a button that opens it in the Data tab when the data holds it now. When the action sets extra input, an Additional input card follows (and a Remote options card for its remote options): each Name, the Value as written and the Computed value, what it comes to with the %merge% fields filled in from the data (tagged estimated ≈ for a formula, can\'t tell with the reason in the tooltip). Copy in the card\'s header puts the table on the clipboard; [[Mask values]] replaces what the data holds. The matching calls show time, result and duration. Best effort: a property a build names differently simply shows less.'
    }],
    ['Name', 'In a multi-language script, labels and Text Block text are custom-label keys, resolved through the script\'s custom labels. A single-language script stores the text on the element. The detail pane shows the underlying label or text key.', {
      short: 'Rows read as API name first, then the label in parentheses.',
      more: 'Custom labels are resolved through scriptHeaderDef.allCustomLabels. Text Blocks show their text (textKey or text). The status bar shows the script language.'
    }],
    ['Element icons', 'A window is a step, brackets round a line a block, a text box an input, a ticked box a choice, lines of text a display element, a bolt an action, a circled ! a validation, Set Errors or Messaging element, <> a custom component and a dot anything else. Hover an icon or the row for the exact type.', {
      short: 'Each row starts with an icon for the kind of element.',
      more: 'A display element is a Text Block, an image or a link. The icons are drawn the same size as the other marks. The list has no Type column: hover the icon or the row, or read the type in the detail head. Click the Marks header for a legend of all the marks (see Marks column).'
    }],
    ['Marks column', 'Hover a mark for its reason.\n- * required\n- closed eye: hidden\n- diamond: has a show rule, shown now\n- two arrows: makes a call\n- cube: overridden by a custom component\n- triangle: custom label missing\n- unequal sign: value does not fit the type\n- red number: May stop Next', {
      short: 'Small marks at the right of each row; click the header for a legend.',
      more: 'The column sits at the right edge of the list, just before the Valid column and apart from it by a hairline, so every row shows its name on the left and all its marks at the same place on the right, whatever the depth. A row with none leaves the cell empty. Required is a neutral * because red is kept for things that fail. The tooltip of the closed eye says which rule fails and what the field holds, then Shown when: and the rule; a hidden row carries the closed eye alone. The diamond, as a flowchart draws a condition, means a show rule that is shown now; its tooltip reads Shown when: and the rule on one line, then what it comes to now. The cube\'s tooltip names the custom component. The triangle means a custom-label key the element uses (label, Text Block text, help text or a manually-entered choice option) is missing from allCustomLabels, which breaks a multi-language OmniScript; hover for which. The list has no Value column: the Current value tab, and its Form view for a step, show every value. The header is a button: Enter or Space open the legend too, and Escape closes it. On the step the script is on, the red May stop Next number is also shown (see May stop Next count).'
    }],
    ['Sections', 'Click a section\'s chevron to fold it; a folded section shows how many elements it holds, such as (3). [[Expand all]] and [[Collapse all]], the icon buttons after the View menu, do every section. Folding also works while a filter or Actions only is on. A long step keeps its row pinned under the column header as you scroll.', {
      short: 'Expand all and Collapse all open or fold every section of the list.',
      more: 'Steps and blocks that contain other elements are set in a heavier type, with a hairline above them. Everything starts expanded. The two buttons do not touch the detail pane, whose JSON trees have their own pair when they are on show. A folded section hides its matches too, and they come back when you unfold it. A faint guide runs down each level of indent. Selecting a step or block tints everything inside it, at any depth, in one shade, and draws a strong bracket along its own guide for the full height of what it holds; hovering a section header lights a lighter bracket for its subtree on top of that, so you can see where a block inside the selected step begins and ends. The pinned row is the step you are in; the next step\'s row takes its place when it arrives.'
    }],
    ['Valid column', '✓ passes its rules now (on a step only), ✕ would stop Next now, – the panel cannot tell, blank when there is nothing to judge. Hover a glyph for the reason. A step shows the sum of its elements. A step still ahead, and everything in it, is blank because its data does not exist yet.', {
      short: 'One glyph per row: passes its rules, would stop Next, or can\'t tell.',
      more: 'The last column of the list, at the right edge after the Marks column and a hairline. The glyphs are the same ones as the Result of the Calls list. The header is the word Valid, with a tooltip that explains the column; a screen reader reads the same sentence as the hover. On an element of the step the script is on, or of a step already passed: a required input is ✕ Required and empty, or blank when filled (one the show rules hide is blank too, since hidden fields do not stop Next); a Messaging or Validation element is ✕ while it shows a Requirement or Error message, – when the panel cannot tell, blank when it passes or only fires a warning; a Set Errors element is ✕ while it fires, blank when it does not; a custom component is –, since its own controls cannot be read from the definition. Anything else (display text, a block, an action, an input that is not required) is blank: there is nothing to judge, and blank is not –, which means the panel tried and could not tell. A step shows ✕ with the same count as the red May stop Next number (which stays after the name of the step the script is on), ✓ when nothing stops Next on it, – when only a formula\'s estimate is in doubt, and – Passed without running for a step whose show rule was false. A passed step is judged against the data right now, like the current one, so a ✕ there means its data has gone bad since. With no data read the whole column is blank. Judged against the data right now; best effort. The step the script is on is told by its row and the elements inside it: they share a faint tint of the accent, as an editor marks its current line, and the step\'s own row alone has a 4 px bar in the accent on its left edge, a bold name, and "The step the OmniScript is on now" in the tooltip of its name (the indent guides are plain grey, so the bar is the only blue stripe). Steps ahead are dimmed, and a step passed without running is dimmed and in italics, with "Passed without running: its show rule was false" in the tooltip of its name. This is read from the definition (asIndex against each element\'s indexInParent) for top-level steps and actions. A Set Values, between steps or inside one, counts as run once the script has reached its step and its show rule is true (judged against the live data, or the definition\'s bShow when the rule cannot be judged).'
    }],
    ['Follow current step', 'On by default. Picking an element by hand pauses following: a small dot appears after the label and the tooltip says it is paused. Press [[Current step]], or tick the box again, to resume. Filters are left alone.', {
      short: 'Keep the step the script is on selected as it moves on.',
      more: 'The label itself never changes, so the toolbar does not move. Pressing Esc in the list pauses it too (see Summary).'
    }],
    ['Hidden elements', 'The closed eye carries the show rule in its tooltip, Shown when:. The detail pane says in one sentence which rule fails and what the field holds. Children of a hidden element are hidden too. The status bar counts them ("2 hidden"). Visible only, in the View menu, leaves them out of the list.', {
      short: 'A dimmed row in italics with a closed eye is not shown right now.',
      more: 'A diamond mark means the element has a show rule and is shown. The status bar count leaves out any hidden element that rests on a guess: a rule the panel cannot tell about, a formula\'s estimate, or a parent that is hidden for one of those reasons (these show the diamond instead of the closed eye, and Visible only still drops them). Show rules are evaluated against the live data, not the definition\'s bShow, which is only a snapshot from when the definition was read. The sentence reads like Hidden: Step:Type is "y", not "x". Rules the panel cannot tell about (unusual operators, a formula it cannot evaluate) fall back to bShow.'
    }],
    ['Show in Data', 'Press Show in Data in the detail pane, or choose it in the row menu. The panel finds the value through the element\'s OmniScript path. Data\'s Structure row button does the reverse.', {
      short: 'Open the Data tab at the selected element\'s value.',
      more: 'It is left out for an element that has no place in the data.'
    }],
    ['Current step', 'The status bar names the step, for example "Plan Selection (step 4 of 5)"; hover it for where that was read from. If it names no step, the definition did not say which one the script is on.', {
      short: 'Select and scroll to the step the OmniScript is on now.',
      more: 'It also resumes [[Follow current step]] when that was paused.'
    }],
    ['Actions only', 'Turn it on in the View menu. The list then shows only elements that call something: the script\'s whole integration surface in one list.', {
      short: 'List only the elements that call a Data Mapper, Integration Procedure or class.',
      more: 'It is not kept by Remember my settings.'
    }],
    ['Value', 'Open the Current value tab (see Current value views). For a radio or select with manual options, the stored value is joined with its option label, such as US (United States). For an element inside a Repeat Block or Edit Block, the detail head steps through the rows (see Repeat rows).', {
      short: 'The Current value tab shows an element\'s live data; the list has no Value column.'
    }],
    ['Detail tabs', 'A tab that does not apply is left out, never greyed. A pick opens on its default tab: Current value when the element has a value, Validation for a step that may stop Next, Visibility for an element with a show rule, otherwise Properties. JSON opens only when you pick it.', {
      short: 'Tabs of the detail pane: Current value, Options, Properties, Visibility, Validation, Calls and JSON.',
      more: 'A tab you pick stays for the elements that have it. Order, each with an icon: Current value (Set Values for a Set Values element), Options (for a choice element that lists its options), Properties, Visibility, Validation, Calls, JSON. Left out when it does not apply: Current value while the data holds nothing for the element (a Formula element keeps it, for its Formula card), Options for an element that lists none, Properties for an element with none, Visibility for an element with no rule that nothing else uses (also when it depends on, is used by or is written by something), Validation for an element that has none (a step gets one while something may stop Next on it), Calls for an action whose settings say nothing and that no captured call matches. A tab comes back when its data does. A Set Errors or Messaging element also opens on Validation. With Remember my settings, the tab you picked is kept for the next time DevTools opens (not JSON; Show internal on the Properties tab is kept as well). JSON is last and is not a default: it is the element as JSON, as the Designer\'s Edit Properties as JSON shows it, for when the readable tabs are not enough, and the next element does not follow you there, unless it is the only tab the element has. What a tab says is drawn as cards, one frame for every fact: a bordered box whose header line holds the card\'s name in small capitals, the verdict as a tag when there is one (Fails, Passes, Hidden, Shown, Can\'t tell; hover it for the whole sentence), other tags (estimated ≈, what if) and Copy at the right; hover the header for what the card is. Inside are labelled rows (the label in small capitals, the value beside it, or above it in a pane narrower than 480 px, with a divider between rows) or a table whose cells stack under their column\'s name in a narrow pane. Names and values are in a monospace font, words in the panel\'s own; an element\'s name is a link that selects it; what the panel cannot know is dimmed and in italics (can\'t tell, not in data); a state is a tag after its value: differs (amber) when a computed value and the current value are not the same, estimated ≈ (outlined) for what a formula the panel evaluates itself comes to, read from the data (grey) for a value the panel took from the data because it cannot work it out. A card\'s Copy copies it as text, with [[Mask values]] applied. [[Expand all]] and [[Collapse all]] appear only on a tab that draws a JSON tree (Current value in its Tree view, and JSON), the filter box on a tree, on the Form and on Properties, and the toolbar\'s Copy on JSON. In a pane narrower than 600 px the tabs show a short name beside the icon (Value, Opts., Props, Visib., Valid., Calls, JSON); the full name is the tab\'s tooltip and stays for screen readers. Right-click a line in any tree of the pane for the same menu as in Data: copy the value, the key, the OmniScript path or the %merge% field, and open or close a branch ([[Mask values]] applies to what is copied).'
    }],
    ['JSON tab', 'Open it from the tab strip, or from the Show JSON link under the Visibility and Validation cards. It is the place to look for what the readable tabs leave out. [[Expand all]], [[Collapse all]], Copy and the filter box work as on any tree.', {
      short: 'The selected element exactly as the definition holds it, as a tree.',
      more: 'It is the same as the Designer\'s Edit Properties as JSON. It is never the tab a pick opens on, unless it is the only one the element has. [[Mask values]] masks the answers the element holds (its response and defaultValue entries) in the tree and in what is copied.'
    }],
    ['Current value views', 'A step or block opens on Form: each key is a row with its label and a plain value; groups open in place. Tree is the JSON tree. Raw is the JSON text with the tree\'s line numbers. The filter box narrows Form and Tree. Copy in the card header copies the value as JSON.', {
      short: 'Show the value as a Form, a Tree or Raw JSON text.',
      more: 'Current value opens on a Current value card on every element type, before any other card. A simple value (text, a number, true or false, an empty value) is shown in a monospace font with a quiet type hint after it (text, number, true/false, empty); while the data holds nothing for the element the card says not in data, dimmed (a Formula element keeps the tab for its Formula card). An object or a list is a tree inside the card. The switch Form | Tree | Raw sits in the card\'s header beside Copy, on a step or a block. In Form, each key\'s row shows the label of the element that owns the key with the element\'s name dimmed after it, else the key alone (hover for the key and the element\'s type), and true and false written as words, with the type hint after a number, a true/false or an empty value. An object or a list shows as "n items" with a chevron that opens it in place, one level at a time; the rows of a repeat or edit block read Row 1, Row 2 and carry the labels of the block\'s own elements. A very long list is cut after 400 rows, which the Tree and Raw views show in full. The choice is kept while the panel is open, and across sessions with Remember my settings. The groups you opened on a step are kept while it stays selected and forgotten when you pick another; a row of a repeat block that carries an Id is remembered by it, so removing a row does not open another. Copy works from all three views and for a simple value (masked with [[Mask values]] on); the toolbar has no Copy of its own on this tab. The filter box narrows the Form to the rows whose label or key contains the text, among the groups that are open, and the status bar says how many rows of how many are shown. [[Expand all]] and [[Collapse all]] belong to the Tree.'
    }],
    ['Properties tab', 'Known settings come first under plain names; hover one for its key and meaning. A small i after a setting opens a short explanation under the row. Values that hold others are drawn as tables, not JSON. Keys the runtime uses for itself sit behind Show internal. The filter box narrows rows by name or value.', {
      short: 'The element\'s settings as a table, with the panel\'s own labels.',
      more: 'The table shows the element\'s propSetMap: a readable name on the left, the value on the right. Known settings have plain names, such as Required, Data Mapper bundle or Remote method; the rest keep their own name. A yes/no is ✓ or –, and a long text is cut with more / less. A list of options becomes label → value rows, Conditional View becomes a rule table (● true now, ○ false now or ? can\'t tell, then Field, Must be and Is now), Set Values reads target ← expression, and any other object nests as a table of its own, up to three levels. A level deeper than that, or with more than 30 keys, shows its size with show JSON / hide JSON to open it as a tree. Internal keys start with _, lwc, pubsub or ssm and are folded behind Show internal (n). The i covers the settings the panel knows (width, repeat, show, mask, the call settings and so on); where the panel is not sure of the meaning, the text says "as far as the panel knows". When no name or value matches, the filter also reads the explanations, so "columns" finds Width. A Text Block, Headline or Messaging element has a Merge fields card above the table (see Merge fields card).'
    }],
    ['Summary', 'It lists the script\'s Type/SubType/Language, element counts by kind, what it calls, the elements custom components override and its custom labels (click one for the Problems list). It also shows the step the script is on, Problems and May stop Next for the current step. Press Esc in the list to come back to it.', {
      short: 'An overview of the script, shown while no element is selected.',
      more: 'A row appears only while it has something to say. Also its version and whether it is active and reusable (when the definition carries them). The element count is the figure the status bar gives, split into steps and each kind, such as 22: 4 steps · 14 fields · 2 actions. What it calls (Data Mappers, Integration Procedures and Remote Actions) is one button per name that selects the first element that calls it, with ×n when several do. Overridden: N lists the elements a custom Lightning web component overrides, each name selecting its element. Custom labels show keys, languages and how many are missing. The furthest step the script has been on is listed too, only when that is a different one. Click May stop Next to open that step\'s Validation tab. After Esc, [[Follow current step]] does not select anything again until you pick an element, press [[Current step]] or tick [[Follow current step]], and shows its pause dot meanwhile. Once the script has been seen on a step, the Timeline takes the place of the summary until you pick something, and Timeline in the More menu shows it again whenever you want it. Best effort: a field the definition does not carry is left out.'
    }],
    ['Visibility tab', 'The Visibility card judges the element\'s show rule (Conditional View in the Designer) against the data. The tag in its header says Hidden, Shown or Can\'t tell; hover it for the sentence. The table lists each condition: a mark for whether it is met now, the Field, what it Must be and what it Is now.', {
      short: 'Why an element is shown or hidden: its show rule judged against the data.',
      more: 'The tag is Hidden (grey: a hidden element is normal), Shown (green) or Can\'t tell, with estimated ≈ when it rests on a formula\'s estimate and what if while a value you typed decides it. Its tooltip reads: Always shown; Shown: its condition is true; Hidden: Step:Plan is "Standard", not "Gold" for a single rule; Hidden: 2 of 3 conditions fail (1 of 3 conditions fails) when every one is needed; Hidden: no condition is true (0 of 3) when one is enough; or that the panel cannot tell if the rule is true here and what the script treats it as, which a Verdict row then says too. An element a parent hides has a Hidden by row with the parent, a link, and why. The marks are neutral (● met, ○ not met, ? can\'t tell), because a met condition is good on a show rule and the reason a Set Errors fails, so the colour is on the card\'s verdict. Field is the element\'s name, a link that selects it, with the field as written in the tooltip; Must be reads = "Gold", ≠ "", ≥ 18; Is now is never blank: empty, not in data, or can\'t tell for a formula or an unusual operator, dimmed. Under each condition the same is said in plain words, such as FO_Age is 30, which is 18 or more, or FO_HasCard is null, which counts as not true. A group says what it needs and how it stands, All of these must be true; 1 of 2 is not, or One of these must be true; none is; a nested group is indented and has its own mark. In a pane narrower than 480 px each condition starts with its mark and its plain words, then Field, Must be and Is now, each label above its value. The As written row ends the card: the rule exactly as the Designer defines it, on one line. Copy copies the card as text, each condition with its plain words; with [[Mask values]] on, what the data holds is replaced and the plain words are left out. The JSON tab holds the element as JSON. The card has a Depends on row (with (not an element) for a name the script has no element for), the tab lists in full which elements\' rules use the element and which Set Values write it, and is there for an element that others depend on even when it has no rule of its own. Best effort: a rule whose value is a formula (it starts with =) is evaluated here, marked ≈ on its mark and estimated ≈ in the header; see Formulas. Unusual operators and formulas that cannot be evaluated are can\'t tell and never guessed.'
    }],
    ['Set Values', 'The Set Values tab has one row per assignment: the Target element, the Expression as written, the Computed value it gives now and the Current value the target holds. An amber differs tag marks a mismatch. A formula is evaluated best effort and tagged estimated ≈; one it cannot evaluate says can\'t tell. Copy copies the table.', {
      short: 'Show each assignment of a Set Values element and what it computes now.',
      more: 'A Current value card comes first only while the data holds something under the element\'s name. Target is the element by its name, a link that selects it (the path as written is in the tooltip and in a copy). Computed value is the value the target gets when the element runs, with the %merge% fields filled in from the live data. Current value is the dimmed not in data while the target holds nothing. For a formula\'s estimate, the tooltip of differs says it differs from the estimate. A formula that cannot be evaluated, or that reads a field with no value yet, says can\'t tell, the tooltip says why, and it is never tagged differs. In a pane narrower than 480 px each assignment stacks. Copy is tab separated; with [[Mask values]] on, what the data holds is replaced and text written in the definition, such as a fixed value, is kept. The element\'s JSON is behind its JSON tab, as for every element. For other elements the Current value tab lists which Set Values write into it (Written by).'
    }],
    ['Options tab', 'For a Select, Radio, Multi-select, Lookup or Type Ahead element that lists its options, the Options card shows each option\'s Label and Value and ticks Selected on the one the data holds. A value that matches no option gets an amber No match tag, and a chip in the detail head opens this tab. Copy copies the table.', {
      short: 'List a choice element\'s options and tick the one the data holds.',
      more: 'A Multi-select ticks every option it holds. When the data holds a value that is none of the options, nothing is ticked, the card\'s header carries the amber No match tag (hover it for the value), and the amber chip in the detail head says No option matches it. An option list that comes from a Data Mapper, an object or custom code has no options of its own and gets no tab. In a debug bundle saved with [[Mask values]] on the answers are placeholders, so nothing is ticked, the card\'s header says masked and no chip is raised. With [[Mask values]] on, Selected reads (masked) on every row of a copy, so which option is selected is not copied.'
    }],
    ['Formula card', 'On a Formula element\'s Current value tab. Expression is as written; Computed value is what it comes to now, tagged estimated ≈. If the panel cannot evaluate it but the data holds the value, that value shows, tagged read from the data; otherwise it says can\'t tell. Elements it reads lists what the formula reads.', {
      short: 'Show how a Formula element\'s expression computes now and which elements it reads.',
      more: 'The card follows the Current value card, which stays even when the Formula card repeats its value. Hover the tags for why. In Elements it reads, each element is shown with what it holds now; its name is a link that selects the element (the field as written is in the tooltip; a field that is no element opens its place in Data while the data holds it). The card stays while the data holds no value for the formula. Copy copies the card as text; with [[Mask values]] on, what the data holds is replaced.'
    }],
    ['Merge fields card', 'A Text Block, Headline or Messaging element holds no value of its own, so its Properties tab starts with this card: each field the text reads, once, in reading order, with what the data holds now. A field that names an element links to it; any other field opens its place in Data.', {
      short: 'List the %merge% fields a text reads and what the data holds for each.',
      more: 'The card is left out for a text that reads no field. A linked element shows its label with its name after it. A value is tagged estimated ≈ for a Formula element\'s estimate, and the dimmed not in data shows for a field the data does not have. Copy copies the table as text; with [[Mask values]] on, what the data holds is replaced.'
    }],
    ['Validation tab', 'The Validation card judges the element against the data now, best effort. Its header tag says Fails, Passes or Can\'t tell. Rows show the message and its kind, or the errors it sets, then the condition as a table like the Visibility card\'s. A Requirement or Error message, or a firing Set Errors, blocks Next.', {
      short: 'Show whether a Set Errors or Messaging element fails now, and why.',
      more: 'It is shown for Set Errors and Messaging / Validation elements. Fails is red when its Requirement or Error message shows, or its error is set, which blocks Next; amber when that rests on an estimate. Passes is green. Estimated ≈ and what if are used as on the Visibility card. Hover the tag for the sentence, such as Expression is false · shown: Requirement “Check the card” or Condition is true now: the error is set and blocks Next. For Messaging / Validation, the rows are Shows, the message the result selects now (no message when it selects none), and Kind, its type and whether it blocks Next, then the message for the other outcome, dimmed, as If it passes or If it fails (or When and its condition). For Set Errors they are Errors it sets (each element the error lands on, a link, with its message), Message, and Checked, when the user moves between steps or the event it runs on (the error clears once the condition is no longer true). The condition marks are neutral (a Set Errors fires when its condition is met, a Messaging / Validation fails when its expression is not). Copy copies the card as text. Messages written as formulas (text starting with =, such as =IF(%LanguageCode%==\'fi\',...)) are evaluated as estimates: the text it comes to, tagged estimated ≈ (hover for the formula and where a language came from), with a Message formula fold under it that holds the formula as written. In a table cell of the Properties tab the same reads ≈ “text”, with a formula fold. When a merge field has no value it says can\'t tell: no value for %Field%. %LanguageCode% falls back to the script\'s own language when the data has none, and the tooltip says so. A code with a region (en_US) is tried as written and as the bare language (en), whichever the formula compares with; when it compares with both, or the script names its language in words (English), it says can\'t tell instead of guessing. The same applies to message and label texts in the Properties tab and in a step\'s Validation tab. Best effort: only a rule group can be judged; a formula expression is reported as such.'
    }],
    ['Export', 'Choose an Export item in the More menu: structure as Markdown (a table per step), structure as CSV (one row per element), custom labels as CSV, or definition as JSON, the baseline for Compare definition. The files hold structure and labels, never a value from the data.', {
      short: 'Save the structure, custom labels or definition as a Markdown, CSV or JSON file.',
      more: 'The Markdown file has a heading per step and a table of its elements, indented by depth, with type, label, required, show rule, remote target and a validation summary. The structure CSV has one row per element, with depth and parent. The custom labels CSV has each key, the text it resolves to, which elements use it and whether it is missing from allCustomLabels, with one text column per language when the script has several; it is greyed out when the script has no custom labels. The definition JSON is the definition exactly as read. [[Mask values]] has nothing to hide in the first three; the one exception is Export definition as JSON when a loaded script keeps answers inside its definition (a response or defaultValue), which [[Mask values]] then replaces with placeholders, keys kept. In the CSV files a cell that starts with = + - or @ gets a leading apostrophe so a spreadsheet does not run it.'
    }],
    ['Timeline', 'Tick Timeline in the More menu, or pick nothing and it shows in the detail pane (Esc shows the summary instead). Each visit lists the step, when it began, how long the script stayed and a bar with a tick for every call that started; click a step to select it. The visit going on is marked (now).', {
      short: 'List each visit to a step, with the time spent and the calls made.',
      more: 'Visits are listed oldest first, and the 40 newest are kept. The time uses the Time format of Calls. The bar shows that time with the longest visit at full width; hover a tick for the call. The size of the last data JSON read during the visit is shown too. The visit going on grows in place. Picking a row of the list also leaves the Timeline, and the button comes back to it. It is measured only while the panel is open and on screen, like Step timing.'
    }],
    ['Set Errors toast', 'It appears when you are on another tab and the number of Set Errors or validations firing on the step the script is on goes from none to some, for example "Set Errors fire on Intro: 2". It never shows while this tab is open, and at most once every 30 seconds.', {
      short: 'A toast says when Set Errors start firing on the current step.',
      more: 'On this tab the step\'s red number says it instead. It is not raised for errors that rest only on a formula estimate. Arriving on a step where errors already fire only sets the starting point. It reads the data JSON the panel already polls about every two seconds, and needs the definition to have been loaded once.'
    }],
    ['What if', 'In the Visibility card, and the Validation card of a Set Errors or Messaging element, click an Is now cell (or press Enter on it), type a value, and press Enter to keep it or Escape to drop it. The marks, plain words and verdict recompute. Nothing is written to the page. Reset what-if puts every typed value back.', {
      short: 'Type a value into a condition\'s Is now cell to see how the verdict changes.',
      more: 'The condition\'s mark and plain words, the group lines and the card\'s verdict recompute as if the field held that value, with "edited" on the row and a what if tag in the card\'s header (the verdict\'s tooltip ends with (what if)), so you can see which value would show an element or make an error fire. A plain number is a number, anything else is text. The data is not touched. Reset what-if appears while any value is typed. A typed value also goes when you select another element, or when the data for its field changes by itself. A step\'s Validation tab shows the same conditions, without editing.'
    }],
    ['Value type hints', 'Hover the mark, or the amber line in the detail head, for the sentence. It is a hint, not a problem: nothing counts it. It is judged only when the data holds a value, and never for an estimate, a type the panel does not know, or options that come from a Data Mapper or other source.', {
      short: 'An amber ≠ mark: the value does not have the shape its element type promises.',
      more: 'The cases are a Number or Currency that holds text (a comma or space inside a number, as in 12,5, is a locale format and not a number), a Date, Date/Time or Time that is not ISO and does not fit the element\'s dateFormat or timeFormat, a Checkbox or Toggle that holds the text true or false instead of a boolean, a Select or Radio that holds something outside its static options, and a Multi-select that holds text instead of a list. Nothing counts it, not the Problems button, the red number or the status bar. Best effort.'
    }],
    ['Compare definition', 'Choose Compare definition… in the More menu and pick a definition file (the jsonDef text) or a debug bundle that holds one. The file is Before and the script now is After. Added, Removed, Renamed and Changed elements are listed; click a name to select it. Close ends the comparison.', {
      short: 'Compare the script now with a saved definition file or debug bundle.',
      more: 'Renamed means the same type in the same place under a new name. Each element is listed with a short note of what changed: label, required, show rule, validation, remote target, options, Set Values and help text. Runtime values the script rewrites while it runs are ignored. The comparison stays until you press Close, pick a row in the list, or open another script. Export definition as JSON in the same menu keeps a baseline. The file is read here and kept in memory only.'
    }],
    ['Resizing', 'Drag the divider to rebalance the list and the detail pane; it works side by side or stacked. Double-click it to reset.', {
      short: 'Drag the divider between the element list and the detail pane.'
    }],
    ['Step validation', 'The tab appears while something may stop Next on the step or it holds a custom component. Required and empty lists visible required elements with no value. Under Validation rules, each Messaging / Validation and Set Errors element shows Fails, Passes, Hidden or Can\'t tell; a failing one is open. Under Custom components, each shows Shown or Hidden.', {
      short: 'A step\'s Validation tab lists what may stop Next: empty required fields and failing rules.',
      more: 'The number after the step\'s name is how many things may stop Next. It is judged against the data right now, best effort (each card\'s header says so in its tooltip), and is a column of cards that follows the data as it changes. Required and empty lists the visible required elements of the step, at any depth, whose value is empty, one row each with the name as a link (a required checkbox or disclosure must be ticked; a Name or Geolocation with nothing in it is empty; required fields inside an Edit Block are left out, since they are checked when the row is saved). In a repeat block every row is judged on its own: a row without the field counts as empty ("row 2"), a block inside a block names the outer row and then the inner one ("row 2.1"), and a show rule inside the block is read with that row\'s own values; a finding inside a block that rests on a rule the panel cannot tell about is tagged estimated ≈ and not counted. Validation rules has one card per Messaging / Validation and Set Errors element of the step, and per Set Errors anywhere else that puts an error on an element of the step ((in Step) on its line): its kind and name, a link, in the header with its verdict. Hidden means it is hidden, so it holds nobody back. A failing rule is open, with what it shows and its kind (or the errors it sets) and its condition as the Visibility card\'s table; a passing one is closed to its header line, which gives the condition that decides it, such as FO_Age is 30, which is 18 or more. Click a card\'s header to open or close it; it stays as you left it while the tab is open. A rule that fails only by a formula\'s estimate is amber, tagged estimated ≈, and not counted. Custom components has a card per Custom LWC of the step and per standard element a custom component overrides (overridden by and the component on its line): its verdict, Shown or Hidden, and the condition that decides it, opening to its show rule (a hidden one is open); and the note that a custom component may carry its own required controls or Next/Previous buttons, which cannot be read from the definition. Click a name to select that element. Server-side checks and rules the panel cannot evaluate are not covered.'
    }],
    ['May stop Next count', 'It shows on the step the script is on: the required fields that are empty plus the Set Errors and validations firing now. The step\'s ✕ in the Valid column says the same, and each element behind the count has its own ✕. The step\'s head says May stop Next: N. Nothing shows at zero.', {
      short: 'The red number on a step: how many things may stop Next on it.',
      more: 'The number follows the data. Nothing that rests only on a formula\'s estimate is counted. The head of any step shows the figure, only while it is above zero.'
    }],
    ['Formulas', 'When a show rule, Set Values or Formula element needs a formula\'s value, the panel works it out and marks it ≈ (estimated). If it cannot (unknown function, syntax error, field with no value, text where a number is needed), the rule stays unjudged (?). An estimate is never counted as a failure.', {
      short: 'The panel evaluates formulas itself and marks the outcome as an estimate (≈).',
      more: 'The mark is ≈ before a value or a rule\'s result, and (estimated) at the end of a sentence. It is used where a show rule compares with a formula (a value starting with =), a rule field names a Formula element the data holds nothing for yet, a Set Values assigns a formula, or a Formula element has no value. Supported, best effort: numbers, text, %Field% and %Step:Field% references, + - * /, comparisons, & to join text, parentheses, and IF, AND, OR, NOT, ISBLANK, ISNULL, CONCAT, LEN, UPPER, LOWER, TRIM, ABS, ROUND, FLOOR, CEILING, MAX, MIN, SUM, AVERAGE, NUMBER and TEXT. The tooltip says why a formula is not judged; nothing is guessed. Messages and texts written as formulas (Set Errors, Messaging, properties) are evaluated the same way and shown with ≈; the formula stays in a fold under them. The script itself decides what really happens, so an estimate never turns the red count up on its own: such findings sit under Estimated, not counted in the step\'s Validation tab.'
    }],
    ['Problems', 'The button appears, with a count, only while there are problems. Errors: names used twice, Set Errors aimed at a name that is not an element, custom labels missing from allCustomLabels. Warnings: an empty show rule. Click a line to select the element; click the button again, or Close, to leave the list.', {
      short: 'List what the definition proves wrong, such as duplicate names or missing labels.',
      more: 'Only errors and warnings count in the button. A bare name that a rule or a %merge% field uses and that is neither an element nor a key in the live data is judged against the data, which a Data Mapper, Integration Procedure or Set Values may fill later, so it is listed apart, under a folded group "Not in the data yet (N)" at the bottom of the list, and never counted. Formulas (=), $ references, Set Values targets and any qualified path (Step:Field, the response nodes of an action) are not judged at all, and nothing data-based is reported while no data could be read. The list is checked again when the definition or the data changes: best effort.'
    }],
    ['Repeat rows', 'For an element inside a Repeat Block or Edit Block the detail head shows Row 1 of 3 with ‹ ›. The Current value tab, the step\'s Validation tab and Set Values follow the chosen row. Rows count from 1, as in OmniScript paths.', {
      short: 'Step through the rows of a Repeat Block or Edit Block.'
    }],
    ['Depends on / Used by / Written by', 'The Visibility tab lists, as buttons that select the element: Depends on (fields its rules read), Used by (elements whose rules read this one) and Written by (Set Values that write into it, with their step). The Current value tab lists Written by too.', {
      short: 'On the Visibility tab: what an element\'s rules read, what reads it, what writes it.',
      more: 'The Visibility tab is offered for any element that has one of the three, even without a rule of its own. The detail head does not carry them: it is one line, see Detail pane head.'
    }],
    ['Detail pane head', 'For example Text · PromoCode · conditional. Only while they apply, it adds · overridden by c-my-input, a verdict chip (click it for the Visibility or Validation tab), May stop Next: N on a step, the calls and time on a step, and the row stepper. A figure that is zero is never shown.', {
      short: 'One line under the name: type, name and flags, with chips for what needs attention.',
      more: 'For an element a custom component draws instead of the standard one, the head adds · overridden by c-my-input (read from lwcComponentOverride or lwcOverride): its own markup and validation run, which the definition cannot show. The verdict chip is red when an error blocks Next, grey when a rule hides the element (hidden is a fact and not an error), and amber when that rests on an estimate or the panel cannot tell if the rule is true; the tab it opens says it in full. A shown element has no chip; its sentence, such as Shown: its condition holds, opens its Visibility tab. A choice element whose value is none of its options also gets an amber chip, a button, No option matches it, which opens the Options tab (see Options tab); on the Options tab itself the head keeps a plain ≠ line with the same words. The head of a step may end with a Go back on page or Go to this step on page button (see Go to an earlier step).'
    }],
    ['Step timing', 'Once there is one, the head of a step says how many captured calls started while the script was on it (click it to open the first in Calls) and how long the script spent there, with its visits. The Time format setting decides whether it reads in milliseconds or as 1m 12s.', {
      short: 'A step\'s head shows its captured calls and the time the script spent on it.',
      more: 'The head reads, for example, "Calls during this step: 2" and "Time on this step: 72,000 ms (2 visits)"; a return to an earlier step is another visit. It is measured while the DevTools panel is open and on screen, whichever tab you are on (it reads the step about every two seconds, sharing the Data tab\'s reads), and the step: filter of Calls uses the same visits. With the panel closed or another DevTools panel in front nothing is measured, and a move made then is dated from the next look. The figures start over when you pick another OmniScript, change the definition property or the page navigates. Time format is in Settings, under Calls.'
    }],
    ['Editing in Designer', 'While this tab is open the definition is read again about every six seconds. When elements were added, removed or renamed, or their settings changed, the list is redrawn and your selection and folds stay on the elements that remain. Refresh reloads it at once.', {
      short: 'The definition is read again every few seconds, so Designer edits show up.',
      more: 'A redraw follows a change of label, required flag, show rule, remote call, validation, help text, options or Set Values. A running script rewrites some definition fields itself (the active step, which elements are shown); those alone never redraw anything.'
    }]
  ]]];

const MORE_GATES = ['structure.timeline', 'structure.compare-definition', 'structure.export'];
const shown = ([title]) => {
  if (title === 'More menu') return MORE_GATES.some((gate) => Features.has(gate));
  return !GATE_OF[title] || Features.has(GATE_OF[title]);
};

/* An entry that stays in Free but names a gated feature in passing is worded
 * without it there (see variants.js). */
const FREE_WORDING = {
  'Row menu': ['structure.steps', [
    [' On a step it may also offer Go back on page or Go to this step on page.', ''],
    [' See Go to an earlier step.', '']
  ]],
  'Marks column': ['structure.steps', [
    ['\n- red number: May stop Next', ''],
    [' On the step the script is on, the red May stop Next number is also shown (see May stop Next count).', '']
  ]],
  View: ['structure.references', [
    ['Switches: Actions only, Collapse done steps, Highlight on hover and Visible only.', 'Switches: Highlight on hover and Visible only.'],
    ['Collapse done steps and Highlight on hover are kept', 'Highlight on hover is kept'],
    ['Visible only and Actions only start fresh', 'Visible only starts fresh']
  ]],
  Sections: ['structure.references', [['while a filter or Actions only is on', 'while a filter is on']]],
  'Valid column': ['structure.steps', [['✕ with the same count as the red May stop Next number (which stays after the name of the step the script is on),', '✕ with the count of what would stop Next,']]],
  Summary: ['structure.problems', [
    [' (click one for the Problems list)', ''],
    ['the step the script is on, Problems and May stop Next for the current step.', 'the step the script is on.'],
    [' Click May stop Next to open that step\'s Validation tab.', ''],
    [' Once the script has been seen on a step, the Timeline takes the place of the summary until you pick something, and Timeline in the More menu shows it again whenever you want it.', '']
  ]],
  'Detail tabs': ['structure.references', [
    [' (also when it depends on, is used by or is written by something)', ''],
    [' (estimated ≈, what if)', ' (estimated ≈)']
  ]],
  'Visibility tab': ['structure.references', [
    [/ The card has a Depends on row .*? even when it has no rule of its own\./s, ''],
    [' and what if while a value you typed decides it', '']
  ]],
  'Set Values': ['structure.references', [[' For other elements the Current value tab lists which Set Values write into it (Written by).', '']]],
  'Options tab': ['shell.bundle', [[' In a debug bundle saved with [[Mask values]] on the answers are placeholders, so nothing is ticked, the card\'s header says masked and no chip is raised.', '']]],
  'Validation tab': ['structure.whatif', [['Estimated ≈ and what if are used as on the Visibility card.', 'Estimated ≈ is used as on the Visibility card.']]],
  'Set Errors toast': ['structure.steps', [['On this tab the step\'s red number says it instead. ', '']]],
  Formulas: ['structure.steps', [['happens, so an estimate never turns the red count up on its own: such findings', 'happens, so such findings']]],
  'Value type hints': ['structure.problems', [['Nothing counts it, not the Problems button, the red number or the status bar.', 'Nothing counts it, not even the status bar.']]],
  'Detail pane head': ['structure.steps', [
    [', May stop Next: N on a step, the calls and time on a step, and the row stepper.', ', and the row stepper.'],
    [' The head of a step may end with a Go back on page or Go to this step on page button (see Go to an earlier step).', '']
  ]]
};

const worded = (entry) => wordedFor(FREE_WORDING, entry);

/* sections is read when the help opens, after a build with gates has registered them. */
export const STRUCTURE_HELP = {
  title: 'Structure',
  lede: 'Every element the OmniScript is built from, read from its definition and joined to the live data.',
  get sections() { return SECTIONS.map(([heading, entries]) => [heading, entries.filter(shown).map(worded)]); },
  allSections: SECTIONS
};

/* The first-time tour of this tab (src/ui/tour.js): at most three steps, each
 * on a real control outside the list, one short sentence that says what to do. */
export const TOUR = [
  { anchor: '#struct-filter', title: 'Find an element', text: 'Type part of an element\'s name or label here to find it in the list.' },
  { anchor: '#struct-current', title: 'Where is the script?', text: 'Click [[Current step]] to jump to the step the script is on right now.' },
  {
    anchor: '#struct-view',
    title: 'Narrow the list',
    get text() {
      return Features.has('structure.references')
        ? 'Open [[View]] to keep only the elements that call something, or only those shown now.'
        : 'Open [[View]] to keep only the elements that are shown now.';
    }
  }
];
