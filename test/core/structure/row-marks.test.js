'use strict';

import { ROW_MARKS, VERDICT_MARKS, KIND_LOOKS, hiddenTitle, ruleTitle, rowLegend, showsRuleMark, legendGroups } from '../../../src/core/structure/row-marks.js';
import { categoryOf } from '../../../src/core/shared/structure-model.js';
import { ICON_NAMES } from '../../../src/ui/icons.js';

describe('the marks of a row', () => {
  it('uses only icons that exist', () => {
    Object.values(ROW_MARKS).filter((mark) => mark.icon).forEach((mark) => expect(ICON_NAMES).toContain(mark.icon));
    KIND_LOOKS.forEach(([icon]) => expect(ICON_NAMES).toContain(icon));
  });

  it('gives every mark a name, a look and a meaning', () => {
    Object.values({ ...ROW_MARKS, ...VERDICT_MARKS }).forEach((mark) => {
      expect(mark.looks).toBeTruthy();
      expect(mark.means).toBeTruthy();
    });
    Object.values(ROW_MARKS).forEach((mark) => expect(mark.name).toBeTruthy());
  });

  it('lists every mark, Next glyph and kind of element in the legend', () => {
    const legend = rowLegend();
    Object.values({ ...ROW_MARKS, ...VERDICT_MARKS }).forEach((mark) => expect(legend).toContain(`${mark.looks} = ${mark.means}`));
    KIND_LOOKS.forEach(([, looks, means]) => expect(legend).toContain(`${looks} = ${means}`));
  });

  it('shows each family of element with an icon the legend describes', () => {
    ['Step', 'Text', 'Checkbox', 'Text Block', 'Block', 'DataRaptor Extract Action', 'Set Errors', 'Custom Lightning Web Component']
      .forEach((type) => expect(KIND_LOOKS.map(([icon]) => icon)).toContain(categoryOf(type).icon));
    expect(categoryOf('Something Unknown').icon).toBe('el-other');
  });
});

describe('what the tooltips say', () => {
  it('reads Hidden by its show rule: ... from the verdict', () => {
    expect(hiddenTitle('Hidden: Intro:Plan is "Standard", not "Gold"')).toBe('Hidden by its show rule: Intro:Plan is "Standard", not "Gold"');
    expect(hiddenTitle('Hidden because Intro is hidden')).toBe('Hidden because Intro is hidden');
    expect(hiddenTitle('')).toBe('Hidden right now');
  });

  it('reads Shown when: the rule, then the verdict', () => {
    expect(ruleTitle('Intro:Kind = "Business"', 'Hidden: x')).toBe('Shown when: Intro:Kind = "Business"\nHidden: x');
    expect(ruleTitle('Intro:Kind = "Business"', '')).toBe('Shown when: Intro:Kind = "Business"');
    expect(ruleTitle('', '')).toBe('Has a show rule');
  });
});

describe('the legend', () => {
  it('names the anything-else kind that the help mentions', () => {
    expect(KIND_LOOKS).toContainEqual(['el-other', 'small dot', 'anything else']);
    expect(rowLegend()).toContain('small dot = anything else');
  });

  it('never uses the same word for two different marks', () => {
    const looks = [...Object.values(ROW_MARKS), ...Object.values(VERDICT_MARKS)].map((mark) => mark.looks)
      .concat(KIND_LOOKS.map(([, word]) => word));
    expect(new Set(looks).size).toBe(looks.length);
  });

  it('draws the show-rule mark as a diamond', () => {
    expect(ROW_MARKS.cond.icon).toBe('diamond');
    expect(ROW_MARKS.cond.looks).toBe('diamond');
  });

  it('gives the popover one line for every mark, Next glyph and kind, with its real icon or glyph', () => {
    const groups = legendGroups();
    expect(groups.map((group) => group.title)).toEqual(['Valid', 'Marks', 'Kinds']);
    const lines = groups.flatMap((group) => group.items);
    expect(lines).toHaveLength(Object.keys(VERDICT_MARKS).length + Object.keys(ROW_MARKS).length + KIND_LOOKS.length);
    lines.forEach((line) => {
      expect(line.means).toBeTruthy();
      expect(Boolean(line.icon) || Boolean(line.text)).toBe(true);
      if (line.icon) expect(ICON_NAMES).toContain(line.icon);
    });
    expect(lines.find((line) => line.text === '*').means).toBe('required');
    expect(groups[0].items).toEqual([
      { text: '✓', looks: 'tick', means: 'passes its rules now' },
      { text: '✕', looks: 'cross', means: 'would stop Next now' },
      { text: '–', looks: 'dash', means: 'the panel cannot tell' }
    ]);
  });
});

describe('which rows carry the show-rule mark', () => {
  it('is a conditional element that is shown now, never one the rule hides', () => {
    expect(showsRuleMark({ conditional: true }, false)).toBe(true);
    expect(showsRuleMark({ conditional: true }, true)).toBe(false);
    expect(showsRuleMark({ conditional: false }, false)).toBe(false);
  });
});

describe('the hidden mark keeps the rule in its tooltip', () => {
  it('adds Shown when: after the reason, for an element with a rule', () => {
    expect(hiddenTitle('Hidden: x is 1, not 2', 'x = 2')).toBe('Hidden by its show rule: x is 1, not 2\nShown when: x = 2');
    expect(hiddenTitle('', 'x = 2')).toBe('Hidden right now\nShown when: x = 2');
    expect(hiddenTitle('Hidden because Intro is hidden', 'x = 2')).toBe('Hidden because Intro is hidden');
  });
});
