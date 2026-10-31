---
title: Get started in five minutes
summary: Open the panel, pick the script, turn Mask values on, learn what the three tabs are for and where the help is.
order: 1
---

You have an OmniScript running in a Salesforce page, or open in a Designer preview, and you want to see what it holds and what it calls. This takes about five minutes.

## Open the panel

1. Open DevTools on the page: `F12`, `Ctrl+Shift+I` on Windows and Linux, or `Option+Cmd+I` on a Mac. The panel works in Chrome, Edge and other Chromium browsers, and in Firefox.
2. Pick the **{=} OmniScript** tab, next to Elements and Console (next to Inspector and Console in Firefox). If you cannot see it, it may be behind the » overflow at the end of the tab row.
3. If the page was already loading, reload it with DevTools open. The panel only reads the page while DevTools is open, so calls made during page load are missed otherwise.
4. In the top bar, pick your script from the list. If the panel says "No OmniScript found on this page", open a page that runs an OmniScript (or a Designer preview), let it load, and press [[Rescan]]. See [Top bar](reference:everywhere-top-bar) and [Rescan](reference:everywhere-rescan).

## Turn on Mask values

Before you copy, save or export anything from a real org, tick [[Mask values]] in the top bar. Strings and numbers become placeholders in everything that leaves the panel; keys and structure stay. It is off every time DevTools opens, unless **Mask values at start** is ticked in Settings. See [Mask values](reference:everywhere-mask-values) and [Mask values at start](reference:everywhere-mask-values-at-start).

## Learn the three tabs

1. **Data** shows what the script holds right now, as a tree, a form or raw text, updating while you click through it. A value that changes flashes amber. Type in the filter box to find a key or a value. See [Data, Start here](reference:data-start).
2. **Structure** lists every element of the script, joined to the live data. Click an element to read its value, properties, show rule, validation and calls. [[Follow current step]] keeps the step the script is on selected. See [Structure, Start here](reference:structure-start).
3. **Calls** lists the Data Mapper, Integration Procedure and Remote Action calls the page makes, with their input, options and output. A failed call is red and opens on its reason. See [Calls, Start here](reference:actions-start).

Drag a tab to put the tabs in another order. See [Tab order](reference:everywhere-tab-order).

## Find the help

1. Click [[?]] in the top bar, or press `h`, for the help. Every control has an entry, and the filter box at the top narrows them by words.
2. Right-click a button or switch, or press `h` while it has focus, to open the entry for that control. See [Help for a control](reference:everywhere-help-for-a-control).
3. The gear opens Settings: text size, Remember my settings, the refresh rate and Copy report. See [Settings](reference:everywhere-settings).

## A first question to try

Pick a field on your page and ask one of these:

- [Why is this field hidden?](guide:why-is-this-field-hidden)
- [Why can't I press Next?](guide:why-cant-i-press-next)
- [Why did this call fail, and what did it send?](guide:why-did-this-call-fail)

A short tour of each tab appears the first time you open it. Turn the tours off from any card, or see them again from the end of Start here. See [Tour](reference:everywhere-tour).
