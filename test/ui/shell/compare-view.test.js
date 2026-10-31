'use strict';

/* The side by side comparison on its own: the head, the two panes lined up,
 * the gaps and folds, Previous / Next and the foot, the keys, List and back,
 * Show unchanged, the one-pane view of a narrow panel, Mask values and Copy. */

import { jest } from '@jest/globals';

let createCompareView;
let forgetCompareViews;
let Mask;
let maskValues;

beforeEach(async () => {
  jest.resetModules();
  ({ createCompareView, forgetCompareViews } = await import('../../../src/ui/compare-view.js'));
  ({ Mask } = await import('../../../src/ui/mask-setting.js'));
  ({ maskValues } = await import('../../../src/core/shared/mask.js'));
  forgetCompareViews();
});

afterEach(() => { document.body.innerHTML = ''; });

const BEFORE = {
  Applicant: {
    K1: 1, K2: 2, K3: 3, Flag: false, Plan: 'Standard', LegacyId: 'A-1024',
    Coverages: [{ Id: 'c1', Limit: 1 }, { Id: 'c2', Limit: 50000 }]
  }
};
const AFTER = {
  Applicant: {
    K1: 1, K2: 2, K3: 3, Flag: true, Plan: 'Gold', Discount: 10,
    Coverages: [{ Id: 'c1', Limit: 1 }, { Id: 'c2', Limit: 75000 }, { Id: 'c3', Limit: 20000 }]
  }
};

function draw(options = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = createCompareView({
    host, before: BEFORE, after: AFTER, titles: { before: 'Before: read at 10:44:30', after: 'After: read at 10:44:32' }, surface: 'test', ...options
  });
  return { host, view, root: view.element };
}

const press = (target, key, init = {}) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
const lines = (root, pane) => [...root.querySelectorAll(`.${pane} > .cmp-row`)].map((row) => {
  if (row.classList.contains('is-gap')) return '░';
  return `${row.querySelector('.cmp-n').textContent}|${row.querySelector('.cmp-t').textContent}`;
});
const foot = (root) => root.querySelector('.cmp-foot').textContent;
const current = (root) => [...root.querySelectorAll('.cmp-row.is-current')].map((row) => row.querySelector('.cmp-t').textContent);

describe('the two panes', () => {
  it('line the rows up, with gaps for a row only one side has and the unchanged keys folded', () => {
    const { root } = draw();
    expect(lines(root, 'cmp-pane-before')).toEqual([
      '1|▾{', '2|▾Applicant: {', '|… 3 unchanged keys', '6|Flag: false', '7|Plan: "Standard"', '░', '8|LegacyId: "A-1024"',
      '9|▾Coverages: [', '10|▸|1: { Id: "c1", Limit: 1 }', '14|▾|2: {', '15|Id: "c2"', '16|Limit: 50000', '17|}', '░', '18|]', '19|}', '20|}'
    ]);
    expect(lines(root, 'cmp-pane-after')).toEqual([
      '1|▾{', '2|▾Applicant: {', '|… 3 unchanged keys', '6|Flag: true', '7|Plan: "Gold"', '8|Discount: 10', '░',
      '9|▾Coverages: [', '10|▸|1: { Id: "c1", Limit: 1 }', '14|▾|2: {', '15|Id: "c2"', '16|Limit: 75000', '17|}', '18|▸|3: { Id: "c3", Limit: 20000 }', '22|]', '23|}', '24|}'
    ]);
    const before = root.querySelector('.cmp-pane-before');
    expect(before.getAttribute('role')).toBe('region');
    expect(before.getAttribute('aria-label')).toBe('Before: read at 10:44:30');
    expect(before.querySelector('.cmp-ph').textContent).toBe('Beforeread at 10:44:30');
    expect(root.querySelectorAll('.cmp-pane-after .cmp-row.is-added')).toHaveLength(2);
    expect(root.querySelectorAll('.cmp-pane-before .cmp-row.is-removed')).toHaveLength(1);
    expect(root.querySelectorAll('.cmp-pane-before .cmp-row.is-changed')).toHaveLength(3);
  });

  it('counts the differences in the head and marks a short value whole', () => {
    const { root } = draw();
    expect([...root.querySelectorAll('.cmp-pill')].map((pill) => [pill.textContent, pill.className])).toEqual([
      ['3 changed', 'tag tag-warn cmp-pill is-changed'], ['2 added', 'tag tag-ok cmp-pill is-added'], ['1 removed', 'tag tag-error cmp-pill is-removed']
    ]);
    const flag = root.querySelector('.cmp-pane-before .cmp-row.is-changed .diff-hl');
    expect(flag.textContent).toBe('false');
    expect(root.querySelector('.cmp-pane-after .cmp-row.is-changed .diff-hl').textContent).toBe('true');
  });

  it('opens a fold on a click, and a closed branch too', () => {
    const { root } = draw();
    root.querySelector('.cmp-pane-after .cmp-fold').click();
    expect(lines(root, 'cmp-pane-after').slice(2, 5)).toEqual(['3|K1: 1', '4|K2: 2', '5|K3: 3']);
    const added = [...root.querySelectorAll('.cmp-pane-after .cmp-row.is-added')].find((row) => row.textContent.includes('|3'));
    added.click();
    expect(lines(root, 'cmp-pane-after')).toEqual(expect.arrayContaining(['18|▾|3: {', '19|Id: "c3"', '20|Limit: 20000', '21|}']));
    expect(lines(root, 'cmp-pane-before').filter((line) => line === '░')).toHaveLength(5);
  });

  it('says so in one line, with no panes, when nothing differs, unless Show unchanged is on', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = createCompareView({ host, before: { a: 1 }, after: { a: 1 }, heading: 'Options', surface: 'same' });
    expect(view.element.querySelector('.cmp-head').textContent).toBe('OptionsIdentical Show unchanged');
    expect(view.element.querySelector('.cmp-panes')).toBeNull();
    const box = view.element.querySelector('.cmp-unchanged input');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(lines(view.element, 'cmp-pane-after')).toEqual(['1|▾{', '2|a: 1', '3|}']);
  });
});

describe('the head: one row with the title and counts on the left, the tools as one group on the right', () => {
  it('holds the title and the count chips in the summary and every tool in one group after it', () => {
    const { root } = draw({ heading: 'Payload' });
    const head = root.querySelector('.cmp-head');
    expect([...head.children].map((node) => node.className)).toEqual(['cmp-summary', 'cmp-tools']);
    const summary = head.querySelector('.cmp-summary');
    expect(summary.querySelector('.cmp-title').textContent).toBe('Payload');
    expect([...summary.querySelectorAll('.cmp-pill')].length).toBeGreaterThan(0);
    expect(summary.querySelector('button')).toBeNull();
    const tools = head.querySelector('.cmp-tools');
    expect([...tools.children].map((node) => node.className.split(' ').find((name) => /^cmp-(nav|mode|unchanged|copy)$/.test(name)))).toEqual(
      ['cmp-nav', 'cmp-mode', 'cmp-unchanged', 'cmp-copy']
    );
  });

  it('has Previous and Next as one small pair with names and tooltips for a screen reader', () => {
    const { root } = draw();
    const pair = root.querySelector('.cmp-nav');
    expect(pair.getAttribute('role')).toBe('group');
    expect(pair.getAttribute('aria-label')).toBe('Differences');
    const prev = pair.querySelector('.cmp-prev');
    const next = pair.querySelector('.cmp-next');
    expect([prev.textContent, next.textContent]).toEqual(['‹', '›']);
    expect([prev.getAttribute('aria-label'), next.getAttribute('aria-label')]).toEqual(['Previous difference', 'Next difference']);
    expect([prev.title, next.title]).toEqual(['Previous difference (↑)', 'Next difference (↓)']);
  });

  it('keeps the pair out of List, where no difference is current', () => {
    const { root } = draw();
    root.querySelector('.cmp-mode-list').click();
    expect(root.querySelector('.cmp-nav')).toBeNull();
    expect(root.querySelector('.cmp-tools .cmp-mode')).not.toBeNull();
    expect(root.querySelector('.cmp-tools .cmp-copy')).not.toBeNull();
  });

  it('lets the tools wrap below as one group: the stylesheet keeps them together and pushes them right', () => {
    const { readFileSync } = jest.requireActual('node:fs');
    const css = readFileSync(new URL('../../../panel.css', import.meta.url), 'utf8');
    const rule = (selector) => css.match(new RegExp(`^${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`, 'm'))[0];
    expect(rule('.cmp-head')).toMatch(/flex-wrap: wrap/);
    expect(rule('.cmp-tools')).toMatch(/flex-wrap: nowrap/);
    expect(rule('.cmp-tools')).toMatch(/margin-left: auto/);
    expect(rule('.cmp-summary')).toMatch(/flex: 1 1 auto/);
  });
});

describe('Previous, Next and the foot', () => {
  it('go from difference to difference, outline it and name it', () => {
    const { root } = draw();
    expect(foot(root)).toBe('6 differences · Next (↓) goes to the first');
    expect(root.querySelector('.cmp-prev').disabled).toBe(true);
    root.querySelector('.cmp-next').click();
    expect(foot(root)).toBe('Difference 1 of 6 · Applicant:Flag changed: false → true');
    expect(current(root)).toEqual(['Flag: false', 'Flag: true']);
    root.querySelector('.cmp-next').click();
    root.querySelector('.cmp-next').click();
    expect(foot(root)).toBe('Difference 3 of 6 · Applicant:Discount added: 10');
    expect(current(root)).toEqual(['Discount: 10']);
    root.querySelector('.cmp-prev').click();
    expect(foot(root)).toBe('Difference 2 of 6 · Applicant:Plan changed: "Standard" → "Gold"');
  });

  it('open a closed branch to reach the difference inside it', () => {
    const { root } = draw();
    // Close Coverages by its line.
    [...root.querySelectorAll('.cmp-pane-before .cmp-row')].find((row) => row.textContent.includes('Coverages')).click();
    expect(root.textContent).not.toContain('50000');
    const body = root.querySelector('.cmp-body');
    press(body, 'End');
    expect(foot(root)).toBe('Difference 6 of 6 · row Applicant:Coverages Id=c3 added');
    press(body, 'ArrowUp');
    expect(foot(root)).toBe('Difference 5 of 6 · Applicant:Coverages|2:Limit changed: 50000 → 75000');
    expect(current(root)).toEqual(['Limit: 50000', 'Limit: 75000']);
  });
});

describe('keys', () => {
  it('Up and Down move the current difference, Home and End go to the ends', () => {
    const { root } = draw();
    const body = root.querySelector('.cmp-body');
    body.focus();
    press(body, 'ArrowDown');
    expect(foot(root)).toMatch(/^Difference 1 of 6/);
    expect(document.activeElement).toBe(root.querySelector('.cmp-body'));
    press(root.querySelector('.cmp-body'), 'ArrowDown');
    expect(foot(root)).toMatch(/^Difference 2 of 6/);
    press(root.querySelector('.cmp-body'), 'End');
    expect(foot(root)).toMatch(/^Difference 6 of 6/);
    press(root.querySelector('.cmp-body'), 'ArrowDown');
    expect(foot(root)).toMatch(/^Difference 6 of 6/);
    press(root.querySelector('.cmp-body'), 'Home');
    expect(foot(root)).toMatch(/^Difference 1 of 6/);
  });

  it('Left closes the branch of the current row and Right opens it again', () => {
    const { root } = draw();
    const key = (name) => press(root.querySelector('.cmp-body'), name);
    key('End');
    key('ArrowUp'); // Coverages|2:Limit
    key('ArrowLeft');
    expect(current(root)).toEqual(['|2: { Id: "c2", Limit: 50000 }', '|2: { Id: "c2", Limit: 75000 }'].map((text) => `▸${text}`));
    expect(foot(root)).toBe('Applicant:Coverages|2 · ←/→ close or open, ↑/↓ the differences');
    key('ArrowRight');
    expect(root.textContent).toContain('Limit: 50000');
    // From the branch line, Down goes to the first difference inside it.
    key('ArrowDown');
    expect(foot(root)).toMatch(/^Difference 5 of 6/);
    key('ArrowDown');
    expect(foot(root)).toMatch(/^Difference 6 of 6/);
    key('Enter'); // opens the added row
    expect(lines(root, 'cmp-pane-after')).toContain('19|Id: "c3"');
  });

  it('Enter opens a fold', () => {
    const { root } = draw();
    const fold = root.querySelector('.cmp-pane-after .cmp-fold');
    expect(fold.tagName).toBe('BUTTON');
    fold.click();
    expect(root.textContent).toContain('K2: 2');
  });
});

describe('List and Show unchanged', () => {
  it('List shows the differences as blocks and the choice is kept for the surface', () => {
    const { root } = draw();
    root.querySelector('.cmp-mode-list').click();
    expect(root.querySelector('.cmp-panes')).toBeNull();
    expect(root.querySelector('.cmp-prev')).toBeNull();
    const blocks = [...root.querySelectorAll('.cmp-list .diff-line .diff-name')].map((node) => node.textContent);
    expect(blocks).toEqual(['Applicant:Flag', 'Applicant:Plan', 'Applicant:Discount', 'Applicant:LegacyId', 'Applicant:Coverages|2:Limit', 'row Applicant:Coverages|3']);
    expect(root.querySelector('.cmp-mode-list').getAttribute('aria-pressed')).toBe('true');
    // A view drawn again on the same surface opens on List; another surface on Side by side.
    expect(draw().root.querySelector('.cmp-list')).not.toBeNull();
    expect(draw({ surface: 'other' }).root.querySelector('.cmp-panes')).not.toBeNull();
    root.querySelector('.cmp-mode-side').click();
    expect(root.querySelector('.cmp-panes')).not.toBeNull();
  });

  it('Show unchanged draws the folded lines', () => {
    const { root } = draw();
    const box = root.querySelector('.cmp-unchanged input');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(root.querySelector('.cmp-fold')).toBeNull();
    expect(lines(root, 'cmp-pane-before').slice(2, 5)).toEqual(['3|K1: 1', '4|K2: 2', '5|K3: 3']);
    expect(document.activeElement).toBe(root.querySelector('.cmp-unchanged input'));
  });
});

describe('a narrow panel', () => {
  it('turns the two panes into one, Before above After for a change', () => {
    const { root, view } = draw();
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 480 });
    expect(view.layout()).toBe(true);
    expect(root.querySelectorAll('.cmp-pane')).toHaveLength(1);
    const pane = root.querySelector('.cmp-pane-both');
    expect(pane.getAttribute('aria-label')).toBe('Before: read at 10:44:30 and After: read at 10:44:32');
    const unified = [...pane.querySelectorAll('.cmp-row')].map((row) => `${[...row.classList].filter((name) => name !== 'cmp-row').join('.')} ${row.querySelector('.cmp-t').textContent}`);
    expect(unified.slice(3, 9)).toEqual([
      'is-removed.is-before Flag: false', 'is-added.is-after Flag: true',
      'is-removed.is-before Plan: "Standard"', 'is-added.is-after Plan: "Gold"',
      'is-added.is-after Discount: 10', 'is-removed.is-before LegacyId: "A-1024"'
    ]);
    expect(pane.querySelector('.is-gap')).toBeNull();
    Object.defineProperty(root, 'clientWidth', { configurable: true, get: () => 1000 });
    expect(view.layout()).toBe(true);
    expect(root.querySelectorAll('.cmp-pane')).toHaveLength(2);
  });
});

describe('Mask values and Copy', () => {
  it('masks what is shown through the mask given, and draws again in place when Mask values changes', () => {
    const { root } = draw({ mask: (value) => Mask.apply(value) });
    expect(root.textContent).toContain('"Standard"');
    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    Mask.mount(box);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(root.isConnected).toBe(true);
    expect(root.textContent).not.toMatch(/Standard|Gold|A-1024|50000/);
    expect(root.textContent).toContain('"<string>"');
    expect(root.textContent).toContain('Flag: false');
    root.querySelector('.cmp-next').click();
    root.querySelector('.cmp-next').click();
    expect(foot(root)).toBe('Difference 2 of 6 · Applicant:Plan changed: "<string>" → "<string>"');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(root.textContent).toContain('"Standard"');
  });

  it('copies the differences as JSON, masked while Mask values is on', () => {
    const copies = [];
    const { root } = draw({ onCopy: (text) => copies.push(text) });
    root.querySelector('.cmp-copy').click();
    const first = JSON.parse(copies[0]);
    expect(first.map((change) => `${change.kind} ${change.path}`)).toEqual([
      'changed Applicant:Flag', 'changed Applicant:Plan', 'added Applicant:Discount', 'removed Applicant:LegacyId',
      'changed Applicant:Coverages|2:Limit', 'row-added Applicant:Coverages|3'
    ]);
    expect(first[1]).toEqual({ path: 'Applicant:Plan', kind: 'changed', before: 'Standard', after: 'Gold' });
    expect(root.querySelector('.cmp-copy').title).toBe('Copy these differences as JSON. Honours Mask values.');

    const box = document.createElement('input');
    box.type = 'checkbox';
    document.body.appendChild(box);
    Mask.mount(box);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    root.querySelector('.cmp-copy').click();
    const masked = JSON.parse(copies[1]);
    expect(masked[1]).toEqual({ path: 'Applicant:Plan', kind: 'changed', before: maskValues('x'), after: maskValues('x') });
    expect(copies[1]).not.toMatch(/Standard|Gold|c3/);
    expect(masked[5].identity).toBe('Id=<string>');
  });
});
