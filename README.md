# OmniScript Data Inspector

Unofficial developer tool. A DevTools panel for inspecting Salesforce
OmniStudio **OmniScripts** while you build and debug them, in Chrome, Edge and
other Chromium browsers, and in Firefox:

- **Data** — the JSON the selected OmniScript is holding right now, re-read on a
  timer, as a collapsible tree, a form, or Raw text. A value that changes
  flashes amber, and a collapsed branch that holds a change is marked. The
  filter takes text, OmniScript paths (`Step:Rows|2:Field`) and key=value;
  right-click a row to copy its value, path or %merge% field, or to open the
  record behind an Id. Copy JSON and Save file keep the page's exact text.
- **Structure** — every element read from the definition and joined to the live
  data: type icons, show rules, validation, Set Errors, Set Values, and
  (for multi-language scripts) resolved custom labels with missing-label
  warnings. An element's facts are cards: its current value first (as a form,
  a tree or raw text), then its formula, Set Values, options, show rule or
  validation, each condition with its live value and in plain words. A
  Properties tab explains an element's settings, the Valid column and the
  current step's Validation tab show what may stop Next, a summary describes
  the script, and Designer edits are picked up by themselves.
- **Calls** — the Data Mapper (DataRaptor), Integration Procedure and Remote
  Action calls the page makes, decoded, with input, output and options per
  call, chained calls grouped and repeats tagged. Errors returned inside a
  successful response are flagged, the filter searches inside a call's input,
  options and output, and Show raw shows a request exactly as the page sent
  it.

The tabs link to each other (Show in Data / Show in Structure, a Calls tab per
element), explain why an element is hidden, and can mask values before
anything is copied or exported. Click `?` in the panel, or press `h`, for
everything it does and the keyboard shortcuts.

**Documentation:** the searchable
[reference](https://mskrzypczynski.github.io/omniscript-data-inspector/reference.html)
(every entry of the panel's help) and the task
[guides](https://mskrzypczynski.github.io/omniscript-data-inspector/guides/):
getting started, why a field is hidden, why Next will not advance, why a call
failed, what changed in a step, where a value came from, what the panel keeps
on your computer, and how to report a problem.

## Install

From the [Chrome Web Store](https://chromewebstore.google.com/), or load
unpacked: `chrome://extensions` → **Developer mode** → **Load unpacked** → pick
this folder. For Firefox, `npm run package -- free firefox` writes the Firefox
build to `dist/free-firefox/`; load its `manifest.json` from
`about:debugging` → **This Firefox** → **Load Temporary Add-on**. Then open a
page running an OmniScript, open DevTools (`F12`) and select the
**{=} OmniScript** tab.

## Privacy

The extension declares only the **storage** permission and **no host access**,
and it sends nothing anywhere: no analytics, no telemetry, no calls of its own.
It reads the inspected page only while DevTools is open, through the browser's
DevTools API.

- Data JSON reads, captured calls and filter text live in memory only and are
  gone when DevTools closes. Exported files (Export in Data: Copy JSON and
  Save file; Export in Calls) and what you copy may contain org data; with
  **Mask values** on, strings and numbers in them are replaced by placeholders.
- The tab order is kept in the browser's extension storage on this computer
  once you change it (until you restore the default order).
- **Remember my settings** (in Settings, on by default) keeps the panel's
  settings (its switches, the views you last chose, text size and refresh
  rate; preferences only) in the browser's extension storage on this computer
  and puts them back when DevTools opens; unticking it turns this off and
  deletes them. The filters that hide rows (Failed only, Visible only) and the
  property names (Data property, Definition property) start fresh in every
  session. Data values, filter text, captured calls and the Mask values switch
  are never kept.
- **Mask values at start** (in Settings, off by default) is one yes-or-no flag
  that is kept in the same storage whether or not Remember my settings is on,
  and turns the Mask values switch on when DevTools opens; unticking it
  deletes it. The switch itself is never stored.
- Four flags saying which tours were seen (the panel's and one per tab) are
  kept in the same storage once you close them. Nothing else is stored.
- In the page it sets `window.__omniHosts` and `window.__omniPeekCache` while
  reading, draws a temporary outline for **Highlight on page**, and sets
  `window.$omni` on **Inspect element**. It never changes the OmniScript or its
  data.
- **Open in Designer** reads the host elements' tag names, classes and their
  `data-omni-id` / `omniscript-id` attributes, the page's origin and path (to
  tell a managed package from core OmniStudio), to build a link to the
  OmniStudio Builder or OmniScript Designer; the choice can be forced in
  Settings. **Open record** in the Data tab uses the same origin to build a
  link to a record whose Id is in the data. Either link opens in a new tab
  only when you click it. Nothing is sent.
- **Copy report** (in Settings, under Tools) and every Copy button put text on
  your clipboard only; the panel never reads the clipboard.
- In the help, **More on the website** and **Full guide** open a page of the
  product website (the reference and the task guides) in a new tab only if you
  click them; the panel passes nothing to the site beyond the page's address.
- The toolbar popup, the help and the panel's status bar offer a
  Buy me a coffee link to [buycoffee.to](https://buycoffee.to/mskrz), which opens
  in a new tab only if you click it. That site is run by someone else and has
  its own privacy policy; the extension passes nothing to it.

Full details: [privacy policy](https://mskrzypczynski.github.io/omniscript-data-inspector/privacy.html).

## Development

```sh
npm install
npm test        # unit, UI and wiring tests
npm run lint
npm run release:check   # versions agree, controls have help, the store text is current
npm run test:perf       # budgets for a 3 MB data JSON and a 500-call list
npm run a11y            # axe-core over every tab (needs Playwright, as npm run screenshots does)
npm run docs -- <dir>   # reference.html, reference.md and the guides (docs/guides/*.md), from the panel's help
npm run package         # the extension zip, for Chromium; -- free firefox for Firefox
```

`npm run docs` writes the documentation pages of the product website
(`omniscript-data-inspector/` in the website repository); it changes nothing
in the extension.

Architecture, conventions and the release process are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Not affiliated with Salesforce

This is an independent, unofficial tool. It is not affiliated with, endorsed by,
or sponsored by Salesforce, Inc. "Salesforce", "OmniStudio" and "OmniScript" are
trademarks of Salesforce, Inc., used here only to describe what the extension works
with.

## Licence

Copyright (c) 2026 Mikołaj Skrzypczyński.

The extension is licensed under the
[GNU General Public License v3.0](LICENSE) (GPL-3.0-only): you may use it
freely, and if you redistribute it, modified or not, you must keep this
copyright notice and make your full source available under the same licence.
