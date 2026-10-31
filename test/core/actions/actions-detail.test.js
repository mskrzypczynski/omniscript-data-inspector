'use strict';

import {
  DIFF_TABS, compareSections, tabBody, copyBody, maskChange, sectionNotice, changesHint,
  changesTitles, changesCaution, compareIntro, compareIntroTitle, compareSplit, metaLine, metaParts, stateText, defaultDetailTab, resultTitle, compareChoices, COMPARE_MENU_TITLE
} from '../../../src/core/actions/actions-detail.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const call = (over = {}) => ({
  name: 'Acc_Fetch', signature: 'svc.Acc_Fetch', type: 'IP', duration: 120, httpStatus: 200, state: 'SUCCESS',
  size: 2048, time: new Date(0), output: { n: 1 }, action: { input: { a: 1 }, options: { b: 2 } }, ...over
});
const clock = () => '10:00:00';

describe('compareSections and tabBody', () => {
  it('diffs input, options and output of the baseline against the call', () => {
    const sections = compareSections(call({ output: { n: 2 } }), call());
    expect(sections.map((s) => [s.title, s.changes.length])).toEqual([['Input', 0], ['Options', 0], ['Output', 1]]);
  });

  it('chooses the value of each tab', () => {
    const entry = call();
    expect(tabBody(entry, 'input')).toEqual({ a: 1 });
    expect(tabBody(entry, 'output')).toEqual({ n: 1 });
    expect(tabBody(entry, 'options')).toEqual({ b: 2 });
    expect(tabBody(entry, 'compare', {})).toBeUndefined();
    expect(tabBody(entry, 'compare', { compare: [{ title: 'Input', changes: [] }] })).toHaveLength(1);
  });

  it('shows data changes only when there are some to show', () => {
    expect(tabBody(call(), 'changes', { changes: { status: 'no-after' } })).toBeUndefined();
    const ok = { status: 'ok', changes: [{ path: 'x', kind: 'added' }], truncated: false };
    expect(tabBody(call(), 'changes', { changes: ok })).toEqual([{ title: 'Changes', changes: ok.changes, truncated: false }]);
  });
});

describe('masking a copy', () => {
  it('masks a tree body whole', () => {
    expect(copyBody({ a: 'x' }, 'input', maskValues)).toEqual({ a: '<string>' });
  });

  it('masks only the before and after of a comparison', () => {
    const sections = [{ title: 'Input', truncated: false, changes: [{ path: 'a', kind: 'changed', before: 'x', after: 'y' }] }];
    const out = copyBody(sections, 'compare', maskValues);
    expect(out[0].title).toBe('Input');
    expect(out[0].changes[0]).toEqual({ path: 'a', kind: 'changed', before: '<string>', after: '<string>' });
    expect(DIFF_TABS).toEqual(['compare', 'changes']);
  });

  it('masks one change', () => {
    expect(maskChange({ path: 'p', kind: 'added', before: undefined, after: 5 }, maskValues).after).toBe('<number>');
  });
});

describe('sectionNotice', () => {
  it('shows the raw text of an answer that could not be decoded', () => {
    const entry = call({ output: undefined, responseProblem: 'not-json', rawResponse: '<html>oops</html>' });
    expect(sectionNotice(entry, 'output')).toEqual({ raw: '<html>oops</html>' });
  });

  it('withholds the raw text while masking', () => {
    const entry = call({ output: undefined, responseProblem: 'not-json', rawResponse: '<html>oops</html>' });
    expect(sectionNotice(entry, 'output', true).raw).toBeUndefined();
    expect(sectionNotice(entry, 'output', true).text).toMatch(/Mask values/);
  });

  it('says nothing came back', () => {
    expect(sectionNotice(call({ output: undefined, responseProblem: 'no-response' }), 'output').text).toMatch(/No response/);
  });

  it('keeps the plain sentence otherwise, and for other tabs', () => {
    expect(sectionNotice(call({ output: undefined }), 'output').text).toBe('Nothing captured for this section.');
    expect(sectionNotice(call({ responseProblem: 'not-json', rawResponse: 'x' }), 'input').text).toBe('Nothing captured for this section.');
  });
});

describe('Data changes wording', () => {
  it('says why there is nothing to show', () => {
    expect(changesHint({ status: 'not-polling' }))
      .toBe('The panel was not reading the data JSON when this call finished (it reads only while DevTools shows it).');
    expect(changesHint({ status: 'no-after' })).toMatch(/within 5 s/);
    expect(changesHint({ status: 'no-history' })).toMatch(/No payload has been read yet/);
    expect(changesHint({ status: 'no-before' })).toMatch(/before this call is kept/);
  });

  it('never sends the reader to Advanced or the Data tab', () => {
    ['no-history', 'no-after', 'not-polling', 'no-before', 'unreadable'].forEach((status) => {
      expect(changesHint({ status })).not.toMatch(/Advanced|Data tab|Auto-refresh/);
    });
  });

  it('titles the two reads in one short line each', () => {
    const found = { before: { time: 0 }, after: { time: 1 }, gapMs: 1900, staleBefore: false, beforeAgeMs: 7000 };
    expect(changesTitles(found, clock)).toEqual({
      before: `Before: ${clock(0)} (7 s before the call ended)`,
      after: `After: ${clock(1)} (1.9 s after)`
    });
    expect(changesTitles({ ...found, beforeAgeMs: 638000 }, clock).before).toMatch(/\(10 min 38 s before the call ended\)$/);
  });

  it('cautions about an old "before" read only, with the reason in the tooltip', () => {
    const found = { before: { time: 0 }, after: { time: 1 }, gapMs: 800, staleBefore: true, beforeAgeMs: 41000 };
    const caution = changesCaution(found);
    expect(caution.text).toBe('May include earlier changes');
    expect(caution.title).toMatch(/41 s before the call ended \(more than 30 s\)/);
    expect(changesCaution({ ...found, staleBefore: false })).toBeNull();
  });
});

describe('compareIntro', () => {
  it('is one line: both times with their durations, and the delta after minus before', () => {
    const base = call({ duration: 410 });
    expect(compareIntro(call({ duration: 470 }), base, clock)).toBe('Before 10:00:00 (410 ms) → After 10:00:00 (470 ms) · +60 ms');
    expect(compareIntro(call({ duration: 400 }), base, clock)).toMatch(/· -10 ms$/);
  });

  it('leaves out what is not known: a duration, and with it the delta', () => {
    expect(compareIntro(call({ duration: 0 }), call({ duration: 100 }), clock)).toBe('Before 10:00:00 (100 ms) → After 10:00:00');
  });

  it('writes the times in the chosen Time format', () => {
    const text = compareIntro(call({ duration: 640 }), call({ duration: 1240 }), clock, 'human');
    expect(text).toBe('Before 10:00:00 (1.2 s) → After 10:00:00 (640 ms) · -600 ms');
    expect(compareIntro(call({ duration: 640 }), call({ duration: 1240 }), clock, 'ms')).toContain('(1,240 ms)');
  });

  it('keeps how the baseline was picked, and what a delta is, for the tooltip', () => {
    expect(compareIntroTitle('previous')).toBe('Baseline: the previous call to the same place. A delta is after minus before.');
    expect(compareIntroTitle('success')).toMatch(/last successful call/);
    expect(compareIntroTitle('picked')).toMatch(/the call you picked/);
    expect(compareIntroTitle('original')).toMatch(/sent again from/);
  });
});

describe('compareSplit', () => {
  const same = (title) => ({ title, changes: [], truncated: false });
  const differs = (title) => ({ title, changes: [{}], truncated: false });

  it('joins every identical part into one sentence', () => {
    expect(compareSplit([same('Input'), same('Options'), same('Output')])).toEqual({ differing: [], same: 'Input, options and output are identical' });
    expect(compareSplit([same('Original input'), same('Response'), same('Options')]).same).toBe('Original input, response and options are identical');
  });

  it('keeps the parts that differ out of it', () => {
    expect(compareSplit([same('Input'), same('Options'), differs('Output')])).toEqual({ differing: ['Output'], same: 'Input and options are identical' });
    expect(compareSplit([differs('Input'), same('Options'), differs('Output')]).same).toBe('Options are identical');
    expect(compareSplit([same('Input'), differs('Options'), differs('Output')]).same).toBe('Input is identical');
  });

  it('says nothing when every part differs, and treats a truncated diff as different', () => {
    expect(compareSplit([differs('Input'), differs('Output')]).same).toBe('');
    expect(compareSplit([{ title: 'Input', changes: [], truncated: true }]).differing).toEqual(['Input']);
  });
});

describe('metaLine', () => {
  it('lists kind, time, duration, HTTP, state, size and step', () => {
    const text = metaLine(call(), { clock, step: { key: 's', name: 'Review' } });
    expect(text).toBe('Integration Procedure · svc.Acc_Fetch · 10:00:00 · 120 ms · HTTP 200 · Succeeded · 2.0 KB · step Review');
  });

  it('leaves out what is not known', () => {
    const text = metaLine(call({ duration: null, size: -1, httpStatus: 0, state: null, signature: 'Acc_Fetch' }), { clock });
    expect(text).toBe('Integration Procedure · 10:00:00 · HTTP ? · state unknown');
  });

  it('writes the duration in the chosen Time format', () => {
    const ctx = { clock, step: null };
    expect(metaLine(call({ duration: 1240 }), { ...ctx, format: 'human' })).toContain('· 1.2 s ·');
    expect(metaLine(call({ duration: 1240 }), { ...ctx, format: 'ms' })).toContain('· 1,240 ms ·');
    expect(metaLine(call({ duration: 1240 }), ctx)).toContain('· 1,240 ms ·');
  });

  it('notes a shared request', () => {
    expect(metaLine(call({ batchSize: 3 }), { clock })).toContain('120 ms · shared by 3');
  });
});

describe('metaLine on a failed call', () => {
  const bad = (over = {}) => call({ output: { success: false, error: 'boom' }, ...over });

  it('does not say SUCCESS next to a red banner', () => {
    const text = metaLine(bad(), { clock });
    expect(text).toContain('HTTP 200 · Failed');
    expect(text).not.toContain('SUCCESS');
  });

  it('says Failed for an Aura state that is itself an error, not the state', () => {
    expect(stateText(call({ state: 'ERROR' }))).toBe('Failed');
  });

  it('names a call that never got an answer', () => {
    expect(stateText(call({ state: null, httpStatus: 0, responseProblem: 'no-response' }))).toBe('No response');
  });

  it('says Succeeded for a call that did not fail, not Aura\'s SUCCESS', () => {
    expect(stateText(call())).toBe('Succeeded');
  });
});

describe('metaParts', () => {
  it('keeps each fact whole, so none can be split across lines', () => {
    const parts = metaParts(call(), { clock, step: { key: 's', name: 'Review' } });
    expect(parts).toContain('HTTP 200');
    expect(parts).toContain('step Review');
    expect(parts.join(' · ')).toBe(metaLine(call(), { clock, step: { key: 's', name: 'Review' } }));
  });
});

describe('defaultDetailTab', () => {
  const bad = call({ output: { success: false } });

  it('opens a failed call on Output, a good one on Input', () => {
    expect(defaultDetailTab(bad, 'input', false)).toBe('output');
    expect(defaultDetailTab(call(), 'output', false)).toBe('input');
  });

  it('keeps a tab the user picked', () => {
    expect(defaultDetailTab(bad, 'input', true)).toBe('input');
    expect(defaultDetailTab(call(), 'options', true)).toBe('options');
  });

  it('opens a debug run on Debug, unless the build has no Debug tab: then a picked tab stays', () => {
    const run = call({ debug: { steps: [] } });
    expect(defaultDetailTab(run, 'options', true)).toBe('debug');
    expect(defaultDetailTab(run, 'options', true, { debugTab: false })).toBe('options');
    expect(defaultDetailTab(run, 'input', false, { debugTab: false })).toBe('input');
    expect(defaultDetailTab(run, 'debug', true, { debugTab: false })).toBe('input');
  });

  it('keeps Compare and Data changes, which the user starts', () => {
    expect(defaultDetailTab(bad, 'compare', false)).toBe('compare');
    expect(defaultDetailTab(bad, 'changes', false)).toBe('changes');
  });
});

describe('resultTitle', () => {
  it('names the verdict, the reason, the HTTP status and the Aura state', () => {
    expect(resultTitle(call({ httpStatus: 200, state: 'SUCCESS' }), 'SUCCESS', ''))
      .toBe('SUCCESS\nNo error found in the response\nHTTP 200\nAura state: SUCCESS');
    expect(resultTitle(call({ httpStatus: 200, state: 'ERROR' }), 'ERROR', 'Action error — boom'))
      .toBe('ERROR\nAction error — boom\nHTTP 200\nAura state: ERROR');
  });

  it('prints a failed HTTP status once: the reason already is it', () => {
    const text = resultTitle(call({ httpStatus: 500, state: 'SUCCESS' }), 'Failed', 'HTTP 500');
    expect(text).toBe('Failed\nHTTP 500\nAura state: SUCCESS');
    expect(text.split('HTTP 500')).toHaveLength(2);
  });

  it('keeps the status when the reason is about something else, or a different status', () => {
    expect(resultTitle(call({ httpStatus: 500 }), 'Failed', 'Response error — boom')).toContain('\nHTTP 500');
    expect(resultTitle(call({ httpStatus: 503 }), 'Failed', 'HTTP 500').split('HTTP 503')).toHaveLength(2);
  });

  it('says unknown for a call with no status, and leaves the Aura line out when there is no state', () => {
    expect(resultTitle(call({ httpStatus: 0, state: '' }), 'No response', 'No response — the request got no answer'))
      .toBe('No response\nNo response — the request got no answer\nHTTP unknown');
  });
});

describe('compareChoices', () => {
  const a = { id: 1 };
  const b = { id: 2 };
  const c = { id: 3 };

  it('offers nothing without anything to compare with', () => {
    expect(compareChoices()).toEqual([]);
    expect(compareChoices({ earlier: null, lastSuccess: null, original: null })).toEqual([]);
  });

  it('lists previous, last success and original in the order of the buttons', () => {
    const choices = compareChoices({ earlier: a, lastSuccess: b, original: c });
    expect(choices.map((choice) => choice.how)).toEqual(['previous', 'success', 'original']);
    expect(choices.map((choice) => choice.target)).toEqual([a, b, c]);
    expect(choices.map((choice) => choice.label)).toEqual(['Compare with previous', 'Compare with last success', 'Compare with original']);
    choices.forEach((choice) => expect(choice.title.length).toBeGreaterThan(20));
    expect(COMPARE_MENU_TITLE).toMatch(/previous call/);
  });

  it('says one thing once when previous and last success are the same call', () => {
    expect(compareChoices({ earlier: a, lastSuccess: a }).map((choice) => choice.how)).toEqual(['previous']);
  });
});
