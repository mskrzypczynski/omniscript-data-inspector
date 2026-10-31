'use strict';

/* The Structure tab's element list: one row per element with its icon, name,
 * and marks, folded by section, and a last column, Next, with one glyph per
 * row. The step the script is on is marked by a bar on its row. The
 * exact type is in the row's tooltip and the detail head: the icon already says the family. */

import { withoutFolded, withContext, childCounts, ancestorKeys, isWithin, noMatchText } from '../../core/structure/element-filter.js';
import { Targets } from '../targets.js';
import { icon as svgIcon } from '../icons.js';
import { notice } from '../notice.js';
import { emptyCard } from './empty-state.js';
import { enhanceList } from '../listbox.js';
import { tagClasses } from '../../core/shared/tag-tone.js';
import { ROW_MARKS, rowLegend, hiddenTitle, ruleTitle, showsRuleMark } from '../../core/structure/row-marks.js';
import { verdictHeaderTitle } from '../../core/structure/row-verdict.js';
import { overrideTitle } from '../../core/structure/overrides.js';
import { wireLegend } from './legend.js';

/* state: the tab's state. el: { list }.
 * deps: visible() the elements the filters let through, isHidden(element)
 * (what Visible only drops), isCertainlyHidden(element) (what is tagged hidden),
 * explain(element), byKey() element key -> element,
 * hintOf(element) what is off about the value for the element's type (core/structure/value-types.js), '' for nothing,
 * clearFilters() drops the filter box and both checkboxes, rowMenu(ev, element, row) a right-click on a row,
 * stopCount(step) how many things may stop that step, verdicts() the Valid column: { [element.key]: { tone, text } }
 * (core/structure/row-verdict.js), asked once per draw, select(element) a click on a row,
 * deselect() Esc on the list. */
export function createElementList({
  state, el, visible, isHidden, isCertainlyHidden = isHidden, explain, byKey, hintOf = () => '', stopCount, verdicts = () => ({}), select, deselect = () => {},
  clearFilters = () => {}, rowMenu = () => {}
}) {
  const LEGEND = rowLegend();

  /* The Valid column: a fixed-width cell at the right edge of every row. With a verdict it holds a
   * .tag pill, the same as the Result of the Calls list: the sentence stays in the pill's text for
   * whatever reads it, the stylesheet draws the glyph. The cell itself carries the sentence as its
   * tooltip and accessible name, as the marks do. No verdict leaves it empty. */
  function verdictCell(verdict) {
    const cell = document.createElement('span');
    cell.className = 'el-verdict';
    setVerdict(cell, verdict);
    return cell;
  }

  function setVerdict(cell, verdict) {
    const shown = cell.firstChild ? cell.firstChild.textContent : '';
    const tone = cell.dataset.tone || '';
    if (!verdict) {
      if (!cell.firstChild) return;
      cell.textContent = '';
      cell.removeAttribute('title');
      cell.removeAttribute('role');
      cell.removeAttribute('aria-label');
      delete cell.dataset.tone;
      return;
    }
    if (shown === verdict.text && tone === verdict.tone) return;
    cell.textContent = '';
    const pill = document.createElement('span');
    pill.className = `${tagClasses(verdict.tone)} verdict is-${verdict.tone}`;
    pill.textContent = verdict.text;
    cell.appendChild(pill);
    cell.dataset.tone = verdict.tone;
    cell.title = verdict.text;
    cell.setAttribute('role', 'img');
    cell.setAttribute('aria-label', verdict.text);
  }

  /* The row's tooltip: name and type, the label, and what is off about the value. A skipped one says so first. */
  function nameTitle(element, hint, progress) {
    return (progress === 'skipped' ? 'Passed without running: its show rule was false\n' : '') +
      (progress === 'current' && element.category.key === 'step' ? 'The step the OmniScript is on now\n' : '') +
      `${element.name} — ${element.type}` +
      (element.label ? '\n' + (element.label.length > 300 ? element.label.slice(0, 300) + '…' : element.label) : '') +
      (hint ? `\n${hint}` : '');
  }

  function progressOf(element) {
    return state.progress[element.key] || null;
  }

  function listHeader() {
    const row = document.createElement('div');
    row.className = 'list-row list-head el-row el-head';

    const spacer = document.createElement('span');
    spacer.className = 'twisty el-twisty is-leaf';
    row.appendChild(spacer);
    /* Four visible names in the list's header style: Element over the names, Marks (right-aligned,
     * and the button that opens the legend) over the marks cell, Next over the glyphs. */
    [
      ['el-icon', '', 'Element family; hover a row for its exact type'],
      ['list-name el-name', 'Element', 'The elements of the script, in script order. Hover a row for its exact type'],
      ['el-marks el-legend-btn', 'Marks', LEGEND],
      ['el-verdict', 'Valid', verdictHeaderTitle(state.data !== undefined)]
    ].forEach(([className, text, title]) => {
      const legend = text === 'Marks';
      const cellEl = document.createElement(legend ? 'button' : 'span');
      cellEl.className = className;
      cellEl.textContent = text;
      cellEl.title = title;
      if (legend) { cellEl.type = 'button'; wireLegend(cellEl); }
      row.appendChild(cellEl);
    });
    return row;
  }

  function toggleFold(element) {
    if (state.collapsed.has(element.key)) state.collapsed.delete(element.key);
    else state.collapsed.add(element.key);
    state.handFolded.add(element.key); // a hand-made choice: auto-collapse leaves it alone
    renderList();
  }

  /* The step the script is on, found once per draw: its row and every row inside it are one tinted block. */
  let currentStepKey = '';

  function renderRow(element, verdict) {
    const row = document.createElement('div');
    row.className = 'list-row el-row';
    row.dataset.rowKey = element.key;
    row.setAttribute('aria-level', String(element.depth + 1));
    /* What the stylesheet needs to show which elements sit under which: the
     * indent guides read --depth, and every row lists all its ancestors so the
     * rows of a whole subtree can be found at any depth. */
    row.dataset.depth = String(element.depth);
    row.dataset.parent = element.parentKey || '';
    row.dataset.ancestors = ancestorKeys(element, byKey()).join(' ');
    if (element.hasChildren) row.dataset.container = '1';
    if (element.key === state.menuKey) row.classList.add('is-menu-target'); // its right-click menu is open
    row.style.setProperty('--depth', String(element.depth));
    if (element.key === state.selectedKey) {
      row.classList.add('is-selected');
    } else if (isWithin(row.dataset.ancestors, state.selectedKey)) {
      /* Everything inside the selected section, at any depth, in one tint,
       * with a bracket in the guide column of the section itself. */
      row.classList.add('is-in-group');
      row.style.setProperty('--sel-depth', String(selectedDepth()));
    }

    const progress = progressOf(element);
    if (progress) row.classList.add(`is-${progress}`);
    /* The step the script is on is told by its row: a bar on its left edge (the stylesheet). */
    if (progress === 'current' && element.category.key === 'step') row.setAttribute('aria-current', 'step');
    if (currentStepKey && (element.key === currentStepKey || isWithin(row.dataset.ancestors, currentStepKey))) row.classList.add('is-current-block');

    const twisty = document.createElement('span');
    twisty.className = 'twisty el-twisty';
    twisty.setAttribute('aria-hidden', 'true');
    twisty.style.marginLeft = `${element.depth * 12}px`;
    if (element.hasChildren) {
      const folded = state.collapsed.has(element.key);
      twisty.appendChild(svgIcon('chevron-right'));
      if (!folded) twisty.classList.add('is-open');
      row.classList.add('is-section');
      twisty.title = folded ? 'Expand section' : 'Collapse section';
      row.setAttribute('aria-expanded', String(!folded)); // keyboard: Left / Right on the row
      twisty.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleFold(element);
      });
    } else {
      twisty.classList.add('is-leaf');
    }
    row.appendChild(twisty);

    const icon = document.createElement('span');
    icon.className = `el-icon is-${element.category.key}`;
    icon.appendChild(svgIcon(element.category.icon));
    icon.title = `${element.category.label} — ${element.type}`;
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', icon.title);
    row.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'list-name el-name';
    name.textContent = element.name;
    /* The label is a gloss on the name: dimmed so the names scan. The text stays "Name (Label)". */
    if (element.label) {
      const gloss = document.createElement('span');
      gloss.className = 'el-label';
      gloss.textContent = ` (${element.label})`;
      name.appendChild(gloss);
    }
    const hint = hintOf(element);
    name.title = nameTitle(element, hint, progress);
    if (element.missingLabels.length) row.classList.add('is-broken');
    row.appendChild(name);

    /* A folded section says how much it holds. */
    if (element.hasChildren && state.collapsed.has(element.key)) {
      const count = childCounts(state.elements).get(element.key) || 0;
      const label = document.createElement('span');
      label.className = 'el-count';
      label.textContent = `(${count})`;
      label.title = `${count} ${count === 1 ? 'element' : 'elements'} inside, folded`;
      row.classList.add('has-count');
      row.appendChild(label);
    }

    /* The marks, in their own cell against the Next cell (empty on a plain row, which keeps the divider). */
    const marks = document.createElement('span');
    marks.className = 'el-marks';
    if (isCertainlyHidden(element)) {
      row.classList.add('is-hidden');
      marks.appendChild(tag('hidden', hiddenTitle(explain(element).headline, element.conditional ? element.showExpr : '')));
    }
    if (element.required) marks.appendChild(tag('req', 'Required'));
    if (showsRuleMark(element, isCertainlyHidden(element))) {
      /* The same sentence the Visibility tab opens with, then the rule itself. */
      marks.appendChild(tag('cond', ruleTitle(element.showExpr, explain(element).headline)));
    }
    if (element.override) marks.appendChild(tag('override', overrideTitle(element)));
    if (element.remote) marks.appendChild(tag('act', `Calls ${element.remote}`));
    if (progress === 'current' && element.category.key === 'step') {
      const badge = stopBadge(stopCount(element));
      if (badge) marks.appendChild(badge);
    }

    if (element.missingLabels.length) {
      marks.appendChild(tag('missing',
        (element.missingLabels.length === 1
          ? `Custom label "${element.missingLabels[0].key}" (${element.missingLabels[0].where})`
          : `${element.missingLabels.length} custom labels`) +
        ' missing from allCustomLabels — the OmniScript will not render correctly:\n' +
        element.missingLabels.map((m) => `• ${m.where}: ${m.key}`).join('\n')));
    }

    if (hint) marks.appendChild(tag('type', hint));
    row.appendChild(marks);

    row.appendChild(verdictCell(verdict));

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
    row.addEventListener('contextmenu', (ev) => rowMenu(ev, element, row));

    return row;
  }

  /* Tree keys on a row: Right unfolds a section (or steps into it), Left folds
   * it (or steps out to the parent). */
  function onTreeKey(ev, row) {
    if (ev.key === 'Escape') {
      if (!state.selectedKey) return false;
      deselect();
      return true;
    }
    const element = state.elements.find((candidate) => candidate.key === row.dataset.rowKey);
    if (!element || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return false;

    const expandable = row.hasAttribute('aria-expanded');
    const open = row.getAttribute('aria-expanded') === 'true';
    if (ev.key === 'ArrowRight') {
      if (expandable && !open) toggleFold(element);
      else if (expandable) {
        const next = row.nextElementSibling;
        if (next && next.classList.contains('el-row')) lb().moveTo(next);
      }
      return true;
    }
    if (expandable && open) { toggleFold(element); return true; }
    const parent = element.parentKey && lb().rows().find((r) => r.dataset.rowKey === element.parentKey);
    if (parent) lb().moveTo(parent);
    return true;
  }

  /* el.list is only set at mount, after this factory ran, hence lazy. */
  let listbox = null;
  const lb = () => { listbox = listbox || enhanceList(el.list, { role: 'tree', label: 'Elements', onKey: onTreeKey }); return listbox; };

  /* The list is emptied and refilled, and measuring the header while it holds
   * only the header (pinStepHeaders) makes the browser clamp the scroll position
   * to the top. A pick, a poll or a fold must leave the view where it was, so the
   * position is put back once the rows are in. */
  function renderList() {
    const list = el.list;
    const top = list.scrollTop;
    lb().around(drawList);
    /* The column header holds the legend button, so it is not hidden from
     * assistive technology like a plain header row. */
    const head = list.querySelector('.list-head');
    if (head) { head.removeAttribute('aria-hidden'); head.setAttribute('role', 'group'); head.setAttribute('aria-label', 'Columns'); }
    if (top > 0 && list.scrollTop !== top) list.scrollTop = top;
  }

  /* How deep the selected section sits: where its bracket is drawn. */
  function selectedDepth() {
    const selected = byKey()[state.selectedKey];
    return selected ? selected.depth : 0;
  }

  /* Hovering a section header marks everything inside it, at any depth, and
   * lights its own guide: a second, lighter bracket on top of the selected
   * one. Class toggles only; one listener for the whole list. */
  function markGroup(list, key, depth) {
    if (list.__groupKey === key) return;
    list.__groupKey = key;
    list.querySelectorAll('.el-row.is-hover-group').forEach((row) => {
      row.classList.remove('is-hover-group');
      row.style.removeProperty('--hover-depth');
    });
    if (!key) return;
    list.querySelectorAll('.el-row').forEach((row) => {
      if (!isWithin(row.dataset.ancestors, key)) return;
      row.classList.add('is-hover-group');
      row.style.setProperty('--hover-depth', String(depth));
    });
  }

  function wireGroupHover(list) {
    if (list.__groupHover) return;
    list.__groupHover = true;
    list.addEventListener('mouseover', (ev) => {
      const row = ev.target.closest ? ev.target.closest('.el-row') : null;
      const header = row && row.dataset.container === '1';
      markGroup(list, header ? row.dataset.rowKey : null, header ? Number(row.dataset.depth) : 0);
    });
    list.addEventListener('mouseleave', () => markGroup(list, null));
  }

  /* A step's row stays pinned just under the column header while its rows scroll
   * (the stylesheet does the pinning, from --struct-head-h): how tall the column
   * header is, measured once it is in the list. Left alone while the list is not
   * laid out (a hidden tab measures 0). */
  function pinStepHeaders(list, head) {
    const height = head.offsetHeight;
    if (height > 0) list.style.setProperty('--struct-head-h', `${height}px`);
  }

  /* One line in the list: what matched nothing, and a way back. */
  function noMatchLine() {
    const box = document.createElement('div');
    box.className = 'notice is-one-line struct-no-match';
    box.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = noMatchText({ query: state.filter, actionsOnly: state.actionsOnly, visibleOnly: state.visibleOnly });
    box.appendChild(text);
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.id = 'struct-clear-filter';
    clear.className = 'icon-btn tiny';
    clear.textContent = 'Clear filter';
    clear.title = 'Empty the filter box and untick Actions only and Visible only';
    clear.addEventListener('click', clearFilters);
    box.appendChild(clear);
    return box;
  }

  function drawList() {
    const list = el.list;
    wireGroupHover(list);
    list.__groupKey = null; // the rows below are new: nothing is marked
    list.textContent = '';

    if (state.error) {
      list.appendChild(notice('Could not read the definition', state.error, true));
      return;
    }

    if (!Targets.selected()) {
      list.appendChild(emptyCard(state.defProp));
      return;
    }

    if (!state.elements.length) {
      const box = notice('Nothing on ' + state.defProp,
        'This OmniScript exposes no definition on that property. Change the Definition property in Settings, under Data, in Reading another page, if your build names it differently.',
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
      list.appendChild(noMatchLine());
      return;
    }

    /* Folding works with a filter on, too: a folded section hides its
     * matches, which come back when it is unfolded. */
    const withParents = withContext(state.elements, rows);
    rows = withoutFolded(withParents.rows, byKey(), state.collapsed);

    const head = listHeader();
    list.appendChild(head);
    pinStepHeaders(list, head);
    const verdictsNow = verdicts();
    currentStepKey = (state.elements.find((candidate) => state.progress[candidate.key] === 'current' && candidate.category.key === 'step') || {}).key || '';
    rows.forEach((element) => {
      const row = renderRow(element, verdictsNow[element.key]);
      /* A step or block kept only so its matches have a place to sit. */
      if (withParents.context.has(element.key)) row.classList.add('is-context');
      list.appendChild(row);
    });
  }

  /* A small red count on the step the script is on: how many things may stop
   * Next (required fields that are empty, Set Errors firing). null for none. */
  function stopBadge(count) {
    if (!count) return null;
    const badge = document.createElement('span');
    badge.className = 'el-badge';
    badge.textContent = String(count);
    badge.title = `${count} ${count === 1 ? 'thing may' : 'things may'} stop Next on this step right now; see its Validation tab`;
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `${count} ${count === 1 ? 'thing may' : 'things may'} stop Next`);
    return badge;
  }

  /* Keeps the count current without redrawing the list: called after the data
   * changes. Only the step the script is on carries one. */
  function refreshBadge() {
    const list = el.list;
    if (!list) return;
    const current = state.elements.find((element) => state.progress[element.key] === 'current' &&
      element.category.key === 'step');
    list.querySelectorAll('.el-badge').forEach((badge) => {
      const row = badge.closest('.el-row');
      if (!current || !row || row.dataset.rowKey !== current.key) badge.remove();
    });
    if (!current) return;
    const row = [...list.querySelectorAll('.el-row')].find((candidate) => candidate.dataset.rowKey === current.key);
    if (!row) return;
    const existing = row.querySelector('.el-badge');
    const next = stopBadge(stopCount(current));
    if (!next) { if (existing) existing.remove(); return; }
    if (existing) {
      if (existing.textContent === next.textContent) return;
      existing.replaceWith(next);
    } else {
      /* Where it sits today: before the missing-label and type marks, which come last. */
      row.querySelector('.el-marks').insertBefore(next, row.querySelector('.el-marks .tag-missing, .el-marks .tag-type'));
    }
  }

  /* Keeps the Valid column current without redrawing the list: called after the
   * data changes, with the same verdicts a redraw would draw. */
  function refreshVerdicts() {
    const list = el.list;
    if (!list) return;
    const now = verdicts();
    list.querySelectorAll('.el-row[data-row-key] .el-verdict').forEach((cell) => {
      setVerdict(cell, now[cell.parentNode.dataset.rowKey]);
    });
    const head = list.querySelector('.el-head .el-verdict');
    const title = verdictHeaderTitle(state.data !== undefined);
    if (head && head.title !== title) head.title = title;
  }

  /* Which variant of the shared tag family draws a mark; the mark itself (its icon, its name) is core/structure/row-marks.js. */
  const TAG_TONE = { req: 'neutral', cond: 'neutral', act: 'neutral', missing: 'error', hidden: 'neutral', type: 'warn', override: 'neutral' };

  /* Keeps the type hints current without redrawing the list: called after the
   * data changes. A hint appears, changes or goes in place on its row. */
  function refreshHints() {
    if (!el.list) return;
    el.list.querySelectorAll('.el-row[data-row-key]').forEach((row) => {
      const element = byKey()[row.dataset.rowKey];
      if (!element) return;
      const hint = hintOf(element);
      const chip = row.querySelector('.tag-type');
      const name = row.querySelector('.el-name');
      if (name) {
        const title = nameTitle(element, hint, progressOf(element));
        if (name.title !== title) name.title = title;
      }
      if (!hint) { if (chip) chip.remove(); return; }
      if (chip && chip.title === hint) return;
      const next = tag('type', hint);
      if (chip) chip.replaceWith(next); else row.querySelector('.el-marks').appendChild(next);
    });
  }

  function tag(kind, title) {
    const mark = ROW_MARKS[kind];
    const span = document.createElement('span');
    span.className = `${tagClasses(TAG_TONE[kind])} tag-${kind}${mark.icon ? ' tag-icon' : ''}`;
    if (mark.icon) span.appendChild(svgIcon(mark.icon)); else span.textContent = mark.text;
    span.title = title;
    span.setAttribute('role', 'img');
    const name = mark.name;
    span.setAttribute('aria-label', title === name ? name : `${name}: ${title}`);
    return span;
  }

  return { renderList, refreshBadge, refreshHints, refreshVerdicts };
}
