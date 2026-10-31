'use strict';

import {
  selectionSummary, summaryText, summaryParts, formatDuration, formatMs, requestSegments, segmentTitle, segmentLabel, segmentTypes,
  idsInRange, markState, pruneMarks
} from '../../../src/core/actions/actions-selection.js';

const call = (id, startMs, duration, failure = null) => ({
  id, time: new Date(1700000000000 + startMs), duration, failure
});

describe('selectionSummary', () => {
  it('adds up overlapping calls but measures the span on the clock', () => {
    // 0-500, 100-400 (inside the first), 300-1000: total 1400, wall clock 1000.
    const summary = selectionSummary([call(1, 0, 500), call(2, 100, 300), call(3, 300, 700)]);
    expect(summary).toMatchObject({ count: 3, total: 1500, span: 1000, avg: 500, slowest: 700, failed: 0 });
  });

  it('measures the gap between disjoint calls into the span', () => {
    const summary = selectionSummary([call(1, 0, 100), call(2, 900, 100)]);
    expect(summary).toMatchObject({ total: 200, span: 1000, avg: 100, slowest: 100 });
  });

  it('counts failed calls', () => {
    const summary = selectionSummary([call(1, 0, 10, 'HTTP 500'), call(2, 20, 10), call(3, 40, 10, 'x')]);
    expect(summary.failed).toBe(2);
  });

  it('leaves calls with no duration out of total, average and slowest', () => {
    const summary = selectionSummary([call(1, 0, 200), call(2, 50, 0), call(3, 60, undefined)]);
    expect(summary).toMatchObject({ count: 3, timed: 1, total: 200, avg: 200, slowest: 200 });
    // They still start inside the first call, so the span is its own length.
    expect(summary.span).toBe(200);
  });

  it('rounds the average', () => {
    expect(selectionSummary([call(1, 0, 1), call(2, 0, 1), call(3, 0, 2)]).avg).toBe(1);
    expect(selectionSummary([call(1, 0, 1), call(2, 0, 2)]).avg).toBe(2);
  });

  it('has nothing to report for durations when none is known', () => {
    const summary = selectionSummary([call(1, 0, 0), call(2, 10, undefined)]);
    expect(summary).toMatchObject({ count: 2, total: null, avg: null, slowest: null });
  });

  it('has no span without start times', () => {
    const summary = selectionSummary([{ id: 1, duration: 5 }]);
    expect(summary).toMatchObject({ total: 5, span: null });
  });

  it('is empty for no calls', () => {
    expect(selectionSummary([])).toMatchObject({ count: 0, total: null, span: null });
  });
});

describe('formatMs', () => {
  it('keeps call times in milliseconds with thousands separators', () => {
    expect(formatMs(1240)).toBe('1,240 ms');
    expect(formatMs(640)).toBe('640 ms');
    expect(formatMs(undefined)).toBe('0 ms');
  });
});

describe('formatDuration', () => {
  it('says milliseconds under a second', () => {
    expect(formatDuration(640)).toBe('640 ms');
    expect(formatDuration(1)).toBe('1 ms');
    expect(formatDuration(999.4)).toBe('999 ms');
  });

  it('says seconds with one decimal under a minute', () => {
    expect(formatDuration(1000)).toBe('1.0 s');
    expect(formatDuration(1840)).toBe('1.8 s');
    expect(formatDuration(36000)).toBe('36.0 s');
  });

  it('rounds into the next unit instead of showing 1000 ms or 60.0 s', () => {
    expect(formatDuration(999.6)).toBe('1.0 s');
    expect(formatDuration(59960)).toBe('1m 0s');
  });

  it('says minutes and seconds above a minute', () => {
    expect(formatDuration(72000)).toBe('1m 12s');
    expect(formatDuration(60000)).toBe('1m 0s');
    expect(formatDuration(3725000)).toBe('62m 5s');
  });

  it('reads an unknown duration as zero', () => {
    expect(formatDuration(undefined)).toBe('0 ms');
    expect(formatDuration(-1)).toBe('0 ms');
    expect(formatDuration(NaN)).toBe('0 ms');
  });
});

describe('summaryText', () => {
  const named = (id, startMs, duration, name, extra = {}) => ({ ...call(id, startMs, duration), name, ...extra });

  it('reads like the bar', () => {
    const summary = selectionSummary([
      named(1, 0, 600, 'Alpha_Fetch'), named(2, 1000, 1200, 'Beta_Fetch'), named(3, 35000, 0, 'Gamma_Fetch')
    ]);
    expect(summaryText(summary)).toBe('3 calls · total 1,800 ms · span 35,000 ms · avg 900 ms · slowest Beta_Fetch 1,200 ms');
  });

  it('adds the failed count when some failed', () => {
    const summary = selectionSummary([named(1, 0, 600, 'A', { failure: 'x' }), named(2, 100, 200, 'B')]);
    expect(summaryText(summary).endsWith(' · 1 failed')).toBe(true);
  });

  it('says "in N requests" when calls travelled together', () => {
    const summary = selectionSummary([
      named(1, 0, 400, 'A', { requestId: 1 }), named(2, 0, 400, 'B', { requestId: 1 }),
      named(3, 500, 100, 'C', { requestId: 2 }), named(4, 500, 100, 'D', { requestId: 2 })
    ]);
    expect(summaryText(summary)).toBe('4 calls in 2 requests · total 500 ms · span 600 ms · avg 250 ms · slowest A 400 ms');
  });

  it('says only the time for a single request', () => {
    expect(summaryText(selectionSummary([named(1, 0, 640, 'A')]))).toBe('1 call · 640 ms');
    expect(summaryText(selectionSummary([
      named(1, 0, 640, 'A', { requestId: 1 }), named(2, 0, 640, 'B', { requestId: 1 })
    ]))).toBe('2 calls in 1 request · 640 ms');
  });

  it('leaves out "across" when there are no start times', () => {
    const text = summaryText(selectionSummary([{ id: 1, duration: 100, name: 'A' }, { id: 2, duration: 300, name: 'B' }]));
    expect(text).toBe('2 calls · total 400 ms · avg 200 ms · slowest B 300 ms');
  });

  it('leaves the name out when the call has none', () => {
    expect(summaryText({ count: 3, requests: 3, failed: 0, timed: 3, total: 1240, span: 980, avg: 413, slowest: 702 }))
      .toBe('3 calls · total 1,240 ms · span 980 ms · avg 413 ms · slowest 702 ms');
  });

  it('writes every figure in seconds with the human Time format', () => {
    const summary = selectionSummary([
      named(1, 0, 600, 'Alpha_Fetch'), named(2, 1000, 1240, 'Beta_Fetch'), named(3, 36000, 0, 'Gamma_Fetch', { failure: 'x' })
    ]);
    expect(summaryText(summary, 'human'))
      .toBe('3 calls · total 1.8 s · span 36.0 s · avg 920 ms · slowest Beta_Fetch 1.2 s · 1 failed');
    expect(summaryText(summary, 'ms'))
      .toBe('3 calls · total 1,840 ms · span 36,000 ms · avg 920 ms · slowest Beta_Fetch 1,240 ms · 1 failed');
    expect(summaryText(summary)).toBe(summaryText(summary, 'ms'));
  });

  it('writes a minute and more as minutes and seconds', () => {
    const summary = selectionSummary([named(1, 0, 600, 'A'), named(2, 70000, 2000, 'B')]);
    expect(summaryText(summary, 'human')).toContain(' · span 1m 12s · ');
  });

  it('writes a single request in the chosen format', () => {
    expect(summaryText(selectionSummary([named(1, 0, 1240, 'A')]), 'human')).toBe('1 call · 1.2 s');
    expect(summaryText(selectionSummary([named(1, 0, 640, 'A')]), 'human')).toBe('1 call · 640 ms');
  });

  it('never says "across"', () => {
    const summary = selectionSummary([named(1, 0, 600, 'A'), named(2, 5000, 100, 'B')]);
    expect(summaryText(summary)).not.toMatch(/across/);
  });

  it('says so when no call has a duration', () => {
    expect(summaryText(selectionSummary([call(1, 0, 0)]))).toBe('1 call · no durations');
  });

  it('is empty for no selection', () => {
    expect(summaryText(selectionSummary([]))).toBe('');
  });
});

describe('summaryParts', () => {
  it('marks the slowest call\'s name with the call it belongs to', () => {
    const summary = selectionSummary([{ ...call(7, 0, 100), name: 'Fast_One' }, { ...call(9, 50, 900), name: 'Slow_One' }]);
    const linked = summaryParts(summary).filter((part) => part.callId !== undefined);
    expect(linked).toEqual([{ text: 'Slow_One', callId: 9 }]);
  });

  it('masks the slowest name only when it was read from the input', () => {
    const mask = () => '<string>';
    const fromInput = selectionSummary([{ ...call(9, 50, 900), name: 'Secret_Bundle', nameFrom: 'input' }, call(10, 60, 5, 'x')]);
    expect(summaryText(fromInput, 'ms', mask)).toContain('slowest <string> 900 ms');
    expect(summaryText(fromInput)).toContain('slowest Secret_Bundle 900 ms');
    const fromCode = selectionSummary([{ ...call(9, 50, 900), name: 'Order_Place', nameFrom: 'method' }, call(10, 60, 5, 'x')]);
    expect(summaryText(fromCode, 'ms', mask)).toContain('slowest Order_Place 900 ms');
  });

  it('joins to the same line summaryText gives', () => {
    const summary = selectionSummary([{ ...call(7, 0, 100), name: 'A' }, { ...call(9, 50, 900), name: 'B' }, call(10, 60, 5, 'x')]);
    expect(summaryParts(summary).map((part) => part.text).join('')).toBe(summaryText(summary));
  });
});

describe('requestSegments', () => {
  const named = (id, startMs, duration, name, extra = {}) => ({ ...call(id, startMs, duration), name, type: 'IP', ...extra });

  it('makes one segment per request, sized by its duration', () => {
    const segments = requestSegments([
      named(1, 0, 380, 'Alpha'), named(2, 0, 1000, 'Beta', { type: 'DR' }), named(3, 0, 420, 'Gamma', { failure: 'x' })
    ]);
    expect(segments.map((segment) => [segment.id, segment.duration, segment.percent, segment.failed])).toEqual([
      [1, 380, 21, false], [2, 1000, 56, false], [3, 420, 23, true]
    ]);
    expect(segments[1]).toMatchObject({ type: 'DR', kind: 'Data Mapper (DataRaptor)' });
  });

  it('counts a batched request once, standing for its first call', () => {
    const segments = requestSegments([
      named(1, 0, 400, 'A', { requestId: 5 }), named(2, 0, 400, 'B', { requestId: 5, failure: 'x' }), named(3, 10, 400, 'C')
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ id: 1, calls: 2, failed: true });
  });

  it('leaves out calls with no duration and never rounds a share down to nothing', () => {
    const segments = requestSegments([named(1, 0, 0, 'A'), named(2, 0, 1, 'B'), named(3, 0, 1000, 'C')]);
    expect(segments.map((segment) => segment.id)).toEqual([2, 3]);
    expect(segments[0].percent).toBe(1);
  });

  it('writes a segment\'s time in the chosen format', () => {
    const [segment] = requestSegments([named(1, 0, 1240, 'Alpha'), named(2, 0, 760, 'Beta')]);
    expect(segmentTitle(segment, 'human')).toBe('Alpha · 1.2 s · 62%');
    expect(segmentTitle(segment, 'ms')).toBe('Alpha · 1,240 ms · 62%');
  });

  it('titles a segment "name · time · share"', () => {
    const [segment] = requestSegments([named(1, 0, 380, 'Alpha'), named(2, 0, 1420, 'Beta')]);
    expect(segmentTitle(segment)).toBe('Alpha · 380 ms · 21%');
    expect(segmentTitle({ ...segment, failed: true, calls: 3 })).toBe('Alpha +2 more in this request · 380 ms · 21% · failed');
  });
});

describe('segmentLabel and segmentTypes', () => {
  const segment = { name: 'Alpha', kind: 'Integration Procedure', duration: 380, percent: 21, calls: 1, failed: false, type: 'IP' };

  it('says the whole segment to a screen reader', () => {
    expect(segmentLabel(segment)).toBe('Alpha, Integration Procedure, 380 ms, 21% of the selected time');
    expect(segmentLabel({ ...segment, calls: 3, failed: true }))
      .toBe('Alpha, 3 calls in this request, Integration Procedure, 380 ms, 21% of the selected time, failed');
  });

  it('says the time in the chosen format', () => {
    expect(segmentLabel({ ...segment, duration: 1240 }, 'human')).toBe('Alpha, Integration Procedure, 1.2 s, 21% of the selected time');
    expect(segmentLabel({ ...segment, duration: 1240 }, 'ms')).toBe('Alpha, Integration Procedure, 1,240 ms, 21% of the selected time');
  });

  it('keys the types in a fixed order, only when there are two or more', () => {
    expect(segmentTypes([{ type: 'RA' }, { type: 'DR' }, { type: 'RA' }])).toEqual(['DR', 'RA']);
    expect(segmentTypes([{ type: 'APEX' }, { type: 'IP' }, { type: 'DR' }])).toEqual(['DR', 'IP', 'APEX']);
    expect(segmentTypes([{ type: 'IP' }, { type: 'IP' }])).toEqual([]);
    expect(segmentTypes([])).toEqual([]);
  });
});

describe('idsInRange', () => {
  const ids = [10, 11, 12, 13, 14];
  it('covers the range in list order, either direction', () => {
    expect(idsInRange(ids, 11, 13)).toEqual([11, 12, 13]);
    expect(idsInRange(ids, 13, 11)).toEqual([11, 12, 13]);
    expect(idsInRange(ids, 12, 12)).toEqual([12]);
  });
  it('falls back to the clicked id when the anchor is not listed', () => {
    expect(idsInRange(ids, 99, 12)).toEqual([12]);
    expect(idsInRange(ids, null, 12)).toEqual([12]);
  });
  it('is empty when the clicked id is not listed', () => {
    expect(idsInRange(ids, 11, 99)).toEqual([]);
  });
});

describe('markState', () => {
  it('tells none, some and all of the visible calls', () => {
    expect(markState([1, 2, 3], new Set())).toBe('none');
    expect(markState([1, 2, 3], new Set([2]))).toBe('some');
    expect(markState([1, 2, 3], new Set([1, 2, 3, 9]))).toBe('all');
  });
  it('ignores marks on calls that are filtered away', () => {
    expect(markState([1, 2], new Set([9]))).toBe('none');
  });
  it('is none for an empty list', () => {
    expect(markState([], new Set([1]))).toBe('none');
  });
});

describe('pruneMarks', () => {
  it('drops the marks of calls that are gone', () => {
    expect([...pruneMarks(new Set([1, 2, 3]), [{ id: 2 }, { id: 3 }, { id: 4 }])]).toEqual([2, 3]);
  });
});

describe('calls that share a request', () => {
  const shared = (id, requestId, startMs, duration) => ({ ...call(id, startMs, duration), requestId });

  it('adds a boxcar\'s time up once, not once per action', () => {
    // Three actions in one 400 ms request, and one separate 100 ms request.
    const summary = selectionSummary([
      shared(1, 'a', 0, 400), shared(2, 'a', 0, 400), shared(3, 'a', 0, 400), shared(4, 'b', 500, 100)
    ]);
    expect(summary).toMatchObject({ count: 4, requests: 2, timed: 2, total: 500, span: 600, avg: 250, slowest: 400 });
  });

  it('treats calls without a request id as requests of their own', () => {
    expect(selectionSummary([call(1, 0, 100), call(2, 0, 100)])).toMatchObject({ requests: 2, total: 200 });
  });

  it('still counts every failed call', () => {
    const rows = [{ ...shared(1, 'a', 0, 10), failure: 'x' }, { ...shared(2, 'a', 0, 10), failure: 'x' }];
    expect(selectionSummary(rows).failed).toBe(2);
  });

  it('says how many requests the calls came in', () => {
    const text = summaryText({ count: 4, requests: 2, failed: 0, total: 500, span: 600, avg: 250, slowest: 400 });
    expect(text).toBe('4 calls in 2 requests · total 500 ms · span 600 ms · avg 250 ms · slowest 400 ms');
    expect(summaryText({ count: 3, requests: 3, failed: 0, total: 5, span: 5, avg: 2, slowest: 3 })).toMatch(/^3 calls ·/);
  });
});
