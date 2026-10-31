'use strict';

/* The Structure tab's detail pane: the selected element's definition, live
 * value, show rule, validation and captured calls; or the list of
 * definition problems. */

import { decorateButton } from '../icons.js';
import { isTextBlock, resolveElementValue, maskDefinitionValues } from '../../core/shared/structure-model.js';
import { isContainer, addAllPaths } from '../../core/shared/json-tree-model.js';
import { callsForElement, failed, failureReason } from '../../core/shared/actions-model.js';
import { elementSegments } from '../../core/shared/path-links.js';
import { describeStep } from '../../core/structure/step-timeline.js';
import { callWiring } from '../../core/structure/call-wiring.js';
import { headNavButton } from '../../core/structure/step-nav.js';
import { treePathFor } from '../../core/shared/path-links.js';
import { validationRules } from '../../core/structure/step-validation.js';
import { detailTabs, usableTab, shortTabLabel, tabTitle, validationLabel } from '../../core/structure/detail-tabs.js';
import { repeatBlockOf, clampRow } from '../../core/structure/repeat-rows.js';
import { elementTables, optionsState, optionsFinding } from '../../core/structure/element-tables.js';
import { liveMessaging, describeActive, liveSetErrors } from '../../core/structure/live-validation.js';
import { currentValueFact } from '../../core/structure/fact-words.js';
import { ruleTree, evaluateShow, withOverrides, describeVerdict } from '../../core/structure/visibility.js';
import { parseWhatIf, fingerprint, staleWhatIf } from '../../core/structure/what-if.js';
import { formulaOf } from '../../core/structure/formula-values.js';
import { valueMismatch } from '../../core/structure/value-types.js';
import { isFormulaText } from '../../core/structure/formula.js';
import { overrideTitle } from '../../core/structure/overrides.js';
import { describeMessage } from '../../core/structure/message-text.js';
import { propertyRows, filterPropertyRows, takesFormula } from '../../core/structure/property-rows.js';
import { propertyTooltip } from '../../core/structure/property-docs.js';
import { scriptSummary } from '../../core/structure/script-summary.js';
import { sortProblems, countProblems, isNote } from '../../core/structure/lint.js';
import { renderJsonTree } from '../json-tree-view.js';
import { Targets } from '../targets.js';
import { Nav } from '../nav.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { Settings, DEFAULTS } from '../settings.js';
import { Features } from '../features.js';
import { viewToOpen, pickedTabToKeep } from '../../core/shared/remembered-views.js';
import { notice } from '../notice.js';
import { copyWithButton, copyWithToast } from '../clipboard.js';
import { openTreeMenu } from '../tree-menu.js';
import { debounce, flashText } from '../util.js';
import { renderRuleTree } from './rule-view.js';
import { createRuleCards } from './rule-cards.js';
import { factCard, factRows, factSingle } from './fact-card.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { createComparePane } from './compare-pane.js';
import { appendMessageText } from './message-view.js';
import { createTimelineView } from './timeline-view.js';
import { renderTableCard } from './table-card.js';
import { renderViewSwitch, renderForm, renderRaw, simpleValue } from './value-views.js';
import { hasFormView, viewOf, formRows, filterFormRows } from '../../core/structure/form-rows.js';

/* The tone of the head chip by verdict kind: red only for what blocks Next, grey for hidden (a fact). */
const CHIP_TONE = { bad: 'error', hidden: 'neutral', estimated: 'warn' };

const SEVERITY_GLYPH = { error: '✕', warning: '!', info: 'i', note: 'i' };

/* The help entry each card's Copy button belongs to. */
const TABLE_HELP = {
  'set-values': 'Set Values', options: 'Options tab', formula: 'Formula card', 'merge-fields': 'Merge fields card',
  'extra-input': 'Calls tab', 'remote-options': 'Calls tab'
};

const NOTES_LEDE = 'Names a rule or label uses that are not elements and not in the data right now; ' +
  'a Data Mapper, Integration Procedure or Set Values may fill them later.';

/* state: the tab's state. el: { detail }.
 * deps: selected() the selected element or null, explain(element), whyKey(element),
 * stoppersOf(step) what may stop that step from continuing (core/structure/step-validation.js stepStoppers),
 * filteredOut(element) the current filters keep it out of the list, jump(key) selects another element,
 * refs() the reference index of the definition, rows() the repeat rows being read ({ block: n }),
 * byKey() element key -> element, setRow(blockKey, n) steps a repeat block,
 * closeProblems() leaves the problems list, openProblems() shows it,
 * current() the step the script is on, or null,
 * estimator() the formula estimator for the data now (core/structure/formula-values.js),
 * language() the script's language code (en or en_US), '' when it has none (core/structure/message-text.js),
 * hintOf(element) what is off about the value for the element's type, or '',
 * navigationFor(element) step-nav.js's verdict for a step (null for none) and goBack(element) the request it makes,
 * findCompared(element), selectCompared(element) and closeCompare() for a loaded comparison,
 * status() repaints the status bar (the form's "N of M rows" is part of it). */
export function createDetailPane({
  state, el, selected, explain, whyKey, stoppersOf, filteredOut, jump, refs, rows, byKey, setRow, closeProblems, estimator, language = () => '', hintOf,
  findCompared, selectCompared, closeCompare, current = () => null, openProblems = () => {},
  navigationFor = () => null, goBack = () => {}, status = () => {}
}) {
  const comparePane = createComparePane({ state, find: findCompared, select: selectCompared, close: closeCompare });
  const timeline = createTimelineView({ state, jump });
  const elementOf = (key) => byKey()[key] || null;
  /* A message or text written as a formula, as what it comes to against the data now (core/structure/message-text.js). */
  const describeText = (text) => describeMessage(text, estimator(), { language: language() });
  /* The rule table of a show rule or expression against the data now; with
   * `editable`, as the what-if values typed into it change it. */
  const treeOf = (show, editable = false) => ruleTree(show, state.data, estimator(), editable ? state.whatIf : undefined);

  /* ------------------------------------------------ what if */

  /* What a rule's field holds in the data, not counting anything typed in. */
  const liveValueOf = (field) => {
    const read = estimator().read(String(field).replace(/^%|%$/g, ''));
    return read ? read.value : undefined;
  };

  function editWhatIf(field, text) {
    if (!state.whatIfBases.has(field)) state.whatIfBases.set(field, fingerprint(liveValueOf(field)));
    state.whatIf.set(field, parseWhatIf(text));
    renderDetail();
  }

  function resetWhatIf() {
    state.whatIf = new Map();
    state.whatIfBases = new Map();
    renderDetail();
  }

  /* A typed value goes when the data holds something else for its field now.
   * True when any went. */
  function dropStaleWhatIf() {
    if (!state.whatIf.size) return false;
    const stale = staleWhatIf(state.whatIf, state.whatIfBases, liveValueOf);
    stale.forEach((field) => { state.whatIf.delete(field); state.whatIfBases.delete(field); });
    return stale.length > 0;
  }

  /* The Visibility and Validation cards (rule-cards.js): fields as links, the Is now
   * cells editable, and the head's verdict sentence as the verdict tag's tooltip. */
  const ruleCards = createRuleCards({
    state, refs, jump, elementOf, treeOf, estimator, describeText, explain,
    onEdit: Features.has('structure.whatif') ? editWhatIf : null, // Free: the Is now cells are read-only
    headline: (element, tab) => (tab === 'conditions' ? visibilityVerdict(element) : headVerdict(element)).text,
    links: () => Features.has('structure.references')
  });

  /* The estimate of a Formula element the data holds no value for, else null:
   * { ok: true, value } or { ok: false, reason }. */
  function formulaEstimate(element) {
    if (!formulaOf(element) || state.data === undefined) return null;
    const value = resolveElementValue(element, state.data, rows());
    return value === undefined || value === null ? estimator().estimate(element) : null;
  }

  /* ------------------------------------------------ the head */

  /* The calls made during a step and the time on it (both part of the timeline gate). Shown for
   * steps, and for anything else the script was seen on. */
  function showsTiming(element) {
    if (!Features.has('structure.timeline')) return false; // Free: no calls-during or time-on-step lines
    return element.category.key === 'step' || state.visits.some((visit) => visit.key === element.key);
  }

  /* The calls and the time on a step, only while they are above zero: a head
   * that says "0" says nothing. Both pieces exist from the start so the pulse
   * can show one that turns up without rebuilding the pane. */
  function renderTiming(element) {
    if (!showsTiming(element)) return null;
    const box = document.createElement('span');
    box.className = 'detail-timing';
    box.dataset.key = element.key;
    const time = document.createElement('span');
    time.className = 'timing-time';
    box.appendChild(time);
    const calls = document.createElement('button');
    calls.type = 'button';
    calls.className = 'timing-calls';
    box.appendChild(calls);
    fillTiming(box, element);
    return box;
  }

  /* Text only, so it can run on every pulse without rebuilding the pane. */
  function fillTiming(box, element) {
    const lines = describeStep(state.visits, element.key, Shared.calls(), Date.now(), Settings.get('timeFormat'));
    const time = box.querySelector('.timing-time');
    const calls = box.querySelector('.timing-calls');
    /* Nothing at zero: the text goes too, not only the element. */
    if (time) {
      const shown = lines.timeMs > 0;
      if (time.textContent !== (shown ? lines.time : '')) time.textContent = shown ? lines.time : '';
      time.hidden = !shown;
    }
    const callsText = lines.callCount ? lines.calls : '';
    if (calls.textContent !== callsText) calls.textContent = callsText;
    calls.hidden = lines.callCount === 0;
    box.hidden = calls.hidden && (!time || time.hidden);

    const first = lines.callList[0];
    calls.disabled = !first;
    calls.title = first ? 'Open the first of these calls in Calls' : 'No captured call started during this step';
    calls.onclick = first ? () => Nav.go('actions', { id: first.id }) : null;
  }

  /* Is the Timeline what the pane shows: when the Timeline
   * button is on, or when nothing has been picked yet. After Esc the summary
   * is what was asked for; the Timeline is then one press of its button away. */
  const timelineWanted = () => Features.has('structure.timeline') && state.visits.length > 0 && !state.compare &&
    !(state.showProblems && countProblems(state.problems)) &&
    (state.showTimeline || (!selected() && !state.deselected));

  /* The clock keeps running on the step the script is on: refresh its lines in
   * place. With no element selected it is the Timeline that is kept current:
   * rebuilt when its rows changed, else repainted. */
  function refreshTiming() {
    if (timelineWanted()) {
      if (timeline.changed()) renderDetail(); else timeline.repaint(el.detail);
      return;
    }
    if (state.detailTimeline) { renderDetail(); return; }
    if (!selected() && summaryChanged()) { renderDetail(); return; }
    const element = selected();
    const box = element && el.detail.querySelector('.detail-timing');
    if (box && box.dataset.key === element.key) fillTiming(box, element);
  }

  /* "Row ‹ 1 of 3 ›" for an element inside a Repeat or Edit Block. */
  function renderRowStepper(element) {
    const info = repeatBlockOf(element, byKey(), state.data);
    if (!info || !info.count) return null;
    const row = clampRow(state.rowsChosen[info.block.key], info.count);

    const box = document.createElement('span');
    box.className = 'row-stepper';
    const step = (label, title, target) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'row-step';
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.disabled = target < 1 || target > info.count;
      button.addEventListener('click', () => setRow(info.block.key, target));
      return button;
    };
    const text = document.createElement('span');
    text.className = 'row-label';
    text.textContent = `Row ${row} of ${info.count}`;
    text.title = `Row of ${info.block.name} that the Value tab, Validation and Set Values read`;
    box.appendChild(step('‹', 'Previous row', row - 1));
    box.appendChild(text);
    box.appendChild(step('›', 'Next row', row + 1));
    return box;
  }

  /* Go back on page on the step the script is on, Go to this step on page on one it has passed:
   * the row menu's request, one click from the head. It acts on the inspected page (it
   * presses the script's own button), so it wears the external-page icon. */
  function renderBackButton(element) {
    if (element.category.key !== 'step') return null;
    const wanted = headNavButton({ navigation: navigationFor(element) });
    if (!wanted) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn tiny step-back';
    decorateButton(button, wanted.icon, wanted.label);
    button.title = wanted.title;
    button.setAttribute('data-help', 'Go to an earlier step');
    button.addEventListener('click', () => goBack(element));
    return button;
  }

  /* ... and the label of the head's step button, so it follows the script from step to step. */
  function navKey(element) {
    const wanted = element.category.key === 'step' ? headNavButton({ navigation: navigationFor(element) }) : null;
    return wanted ? wanted.label : '';
  }

  /* What the head says about an element's visibility or validation, as
   * { text, kind }: `kind` is 'bad' (an error that blocks Next), 'hidden' (hidden
   * for certain: a fact, drawn neutral), 'estimated' (rests on an estimate, or cannot be judged here) or ''
   * (nothing worth a chip: the sentence is at the top of its tab). A Set Errors /
   * Messaging element says what its validation comes to now (its show rule is
   * its condition); any other element says whether it is shown. */
  function headVerdict(element) {
    const validation = element.validation;
    const tried = state.whatIf.size > 0;
    const suffix = tried ? ' (what if)' : '';
    if (validation && validation.kind === 'set-errors') {
      let info = state.visibility[element.key];
      if (tried && element.show) {
        const evaluation = evaluateShow(element.show, state.data, withOverrides(estimator(), state.whatIf, state.data));
        const parentHides = !!(info && info.hidden && info.via && info.via !== element.key);
        info = {
          ...info, evaluation, live: evaluation.result !== null, estimated: evaluation.estimated,
          hidden: evaluation.result === false || parentHides
        };
      }
      const live = liveSetErrors(validation, info);
      const uncertain = live.state === 'unknown' || !!(info && info.estimated);
      return { text: live.headline + suffix, kind: uncertain ? 'estimated' : (live.blocks ? 'bad' : '') };
    }
    if (validation && validation.kind === 'messaging') {
      const live = liveMessaging(validation, state.data, tried ? withOverrides(estimator(), state.whatIf, state.data) : estimator());
      const active = live.active.map((message) => {
        const text = describeText(message.text);
        return `${message.type} ${text.formula ? text.plain : `“${message.text}”`}`;
      }).join(', ');
      const uncertain = live.state === 'unknown' || !!live.estimated;
      return {
        text: (active ? `${live.headline} · shown: ${active}` : live.headline) + suffix,
        kind: uncertain ? 'estimated' : (live.blocks ? 'bad' : '')
      };
    }
    return visibilityVerdict(element);
  }

  /* Whether the element is shown, as a verdict: the sentence of the Visibility tab. */
  function visibilityVerdict(element) {
    const why = explain(element);
    const info = state.visibility[element.key];
    if (state.whatIf.size > 0 && element.show) {
      const tree = treeOf(element.show, true);
      if (tree && tree.edited) {
        const hidden = tree.ok === false || why.hidden;
        return { text: describeVerdict(tree, { assumed: element.shown }), kind: hidden ? 'hidden' : '' };
      }
    }
    const uncertain = !!(info && (info.unknown || (info.estimated && why.hidden)));
    return { text: why.headline, kind: uncertain ? 'estimated' : (why.hidden ? 'hidden' : '') };
  }

  /* The tab that says more about the verdict, when the element has one. */
  function verdictTab(element, tabs) {
    const wanted = element.validation && element.validation.has ? 'validation' : 'conditions';
    return tabs.some((tab) => tab.id === wanted) ? wanted : null;
  }

  /* The one chip of the head: red for blocks Next, grey for hidden (a fact), amber for an estimate or a rule
   * that cannot be judged. Clicking it opens the tab that explains it. */
  function renderVerdictChip(element, tabs) {
    const verdict = headVerdict(element);
    if (!verdict.text || !verdict.kind) return null;
    const tab = verdictTab(element, tabs);
    /* On the tab that says it in full the chip would only repeat it. */
    if (tab && state.detailTab === tab) return null;
    const chip = document.createElement(tab ? 'button' : 'span');
    chip.className = `detail-why detail-chip ${tagClasses(CHIP_TONE[verdict.kind] || 'warn')} is-${verdict.kind}`;
    chip.textContent = verdict.text;
    chip.title = tab ? `${verdict.text}\nOpen the ${tab === 'validation' ? 'Validation' : 'Visibility'} tab` : verdict.text;
    if (tab) {
      chip.type = 'button';
      chip.addEventListener('click', () => { pickTab(tab, { store: false }); renderDetail(); });
    }
    return chip;
  }

  /* An amber chip when the data holds a value that is none of the element's options;
   * it opens the Options tab, which lists them with the one held. */
  function renderOptionsChip(element, tabs) {
    const finding = optionsFinding(element, state.data, rows());
    if (!finding || state.detailTab === 'options' || !tabs.some((tab) => tab.id === 'options')) return null;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `detail-why detail-chip options-chip ${tagClasses('warn')} is-estimated`;
    chip.textContent = finding.text;
    chip.title = `${finding.title}\nOpen the Options tab`;
    chip.addEventListener('click', () => { pickTab('options', { store: false }); renderDetail(); });
    return chip;
  }

  /* ONE compact line: "Text · PromoCode · conditional", then, only while they
   * apply, the verdict chip, what may stop Next, the calls and time of a step
   * and the row stepper. */
  function renderDetailHead(element, tabsInfo) {
    const head = document.createElement('div');
    head.className = 'detail-head';

    const title = document.createElement('div');
    title.className = 'detail-title';
    const shortLabel = element.label.length > 120 ? element.label.slice(0, 120) + '…' : element.label;
    title.textContent = element.name + (element.label ? ` (${shortLabel})` : '');
    if (shortLabel !== element.label || title.textContent.length > 40) title.title = element.name + (element.label ? ` (${element.label})` : '');
    head.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'detail-meta detail-line';
    const kind = document.createElement('span');
    const bits = [element.type, element.name];
    if (element.required) bits.push('required');
    if (element.conditional) bits.push('conditional');
    if (element.remote) bits.push(`calls ${element.remote}`);
    if (element.override) bits.push(`overridden by ${element.override}`);
    kind.textContent = bits.join(' · ');
    if (element.override) kind.title = overrideTitle(element);
    meta.appendChild(kind);

    const chip = renderVerdictChip(element, tabsInfo.tabs);
    if (chip) meta.appendChild(chip);
    const optionsChip = renderOptionsChip(element, tabsInfo.tabs);
    if (optionsChip) meta.appendChild(optionsChip);
    if (element.category.key === 'step' && Features.has('structure.steps')) {
      const count = stoppersOf(element).count;
      if (count) {
        const stops = document.createElement('span');
        stops.className = 'detail-stops';
        stops.textContent = `May stop Next: ${count}`;
        stops.title = 'Required fields that are empty and Set Errors / validations firing now; see the Validation tab';
        meta.appendChild(stops);
      }
    }
    const timing = renderTiming(element);
    if (timing) meta.appendChild(timing);
    const stepper = renderRowStepper(element);
    if (stepper) meta.appendChild(stepper);
    const back = renderBackButton(element);
    if (back) meta.appendChild(back);
    head.appendChild(meta);

    if (filteredOut(element)) {
      const out = document.createElement('div');
      out.className = 'detail-meta detail-filtered';
      out.textContent = 'Not in the list: the current filter hides it.';
      head.appendChild(out);
    }

    /* In a multi-language script the label is a custom-label key, not the text —
     * show it so it can be found and fixed in Custom Labels. */
    if (element.labelKey && (element.labelKey !== element.label || element.missingLabels.length)) {
      const labelKeyEl = document.createElement('div');
      labelKeyEl.className = 'detail-meta detail-labelkey';
      const labelKind = isTextBlock(element.node) && element.node.propSetMap && element.node.propSetMap.textKey
        ? 'text key: ' : 'label: ';
      labelKeyEl.textContent = labelKind + element.labelKey;
      head.appendChild(labelKeyEl);
    }

    /* The chip says it, and opens the list: the hint line would only repeat it. On the Options
     * tab, where the chip is not drawn, the line is back as plain text: there is nothing to open. */
    const mismatch = optionsChip && state.data !== undefined ? valueMismatch(element, resolveElementValue(element, state.data, rows())) : null;
    const typeHint = mismatch && mismatch.kind === 'option' ? '' : hintOf(element);
    if (typeHint) {
      const hint = document.createElement('div');
      hint.className = 'detail-meta detail-typehint';
      hint.textContent = `≠ ${typeHint}`;
      hint.title = 'A hint, not a problem: the value does not have the shape the element type promises';
      head.appendChild(hint);
    }

    if (state.whatIf.size) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'icon-btn tiny whatif-reset';
      reset.textContent = 'Reset what-if';
      reset.title = 'Put back what the data holds: drop every value typed into the rule table';
      reset.addEventListener('click', resetWhatIf);
      head.appendChild(reset);
    }

    /* One red line per custom-label key that is missing from allCustomLabels. */
    element.missingLabels.forEach((m) => {
      const missing = document.createElement('div');
      missing.className = 'detail-meta detail-labelkey is-broken';
      missing.textContent = `missing label · ${m.where}: ${m.key}`;
      head.appendChild(missing);
    });

    return head;
  }

  /* ------------------------------------------------ the tabs */

  /* Everything the detail pane needs to know about which tabs exist and what
   * each one shows, resolved once per render so the tab strip, the disabled
   * reasons and the body all agree with each other. */
  function detailTabsFor(element) {
    const currentRows = rows();
    const currentValue = resolveElementValue(element, state.data, currentRows);
    const isStep = element.category.key === 'step';
    const calls = callsForElement(element, Shared.calls());
    const stoppers = isStep ? stoppersOf(element) : null;
    const links = Features.has('structure.references');
    const usedBy = links ? (refs().usedBy.get(element.key) || []) : [];
    const linkCount = links
      ? usedBy.length + (refs().dependsOn.get(element.key) || []).length + (refs().writtenBy.get(element.key) || []).length
      : 0;

    const props = propertyRows(element);
    const options = optionsState(element, state.data, currentRows);
    const estimate = element.isSetValues ? null : formulaEstimate(element);
    const shownValue = estimate && estimate.ok ? estimate.value : currentValue;
    const tabs = detailTabs({
      element,
      propsCount: props.rows.length + props.internal.length,
      optionsCount: options ? options.options.length : 0,
      formula: !!formulaOf(element),
      value: element.isSetValues ? undefined : shownValue,
      callsCount: calls.length,
      stopCount: stoppers ? stoppers.count : 0,
      customCount: stoppers ? stoppers.custom.length : 0,
      estimatedCount: stoppers ? stoppers.estimated.length : 0,
      usedByCount: usedBy.length,
      linkCount,
      wired: !!(element.remote && callWiring(element))
    });

    /* The Validation tab of a step stays; the count in its label is the May stop Next count. */
    if (stoppers && !Features.has('structure.steps')) {
      tabs.forEach((tab) => { if (tab.id === 'validation') tab.label = validationLabel(0); });
    }

    const bodyByTab = {
      calls: calls.map((call) => ({
        time: call.time.toISOString(), name: call.name, ms: call.duration, failed: failed(call)
      })),
      definition: element.node,
      props: (element.node && element.node.propSetMap) || null,
      options: (element.node && element.node.propSetMap && element.node.propSetMap.options) || null,
      /* A Set Values element holds no value of its own: it writes into the data. */
      value: element.isSetValues ? element.setValues : shownValue,
      conditions: element.show,
      validation: stoppers
        ? { required: stoppers.required, firing: stoppers.firing, customComponents: stoppers.custom.map((item) => item.name) }
        : ((element.validation && element.validation.raw) || null)
    };

    return { tabs, bodyByTab };
  }

  /* Does the open tab draw a JSON tree? 'plain' when it is on show, 'copy' when the
   * value is shown as text that can be copied but not expanded or filtered, null when
   * there is none. */
  function jsonTreeKind(element, shown) {
    if (!isContainer(shown) || stepStopsShown(element)) return null;
    const tab = state.detailTab;
    if (tab === 'definition') return 'plain';
    if (tab === 'value') {
      if (element.isSetValues) return null;
      /* The Form and the Raw text have nothing to expand; both can be copied (the Form is filtered below). */
      const view = hasFormView(element, shown) ? viewOf(state.valueView) : 'tree';
      return view === 'tree' ? 'plain' : 'copy';
    }
    return null; // the rule tabs read as sections; their JSON is in Definition
  }

  /* Is the Current value tab showing its Form? Its rows take the filter box. */
  function formShown(element, shown) {
    return state.detailTab === 'value' && !element.isSetValues && hasFormView(element, shown) && viewOf(state.valueView) === 'form';
  }

  function renderTabStrip(tabs, onPick, current) {
    const strip = document.createElement('div');
    strip.className = 'seg';
    tabs.forEach((tab) => {
      const button = document.createElement('button');
      button.className = `seg-btn icon-btn${current === tab.id ? ' is-on' : ''}`;
      button.setAttribute('aria-pressed', String(current === tab.id));
      button.textContent = tab.label;
      if (!tab.enabled) {
        button.disabled = true;
        button.title = tab.reason || '';
      } else {
        button.title = tabTitle(tab);
        button.addEventListener('click', () => onPick(tab.id));
      }
      if (tab.icon) decorateButton(button, tab.icon, tab.label);
      /* A narrow pane (under 600 px) swaps the full name for this short one, drawn
       * by the stylesheet: an icon alone is a guess. The full name stays in the
       * accessibility tree and in the button's text. */
      button.dataset.short = shortTabLabel(tab);
      strip.appendChild(button);
    });
    return strip;
  }

  /* The tab to show: the one picked by hand while the element has it, else the
   * element's default. Settled before the head is drawn, which leaves out the
   * chip that says what the open tab says. */
  function settleTab(element, tabs) {
    const step = current();
    /* The pick is kept as picked; only the tab shown falls back to the
     * element's default when it lacks the picked one. */
    state.detailTab = usableTab(tabs, state.pickedTab, {
      isCurrentStep: !!step && step.key === element.key, conditional: element.conditional,
      ownsValidation: !!(element.validation && element.validation.has)
    });
  }

  function renderDetailTools(element, tabsInfo) {
    const { tabs, bodyByTab } = tabsInfo;

    const tools = document.createElement('div');
    tools.className = 'detail-tools';

    const segments = elementSegments(element, state.data);
    const onPage = document.createElement('button');
    onPage.className = 'icon-btn tiny';
    decorateButton(onPage, 'crosshair', 'Highlight on page');
    onPage.title = 'Outline this element\'s component on the inspected page';
    onPage.addEventListener('click', () => {
      Targets.highlight(element, true, (found) => {
        if (found) return;
        flashText(onPage, 'Not found on page');
      });
    });
    tools.appendChild(onPage);

    const showInData = document.createElement('button');
    showInData.className = 'icon-btn tiny';
    decorateButton(showInData, 'data', 'Show in Data');
    showInData.title = 'Open the Data tab at this element\'s value';
    showInData.addEventListener('click', () => Nav.go('data', { segments }));
    /* Left out, not greyed, for an element with no JSONPath whose name is not in the data. */
    if (segments && segments.length) tools.appendChild(showInData);

    tools.appendChild(renderTabStrip(tabs, (tabId) => { pickTab(tabId); renderDetail(); }, state.detailTab));

    const shown = bodyByTab[state.detailTab];
    const tree = jsonTreeKind(element, shown);

    const expand = document.createElement('button');
    expand.className = 'icon-btn tiny tree-btn';
    decorateButton(expand, 'expand', 'Expand all');
    expand.title = 'Expand everything';
    expand.addEventListener('click', () => {
      const set = new Set();
      addAllPaths(shown, '', set, 0);
      state.expanded[state.detailTab] = set;
      state.filterOpen[state.detailTab] = new Map();
      renderDetail();
    });
    const collapse = document.createElement('button');
    collapse.className = 'icon-btn tiny tree-btn';
    decorateButton(collapse, 'collapse', 'Collapse all');
    collapse.title = 'Collapse to the top level';
    collapse.addEventListener('click', () => {
      state.expanded[state.detailTab] = new Set(['']);
      const all = new Set();
      addAllPaths(shown, '', all, 0);
      state.filterOpen[state.detailTab] = new Map([...all].filter((path) => path !== '').map((path) => [path, false]));
      renderDetail();
    });
    /* Only where a JSON tree is drawn: Current value and Definition. */
    if (tree === 'plain') [expand, collapse].forEach((button) => tools.appendChild(button));

    /* Copy, like Expand all and the filter box, belongs to a tab that draws a
     * JSON tree: a step's "what may stop Next", the Properties form and a list
     * of calls have none. On Current value the card has its own Copy, which
     * copies the same JSON, so the toolbar leaves it out. */
    if (tree && state.detailTab !== 'value') {
      const copy = document.createElement('button');
      copy.className = 'icon-btn tiny';
      decorateButton(copy, 'copy', 'Copy');
      copy.title = 'Copy this view as JSON. Honours Mask values.';
      copy.addEventListener('click', () => {
        /* The definition's `response` and `defaultValue` can hold live data too. */
        const out = Mask.on() ? maskDefinitionValues(shown) : shown;
        copyWithButton(JSON.stringify(out, null, 2), copy);
      });
      tools.appendChild(copy);
    }

    const onForm = formShown(element, shown);
    if (state.detailTab !== 'props' && tree !== 'plain' && !onForm) return tools;

    const find = document.createElement('input');
    find.type = 'search';
    find.className = 'detail-find';
    find.placeholder = onForm ? 'Filter rows' : 'Filter keys and values';
    find.setAttribute('aria-label', onForm ? 'Filter the rows of the form by label or key' : 'Filter keys and values in this view');
    find.spellcheck = false;
    find.value = state.detailFilter;
    const applyFind = debounce((value) => {
      if (value.trim().toLowerCase() !== state.detailFilter.trim().toLowerCase()) state.filterOpen = {};
      state.detailFilter = value;
      renderDetail();
      const again = el.detail.querySelector('.detail-find');
      if (again) { again.focus(); again.setSelectionRange(value.length, value.length); }
    }, 150);
    find.addEventListener('input', () => applyFind(find.value));
    tools.appendChild(find);

    return tools;
  }

  /* ------------------------------------------------ bodies */

  /* One captured call made by the selected element; click to open it in the
   * Calls tab. */
  function callLine(call) {
    const line = document.createElement('div');
    line.className = `call-line${failed(call) ? ' is-failed' : ''}`;
    const why = failureReason(call);
    line.textContent = `${call.time.toLocaleTimeString()}  ·  ${why ? 'Failed' : 'Succeeded'}  ·  ` +
      `${call.duration ? `${call.duration} ms` : '? ms'}  ·  ${call.name}`;
    line.title = (why ? `${why}\n\n` : '') + 'Open this call in Calls';
    line.addEventListener('click', () => Nav.go('actions', { id: call.id }));
    return line;
  }

  /* A button that selects another element. */
  function elementButton(text, key, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jump-link';
    button.textContent = text;
    button.title = title || 'Select this element';
    button.addEventListener('click', () => jump(key));
    return button;
  }

  /* A tab picked by hand (the strip, a chip, a link) stays for the elements that
   * have it. Only a click on the tab strip or on Definition is a pick to keep
   * (`store`): a jump chip or a summary link shows the tab without changing
   * what Remember my settings holds. */
  function pickTab(id, { store = true } = {}) {
    state.detailTab = id;
    state.pickedTab = id;
    if (store) Settings.set('structDetailTab', pickedTabToKeep(id));
  }

  /* The Validation tab of a step is "what may stop Next". */
  function stepStopsShown(element) {
    return element.category.key === 'step' && state.detailTab === 'validation';
  }

  function span(className, text) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  /* "Sends: ..." and "Response node: ..." at the top of the Calls tab. The place in
   * the data is a button to open it in the Data tab when the data holds it. */
  function wiringLine(part) {
    const line = document.createElement('div');
    line.className = 'wiring-line';
    if (part.title) line.title = part.title;
    line.appendChild(document.createTextNode(`${part.label}: `));

    const where = part.segments && part.segments.length ? treePathFor(state.data, part.segments) : null;
    if (where && where.found && where.exact) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'jump-link';
      button.textContent = part.value;
      button.title = 'Open this place in the Data tab';
      button.addEventListener('click', () => Nav.go('data', { segments: part.segments }));
      line.appendChild(button);
    } else {
      line.appendChild(document.createTextNode(part.value));
    }
    if (part.note) line.appendChild(document.createTextNode(part.note));
    if (part.segments && part.segments.length && !(where && where.exact)) {
      line.appendChild(span('rule-now', state.data === undefined ? '  (no data read)' : '  (not in the data now)'));
    }
    return line;
  }

  function renderWiring(element, container) {
    const wiring = callWiring(element);
    if (!wiring) return;
    container.appendChild(wiringLine(wiring.sends));
    container.appendChild(wiringLine(wiring.lands));
    wiring.failure.forEach((item) => {
      const line = document.createElement('div');
      line.className = 'wiring-line';
      line.textContent = `${item.label}: ${item.value}`;
      container.appendChild(line);
    });
    if (wiring.remote) container.appendChild(span('wiring-remote', `Calls ${wiring.remote}`));
  }

  /* A button for a rule field that names an element of the script, else null (Properties). */
  function fieldButton(field) {
    const target = field ? refs().resolve(field).element : null;
    return target ? elementButton(field, target.key, `Select ${target.name}`) : null;
  }

  /* The full "Used by" and "Written by" lists, as buttons, after the Visibility card
   * (Depends on is a row of the card). */
  function renderLinkLists(element, container) {
    const index = refs();
    const group = (label, entries) => {
      if (!entries.length) return;
      const line = document.createElement('div');
      line.className = 'rule-line link-list';
      line.appendChild(document.createTextNode(`${label}  `));
      entries.forEach((entry, i) => {
        if (i) line.appendChild(document.createTextNode(', '));
        if (entry.key) line.appendChild(elementButton(entry.text, entry.key));
        else line.appendChild(document.createTextNode(entry.text));
      });
      container.appendChild(line);
    };
    group('Used by:', (index.usedBy.get(element.key) || []).map((key) => ({ text: elementOf(key).name, key })));
    group('Written by:', (index.writtenBy.get(element.key) || []).map(writerLine));
  }

  function writerLine(writerKey) {
    const writer = elementOf(writerKey);
    const parent = writer && writer.depth > 0 ? elementOf(writer.parentKey) : null;
    return { text: writer ? (parent ? `${writer.name} (${parent.name})` : writer.name) : '', key: writerKey };
  }

  /* The cards a tab starts with (core/structure/element-tables.js): Set Values and Formula
   * on the Current value tab, Options, Merge fields on Properties, Additional input on Calls. */
  const tablesFor = (element, tab) => elementTables({
    tab, element, data: state.data, refs: refs(), rows: rows(), estimator: estimator()
  });

  function renderTables(element, tab, container) {
    tablesFor(element, tab).forEach((table) => renderTableCard(table, container, { select: jump, help: TABLE_HELP[table.id] }));
  }

  function renderWrittenBy(element, container) {
    if (!Features.has('structure.references')) return;
    const writers = (refs().writtenBy.get(element.key) || []).map(writerLine);
    if (!writers.length) return;
    const line = document.createElement('div');
    line.className = 'rule-line link-list';
    line.appendChild(document.createTextNode('Written by:  '));
    writers.forEach((entry, i) => {
      if (i) line.appendChild(document.createTextNode(', '));
      line.appendChild(elementButton(entry.text, entry.key));
    });
    container.appendChild(line);
  }

  /* The right-click menu of a JSON tree in the pane: copy the value, key, path
   * or %merge% field, open or close the branch. `root` is the whole value the
   * tree shows and `tree` the sets it is drawn from. */
  function treeMenu(root, tree, filtering) {
    return (ev, info) => openTreeMenu(ev, info, {
      root,
      tree,
      filtering,
      copy: (text, what) => copyWithToast(text, what ? `Copied ${what}` : 'Copied'),
      rerender: renderDetail
    });
  }

  /* ------------------------------------------------ properties */

  function propTree(key) {
    if (!state.propTrees[key]) state.propTrees[key] = { expanded: new Set(['']), expandedText: new Set(), filterOpen: new Map() };
    return state.propTrees[key];
  }

  function disclosure(label, open, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'prop-toggle';
    button.textContent = label;
    button.setAttribute('aria-expanded', String(open));
    button.addEventListener('click', onClick);
    return button;
  }

  function toggleIn(set, key) {
    if (set.has(key)) set.delete(key); else set.add(key);
    renderDetail();
  }

  /* A scalar: a mark, or text with more / less for a long one. */
  function fillScalar(cell, view) {
    if (view.kind === 'bool') {
      const mark = document.createElement('span');
      mark.className = `prop-bool is-${view.value ? 'on' : 'off'}`;
      mark.textContent = view.text;
      mark.setAttribute('role', 'img');
      mark.setAttribute('aria-label', view.value ? 'yes' : 'no');
      cell.appendChild(mark);
      return;
    }

    /* A text that is a formula: what it comes to (≈), the formula under it. */
    if (view.kind === 'text' && isFormulaText(view.value) && takesFormula(view.id)) {
      const fold = appendMessageText(cell, view.value, describeText, state.formulaOpen, { compact: true });
      if (fold) cell.appendChild(fold);
      return;
    }

    const text = document.createElement('span');
    text.className = `prop-text${view.kind === 'null' || view.text === '(empty)' ? ' is-dim' : ''}`;
    cell.appendChild(text);

    if (!view.long) { text.textContent = view.text; return; }
    const open = state.propMore.has(view.id);
    text.textContent = open ? view.full : view.text;
    cell.appendChild(document.createTextNode(' '));
    cell.appendChild(disclosure(open ? 'less' : 'more', open, () => toggleIn(state.propMore, view.id)));
  }

  /* Set Values assignments, one per line: target ← expression. */
  function fillAssignments(cell, view) {
    view.items.forEach((item) => {
      const line = document.createElement('div');
      line.className = 'prop-assign';
      const target = fieldButton(item.target);
      if (target) line.appendChild(target); else line.appendChild(span('prop-assign-target', item.target));
      line.appendChild(span('prop-assign-arrow', ' ← '));
      line.appendChild(span('prop-assign-value', item.expression === '' ? '(empty)' : item.expression));
      cell.appendChild(line);
    });
  }

  /* A value too deep or too large for nested tables: its size, and the JSON on request. */
  function fillJson(cell, view) {
    cell.appendChild(span('prop-text', view.text));
    const open = state.propOpen.has(view.id);
    cell.appendChild(document.createTextNode(' '));
    cell.appendChild(disclosure(open ? 'hide JSON' : 'show JSON', open, () => toggleIn(state.propOpen, view.id)));
    if (!open) return;
    const box = document.createElement('div');
    box.className = 'prop-tree';
    const tree = propTree(view.id);
    renderJsonTree(box, view.id, view.value, {
      expanded: tree.expanded,
      expandedText: tree.expandedText,
      filterOpen: tree.filterOpen,
      transform: Mask.apply,
      onContext: treeMenu(view.value, tree, () => false),
      onToggle: renderDetail
    });
    cell.appendChild(box);
  }

  /* Nested values as nested two-column tables. */
  function fillRows(cell, view) {
    const table = document.createElement('table');
    table.className = 'prop-nested';
    const body = document.createElement('tbody');
    view.rows.forEach((entry) => {
      const tr = document.createElement('tr');
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = entry.label;
      const value = document.createElement('td');
      fillView(value, entry.view);
      tr.appendChild(name);
      tr.appendChild(value);
      body.appendChild(tr);
    });
    table.appendChild(body);
    cell.appendChild(table);
  }

  /* The value cell of a property, drawn from its view (core/structure/property-rows.js). */
  function fillView(cell, view) {
    if (view.kind === 'rows') fillRows(cell, view);
    else if (view.kind === 'rule') renderRuleTree(treeOf(view.rule), cell, { fieldButton });
    else if (view.kind === 'assignments') fillAssignments(cell, view);
    else if (view.kind === 'json') fillJson(cell, view);
    else fillScalar(cell, view);
  }

  function fillPropertyValue(cell, row) {
    fillView(cell, row.view);
  }

  /* The small "i" after a property's name: opens what the setting means as a
   * note under the row. It keeps the focus through the redraw. */
  function infoButton(row) {
    const open = state.propDocOpen.has(row.key);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'prop-info';
    button.dataset.key = row.key;
    button.setAttribute('data-help', 'Properties tab');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', `What ${row.label} means`);
    button.title = row.doc;
    button.addEventListener('click', () => {
      toggleIn(state.propDocOpen, row.key);
      const again = [...document.querySelectorAll('.prop-info')].find((node) => node.dataset.key === row.key);
      if (again) again.focus();
    });
    return button;
  }

  /* The note that opens under a row: its doc, as one line of prose. */
  function docRow(row) {
    const tr = document.createElement('tr');
    tr.className = 'prop-doc-row';
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.className = 'prop-doc';
    cell.textContent = row.doc;
    tr.appendChild(cell);
    return tr;
  }

  /* The element's propSetMap as a two-column table. */
  function renderProperties(element, container) {
    const { rows, internal } = propertyRows(element);
    const shown = filterPropertyRows(state.showInternal ? rows.concat(internal) : rows, state.detailFilter);

    if (shown.length) {
      const table = document.createElement('table');
      table.className = 'prop-table';
      const body = document.createElement('tbody');
      shown.forEach((row) => {
        const tr = document.createElement('tr');
        if (row.internal) tr.className = 'is-internal';
        const name = document.createElement('th');
        name.scope = 'row';
        name.textContent = row.label;
        const tip = propertyTooltip(row.key, row.label);
        if (tip) name.title = tip;
        if (row.doc) name.appendChild(infoButton(row));
        const cell = document.createElement('td');
        fillPropertyValue(cell, row);
        tr.appendChild(name);
        tr.appendChild(cell);
        body.appendChild(tr);
        if (row.doc && state.propDocOpen.has(row.key)) body.appendChild(docRow(row));
      });
      table.appendChild(body);
      container.appendChild(table);
    } else {
      container.appendChild(notice('', state.detailFilter.trim()
        ? `Nothing here matches "${state.detailFilter}".` : 'This element has no properties.', false));
    }

    if (internal.length) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'prop-internal-toggle';
      toggle.textContent = `${state.showInternal ? 'Hide' : 'Show'} internal (${internal.length})`;
      toggle.title = 'Keys the runtime uses for itself: names starting with _, lwc, pubsub or ssm';
      toggle.setAttribute('aria-pressed', String(state.showInternal));
      toggle.addEventListener('click', () => {
        state.showInternal = !state.showInternal;
        Settings.set('structShowInternal', state.showInternal);
        renderDetail();
      });
      container.appendChild(toggle);
    }
  }

  /* ------------------------------------------------ tree, form and raw */

  /* The open groups of the form are kept by element, for the life of the tab. */
  const formKey = (element, id) => `${element.key}\u0000${id}`;

  /* A redraw drops the focus; the control that was used gets it back. */
  function redrawKeeping(selector) {
    renderDetail();
    const again = el.detail.querySelector(selector);
    if (again) again.focus();
  }

  function pickValueView(view) {
    state.valueView = view;
    Settings.set('structValueView', viewToOpen('structValueView', view, DEFAULTS.structValueView));
    redrawKeeping(`.value-views [data-view="${view}"]`);
  }

  function toggleForm(element, id) {
    const key = formKey(element, id);
    if (state.formOpen.has(key)) state.formOpen.delete(key); else state.formOpen.add(key);
    const at = [...el.detail.querySelectorAll('.form-row')].findIndex((line) => line.dataset.id === id);
    renderDetail();
    const again = [...el.detail.querySelectorAll('.form-row')][at];
    const button = again && again.querySelector('.form-open');
    if (button) button.focus();
  }

  /* The JSON tree of the tab on show: the value of Current value, or the element on the JSON tab. */
  function renderTree(host, shown) {
    const tree = {
      expanded: state.expanded[state.detailTab],
      filterOpen: state.filterOpen[state.detailTab] || (state.filterOpen[state.detailTab] = new Map())
    };
    const result = renderJsonTree(host, state.detailTab === 'definition' ? 'JSON' : state.detailTab, shown, {
      expanded: tree.expanded,
      expandedText: state.expandedText[state.detailTab],
      filterOpen: tree.filterOpen,
      filter: state.detailFilter,
      /* Every tree masks what its row buttons copy: a definition holds answers
       * too (`response`, `defaultValue`) and a row button sees only its value. */
      transform: Mask.apply,
      onContext: treeMenu(shown, tree, () => !!state.detailFilter.trim()),
      onToggle: renderDetail
    });
    if (!result.matched) host.appendChild(notice('', `Nothing here matches "${state.detailFilter}".`, false));
  }

  /* The Current value card: a simple value with its type hint, or an object or
   * list as a tree; a step or block has Form | Tree | Raw in the card's header. */
  function renderValueCard(element, value, content) {
    const container = value !== null && typeof value === 'object';
    const views = container && hasFormView(element, value);
    const view = views ? viewOf(state.valueView) : 'tree';
    const { body } = factCard(content, {
      name: 'Current value',
      id: 'current-value',
      tip: element.category.key === 'step' ? 'What the step holds in the data now' : 'What the element holds in the data now',
      controls: views ? [renderViewSwitch(view, pickValueView)] : [],
      copy: value === undefined ? null : {
        text: () => JSON.stringify(Mask.apply(value), null, 2),
        title: 'Copy the value as JSON. Honours Mask values.',
        help: 'Current value views'
      }
    });
    if (!container) {
      factSingle(factRows(body), simpleValue(currentValueFact(value, { optionLabels: element.optionLabels })));
      return;
    }
    body.classList.add(`is-${view}`);
    if (view === 'form') {
      const result = filterFormRows(
        formRows(element, value, state.elements, (id) => state.formOpen.has(formKey(element, id))), state.detailFilter
      );
      if (result.filtered) state.formNote = `${result.rows.length} of ${result.total} rows`;
      if (result.filtered && !result.rows.length) {
        body.appendChild(notice('', `Nothing here matches "${state.detailFilter}".`, false));
        return;
      }
      renderForm(result, body, (id) => toggleForm(element, id));
      return;
    }
    if (view === 'raw') { renderRaw(JSON.stringify(value, null, 2), body); return; }
    const host = document.createElement('div');
    host.className = 'value-tree';
    body.appendChild(host);
    renderTree(host, value);
  }

  /* Current value: the Current value card first, on every element type, then the
   * card the element adds (Formula, or a Set Values element's Set Values, which
   * holds no value of its own: its Current value card shows only while the data
   * holds something under its name), then who writes into it. */
  function renderValueTab(element, content) {
    const value = state.data === undefined ? undefined : resolveElementValue(element, state.data, rows());
    if (!element.isSetValues || value !== undefined) renderValueCard(element, value, content);
    renderTables(element, 'value', content);
    renderWrittenBy(element, content);
  }

  function renderDetailBody(element, tabsInfo) {
    const { bodyByTab } = tabsInfo;
    const content = document.createElement('div');
    content.className = 'detail-body';

    if (state.detailTab === 'conditions') {
      ruleCards.renderVisibility(element, content);
      if (Features.has('structure.references')) renderLinkLists(element, content);
      return content;
    }

    if (stepStopsShown(element)) {
      ruleCards.renderStepValidation(stoppersOf(element), validationRules(state.elements, element.key, state.data, state.visibility), content);
      return content;
    }

    if (state.detailTab === 'validation') {
      ruleCards.renderValidation(element, content);
      return content;
    }

    if (state.detailTab === 'value') {
      renderValueTab(element, content);
      return content;
    }

    if (state.detailTab === 'options') {
      renderTables(element, 'options', content);
      return content;
    }

    if (state.detailTab === 'props') {
      renderTables(element, 'props', content);
      renderProperties(element, content);
      return content;
    }

    if (state.detailTab === 'calls') {
      renderWiring(element, content);
      renderTables(element, 'calls', content);
      const captured = callsForElement(element, Shared.calls());
      captured.forEach((call) => content.appendChild(callLine(call)));
      if (!captured.length) {
        const none = document.createElement('div');
        none.className = 'valid-note';
        none.textContent = 'No captured call matches this element yet.';
        content.appendChild(none);
      }
      return content;
    }

    /* The JSON tab: the element as JSON. */
    const shown = bodyByTab[state.detailTab];
    if (!isContainer(shown)) {
      if (shown === null || shown === undefined) return content;
      content.appendChild(notice('', String(shown), false));
      return content;
    }
    renderTree(content, shown);
    return content;
  }

  /* ------------------------------------------------ problems */

  function problemLine(problem) {
    const owner = elementOf(problem.elementKey);
    const line = document.createElement('div');
    line.className = `problem-line is-${problem.severity}`;
    const glyph = document.createElement('span');
    glyph.className = 'problem-glyph';
    glyph.textContent = SEVERITY_GLYPH[problem.severity] || '•';
    glyph.setAttribute('role', 'img');
    glyph.setAttribute('aria-label', problem.severity);
    line.appendChild(glyph);
    line.appendChild(elementButton(owner ? owner.name : '?', problem.elementKey, 'Select this element'));
    line.appendChild(document.createTextNode(` ${problem.message}`));
    return line;
  }

  /* Judged against the data, so only a hint before the script has run the
   * action that fills the name: folded away under the real problems. */
  function renderNotes(notes, body) {
    const details = document.createElement('details');
    details.className = 'problem-notes';
    details.open = state.notesOpen;
    const summary = document.createElement('summary');
    summary.textContent = `Not in the data yet (${notes.length})`;
    summary.addEventListener('click', () => { state.notesOpen = !details.open; });
    details.appendChild(summary);
    const lede = document.createElement('div');
    lede.className = 'tab-lede';
    lede.textContent = NOTES_LEDE;
    details.appendChild(lede);
    notes.forEach((problem) => details.appendChild(problemLine(problem)));
    body.appendChild(details);
  }

  function renderProblems(pane) {
    const problems = sortProblems(state.problems);
    const notes = problems.filter(isNote);
    const head = document.createElement('div');
    head.className = 'detail-head';
    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = `Problems (${countProblems(problems)})`;
    head.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    meta.textContent = 'Only what is provably wrong. Names a formula, an action or a Set Values may create while the script runs are not judged.';
    head.appendChild(meta);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'icon-btn tiny problems-close';
    close.textContent = 'Close';
    close.title = 'Back to the selected element';
    close.addEventListener('click', closeProblems);
    head.appendChild(close);
    pane.appendChild(head);

    const body = document.createElement('div');
    body.className = 'detail-body';
    problems.filter((problem) => !isNote(problem)).forEach((problem) => body.appendChild(problemLine(problem)));
    if (notes.length) renderNotes(notes, body);
    pane.appendChild(body);
  }

  /* ------------------------------------------------ the summary */

  /* The script's summary now; no rows before a definition is loaded. */
  function summaryNow() {
    if (!state.elements.length) return { title: '', rows: [] };
    const step = current();
    return scriptSummary(state.root, state.elements, {
      step, visits: state.visits, problems: state.problems, header: state.header,
      stoppers: step && Features.has('structure.steps') ? stoppersOf(step) : null
    });
  }

  /* Would the summary read differently from the one drawn? Only asked while it is on show. */
  function summaryChanged() {
    return state.detailSummary !== '' && JSON.stringify(summaryNow()) !== state.detailSummary;
  }

  /* What a click on a summary row does. */
  function followSummaryLink(link) {
    if (link.kind === 'problems') { openProblems(); return; }
    if (link.tab) pickTab(link.tab, { store: false });
    jump(link.key);
  }

  function summaryButton(text, link, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'jump-link';
    button.textContent = text;
    button.title = title;
    button.setAttribute('data-help', 'Summary');
    button.addEventListener('click', () => followSummaryLink(link));
    return button;
  }

  /* The value cell of a summary row: a list of names that each select their
   * element, one button for the whole row, or plain text. */
  function fillSummaryCell(cell, row) {
    if (row.items) {
      row.items.forEach((item, i) => {
        if (i) cell.appendChild(document.createTextNode(', '));
        cell.appendChild(summaryButton(item.text, { kind: 'element', key: item.key },
          item.title || (item.count > 1 ? `Select the first of the ${item.count} elements that call this` : 'Select the element that calls this')));
        if (item.count > 1) cell.appendChild(document.createTextNode(` ×${item.count}`));
      });
      return;
    }
    if (!row.link) { cell.textContent = row.text; return; }
    const title = {
      problems: 'Open the Problems list',
      element: row.link.tab ? 'Select the step and open what may stop Next' : 'Select this step'
    }[row.link.kind];
    cell.appendChild(summaryButton(row.text, row.link, title));
  }

  /* The script's summary in place of an empty pane. False when there is
   * nothing to say (no definition loaded), and the placeholder is drawn. */
  function renderSummary(pane) {
    const summary = summaryNow();
    if (!summary.rows.length) return false;
    state.detailSummary = JSON.stringify(summary);

    const head = document.createElement('div');
    head.className = 'detail-head';
    const title = document.createElement('div');
    title.className = 'detail-title';
    title.textContent = `Summary · ${summary.title}`;
    head.appendChild(title);
    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    meta.textContent = 'Select an element in the list for its details. Esc in the list comes back here.';
    head.appendChild(meta);
    pane.appendChild(head);

    const body = document.createElement('div');
    body.className = 'detail-body';
    const table = document.createElement('table');
    table.className = 'prop-table summary-table';
    const tbody = document.createElement('tbody');
    summary.rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.dataset.row = row.id;
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = row.label;
      const cell = document.createElement('td');
      fillSummaryCell(cell, row);
      tr.appendChild(name);
      tr.appendChild(cell);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
    pane.appendChild(body);
    return true;
  }

  /* A string that changes exactly when what may stop Next on a step would read differently. */
  function stoppersKey(element) {
    if (!element || element.category.key !== 'step') return '';
    const stoppers = stoppersOf(element);
    return JSON.stringify([
      stoppers.items.map((item) => [item.elementKey, item.shownReason || item.reason]),
      stoppers.estimated.map((item) => [item.elementKey, item.shownReason || item.reason]),
      stoppers.custom.map((item) => [item.elementKey, item.verdict, item.hidden, item.overriddenBy, leavesKey(item.tree)]),
      stepStopsShown(element) ? rulesKey(element) : ''
    ]);
  }

  /* What the conditions of a rule tree hold now: a card that shows them is drawn again when one moves. */
  function leavesKey(tree) {
    if (!tree) return '';
    return tree.kind === 'group' ? tree.children.map(leavesKey).join('|') : `${tree.ok}:${tree.actual}`;
  }

  /* The verdict of every validation rule on a step's Validation tab, and what its conditions hold. */
  function rulesKey(step) {
    return validationRules(state.elements, step.key, state.data, state.visibility).map((rule) => {
      const element = elementOf(rule.elementKey);
      const validation = element && element.validation;
      const rule0 = validation && validation.kind === 'messaging' ? validation.raw && validation.raw.validateExpression : element && element.show;
      return [rule.elementKey, rule.verdict, rule.estimated, leavesKey(treeOf(rule0))];
    });
  }

  /* ... and when the live Validation tab would. */
  function validationKey(element) {
    if (!element) return '';
    const formulas = formulaTextsKey(element);
    const validation = element.validation;
    if (!validation || !validation.has) return formulas;
    if (validation.kind === 'messaging') {
      const live = liveMessaging(validation, state.data, estimator());
      return JSON.stringify([live.headline, describeActive(live), live.lines, formulas]);
    }
    const live = liveSetErrors(validation, state.visibility[element.key]);
    return JSON.stringify([live ? live.headline : '', formulas]);
  }

  /* What the message formulas of an element (Set Errors, Messaging, any property
   * that starts with "=") come to now, so the pane redraws when the data moves one. */
  function formulaTextsKey(element) {
    const found = [];
    const walk = (value, depth, id) => {
      if (typeof value === 'string') {
        if (isFormulaText(value) && (id === null || takesFormula(id))) found.push(describeText(value).plain);
      } else if (value && typeof value === 'object' && depth < 5) {
        Object.keys(value).forEach((key) => walk(value[key], depth + 1, id === null ? null : (id === '' ? key : `${id}.${key}`)));
      }
    };
    walk(element.node && element.node.propSetMap, 0, '');
    const validation = element.validation; // the same texts after custom labels are resolved
    if (validation && validation.has) {
      walk([validation.message, validation.errorMap.map((entry) => entry.message), validation.messages.map((message) => message.text)], 0, null);
    }
    return found.length ? JSON.stringify(found) : '';
  }

  /* ... and when the tab strip would: a tab is left out while it does not
   * apply, so one appears (a value turns up, a call is captured) or goes. */
  function tabsKey(element) {
    return JSON.stringify(detailTabsFor(element).tabs.map((tab) => [tab.id, tab.label]));
  }

  /* ... and when the tab on show would: the value the Current value tab shows, the cards a tab
   * starts with (a Set Values element's rows, an element's options, a text's merge fields), the
   * options finding in the head, the tab strip's labels and the mask. Not the whole data, so a
   * change elsewhere in the payload leaves the pane be. */
  function valueKey(element, tabsInfo) {
    if (!element) return '';
    const finding = optionsFinding(element, state.data, rows());
    const tables = tablesFor(element, state.detailTab);
    if (state.detailTab !== 'value') return finding || tables.length ? JSON.stringify([Mask.on(), finding, tables]) : '';
    const { tabs, bodyByTab } = tabsInfo || detailTabsFor(element);
    const estimate = element.isSetValues ? null : formulaEstimate(element);
    return JSON.stringify([
      Mask.on(), tabs.map((tab) => [tab.id, tab.label, tab.enabled]), bodyByTab.value, tables, estimate, finding
    ]);
  }

  /* A poll can redraw the pane under the Rule card's header while it has focus;
   * focus goes back to the toggle at the same place (the n-th one of the pane). */
  /* Where the body is scrolled to means something only while the same element shows the same
   * tab and view as the draw before: a poll that redraws it keeps the place, a new pick starts at the top. */
  const scrollPlace = () => `${state.selectedKey}|${state.detailTab}|${state.valueView}|${state.compare ? 'compare' : ''}`;
  let drawnPlace = '';

  function renderDetail() {
    const pane = el.detail;
    const toggles = [...pane.querySelectorAll('.detail-card-toggle')];
    const focused = toggles.indexOf(document.activeElement);
    const body = pane.querySelector('.detail-body');
    const top = body ? body.scrollTop : 0;
    const before = drawnPlace;
    drawDetail();
    drawnPlace = scrollPlace();
    const redrawn = pane.querySelector('.detail-body');
    if (redrawn && top > 0 && before === drawnPlace) redrawn.scrollTop = top;
    if (focused < 0) return;
    const again = pane.querySelectorAll('.detail-card-toggle')[focused];
    if (again) again.focus();
  }

  /* The form's filter count belongs to the status bar, which is told when it changes. */
  function drawDetail() {
    const before = state.formNote;
    state.formNote = '';
    drawDetailBody();
    if (state.formNote !== before) status();
  }

  function drawDetailBody() {
    const pane = el.detail;
    pane.textContent = '';

    const element = selected();
    dropStaleWhatIf();
    state.detailWhy = whyKey(element);
    state.detailStoppers = stoppersKey(element);
    state.detailValidation = validationKey(element);
    state.detailTimeline = '';
    state.detailSummary = '';
    state.detailHint = element ? hintOf(element) : '';
    state.detailValue = '';
    state.detailTabs = element ? tabsKey(element) : '';
    state.detailNav = element ? navKey(element) : '';

    if (state.compare) {
      comparePane.render(pane);
      return;
    }

    if (state.showProblems && countProblems(state.problems)) {
      renderProblems(pane);
      return;
    }

    if (timelineWanted()) { timeline.render(pane); return; }

    if (!element) {
      if (!renderSummary(pane)) {
        pane.appendChild(notice('Select an element', 'Its properties, current value and show rule appear here.', false));
      }
      return;
    }

    const tabsInfo = detailTabsFor(element);
    settleTab(element, tabsInfo.tabs);
    const head = renderDetailHead(element, tabsInfo);
    head.appendChild(renderDetailTools(element, tabsInfo));
    pane.appendChild(head);
    pane.appendChild(renderDetailBody(element, tabsInfo));
    state.detailValue = valueKey(element, tabsInfo);
  }

  /* Does the pane need a redraw after a data change? Drawing it afresh drops
   * the focus and scroll of its filter box, so only when it would read differently. */
  function needsRedraw() {
    const element = selected();
    if (state.compare || timelineWanted()) return false;
    if (state.showProblems && countProblems(state.problems)) return false;
    if (!element) return summaryChanged();
    const dropped = dropStaleWhatIf();
    /* Never rebuild the pane under a value being typed. */
    if (el.detail.querySelector('.whatif-input')) return false;
    if (dropped) return true;
    return hintOf(element) !== state.detailHint || valueKey(element) !== state.detailValue || whyKey(element) !== state.detailWhy ||
      tabsKey(element) !== state.detailTabs || navKey(element) !== state.detailNav ||
      stoppersKey(element) !== state.detailStoppers ||
      validationKey(element) !== state.detailValidation;
  }

  return { renderDetail, refreshTiming, stoppersKey, needsRedraw };
}
