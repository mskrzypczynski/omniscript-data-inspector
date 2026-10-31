---
title: Where did this value come from?
summary: Go from a value in the data to the element that owns it, the Set Values that computes it and the calls that sent or returned it.
order: 7
---

A field holds a value you did not type, or a value is not what you expect. Somewhere a call, a Set Values element or a user action put it there. The panel links the data, the script's elements and the calls, so you can follow the value back.

## Find the value

1. Open the **Data** tab and find the key: type part of its name or value in the filter box, or an OmniScript path such as `Step:Rows|2:Field`. See [Filter](reference:data-filter).
2. Keep the tab open while you use the page. A value that changes flashes amber, and a collapsed branch that holds a change is marked with a dot. See [Amber highlight](reference:data-amber-highlight).
3. To freeze the data while you read it, untick **Auto-refresh**; **Refresh** then reads once. See [Auto-refresh](reference:data-auto-refresh).

## Go to the element that owns the key

1. Hover the row and press its Structure icon, or right-click and choose [[Show in Structure]]. The Structure tab opens with the element that owns that key selected, or its nearest parent. See [Show in Structure button](reference:data-show-in-structure-button).
2. On the **Current value** tab you see what the element holds now. **Show in Data** goes back to the row.
3. If a Set Values element writes the key, select it: its **Set Values** tab lists each assignment with the Target, the Expression as written, the Computed value it gives now and the Current value the target holds. An amber differs tag marks a mismatch. See [Set Values](reference:structure-set-values).

## Find the call behind it

1. Open the **Calls** tab and type `in:` and the value, or part of it, in the filter box. Only the calls whose input, options or output contain it stay, with the matching lines shown. See [Filter box](reference:actions-filter-box).
2. Select a call and read its **Output** tab: a response node that holds the value tells you which call returned it.
3. If an element of the script makes the call, press [[Show in Structure]] in the detail pane. The element's **Calls** tab then says what it sends and where the answer lands in the data. See [Show in Structure](reference:actions-show-in-structure).

## When the answer is "not in data"

If the element's value reads not in data, the element that should have written it has not run, or wrote another key. Check the element's **Calls** tab for **Response node**: when none is set, the answer lands at the top level of the data. To find out why a call failed, see [Why did this call fail, and what did it send?](guide:why-did-this-call-fail).

Turn [[Mask values]] on before you copy any of this into a ticket. See [Mask values](reference:everywhere-mask-values).
