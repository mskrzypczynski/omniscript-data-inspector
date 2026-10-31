'use strict';

import {
  viewOptions, viewCount, viewButtonTitle, moreEntries, followNote, FOLLOW_PAUSED_NOTE
} from '../../../src/core/structure/toolbar-menus.js';

const all = () => true;
const only = (...gates) => (gate) => gates.includes(gate);

describe('viewOptions', () => {
  it('lists the four switches in menu order when every gate is open', () => {
    expect(viewOptions(all, {}).map((option) => option.label))
      .toEqual(['Actions only', 'Collapse done steps', 'Highlight on hover', 'Visible only']);
  });

  it('leaves out a switch whose gate is closed', () => {
    expect(viewOptions(only(), {}).map((option) => option.key)).toEqual(['hover', 'visibleOnly']);
    expect(viewOptions(only('structure.steps'), {}).map((option) => option.key))
      .toEqual(['autoCollapse', 'hover', 'visibleOnly']);
  });

  it('reads each state from the values, off when missing', () => {
    const options = viewOptions(all, { hover: true, visibleOnly: false });
    expect(options.find((option) => option.key === 'hover').checked).toBe(true);
    expect(options.find((option) => option.key === 'visibleOnly').checked).toBe(false);
    expect(options.find((option) => option.key === 'actionsOnly').checked).toBe(false);
  });

  it('gives every switch a tooltip', () => {
    viewOptions(all, {}).forEach((option) => expect(option.title.length).toBeGreaterThan(10));
  });
});

describe('viewCount and viewButtonTitle', () => {
  it('counts the switches that are on', () => {
    expect(viewCount(viewOptions(all, {}))).toBe(0);
    expect(viewCount(viewOptions(all, { hover: true, actionsOnly: true }))).toBe(2);
  });

  it('does not count a switch the build does not have', () => {
    expect(viewCount(viewOptions(only(), { actionsOnly: true, autoCollapse: true }))).toBe(0);
  });

  it('says what the menu holds in this build, and how many are on, in the tooltip', () => {
    expect(viewButtonTitle(viewOptions(all, {}))).toMatch(/Actions only, Collapse done steps, Highlight on hover and Visible only$/);
    expect(viewButtonTitle(viewOptions(only(), {}))).toMatch(/: Highlight on hover and Visible only$/);
    expect(viewButtonTitle(viewOptions(all, { hover: true }))).toMatch(/1 switch is on$/);
    expect(viewButtonTitle(viewOptions(all, { hover: true, visibleOnly: true, actionsOnly: true }))).toMatch(/3 switches are on$/);
  });
});

describe('moreEntries', () => {
  it('lists Timeline, Compare and Export by their gates', () => {
    expect(moreEntries(all)).toEqual(['timeline', 'compare', 'export']);
    expect(moreEntries(only('structure.export'))).toEqual(['export']);
    expect(moreEntries(only('structure.timeline', 'structure.compare-definition'))).toEqual(['timeline', 'compare']);
  });

  it('is empty in Free, so no button is drawn', () => {
    expect(moreEntries(only())).toEqual([]);
  });
});

describe('followNote', () => {
  it('is empty while following and a sentence while paused', () => {
    expect(followNote(false)).toBe('');
    expect(followNote(true)).toBe(FOLLOW_PAUSED_NOTE);
  });
});
