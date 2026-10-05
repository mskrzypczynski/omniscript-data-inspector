'use strict';

import { applyAutoCollapse } from '../../src/core/auto-collapse.js';

const step = (key, hasChildren = true) => ({ key, hasChildren, category: { key: 'step' } });
const sets = () => ({ collapsed: new Set(), autoFolded: new Set(), handFolded: new Set() });

describe('applyAutoCollapse', () => {
  const elements = [step('a'), step('b'), step('c'), { key: 'f', hasChildren: false, category: { key: 'input' } }];

  it('folds passed steps once and leaves the current and pending ones open', () => {
    const s = sets();
    const changed = applyAutoCollapse(elements, { a: 'done', b: 'current', c: 'pending' }, s);
    expect(changed).toBe(true);
    expect([...s.collapsed]).toEqual(['a']);
    expect(applyAutoCollapse(elements, { a: 'done', b: 'current', c: 'pending' }, s)).toBe(false);
  });

  it('treats a skipped step as passed', () => {
    const s = sets();
    applyAutoCollapse(elements, { a: 'skipped' }, s);
    expect(s.collapsed.has('a')).toBe(true);
  });

  it('opens a folded step again when the script returns to it', () => {
    const s = sets();
    applyAutoCollapse(elements, { a: 'done', b: 'current' }, s);
    expect(applyAutoCollapse(elements, { a: 'current', b: 'pending' }, s)).toBe(true);
    expect(s.collapsed.size).toBe(0);
  });

  it('never touches a section the user folded or unfolded by hand', () => {
    const s = sets();
    s.handFolded.add('a');
    expect(applyAutoCollapse(elements, { a: 'done' }, s)).toBe(false);
    expect(s.collapsed.size).toBe(0);

    s.handFolded.add('b');
    s.collapsed.add('b');
    applyAutoCollapse(elements, { b: 'current' }, s);
    expect(s.collapsed.has('b')).toBe(true);
  });

  it('ignores steps without children and elements that are not steps', () => {
    const s = sets();
    expect(applyAutoCollapse([step('x', false), elements[3]], { x: 'done', f: 'done' }, s)).toBe(false);
  });
});
