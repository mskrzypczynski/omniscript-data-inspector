'use strict';

/* A change drawn as a block: path first, then a red before and a green after
 * with the differing span marked, long values folded behind "more". */

import { diffLine, diffLineText } from '../../../src/ui/diff-lines.js';

afterEach(() => { document.body.innerHTML = ''; });

const text = (node) => node.textContent;
const hl = (block, cls) => [...block.querySelectorAll(`.${cls} .diff-hl`)].map(text);

describe('diffLine blocks', () => {
  it('draws a changed value as the path, a before line and an after line', () => {
    const block = diffLine({ path: 'Step.Name', kind: 'changed', before: 'Ada Lovelace', after: 'Ada Byron' });
    expect(block.className).toBe('diff-line diff-block is-changed');
    expect([...block.children].map((child) => child.className)).toEqual(['diff-path', 'diff-before', 'diff-after']);
    expect(text(block.querySelector('.diff-glyph'))).toBe('~');
    expect(text(block.querySelector('.diff-name'))).toBe('Step.Name');
    expect(text(block.querySelector('.diff-before .diff-sign'))).toBe('−');
    expect(text(block.querySelector('.diff-after .diff-sign'))).toBe('+');
    expect(text(block.querySelector('.diff-before .diff-val'))).toBe('"Ada Lovelace"');
    expect(text(block.querySelector('.diff-after .diff-val'))).toBe('"Ada Byron"');
  });

  it('marks only the part that differs', () => {
    const block = diffLine({ path: 'A', kind: 'changed', before: 'order-1042-open', after: 'order-1042-closed' });
    expect(hl(block, 'diff-before')).toEqual(['open']);
    expect(hl(block, 'diff-after')).toEqual(['closed']);
  });

  it('marks a short value, a number, a flag or null whole', () => {
    const flag = diffLine({ path: 'A', kind: 'changed', before: false, after: true });
    expect(hl(flag, 'diff-before')).toEqual(['false']);
    expect(hl(flag, 'diff-after')).toEqual(['true']);
    const mixed = diffLine({ path: 'A', kind: 'changed', before: 1, after: 'x' });
    expect(hl(mixed, 'diff-before')).toEqual(['1']);
    expect(hl(mixed, 'diff-after')).toEqual(['"x"']);
    const plan = diffLine({ path: 'A', kind: 'changed', before: 'Standard', after: 'Gold' });
    expect(hl(plan, 'diff-after')).toEqual(['"Gold"']);
  });

  it('marks inside two long texts only, inside their quotes', () => {
    const block = diffLine({ path: 'A', kind: 'changed', before: 'aaaaaaaaaaaaaa', after: 'bbbbbbbbbbbbbb' });
    expect(hl(block, 'diff-before')).toEqual(['aaaaaaaaaaaaaa']);
    expect(text(block.querySelector('.diff-before .diff-val'))).toBe('"aaaaaaaaaaaaaa"');
  });

  it('draws an added or removed value on one line, with its glyph', () => {
    const added = diffLine({ path: 'A.B', kind: 'added', after: { x: 1 } });
    expect(text(added.querySelector('.diff-glyph'))).toBe('+');
    expect(added.querySelector('.diff-before')).toBe(null);
    expect(text(added.querySelector('.diff-after .diff-val'))).toBe('{"x":1}');
    expect(added.classList.contains('is-added')).toBe(true);

    const removed = diffLine({ path: 'A.B', kind: 'removed', before: [1, 2] });
    expect(text(removed.querySelector('.diff-glyph'))).toBe('−');
    expect(removed.querySelector('.diff-after')).toBe(null);
    expect(text(removed.querySelector('.diff-before .diff-val'))).toBe('[1,2]');
    expect(removed.classList.contains('is-removed')).toBe(true);
  });

  it('names a row and its identity on the first line', () => {
    const block = diffLine({ path: 'Rows|3', kind: 'row-removed', identity: 'Id=7', before: { Id: 7 } });
    expect(text(block.querySelector('.diff-name'))).toBe('row Rows|3');
    expect(text(block.querySelector('.diff-id'))).toBe('(Id=7)');
    expect(block.classList.contains('is-removed')).toBe(true);
  });

  it('masks the values and the row identity it draws', () => {
    const mask = (value) => (typeof value === 'string' ? '<string>' : value);
    const block = diffLine({ path: 'Rows|3', kind: 'row-added', identity: 'Id=7a', after: { Id: 'x' } }, (value) => (
      value && typeof value === 'object' ? { Id: mask(value.Id) } : mask(value)));
    expect(text(block.querySelector('.diff-id'))).toBe('(Id=<string>)');
    expect(text(block.querySelector('.diff-after .diff-val'))).toBe('{"Id":"<string>"}');
    expect(block.__change.after).toEqual({ Id: 'x' }); // the copy path masks from the raw change
  });

  it('keeps the one-line text for copying', () => {
    const change = { path: 'N', kind: 'changed', before: 1, after: 2 };
    expect(diffLineText(change)).toBe('~ N: 1 → 2');
    expect(diffLine(change).__change).toBe(change);
  });
});

describe('long values', () => {
  const long = (tail) => `${'a'.repeat(200)}${tail}`;

  it('folds a value longer than 160 characters behind a more button, and opens it', () => {
    const block = diffLine({ path: 'A', kind: 'added', after: long('END') });
    const line = block.querySelector('.diff-after');
    const button = line.querySelector('.diff-more');
    expect(button.textContent).toBe('more');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(text(line.querySelector('.diff-val')).length).toBeLessThan(170);
    expect(text(line.querySelector('.diff-val'))).not.toContain('END');
    button.click();
    expect(text(line.querySelector('.diff-val'))).toBe(JSON.stringify(long('END')));
    expect(button.textContent).toBe('less');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(button.textContent).toBe('more');
  });

  it('has no button on a short value', () => {
    expect(diffLine({ path: 'A', kind: 'added', after: 'short' }).querySelector('.diff-more')).toBe(null);
  });

  it('keeps the differing span in view when it sits near the end', () => {
    const block = diffLine({ path: 'A', kind: 'changed', before: long('one'), after: long('two') });
    const val = block.querySelector('.diff-before .diff-val');
    expect(text(val.querySelector('.diff-hl'))).toBe('one');
    expect(text(val).startsWith('…')).toBe(true);
    expect(block.querySelectorAll('.diff-more')).toHaveLength(2);
  });
});
