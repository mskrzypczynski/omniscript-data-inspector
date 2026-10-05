'use strict';

/* The Structure tab's element list: one row per element with its progress mark,
 * glyph, name, tags, type and live value, folded by section. */

import { displayValue, resolveElementValue } from '../../core/structure-model.js';
import { Targets } from '../targets.js';
import { notice } from '../notice.js';

/* state: the tab's state. el: { list }.
 * deps: visible() the elements the filters let through, isHidden(element),
 * explain(element), select(element) a click on a row. */
export function createElementList({ state, el, visible, isHidden, explain, select }) {
  const STATUS_GLYPH = { done: '✓', current: '●', skipped: '–' };

  /* One fixed-width column at the left edge of the row, so progress reads as a
   * single vertical strip instead of competing with the tags after the name. */
  function statusCell(element, progress) {
    const cell = document.createElement('span');
    cell.className = `el-status${progress ? ` is-${progress}` : ''}`;
    if (!progress || !STATUS_GLYPH[progress]) return cell;

    const isStep = element.category.key === 'step';
    cell.textContent = STATUS_GLYPH[progress];
    cell.title = {
      current: 'The step the OmniScript is on now',
      skipped: 'Passed without running — its show condition was false',
      done: isStep ? 'Already passed' : 'Has run'
    }[progress];
    return cell;
  }

  function progressOf(element) {
    return state.progress[element.key] || null;
  }

  function listHeader() {
    const row = document.createElement('div');
    row.className = 'log-row log-head';
    const status = document.createElement('span');
    status.className = 'el-status';
    status.title = 'Progress: ✓ passed · ● current · – skipped';
    row.appendChild(status);

    const spacer = document.createElement('span');
    spacer.className = 'twisty is-leaf';
    row.appendChild(spacer);
    [
      ['el-icon', '', 'Element family'],
      ['log-name', 'Element', 'Label from the definition, or the element name when it has none'],
      ['el-type', 'Type', 'Element type as defined in the OmniScript'],
      ['el-value', 'Value', 'Current value in the live data']
    ].forEach(([className, text, title]) => {
      const cellEl = document.createElement('span');
      cellEl.className = className;
      cellEl.textContent = text;
      cellEl.title = title;
      row.appendChild(cellEl);
    });
    return row;
  }

  function isSectionCollapsed(element, byKey) {
    let parent = byKey[element.parentKey];
    let guard = 0;
    while (parent && guard++ < 100) {
      if (state.collapsed.has(parent.key)) return true;
      parent = byKey[parent.parentKey];
    }
    return false;
  }

  function renderRow(element, sectioning) {
    const row = document.createElement('div');
    row.className = 'log-row';
    if (element.key === state.selectedKey) row.classList.add('is-selected');

    const progress = progressOf(element);
    row.appendChild(statusCell(element, progress));
    if (progress) row.classList.add(`is-${progress}`);

    const twisty = document.createElement('span');
    twisty.className = 'twisty';
    twisty.style.marginLeft = `${element.depth * 12}px`;
    if (sectioning && element.hasChildren) {
      const folded = state.collapsed.has(element.key);
      twisty.textContent = folded ? '▸' : '▾';
      twisty.title = folded ? 'Expand section' : 'Collapse section';
      twisty.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.collapsed.has(element.key)) state.collapsed.delete(element.key);
        else state.collapsed.add(element.key);
        state.handFolded.add(element.key); // a hand-made choice: auto-collapse leaves it alone
        renderList();
      });
    } else {
      twisty.classList.add('is-leaf');
    }
    row.appendChild(twisty);

    const icon = document.createElement('span');
    icon.className = `el-icon is-${element.category.key}`;
    icon.textContent = element.category.glyph;
    icon.title = `${element.category.label} — ${element.type}`;
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'log-name';
    name.textContent = element.name + (element.label ? ` (${element.label})` : '');
    name.title = `${element.name} — ${element.type}` +
      (element.label ? '\n' + (element.label.length > 300 ? element.label.slice(0, 300) + '…' : element.label) : '');
    if (element.missingLabels.length) row.classList.add('is-broken');
    row.appendChild(name);

    if (isHidden(element)) {
      row.classList.add('is-hidden');
      row.appendChild(tag('hidden', explain(element).headline || 'Hidden right now'));
    }
    if (element.required) row.appendChild(tag('req', 'Required'));
    if (element.conditional) {
      row.appendChild(tag('cond', element.showExpr ? `Visible when: ${element.showExpr}` : 'Has show/hide conditions'));
    }
    if (element.remote) row.appendChild(tag('act', `Calls ${element.remote}`));

    if (element.missingLabels.length) {
      row.appendChild(tag('missing',
        (element.missingLabels.length === 1
          ? `Custom label "${element.missingLabels[0].key}" (${element.missingLabels[0].where})`
          : `${element.missingLabels.length} custom labels`) +
        ' missing from allCustomLabels — the OmniScript will not render correctly:\n' +
        element.missingLabels.map((m) => `• ${m.where}: ${m.key}`).join('\n')));
    }

    const type = document.createElement('span');
    type.className = 'el-type';
    type.textContent = element.type;
    row.appendChild(type);

    const value = document.createElement('span');
    value.className = 'el-value';
    value.textContent = displayValue(element, resolveElementValue(element, state.data));
    state.cells[element.key] = value;
    row.appendChild(value);

    let hoverTimer = null;
    row.addEventListener('mouseenter', () => {
      if (!state.hover) return;
      hoverTimer = setTimeout(() => Targets.highlight(element, true, () => {}), 200);
    });
    row.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer);
      if (state.hover) Targets.highlight(element, false, () => {});
    });

    row.addEventListener('click', () => select(element));

    return row;
  }

  function renderList() {
    const list = el.list;
    list.textContent = '';
    state.cells = {};

    if (state.error) {
      list.appendChild(notice('Could not read the definition', state.error, true));
      return;
    }

    if (!Targets.selected()) {
      list.appendChild(notice('No OmniScript selected', 'Pick one in the bar above, or press Rescan if the list is empty.', false));
      return;
    }

    if (!state.elements.length) {
      const box = notice('Nothing on ' + state.defProp,
        'This OmniScript exposes no definition on that property. Change the Definition field if your build names it differently.',
        false);
      Targets.hints().forEach((h) => {
        if (!h.props || !h.props.length) return;
        const p = document.createElement('div');
        p.style.marginTop = '6px';
        p.textContent = `${h.tag} exposes: ${h.props.join(', ')}`;
        box.appendChild(p);
      });
      list.appendChild(box);
      return;
    }

    let rows = visible();
    if (!rows.length) {
      list.appendChild(notice('No elements', 'Nothing matches the current filter.', false));
      return;
    }

    /* Sections only fold when the list still reflects the real tree — a text
     * filter or Actions only strips parents out, so honour neither then. */
    const sectioning = !state.filter.trim() && !state.actionsOnly;
    const byKey = {};
    state.elements.forEach((element) => { byKey[element.key] = element; });

    if (sectioning) {
      rows = rows.filter((element) => !isSectionCollapsed(element, byKey));
    }

    list.appendChild(listHeader());
    rows.forEach((element) => list.appendChild(renderRow(element, sectioning)));
  }

  const TAG_GLYPH = { req: '!', cond: '?', act: '↗', missing: '⚠', hidden: '◌' };

  function tag(kind, title) {
    const span = document.createElement('span');
    span.className = `tag tag-${kind}`;
    span.textContent = TAG_GLYPH[kind] || '';
    span.title = title;
    return span;
  }

  return { renderList };
}
