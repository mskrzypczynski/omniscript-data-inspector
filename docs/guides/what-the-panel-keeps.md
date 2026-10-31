---
title: What the panel keeps on this computer
summary: See what is stored in the browser, what stays in memory, and how to clear each part.
order: 8
---

The panel sends nothing anywhere. It keeps your preferences, never your data. The data itself lives in memory and goes when DevTools closes. This guide lists what is stored in your browser, so you can decide what to keep and how to remove it.

## What is always kept

1. **The tab order.** If you drag the tabs into another order, the order is kept in the browser's extension storage. To clear it, press [[Reset]] next to Tab order in Settings (the gear, or press `,`), or [[Restore default settings]]. See [Tab order](reference:everywhere-tab-order).
2. **The tour flags.** Four yes-or-no flags record which tours you have seen: the panel tour and one for each tab. To see the tours again, use [[Show the tour again]] at the end of Start here in the help, or **Show tours again** in Settings, which clear them. **Don't show tours** on any card stops them all. See [Tour](reference:everywhere-tour).
3. **Mask values at start.** One flag, kept only while it is ticked. Untick it in Settings, under General, and it is deleted. The Mask values switch itself is never stored. See [Mask values at start](reference:everywhere-mask-values-at-start).

## What is kept by default, and can be turned off

[[Remember my settings]], in Settings under General, is on by default. While it is on, your settings are kept in the browser's extension storage on this computer and put back the next time DevTools opens: Text size, Refresh rate, Follow current step, Highlight on hover, Time format, Clear on reload, Open in Designer and its namespace, Show the Frame row and Embedded scripts, and the views you last chose (the Data view, Structure's Current value view, the detail tab you picked by hand and Show internal, and the Calls detail tab). These are preferences only. See [Remember my settings](reference:everywhere-remember-my-settings).

To clear all of it, untick [[Remember my settings]]. That deletes what was kept, and nothing is stored from then on.

## What is never kept

The data, the filter text, the captured calls, [[Mask values]] and Auto-refresh are never stored. They live in memory and are gone when DevTools closes, or when you pick another script.

Some settings start fresh in every DevTools session even with Remember my settings on: [[Failed only]], [[Visible only]] and the two property names, **Data property** and **Definition property**. A filter that hides rows, or a property name from yesterday's page, would make a list look short or empty with nothing on screen to say why.

Files you save yourself, with Export in Data or Calls, are ordinary files on your computer. The panel does not keep them, and they may contain org data unless Mask values was on.

## Put everything back

1. Open Settings. The list of settings that differ shows what is not at its default, with [[Reset]] for each.
2. Press [[Restore default settings]] to put them all back at once. It asks first. This also turns off Mask values at start and resets the tab order. Remember my settings stays as you set it.
3. To remove the stored settings and views, untick [[Remember my settings]]. [[Show the tour again]] clears the tour flags, but the tour writes one again when it ends.

Removing the extension from the browser deletes its storage too. See [Settings](reference:everywhere-settings).
