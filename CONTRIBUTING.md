# Contributing

OmniScript Data Inspector is a Chrome DevTools panel (Manifest V3) for
inspecting Salesforce OmniStudio OmniScripts. It has three tabs: **Data**,
**Structure** and **Calls**. Replay, which recorded and replayed a
tester's steps, moved to its own extension, OmniScript Replay
(`mskrzypczynski/omniscript-replay`), which started from this repository's
top bar, JSON tree and settings code. README.md covers what it does for
users.

This file holds the engineering rules of the project: what the architecture is, what every change needs, how it is checked and how a release is made.

## Branches

- Name every branch `feature/<name-of-feature>`: lowercase words joined by
  hyphens that say what the change does, e.g. `feature/form-view`.
- One branch per feature, started from an up-to-date `main`. The matching
  branch in the website repository uses the same name.

## Architecture (the rules that matter)

- **No build step and no runtime dependencies.** Every file under `src/` is a
  native ES module, loaded by `panel.html` through `src/ui/app.js` (the
  composition root). Don't add a bundler, transpiler, framework or npm runtime
  package.
- **Two layers, one direction:**
  - `src/core/` holds pure domain logic: plain functions on plain data. It has
    no DOM, no `chrome.*`, and no `window`/`localStorage`; ESLint enforces this.
    Anything that makes a decision, such as parsing, diffing, line numbering,
    show rules, filtering or decoding payloads, belongs here and gets unit
    tests in `test/core/`, in the folder that matches its own.
  - `src/core/` is split by tab: `data/`, `structure/` and `actions/` hold what
    only that tab uses; `shared/` holds what more than one tab, the shell or a
    report reads (the payload and definition models, the call model, masking,
    diffing, the JSON tree). A tab's folder imports itself and `shared/`, never
    another tab's folder, and `shared/` imports only itself; ESLint enforces
    this. When a second tab needs a module, move it to `shared/`.
  - `src/ui/` holds DOM rendering and `chrome.devtools` wiring. It may import
    from `src/core/`. `src/core/` never imports from `src/ui/`.
- **One entry module per tab** (`data-tab.js`, `structure-tab.js`,
  `actions-tab.js`). Each owns its own `state`, polling and event wiring. The
  pieces it draws and its settings sync live next to it in `src/ui/data/`,
  `src/ui/structure/` and `src/ui/actions/`; the help text is in
  `src/ui/help/`, one module per tab. Shared widgets (JSON tree, top bar
  `targets.js`, toast, context menu, clipboard) stay at the top level of
  `src/ui/`. A redraw that should do nothing when nothing changed uses
  `memoDraw` (`src/ui/memo-draw.js`). OmniScript Replay keeps
  copies of the top bar, JSON tree and settings: port a fix to them there
  too.
- Tabs talk to each other through `nav.js` (jumps) and `shared.js` (shared
  definition), not by importing each other's internals.
- **Feature gates.** Some controls, help entries and menu items are drawn
  only when `Features.has(gate)` is true (`src/ui/features.js`; the gates are
  listed in `src/core/shared/features.js`). Nothing in this repository
  registers a gate, so every one stays closed: write a tab's code so that it
  works, and reads well, with all of them closed.
- **Browsers.** The same code runs in Chromium (Chrome, Edge, Brave, Opera:
  one package) and Firefox. Nothing but `src/ui/page.js` reaches the
  inspected page: it is the kit's DevTools page facade, and `Page.can` says
  what the browser supports (Firefox runs expressions in the top document
  only: no frames, no `getResources`, so the Frame picker is hidden). Only the
  manifest differs per browser, written by `scripts/lib/browsers.mjs`
  (`npm run package -- free firefox`): Firefox drops
  `minimum_chrome_version` and gains `browser_specific_settings` (its add-on
  ids, which never change once listed, minimum version 140 and
  `data_collection_permissions: none`). CI builds the Firefox package and runs Mozilla's
  `web-ext lint` on it. A new `chrome.*` call goes into the kit's
  facade first, with what Firefox does instead.
- `src/kit/` is a synced copy of the modules the OmniStudio extensions of
  this line share (host mapping, designer routes, masking, the JSON tree and
  the DevTools page facade), with the same two layers (`kit/core/` pure,
  `kit/ui/` for the DOM). Never edit it here: a change to a shared module is
  made where the shared modules are kept and synced in, so propose it in an
  issue. `npm run kit:check` (and CI) fails when the copy differs from its
  `kit.json`. Panel modules may re-export a kit module from where they used
  to define it, as `src/core/shared/mask.js` does.
- `hostScan` / `hostFetch` / `frameScan` in `src/ui/targets.js` are
  stringified and run inside the inspected page. They must stay
  self-contained: no imports, and no closures over outer variables.
  `hostFetch` must enumerate hosts exactly like `hostScan`, because every tab
  addresses the top bar's script by its index in that list.
- The extension declares only the **`storage`** permission. `src/ui/stored.js`
  is the only module that touches `chrome.storage`, and what goes there is
  the tab order, the flags that the panel tour and each tab's tour were seen,
  the **Mask values at start** flag (on its own entry, with Remember my
  settings on or off; unticking it deletes it) and, while **Remember my
  settings** is on (the default; turning it off deletes them and stores only
  that choice), the settings (including the designer choice and its
  namespace) and the views last chosen; everything else stays in memory.
  Don't add permissions or hosts, and don't send data anywhere. Never change
  the OmniScript or its data. If what the extension reads, writes to the
  page, stores or sends changes, update the privacy section of README.md and
  the privacy policy.

## Working rules

- Run `npm run lint` and `npm test` after the **last** edit, right before
  committing. Help text and other strings are code too: an unescaped quote
  in the help once stopped the whole panel from loading.
- Never put a user's real data (names, ids, URLs, element names of their
  scripts) in code, tests, fixtures or commit messages: use invented, generic
  names.

## Definition of done

A feature or fix is mergeable only with all of these: the decision in a
`src/core/` function with unit tests; a UI test through the real
`panel.html`; a `title` tooltip on every control it adds; a help entry;
a screenshot scene in `scripts/screenshots.mjs` when it is visible; a line
in CHANGELOG.md under the next version, in the per-tab bullet style; strings
that use the words of "Words the panel uses"; and a note of its privacy
impact, even when that is "none".

## Real fixtures

`test/fixtures/bundles/` holds two files of a script's definition, data and
calls: one built from the demo script and one written by hand. Every rule
that judges a script (what may stop Next, visibility verdicts, chain
grouping, repeats) runs over all of them in
`test/core/fixtures.test.js`: no exception, and the expected counts. A demo
script proves the code runs; a fixture proves it is right. A new fixture that
breaks a count is a finding, not a test to loosen. Fixtures hold invented
names only.

## Issues

`.github/ISSUE_TEMPLATE/` asks for the extension version, the package
flavour (core OmniStudio or a managed package), the Copy report text, the
steps that show the problem and, when it helps, a copy of the data or a call
taken with Mask values on. Nothing else is needed to reproduce most reports.

## Contributions

The extension is licensed under the GPL-3.0. A pull request from someone
other than the owner is accepted with this line in its description: "I grant
Mikołaj Skrzypczyński the right to use this contribution under the GPL-3.0
and under any other licence." Without it the change can still be suggested
in an issue.

## Code style

- Small, named functions. Follow the existing style of short block comments
  that explain *why*, not *what*.
- A poll that changes nothing must not rebuild the DOM, because a rebuild drops
  selection, focus and scroll. Compare a signature first and redraw only on a
  change; follow the pattern in `data-tab.js`.
- Polling stops when the panel or tab is hidden. User toggles (Auto-refresh,
  Follow current step, filters) have to be respected on every code path that re-reads
  data, including background rescans.
- Keep the help text in `src/ui/help/` and the `title` tooltips in
  `panel.html` in sync with behaviour and defaults.
- Accessibility: interactive things are buttons, or have `role`, `tabindex` and
  keyboard handlers. Toggles expose `aria-expanded` / `aria-pressed`.

## Usability principles

- Tabs can be put in any order (drag, or Alt+Shift+arrows); code never
  assumes their position. The 1–3 keys follow the order shown.

- Defaults should suit someone debugging a running script: live data, follow
  the current step, and show errors prominently.
- **Easy to step into, not cluttered.** Each tab shows one
  list or tree, one filter box and a handful of buttons; that first screen is
  the product. Anything for a deeper dive (timing breakdowns, extra columns,
  exports) goes into a toolbar menu (View, Export), into a detail-pane tab, into the
  existing filter box as a prefix, or into the row menu, never as another
  always-visible button, checkbox or banner. Counts and chips appear only
  while they are non-zero. Detail heads are one compact meta line, not a
  stack of lines. Before adding a control, try removing one.
- Anything the user can open (a node, an error, a detail panel), they can also
  close, and that state survives polling redraws.
- Searching narrows the view. It doesn't take control away: expanding,
  collapsing and copying still work while a filter is active.
- Line numbers in tree views match the line numbers of the same JSON in the
  Raw view.
- Mask values applies to everything that leaves the panel (copy, save,
  export).

## Words the panel uses

One word for one thing, in every label, title, toast, help entry, guide and
store text. A new string uses these words; a new term is added here first.
Each line gives the term, what it means in the panel, and the OmniStudio
term it maps to.

Style: sentence case, except OmniStudio product terms, which keep the
Designer's capitals (Data Mapper, Integration Procedure, Set Values, Remote
Action, Conditional View, OmniScript, Type/SubType/Language). Titles are
imperative and end without a full stop, with the shortcut as a "(key)" suffix.
An ellipsis is only for a control that asks for more input. Help says "the
panel", never "the tool" or "this panel". Copy titles read "Copy <what>.
Honours Mask values."; toasts read "Copied <what>".

- **Data** (tab): the selected script's live data. Maps to the Data JSON of the Designer's Preview.
- **Data JSON**: the JSON the running OmniScript holds (jsonDataStr). Maps to Data JSON.
- **Structure** (tab): every element of the script, from its definition, joined to the data. Maps to the Designer's element tree.
- **Calls** (tab): the Data Mapper, Integration Procedure and Apex calls the page makes. OmniStudio has no single word for them.
- **call**: one invocation of a Data Mapper, Integration Procedure, Remote Action or Apex method; one row in Calls. The Calls list column is headed Call. Not "hop" and not "action".
- **request**: the HTTP request a call travelled in; it may carry several calls.
- **Remote Action**: the element type that runs an Apex class (Remote Class, Remote Method), and the RA call type. Capitalised.
- **action**: an element of the Designer's Actions group (Set Values, Navigate, HTTP, Data Mapper, Integration Procedure, Remote Action). Maps to Action.
- **Data Mapper**: the OmniStudio data tool, formerly DataRaptor; "(DataRaptor)" is written once per surface. Maps to Data Mapper / DataRaptor.
- **Integration Procedure** (procedure, IP in tags): the OmniStudio server process, named by its Type_SubType key.
- **element**: any element of a script or procedure. **step**: an OmniScript Step only.
- **Block, Repeat Block, Edit Block, row**: the Designer's group types; a row is one repeat of a repeatable element.
- **show rule**: an element's condition for being shown. Maps to Conditional View in the Designer.
- **Conditional View**: the Properties label of the `show` setting, and only that.
- **Visibility** (tab): why the element is shown or hidden now. **Hidden** and **Shown** are the verdict.
- **Validation** (tab): a Messaging or Set Errors element's own rule and messages. Maps to Messaging, Validate Expression, Set Errors.
- **Marks** (column): the cell before Valid in the Structure list, right-aligned, holding a row's small marks (required, hidden, show rule, calls, custom component, missing label, type hint); its header opens the legend. There is no Value column: values are in the Current value tab.
- **Valid** (column): the last column of the Structure list, one glyph per row: ✓ passes its rules now, ✕ would stop Next now, – the panel cannot tell, blank when there is nothing to judge. The same glyphs as the Result of the Calls list.
- **Set Errors, Messaging**: element types that set an error or show a message. **firing**: its condition is true now.
- **Set Values**: the element type that writes values, and its card and tab. Capitalised. Maps to Set Values / Element Value Map.
- **Target, Expression, Computed value, Current value**: the columns of the Set Values card. **Computed value** is what an expression, formula or %merge% field works out to now (also on the Formula and Additional input cards); **Current value** is what the target holds.
- **Selected**: the column of the Options card that ticks the option the data holds.
- **card**: one fact of the Structure detail pane in the one frame they share (Current value, Formula, Set Values, Options, Merge fields, Additional input, Visibility, Validation): a header with the card's name, its verdict as a tag (Fails, Passes, Hidden, Shown, Can't tell), other tags and Copy, then labelled rows or a table. What a card is goes in its header's tooltip and the help, never in the card.
- **differs**: the amber tag after a Current value that is not the Computed value.
- **estimated ≈**: the outlined tag after a value that a formula the panel evaluates itself comes to; ≈ alone on a condition's mark.
- **read from the data**: the grey tag after a Computed value the panel took from the data because it cannot evaluate the formula.
- **As written**: the row of a Visibility or Validation card with the rule exactly as the Designer defines it, on one line. **Elements it reads**: the Formula card's sub-heading over the elements its expression reads.
- **Field, Must be, Is now**: the columns of a rule table.
- **Current value** (tab): the element's value in the Data JSON. **Properties** (tab): the element's settings with the panel's labels. **JSON** (tab): the element as JSON, with the link Show JSON. Maps to Edit Properties as JSON.
- **definition**: the whole script's definition (jsonDef): Definition property, Definition JSON. Never one element's JSON.
- **Input, Options, Output**: a call's three parts. **Response**: an Integration Procedure's response node in a Preview.
- **chain, chainable**: one chainable procedure that ran as several calls; the option tags. Maps to chainable, queueableChainable.
- **repeat**: a call with the same procedure and input as one within 5 s. In OmniScript, Repeat stays the element property and the block type.
- **Succeeded, Failed, Skipped**: the outcome of a call or an element, wherever a status is shown as a word. The glyphs are a tick, a cross and a dash.
- **Failed only**: the Calls filter for failed calls. **Clear list**: remove every captured call.
- **Recording**, **Paused**: whether calls are captured.
- **Mask values**, **masked**, **placeholder**: replace strings and numbers in everything that leaves the panel. **Mask values at start**: the setting that turns it on whenever DevTools opens.
- **session**: the Salesforce session of the page only; never DevTools being open (say "while DevTools is open").
- **OmniScript path**: the colon path `Step:Rows|2:Field`, positions counting from 1. **%merge% field**: a `%Step:Field%` reference.
- **custom label**: a Salesforce custom label a multi-language script uses. **overridden by**: a standard element drawn by a custom LWC (LWC Component Override).
- **formula, estimated (≈), can't tell (?)**: a formula the panel evaluates itself, the mark of an estimate, and a rule it cannot judge.
- **Embedded scripts**: OmniScripts placed inside another one, and the components that carry a script's data; the rows read embedded and component.
- **top bar**: the bar with the OmniScript picker, Mask values, Settings and the ? button.
- **Follow current step**, **Current step**: keep the step the script is on selected; jump to it.
- **Show in Data**, **Show in Structure**, **Show in tree**: jump to the same thing in another place. Calls is reached from the call lines of Structure ("Open this call in Calls").
- **Summary**: the script overview when nothing is selected. **Type/SubType/Language**: a script's identity, written without spaces.
- **Open in Designer**: open the script in its designer (the OmniStudio Builder for core, the OmniScript Designer for a managed package).
- **Started, Took**: the clock time a request left, and its round trip.
- **tip**: one card of a tour, counted "2 of 4", with Previous tip and Next tip.
- **Tree cut at N rows**: the Data tree drawn only up to its row limit.

## Keep the website and privacy policy aligned

After every update that users can see, also update the product site in the
`mskrzypczynski/mskrzypczynski.github.io` repository, on the same branch name:

- `omniscript-data-inspector/index.html`: the feature descriptions, defaults
  and shortcuts must match the current panel. Bump the version shown there
  when releasing.
- `omniscript-data-inspector/privacy.html`: must still describe exactly what
  the extension reads, writes to the page, stores (see the storage rule above) and
  sends (nothing). Update its "last updated" date whenever its content
  changes.
- The privacy section of README.md must say the same as privacy.html.
- `reference.html` and `guides/` in the same website folder are generated,
  never edited by hand. After every change to the help text (`src/ui/help/`)
  or to the guides, run `npm run docs -- <website>/omniscript-data-inspector`
  and commit the output to the website repository on the same branch name.
  The guides are written in `docs/guides/*.md` and link help entries as
  `reference:<anchor>`; the build stops when an entry they name is renamed or
  removed, so fix the guide then.
- `store/description.txt` is the Chrome Web Store description: keep its
  features, labels and privacy claims true. After a UI change, regenerate the
  store screenshots with `npm run screenshots` and check them.

## Checks before every commit

```sh
npm test       # Jest: core (node), ui (jsdom), scripts, wiring (boot test)
npm run lint   # ESLint, including the core purity and layering rules
```

Both must pass, and CI runs the same checks plus `npm run package`. A bug fix
comes with a test that fails without the fix. UI tests use
`test/ui/support/panel-fixture.js` and live in the folder of their tab
(`test/ui/data/`, `structure/`, `actions/`, `shell/`).

CI also runs, each as its own step or job:

```sh
npm run release:check  # versions agree; every top-bar and toolbar control has a help entry;
                       # store/description.txt names no removed feature
npm run test:perf      # budgets: a 3 MB payload and a 500-call list (generous, 10 s)
npm run screenshots    # then compared with store/screenshots (scripts/compare-screenshots.mjs)
npm run a11y           # axe-core over every tab, light and dark
```

**A change to what the panel looks like regenerates the store screenshots in
the same PR** (`npm run screenshots`, then look at the five images): CI renders
them again and fails on a difference. When CI's rendering is the one to keep,
download its `screenshots` artifact and commit that. `scripts/a11y-allow.json`
lists the axe findings that are known, each with a reason; fix one and delete
its entry. `scripts/release-check.allow.json` does the same for controls that
have no help entry yet.

## Releasing

1. `npm run bump -- patch|minor|major` (keeps `manifest.json`, `package.json`
   and the lockfile in step), commit, merge to `main`, then tag the merge
   commit: `git tag vX.Y.Z`, `git push --follow-tags`.
2. The Release workflow (`.github/workflows/release.yml`) checks the tag
   against the manifest, lints, tests, and attaches to a GitHub Release (also
   kept as a workflow artifact):
   - `omniscript-data-inspector-X.Y.Z.zip`: the extension as uploaded to the
     store (`npm run package`: only the shipped files plus `LICENSE`);
   - `...-screenshots.zip` and the five PNGs (`npm run screenshots`, rendered
     in CI with Playwright installed for that job only);
   - `...-marketing.zip` and its seven PNGs (`npm run marketing`, built from
     the screenshots: five 1280x800 annotated screenshots, the 440x280 small
     promo tile and the 1400x560 marquee tile);
   - `...-store-description.txt` (a copy of `store/description.txt`);
   - `...-SHA256SUMS.txt`.
   Running the workflow by hand on a tag rebuilds that tag's assets.
3. With the secrets `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`
   and `CWS_REFRESH_TOKEN` set, it also uploads the zip to the Chrome Web Store
   as a draft; submit it in the dashboard, or run the workflow manually with
   *publish* ticked.
4. In the store dashboard, paste the description, replace the screenshots
   with the marketing screenshots, and upload the small and marquee promo tiles
   from the release assets. Privacy practices only change if what the
   extension reads, stores or sends changed.
5. Before submitting, check the website and privacy policy match (see above),
   and merge the website branch so they go live with the release.
6. PRs are merged with **Squash and merge** (the branch may contain merge
   commits, which GitHub cannot rebase). Write the squash message by hand:
   a short title and the per-tab bullets, no list of intermediate commits.
