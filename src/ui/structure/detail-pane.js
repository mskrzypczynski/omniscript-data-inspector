'use strict';

/* The Structure tab's detail pane: the selected element's definition, live
 * value, visibility rules, validation and captured calls. */

import { isTextBlock, displayValue, resolveElementValue } from '../../core/structure-model.js';
import { isContainer, addAllPaths } from '../../core/json-tree-model.js';
import { callsForElement, failed, failureReason } from '../../core/actions-model.js';
import { elementSegments } from '../../core/path-links.js';
import { renderJsonTree } from '../json-tree-view.js';
import { Targets } from '../targets.js';
import { Nav } from '../nav.js';
import { Mask } from '../mask-setting.js';
import { Shared } from '../shared.js';
import { notice } from '../notice.js';
import { copyWithButton } from '../clipboard.js';
import { renderValidationSummary } from './validation-summary.js';

/* state: the tab's state. el: { detail }.
 * deps: selected() the selected element or null, explain(element), whyKey(element). */
export function createDetailPane({ state, el, selected, explain, whyKey }) {
  function renderDetailHead(element) {
    const head = document.createElement('div');
    head.className = 'detail-head';

    const title = document.createElement('div');
    title.className = 'detail-title';
    const shortLabel = element.label.length > 120 ? element.label.slice(0, 120) + '…' : element.label;
    title.textContent = element.name + (element.label ? ` (${shortLabel})` : '');
    if (shortLabel !== element.label) title.title = element.label;
    head.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    const bits = [element.type, `name: ${element.name}`];
    if (element.required) bits.push('required');
    if (element.conditional) bits.push('conditional');
    if (element.remote) bits.push(`calls ${element.remote}`);
    meta.textContent = bits.join(' · ');
    head.appendChild(meta);

    /* In a multi-language script the label is a custom-label key, not the text —
     * show it so it can be found and fixed in Custom Labels. */
    if (element.labelKey && (element.labelKey !== element.label || element.missingLabels.length)) {
      const labelKeyEl = document.createElement('div');
      labelKeyEl.className = 'detail-meta detail-labelkey';
      const kind = isTextBlock(element.node) && element.node.propSetMap && element.node.propSetMap.textKey
        ? 'text key: ' : 'label: ';
      labelKeyEl.textContent = kind + element.labelKey;
      head.appendChild(labelKeyEl);
    }

    const why = explain(element);
    if (why.headline) {
      const whyEl = document.createElement('div');
      whyEl.className = `detail-why${why.hidden ? ' is-hidden' : ''}`;
      whyEl.textContent = why.headline;
      head.appendChild(whyEl);
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

  /* Everything the detail pane needs to know about which tabs exist and what
   * each one shows, resolved once per render so the tab strip, the disabled
   * reasons and the body all agree with each other. */
  function detailTabsFor(element) {
    const currentValue = resolveElementValue(element, state.data);

    /* A Set Values element doesn't hold a value of its own — it writes into the
     * data JSON — so its second tab shows the assignments it makes instead. */
    const valueTab = element.isSetValues
      ? { label: 'Set values', data: element.setValues, on: !!element.setValues }
      : { label: 'Current value', data: currentValue, on: currentValue !== undefined };

    const hasValidation = !!(element.validation && element.validation.has);

    const calls = callsForElement(element, Shared.calls());

    const bodyByTab = {
      calls: calls.map((call) => ({
        time: call.time.toISOString(), name: call.name, ms: call.duration, failed: failed(call)
      })),
      definition: element.node,
      value: valueTab.data,
      conditions: element.show,
      validation: (element.validation && element.validation.raw) || null
    };

    const available = [
      ['definition', 'Definition', true],
      ['value', valueTab.label, valueTab.on],
      ['conditions', 'Visibility', !!element.conditional]
    ];
    if (hasValidation) available.push(['validation', 'Validation', true]);
    if (element.remote) available.push(['calls', calls.length ? `Calls (${calls.length})` : 'Calls', calls.length > 0]);

    const disabledReason = {
      value: element.isSetValues ? 'This Set Values element has no assignments' : 'This element holds no value right now',
      conditions: 'This element has no show/hide conditions — it is always visible',
      validation: 'This element has no validation',
      calls: 'No captured call matches this element yet. Open the Remote actions tab and let it record while the script runs.'
    };

    return { available, bodyByTab, disabledReason };
  }

  function renderDetailTools(element, tabs) {
    const { available, bodyByTab, disabledReason } = tabs;

    if (!available.some(([tabId, , enabled]) => tabId === state.detailTab && enabled)) {
      state.detailTab = 'definition';
    }

    const tools = document.createElement('div');
    tools.className = 'detail-tools';

    const segments = elementSegments(element, state.data);
    const onPage = document.createElement('button');
    onPage.className = 'icon-btn tiny';
    onPage.textContent = 'Highlight on page';
    onPage.title = 'Outline this element\'s component on the inspected page';
    onPage.addEventListener('click', () => {
      Targets.highlight(element, true, (found) => {
        if (found) return;
        onPage.textContent = 'Not found on page';
        setTimeout(() => { onPage.textContent = 'Highlight on page'; }, 1500);
      });
    });
    tools.appendChild(onPage);

    const showInData = document.createElement('button');
    showInData.className = 'icon-btn tiny';
    showInData.textContent = 'Show in Data';
    showInData.disabled = !segments || !segments.length;
    showInData.title = showInData.disabled
      ? 'This element has no JSONPath and its name is not in the data'
      : 'Open the Data tab at this element\'s value';
    showInData.addEventListener('click', () => Nav.go('data', { segments }));
    tools.appendChild(showInData);

    const tabStrip = document.createElement('div');
    tabStrip.className = 'seg';
    available.forEach(([tabId, tabLabel, enabled]) => {
      const button = document.createElement('button');
      button.className = `seg-btn${state.detailTab === tabId ? ' is-on' : ''}`;
      button.textContent = tabLabel;
      if (!enabled) {
        button.disabled = true;
        button.title = disabledReason[tabId] || '';
      } else {
        button.addEventListener('click', () => {
          state.detailTab = tabId;
          renderDetail();
        });
      }
      tabStrip.appendChild(button);
    });
    tools.appendChild(tabStrip);

    const shown = bodyByTab[state.detailTab];
    const treeable = isContainer(shown) && state.detailTab !== 'calls';

    const expand = document.createElement('button');
    expand.className = 'icon-btn tiny';
    expand.textContent = 'Expand all';
    expand.disabled = !treeable;
    expand.addEventListener('click', () => {
      const set = new Set();
      addAllPaths(shown, '', set, 0);
      state.expanded[state.detailTab] = set;
      renderDetail();
    });
    tools.appendChild(expand);

    const collapse = document.createElement('button');
    collapse.className = 'icon-btn tiny';
    collapse.textContent = 'Collapse all';
    collapse.disabled = !treeable;
    collapse.addEventListener('click', () => {
      state.expanded[state.detailTab] = new Set(['']);
      renderDetail();
    });
    tools.appendChild(collapse);

    const copy = document.createElement('button');
    copy.className = 'icon-btn tiny';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => {
      copyWithButton(JSON.stringify(
        state.detailTab === 'value' ? Mask.apply(shown) : shown, null, 2), copy, 'Copy');
    });
    tools.appendChild(copy);

    const find = document.createElement('input');
    find.type = 'search';
    find.className = 'detail-find';
    find.placeholder = 'Filter keys and values';
    find.spellcheck = false;
    find.value = state.detailFilter;
    let findTimer = null;
    find.addEventListener('input', () => {
      const value = find.value;
      clearTimeout(findTimer);
      findTimer = setTimeout(() => {
        state.detailFilter = value;
        renderDetail();
        const again = el.detail.querySelector('.detail-find');
        if (again) { again.focus(); again.setSelectionRange(value.length, value.length); }
      }, 150);
    });
    tools.appendChild(find);

    return tools;
  }

  /* One captured call made by the selected element; click to open it in the
   * Remote actions tab. */
  function callLine(call) {
    const line = document.createElement('div');
    line.className = `call-line${failed(call) ? ' is-failed' : ''}`;
    const why = failureReason(call);
    line.textContent = `${call.time.toLocaleTimeString()}  ·  ${why ? 'ERROR' : 'SUCCESS'}  ·  ` +
      `${call.duration ? `${call.duration} ms` : '? ms'}  ·  ${call.name}`;
    line.title = (why ? `${why}\n\n` : '') + 'Open this call in Remote actions';
    line.addEventListener('click', () => Nav.go('actions', { id: call.id }));
    return line;
  }

  function renderDetailBody(element, tabs) {
    const { bodyByTab } = tabs;
    const content = document.createElement('div');
    content.className = 'detail-body';

    if (state.detailTab === 'conditions' && element.showExpr) {
      const expr = document.createElement('div');
      expr.className = 'cond-expr';
      expr.textContent = `Visible when:  ${element.showExpr}`;
      content.appendChild(expr);
    }

    if (state.detailTab === 'conditions') {
      const why = explain(element);
      if (why.headline) {
        const verdict = document.createElement('div');
        verdict.className = `cond-expr${why.hidden ? ' is-hidden' : ''}`;
        verdict.textContent = why.headline;
        content.appendChild(verdict);
      }
      why.lines.forEach((line) => {
        const div = document.createElement('div');
        div.className = `rule-line${line.ok === false ? ' is-false' : ''}`;
        div.textContent = `${line.ok === true ? '✓' : line.ok === false ? '✗' : '?'}  ${line.text}`;
        content.appendChild(div);
      });
    }

    if (state.detailTab === 'validation') {
      renderValidationSummary(element.validation, content);
    }

    if (state.detailTab === 'value' && element.isSetValues) {
      const note = document.createElement('div');
      note.className = 'valid-note';
      note.textContent = 'Assignments this element writes into the OmniScript data ' +
        '(target field → value or formula). It holds no value of its own.';
      content.appendChild(note);
    }

    if (state.detailTab === 'calls') {
      callsForElement(element, Shared.calls()).forEach((call) => content.appendChild(callLine(call)));
      return content;
    }

    const shown = bodyByTab[state.detailTab];
    const treeable = isContainer(shown);

    if (!treeable) {
      const text = shown === undefined ? 'No value.'
        : (state.detailTab === 'value' ? displayValue(element, shown) : String(shown));
      content.appendChild(notice('', text, false));
      return content;
    }

    const result = renderJsonTree(content, state.detailTab, shown, {
      expanded: state.expanded[state.detailTab],
      expandedText: state.expandedText[state.detailTab],
      filter: state.detailFilter,
      transform: state.detailTab === 'value' ? Mask.apply : undefined,
      onToggle: renderDetail
    });

    if (!result.matched) {
      content.appendChild(notice('', `Nothing here matches "${state.detailFilter}".`, false));
    }

    return content;
  }

  function renderDetail() {
    const pane = el.detail;
    pane.textContent = '';

    const element = selected();
    state.detailWhy = whyKey(element);
    if (!element) {
      pane.appendChild(notice('Select an element', 'Its definition, current value and visibility conditions appear here.', false));
      return;
    }

    const tabs = detailTabsFor(element);
    const head = renderDetailHead(element);
    head.appendChild(renderDetailTools(element, tabs));
    pane.appendChild(head);
    pane.appendChild(renderDetailBody(element, tabs));
  }

  return { renderDetail };
}
