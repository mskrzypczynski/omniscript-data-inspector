---
title: Why did this call fail, and what did it send?
summary: Find a failed Data Mapper, Integration Procedure or Remote Action call, read the reason and see exactly what the script sent.
order: 4
---

A Data Mapper or Integration Procedure fails, and the script shows a vague message or nothing at all. The Calls tab lists the calls the page makes, decoded, so you can read the real reason and the exact input.

## Find the failed call

1. Open the **Calls** tab and use the page as you normally would. Calls appear as they are made. They are captured only while DevTools is open, so if the list is empty press **Reload page to capture from the start** and repeat the steps. See [Empty list](reference:actions-empty-list).
2. The number on the tab turns red as soon as any call failed, so you will see it from the other tabs too. See [Tab badge](reference:actions-tab-badge).
3. Find the red row. In a long list, tick [[Failed only]], or type the class, method, bundle or key in the filter box.
4. Click it. A failed call opens on its **Output** tab, where the reason is. Press [[Show more]] on the failure banner for the rest. See [Failed calls](reference:actions-failed-calls).

## Read the result carefully

The **Result** mark in the last column of the list is what the answer says, and the HTTP status is only the transport. A call can come back with HTTP 200 and still have failed: "HTTP 200 · Failed" means Apex returned an error inside a successful response. A grey – means nothing useful came back (aborted or offline). See [HTTP vs Result](reference:actions-http-vs-result).

## See what it sent

1. Open the **Input** tab. Right-click any row to copy a value, a key, the OmniScript path or the %merge% field. See [Trees in the call detail](reference:actions-trees-in-the-call-detail).
2. The **Options** tab holds the call's settings, such as `chainable`.
3. To see the request exactly as the page sent it, and the answer exactly as it came back, right-click the call and choose **Show raw**. Fields that look like credentials show as <hidden>.

## Look at the calls around it

1. A tag such as "repeat ×2" marks a call with the same input and options as one a few seconds before: a double-fired action or a re-render loop. Type `repeat:` in the filter box to keep only those.
2. A chainable Integration Procedure that ran as several calls is one row with a chain tag. Open it with its chevron to see each call.
3. Type `step:` and the step's name in the filter box to keep the calls made on that step, or `in:` and a word to search inside inputs and outputs. See [Filter box](reference:actions-filter-box).

## Take it outside the page

- [[Copy input]] (the { } button) copies the bare input as JSON, ready to paste into a test or another tool. See [Copy input](reference:actions-copy-input).
- **Export** writes the calls in view to a JSON file. It may contain org data, so turn [[Mask values]] on first. See [Export calls](reference:actions-export-calls).

## Which element made the call?

If an element makes this call, the detail pane has a [[Show in Structure]] button. There, the element's **Calls** tab shows what it sends and where the answer lands. See [Calls tab](reference:structure-calls-tab).

Turn [[Mask values]] on before you copy any of this into a ticket. See [Report a problem](guide:file-an-issue).
