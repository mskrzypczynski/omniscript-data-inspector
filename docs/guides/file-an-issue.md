---
title: Report a problem
summary: Turn Mask values on, copy the panel's short report, add what you did and what you saw, and fill in the issue form.
order: 9
---

Something in the panel is wrong, missing or confusing. A good write-up lets the developer reproduce it without a round of questions. It needs the version, the package flavour, a short text the panel writes for you, and the steps that show the problem.

## Before you start

1. Turn on [[Mask values]] in the top bar. While it is on, everything that leaves the panel has its strings and numbers replaced with placeholders. Keys, structure, element names and step names stay. It is off when DevTools opens unless Mask values at start is ticked in Settings, so check it every time. See [Mask values](reference:everywhere-mask-values).
2. Get the panel into the state where the problem shows: the right tab, the right step, the call selected.

## Copy the report

1. Open Settings: the gear in the top bar, or press `,`. The **Tools** row has [[Copy report]].
2. Press [[Copy report]]. It puts a few lines of Markdown on the clipboard: the script (as Type/SubType/Language), the extension version, the step it is on, the size of the data and the last five failed calls with their reasons and times. A line whose fact is not known is left out, and names and counts are kept when masking. Nothing is sent anywhere. See [Copy report](reference:everywhere-copy-report).

## Add what shows the problem

1. Write down the tab you were on, the steps you took, what you expected and what you saw instead.
2. A screenshot of the panel helps. Check that it shows no real data: with Mask values on, copies are masked, but the screen still shows the data itself.
3. If the problem is in the data or in a call, a masked copy says more than a screenshot. In Data, **Export** → **Copy JSON**; in Calls, right-click the call and choose [[Copy input]], or press **Export**. With Mask values on, strings and numbers become placeholders. See [Export data](reference:data-export-data) and [Export calls](reference:actions-export-calls).

Look at what you copied before you share it. Element names, keys and step names are kept, and they can say something about your org.

## Fill in the issue form

1. Open the [bug report form](https://github.com/mskrzypczynski/omniscript-data-inspector/issues/new?template=bug.yml) on GitHub.
2. **Extension version**: at the bottom right of the panel, or on the browser's extensions page.
3. **Package flavour**: core OmniStudio, a managed package (vlocity_cmt, vlocity_ins or vlocity_ps), or not sure.
4. **What you did and what happened**: the tab, the steps, what you expected and what you saw. A screenshot helps.
5. [[Copy report]]: paste the text from the clipboard.
6. **Masked data or calls** (optional): paste what you copied with Mask values on.
7. Tick the box that confirms Mask values was on and nothing shows real data.

Please do not paste real org data anywhere. If the problem is in a particular call or a hidden field, the guides [Why did this call fail, and what did it send?](guide:why-did-this-call-fail) and [Why is this field hidden?](guide:why-is-this-field-hidden) show what to look at first.
