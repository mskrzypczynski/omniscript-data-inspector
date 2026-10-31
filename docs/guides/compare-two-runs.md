---
title: What changed in this step?
summary: Watch the data change as you use the page, see what each call sent and returned during a step, and check what a Set Values computes.
order: 6
---

You press Next, and something in the data is not what it was. The panel shows the data, the calls and the script's own rules side by side with the page, so you can see what a step changed while it happens.

## Watch the data change

1. Open the **Data** tab and pick your script in the top bar. **Auto-refresh** is on, so the tree is read again on a timer while you use the page.
2. Open the branches you care about. The tree keeps them open across updates.
3. Use the page, for example fill in a field or press Next. A value that changed since the previous read flashes amber for a few seconds, and a collapsed branch that holds a change is marked with a dot, so you know where to open. See [Amber highlight](reference:data-amber-highlight).
4. To read the data at your own pace, untick **Auto-refresh**: nothing is read again until you press **Refresh**. See [Auto-refresh](reference:data-auto-refresh).

## Keep a copy of before and after

1. Before the step, turn on [[Mask values]] if the data is real, then press **Export** → **Save file…**. The file is the page's own text, in its own key order.
2. Do the step on the page.
3. Save the data again, and compare the two files with the diff tool you already use. See [Export data](reference:data-export-data).

The Raw view shows the same text with line numbers that match the tree, which helps when you read a diff.

## See the calls of the step

1. Open the **Calls** tab and press **Clear list** just before the step, so only its calls are listed. See [Clear list](reference:actions-clear-list).
2. Do the step on the page. Each Data Mapper, Integration Procedure and Remote Action call appears as it is made, with its time.
3. Click a call: **Input** shows what it sent, **Output** what came back. A "repeat ×2" tag marks a call sent twice with the same input. See [Repeated calls](reference:actions-repeated-calls).
4. While Structure follows the script, each call knows its step, and `step:` in the filter box keeps the calls made on one step. See [Step](reference:actions-step).

## Check what the script computes

1. Open the **Structure** tab. [[Follow current step]] keeps the step the script is on selected.
2. Select a Set Values element of the step. Its **Set Values** tab lists each assignment: the Expression as written, the Computed value it gives now and the Current value the target holds. An amber differs tag marks a target that holds something else. See [Set Values](reference:structure-set-values).
3. Select a field and open **Current value** to see what it holds now, or press **Show in Data** to find it in the tree.

If a value came from a call that failed, read [Why did this call fail, and what did it send?](guide:why-did-this-call-fail). To follow one value back to where it was set, read [Where did this value come from?](guide:where-did-this-value-come-from).
