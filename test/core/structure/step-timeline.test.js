'use strict';

import {
  MAX_VISITS, recordStep, closedVisits, stepTotals, allTotals, callsDuring, describeStep, timelineModel, timelineSignature, TIMELINE_VISITS
} from '../../../src/core/structure/step-timeline.js';

const at = (ms) => new Date(ms);
const step = (key, name = key) => ({ key, name });

describe('recordStep', () => {
  it('opens a visit on the first step seen', () => {
    expect(recordStep([], step('a', 'Intro'), 1000)).toEqual([{ key: 'a', name: 'Intro', from: 1000, to: null }]);
  });

  it('returns the same array while the step is unchanged', () => {
    const visits = recordStep([], step('a'), 1000);
    expect(recordStep(visits, step('a'), 5000)).toBe(visits);
  });

  it('closes the open visit and opens the next on a change', () => {
    const visits = recordStep(recordStep([], step('a'), 1000), step('b'), 4000);
    expect(visits).toEqual([
      { key: 'a', name: 'a', from: 1000, to: 4000 },
      { key: 'b', name: 'b', from: 4000, to: null }
    ]);
  });

  it('does not mutate the visits it was given', () => {
    const first = recordStep([], step('a'), 1000);
    const snapshot = JSON.stringify(first);
    recordStep(first, step('b'), 2000);
    expect(JSON.stringify(first)).toBe(snapshot);
  });

  it('closes the open visit when the script is on no step', () => {
    const visits = recordStep(recordStep([], step('a'), 1000), null, 3000);
    expect(visits).toEqual([{ key: 'a', name: 'a', from: 1000, to: 3000 }]);
  });

  it('does nothing for no step when nothing is open', () => {
    const visits = [];
    expect(recordStep(visits, null, 10)).toBe(visits);
  });

  it('counts a return to an earlier step as a new visit', () => {
    let visits = recordStep([], step('a'), 0);
    visits = recordStep(visits, step('b'), 1000);
    visits = recordStep(visits, step('a'), 2000);
    expect(visits.map((visit) => visit.key)).toEqual(['a', 'b', 'a']);
  });

  it('keeps only the most recent visits', () => {
    let visits = [];
    for (let i = 0; i < MAX_VISITS + 20; i++) visits = recordStep(visits, step(`s${i}`), i);
    expect(visits).toHaveLength(MAX_VISITS);
    expect(visits[visits.length - 1].key).toBe(`s${MAX_VISITS + 19}`);
  });
});

describe('stepTotals', () => {
  const visits = [
    { key: 'a', name: 'a', from: 0, to: 10000 },
    { key: 'b', name: 'b', from: 10000, to: 15000 },
    { key: 'a', name: 'a', from: 15000, to: null }
  ];

  it('adds the visits of one step, the open one up to now', () => {
    expect(stepTotals(visits, 'a', 20000)).toEqual({ ms: 15000, visits: 2 });
    expect(stepTotals(visits, 'b', 20000)).toEqual({ ms: 5000, visits: 1 });
  });

  it('is zero for a step never seen', () => {
    expect(stepTotals(visits, 'zzz', 20000)).toEqual({ ms: 0, visits: 0 });
  });

  it('never goes negative when the clock steps back', () => {
    expect(stepTotals([{ key: 'a', name: 'a', from: 5000, to: null }], 'a', 1000).ms).toBe(0);
  });

  it('lists every step once, in the order first seen', () => {
    expect(allTotals(visits, 20000)).toEqual([
      { key: 'a', name: 'a', ms: 15000, visits: 2 },
      { key: 'b', name: 'b', ms: 5000, visits: 1 }
    ]);
  });
});

describe('callsDuring', () => {
  const visits = [
    { key: 'a', name: 'a', from: 1000, to: 2000 },
    { key: 'b', name: 'b', from: 2000, to: 3000 },
    { key: 'a', name: 'a', from: 3000, to: null }
  ];
  const calls = [
    { id: 1, time: at(500) },   // before anything
    { id: 2, time: at(1500) },  // a
    { id: 3, time: at(2000) },  // the moment a ended: belongs to b
    { id: 4, time: at(2500) },  // b
    { id: 5, time: at(3500) },  // a again, still open
    { id: 6, time: at(9000) }   // after now
  ];

  it('picks the calls that started inside the step visits', () => {
    expect(callsDuring(visits, 'a', calls, 5000).map((call) => call.id)).toEqual([2, 5]);
    expect(callsDuring(visits, 'b', calls, 5000).map((call) => call.id)).toEqual([3, 4]);
  });

  it('is empty for a step never seen', () => {
    expect(callsDuring(visits, 'c', calls, 5000)).toEqual([]);
  });

  it('ignores calls without a usable time', () => {
    expect(callsDuring(visits, 'a', [{ id: 1 }, { id: 2, time: 'x' }], 5000)).toEqual([]);
  });
});

describe('describeStep', () => {
  const visits = [
    { key: 'a', name: 'a', from: 0, to: 30000 },
    { key: 'b', name: 'b', from: 30000, to: 40000 },
    { key: 'a', name: 'a', from: 40000, to: 82000 }
  ];

  it('words the time, the visits and the calls', () => {
    const lines = describeStep(visits, 'a', [{ id: 7, time: at(100) }, { id: 8, time: at(35000) }], 90000);
    expect(lines.time).toBe('Time on this step: 72,000 ms (2 visits)');
    expect(lines.calls).toBe('Calls during this step: 1');
    expect(lines.callList.map((call) => call.id)).toEqual([7]);
  });

  it('uses the singular for one visit', () => {
    expect(describeStep(visits, 'b', [], 90000).time).toBe('Time on this step: 10,000 ms (1 visit)');
  });

  it('writes the time the way the Time format setting says', () => {
    expect(describeStep(visits, 'a', [], 90000, 'human').time).toBe('Time on this step: 1m 12s (2 visits)');
    expect(describeStep(visits, 'b', [], 90000, 'human').time).toBe('Time on this step: 10.0 s (1 visit)');
    expect(describeStep(visits, 'b', [], 90000, 'ms').time).toBe('Time on this step: 10,000 ms (1 visit)');
    expect(describeStep(visits, 'b', [], 90000, 'anything else').time).toBe('Time on this step: 10,000 ms (1 visit)');
  });

  it('counts the visit in progress up to now', () => {
    const open = [{ key: 'a', name: 'a', from: 80000, to: null }];
    expect(describeStep(open, 'a', [], 90000).time).toBe('Time on this step: 10,000 ms (1 visit)');
  });

  it('gives the plain numbers behind the lines, for a head that shows only what is above zero', () => {
    const lines = describeStep(visits, 'a', [{ id: 7, time: at(100) }], 90000);
    expect([lines.callCount, lines.timeMs]).toEqual([1, 72000]);
    const none = describeStep(visits, 'z', [], 90000);
    expect([none.callCount, none.timeMs]).toEqual([0, 0]);
  });

  it('says so for a step not seen', () => {
    const lines = describeStep(visits, 'z', [], 90000);
    expect(lines.time).toBe('Time on this step: not seen yet');
    expect(lines.calls).toBe('Calls during this step: 0');
  });
});

describe('timelineModel', () => {
  const visits = [
    { key: 'a', name: 'Intro', from: 1000, to: 5000 },
    { key: 'b', name: 'Details', from: 5000, to: 7000 },
    { key: 'a', name: 'Intro', from: 7000, to: null }
  ];
  const calls = [
    { id: 1, name: 'First', time: new Date(1000) },   // at the very start of Intro
    { id: 2, name: 'Second', time: new Date(3000) },  // half way through Intro
    { id: 3, name: 'Third', time: new Date(5000) },   // the moment Intro ended: belongs to Details
    { id: 4, name: 'Fourth', time: 9000 },            // during the open visit, as a number
    { id: 5, name: 'Early', time: new Date(10) }      // before everything
  ];
  const history = [
    { raw: '12345', time: new Date(2000) },
    { raw: '1234567', time: new Date(4500) },
    { raw: '123', time: new Date(8000) }
  ];

  it('makes one row per visit, oldest first, with when and for how long', () => {
    const { rows, hidden } = timelineModel(visits, calls, history, 11000);
    expect(hidden).toBe(0);
    expect(rows.map((row) => [row.name, row.from, row.ms, row.open])).toEqual([
      ['Intro', 1000, 4000, false], ['Details', 5000, 2000, false], ['Intro', 7000, 4000, true]
    ]);
  });

  it('runs an open visit up to now', () => {
    expect(timelineModel(visits, calls, history, 8000).rows[2].ms).toBe(1000);
    expect(timelineModel(visits, calls, history, 6000).rows[2].ms).toBe(0);
  });

  it('puts the calls of a visit on it as ticks along its length', () => {
    const { rows } = timelineModel(visits, calls, history, 11000);
    expect(rows[0].ticks.map((tick) => [tick.id, tick.at])).toEqual([[1, 0], [2, 0.5]]);
    expect(rows[1].ticks.map((tick) => tick.id)).toEqual([3]);
    expect(rows[1].ticks[0].at).toBe(0);
    expect(rows[2].ticks.map((tick) => [tick.id, tick.at])).toEqual([[4, 0.5]]);
    expect(rows.map((row) => row.callCount)).toEqual([2, 1, 1]);
    expect(rows[0].ticks[1].name).toBe('Second');
  });

  it('gives the size of the last payload read during the visit, or none', () => {
    const { rows } = timelineModel(visits, calls, history, 11000);
    expect(rows.map((row) => row.bytes)).toEqual([7, null, 3]);
  });

  it('scales the bars by the longest visit', () => {
    const { rows } = timelineModel(visits, calls, history, 11000);
    expect(rows.map((row) => row.share)).toEqual([1, 0.5, 1]);
    expect(timelineModel([{ key: 'a', name: 'A', from: 5, to: 5 }], [], [], 9).rows[0].share).toBe(0);
  });

  it('keeps the newest visits and counts the rest', () => {
    const many = Array.from({ length: TIMELINE_VISITS + 5 }, (_, i) => ({ key: `k${i}`, name: `S${i}`, from: i * 10, to: i * 10 + 5 }));
    const { rows, hidden } = timelineModel(many, [], [], 9999);
    expect(rows).toHaveLength(TIMELINE_VISITS);
    expect(hidden).toBe(5);
    expect(rows[0].name).toBe('S5');
    expect(rows[0].index).toBe(5);
  });

  it('copes with nothing, and with calls and snapshots that have no usable time', () => {
    expect(timelineModel([], [], [], 1)).toEqual({ rows: [], hidden: 0 });
    expect(timelineModel(undefined, undefined, undefined, 1)).toEqual({ rows: [], hidden: 0 });
    const odd = timelineModel(visits, [{ id: 9, time: 'x' }], [{ raw: 'x', time: 'y' }], 11000);
    expect(odd.rows.map((row) => [row.callCount, row.bytes])).toEqual([[0, null], [0, null], [0, null]]);
  });
});

describe('timelineSignature', () => {
  const visits = [{ key: 'a', name: 'A', from: 0, to: 10 }, { key: 'b', name: 'B', from: 10, to: null }];
  const sign = (now, calls = [], history = []) => timelineSignature(timelineModel(visits, calls, history, now));

  it('does not change while only the open visit grows', () => {
    expect(sign(100)).toBe(sign(5000));
  });

  it('changes when a visit closes, a call arrives or a payload is read', () => {
    const base = sign(100);
    expect(timelineSignature(timelineModel([visits[0], { ...visits[1], to: 50 }], [], [], 100))).not.toBe(base);
    expect(sign(100, [{ id: 1, time: 20 }])).not.toBe(base);
    expect(sign(100, [], [{ raw: 'abc', time: 20 }])).not.toBe(base);
  });
});

describe('closedVisits', () => {
  it('ends the visit still open at the time the file was saved, and leaves closed ones alone', () => {
    const visits = [
      { key: 'a', name: 'A', from: 1000, to: 4000 },
      { key: 'b', name: 'B', from: 4000, to: null }
    ];
    expect(closedVisits(visits, 9000)).toEqual([
      { key: 'a', name: 'A', from: 1000, to: 4000 },
      { key: 'b', name: 'B', from: 4000, to: 9000 }
    ]);
  });

  it('gives an open visit no length when the save time is missing or before it began', () => {
    const open = [{ key: 'b', name: 'B', from: 4000, to: null }];
    expect(closedVisits(open, NaN)[0].to).toBe(4000);
    expect(closedVisits(open, undefined)[0].to).toBe(4000);
    expect(closedVisits(open, 3000)[0].to).toBe(4000);
  });

  it('does not change what it is given, and takes a missing list as none', () => {
    const open = [{ key: 'b', name: 'B', from: 4000, to: null }];
    closedVisits(open, 9000);
    expect(open[0].to).toBeNull();
    expect(closedVisits(undefined, 1)).toEqual([]);
  });
});
