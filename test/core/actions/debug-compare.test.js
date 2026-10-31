'use strict';

/* Two debug runs side by side: steps matched by element name, the delta and
 * its verdict, the totals. Invented runs (test/fixtures/debug-runs.js). */

import { ipDebugModel, drDebugModel } from '../../../src/core/actions/debug-run.js';
import {
  compareDebugRuns, verdictOf, deltaText, comparableRuns, showCompareStatus, rowName, presenceNote, rowChanged, rowDiffers, compareHeading, ranChange
} from '../../../src/core/actions/debug-compare.js';
import { ipFullData, drResult } from '../../fixtures/debug-runs.js';

const run = (tweak = (data) => data) => ipDebugModel({ fullDataJson: tweak(ipFullData()) });
const rowOf = (result, name) => result.rows.find((row) => row.name === name);

describe('comparing two debug runs', () => {
  it('finds equal runs identical, with no delta', () => {
    const result = compareDebugRuns(run(), run());
    expect(result.identical).toBe(true);
    expect(result.rows.map((row) => row.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(result.rows.every((row) => row.deltaMs === 0 && row.verdict === '' && row.presence === 'both')).toBe(true);
    expect(result.totals).toMatchObject({ statusA: 'Succeeded', statusB: 'Succeeded', elapsedA: 410, elapsedB: 410, deltaMs: 0, verdict: '', cpuDeltaMs: 0 });
  });

  it('gives each element its status and time in both runs and the signed delta', () => {
    const slower = run((data) => { data.CallRatingDebug.ElapsedTime = 360; data.CallRatingDebug.ElapsedTimeCPU = 90; data.elapsedTimeActual = 530; return data; });
    const result = compareDebugRuns(run(), slower);
    expect(rowOf(result, 'CallRating')).toMatchObject({
      presence: 'both', statusA: 'Succeeded', statusB: 'Succeeded', elapsedA: 240, elapsedB: 360, deltaMs: 120, verdict: 'slower', cpuDeltaMs: 30
    });
    expect(rowOf(result, 'GetAccount').deltaMs).toBe(0);
    expect(result.totals).toMatchObject({ elapsedA: 410, elapsedB: 530, deltaMs: 120, verdict: 'slower' });
    expect(result.identical).toBe(false);
  });

  it('says faster for a big enough drop', () => {
    const faster = run((data) => { data.GetAccountDebug.ElapsedTime = 60; return data; });
    expect(rowOf(compareDebugRuns(run(), faster), 'GetAccount')).toMatchObject({ deltaMs: -60, verdict: 'faster' });
  });

  it('keeps a change that is under 20% or under 10 ms without a verdict', () => {
    expect(verdictOf(240, 30)).toBe('');          // 12.5%, 30 ms
    expect(verdictOf(240, 48)).toBe('slower');    // exactly 20%
    expect(verdictOf(20, 9)).toBe('');            // 45% but under 10 ms
    expect(verdictOf(20, 10)).toBe('slower');     // 50% and 10 ms
    expect(verdictOf(100, -20)).toBe('faster');
    expect(verdictOf(100, -19)).toBe('');
    expect(verdictOf(0, 12)).toBe('slower');      // from nothing
    expect(verdictOf(100, null)).toBe('');
  });

  it('marks an element only one run has, and puts those after the first run\'s own order', () => {
    const second = run((data) => {
      data.executionSequence = ['GetAccount', 'AuditLog', 'CallRating'];
      delete data.SetTotals;
      delete data.SetTotalsDebug;
      data.AuditLogDebug = { Status: 'Success', Type: 'Set Values', ElapsedTime: 5, ElapsedTimeCPU: 1 };
      return data;
    });
    const result = compareDebugRuns(run(), second);
    expect(result.rows.map((row) => [row.name, row.presence])).toEqual([
      ['GetAccount', 'both'], ['SetTotals', 'a-only'], ['CallRating', 'both'], ['AuditLog', 'b-only']
    ]);
    expect(rowOf(result, 'SetTotals')).toMatchObject({ statusA: 'Succeeded', statusB: '', elapsedA: 10, elapsedB: null, deltaMs: null, verdict: '' });
    expect(rowOf(result, 'AuditLog')).toMatchObject({ statusA: '', statusB: 'Succeeded', elapsedA: null, elapsedB: 5, deltaMs: null });
    expect(presenceNote(rowOf(result, 'SetTotals'))).toBe('only before');
    expect(presenceNote(rowOf(result, 'AuditLog'))).toBe('only after');
    expect(presenceNote(rowOf(result, 'GetAccount'))).toBe('');
    expect(result.identical).toBe(false);
  });

  it('follows the first run\'s order when the second ran them in another', () => {
    const reordered = run((data) => { data.executionSequence = ['CallRating', 'GetAccount', 'SetTotals']; return data; });
    const result = compareDebugRuns(run(), reordered);
    expect(result.rows.map((row) => row.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(result.rows.every((row) => !rowChanged(row))).toBe(true);
    expect(result.orderChanged).toBe(true);
    expect(result.identical).toBe(false);
    expect(compareHeading(result, 'ip')).toBe('Steps — 0 of 3 steps differ · order changed');
  });

  it('does not call the same order changed because an element only one run has sits between', () => {
    const extra = run((data) => { data.executionSequence = ['GetAccount', 'AuditLog', 'SetTotals', 'CallRating']; data.AuditLogDebug = { Status: 'Success', ElapsedTime: 1 }; return data; });
    expect(compareDebugRuns(run(), extra).orderChanged).toBe(false);
    expect(compareDebugRuns(run(), run()).orderChanged).toBe(false);
  });

  it('matches an element that ran twice first with first and second with second', () => {
    const twice = (second) => run((data) => {
      data.executionSequence = ['GetAccount', 'SetTotals', 'GetAccount'];
      data.GetAccountDebug = { ...data.GetAccountDebug, ElapsedTime: second };
      return data;
    });
    const result = compareDebugRuns(twice(100), twice(200));
    expect(result.rows.map((row) => rowName(row))).toEqual(['GetAccount', 'SetTotals', 'GetAccount (2)', 'CallRating']);
    expect(result.rows[0].presence).toBe('both');
    expect(result.rows[2].presence).toBe('both');
  });

  it('sees a status that changed, and a failed run in the totals', () => {
    const failing = run((data) => { data.SetTotalsDebug.Status = 'Error'; return data; });
    const result = compareDebugRuns(run(), failing);
    expect(rowOf(result, 'SetTotals')).toMatchObject({ statusA: 'Succeeded', statusB: 'Failed', deltaMs: 0 });
    expect(rowChanged(rowOf(result, 'SetTotals'))).toBe(true);
    expect(rowChanged(rowOf(result, 'GetAccount'))).toBe(false);
    expect(compareDebugRuns({ ...run(), ok: true }, { ...failing, ok: false }).totals)
      .toMatchObject({ statusA: 'Succeeded', statusB: 'Failed' });
  });

  describe('the heading', () => {
    it('counts a step as differing by its status or a tagged time, not by a few milliseconds', () => {
      const noise = run((data) => { data.GetAccountDebug.ElapsedTime = 121; data.CallRatingDebug.ElapsedTime = 244; return data; });
      const result = compareDebugRuns(run(), noise);
      expect(result.rows.filter(rowChanged)).toHaveLength(2);
      expect(result.rows.filter(rowDiffers)).toHaveLength(0);
      expect(compareHeading(result, 'ip')).toBe('Steps — 0 of 3 steps differ');
      const real = run((data) => { data.CallRatingDebug.ElapsedTime = 360; data.SetTotalsDebug.Status = 'Error'; return data; });
      const second = compareDebugRuns(run(), real);
      expect(second.rows.filter(rowDiffers).map((row) => row.name)).toEqual(['SetTotals', 'CallRating']);
      expect(compareHeading(second, 'ip')).toBe('Steps — 2 of 3 steps differ');
    });

    it('says so when only the total differs', () => {
      const result = compareDebugRuns(run(), run((data) => { data.elapsedTimeActual = 960; return data; }));
      expect(compareHeading(result, 'ip')).toBe('Steps — 0 of 3 steps differ · total slower');
    });

    it('counts an element only one run has', () => {
      const result = compareDebugRuns(run(), run((data) => { data.executionSequence = ['GetAccount', 'SetTotals']; delete data.CallRating; delete data.CallRatingDebug; return data; }));
      expect(compareHeading(result, 'ip')).toBe('Steps — 1 of 3 steps differ');
    });

    it('is identical for equal runs, and a DataRaptor says Run', () => {
      expect(compareHeading(compareDebugRuns(run(), run()), 'ip')).toBe('Steps — identical');
      const dr = (ms) => drDebugModel({ ...drResult(), ActualTime: ms });
      expect(compareHeading(compareDebugRuns(dr(48), dr(48)), 'dr')).toBe('Run — identical');
      expect(compareHeading(compareDebugRuns(dr(48), dr(96)), 'dr')).toBe('Run — differs');
    });
  });

  describe('a step that did not run', () => {
    const withSkip = (skipped) => run((data) => {
      if (skipped) { data.CB_Other = null; data.CB_OtherStatus = false; } else { data.CB_OtherDebug = { Status: 'Success', Type: 'Set Values', ElapsedTime: 30, ElapsedTimeCPU: 4 }; data.CB_Other = {}; }
      return data;
    });

    it('has no time, and a skip in one run only is tagged ran or skipped', () => {
      const ranThen = compareDebugRuns(withSkip(true), withSkip(false));
      expect(rowOf(ranThen, 'CB_Other')).toMatchObject({ statusA: 'Skipped', statusB: 'Succeeded', elapsedA: null, elapsedB: 30, deltaMs: null, verdict: '', ranChange: 'ran' });
      expect(rowDiffers(rowOf(ranThen, 'CB_Other'))).toBe(true);
      const skippedNow = compareDebugRuns(withSkip(false), withSkip(true));
      expect(rowOf(skippedNow, 'CB_Other')).toMatchObject({ statusA: 'Succeeded', statusB: 'Skipped', elapsedA: 30, elapsedB: null, ranChange: 'skipped' });
      expect(compareHeading(skippedNow, 'ip')).toBe('Steps — 1 of 4 steps differ');
    });

    it('is no difference when both runs skipped it', () => {
      const result = compareDebugRuns(withSkip(true), withSkip(true));
      expect(rowOf(result, 'CB_Other')).toMatchObject({ statusA: 'Skipped', statusB: 'Skipped', ranChange: '' });
      expect(rowDiffers(rowOf(result, 'CB_Other'))).toBe(false);
      expect(result.identical).toBe(true);
    });

    it('tags only a step both runs have', () => {
      expect(ranChange({ status: 'Skipped' }, { status: 'Succeeded' })).toBe('ran');
      expect(ranChange({ status: 'Succeeded' }, { status: 'Skipped' })).toBe('skipped');
      expect(ranChange({ status: 'Succeeded' }, { status: 'Succeeded' })).toBe('');
      expect(ranChange(null, { status: 'Succeeded' })).toBe('');
    });
  });

  it('leaves a time the answers did not carry out of the deltas', () => {
    const silent = run((data) => { delete data.elapsedTimeActual; delete data.elapsedTimeCPU; return data; });
    const result = compareDebugRuns(run(), silent);
    expect(result.totals).toMatchObject({ elapsedA: 410, elapsedB: null, deltaMs: null, verdict: '', cpuDeltaMs: null });
  });

  it('compares two DataRaptor runs by their totals alone', () => {
    const result = compareDebugRuns(drDebugModel(drResult()), drDebugModel({ ...drResult(), ActualTime: 96, CpuTime: 20 }));
    expect(result.rows).toEqual([]);
    expect(result.totals).toMatchObject({ elapsedA: 48, elapsedB: 96, deltaMs: 48, verdict: 'slower', cpuDeltaMs: 0 });
    expect(result.identical).toBe(false);
  });

  it('does not fail on a missing model', () => {
    const result = compareDebugRuns(null, undefined);
    expect(result.rows).toEqual([]);
    expect(result.totals).toMatchObject({ elapsedA: null, deltaMs: null });
  });
});

describe('the words around a comparison', () => {
  it('writes a signed time', () => {
    expect(deltaText(30, 'ms')).toBe('+30 ms');
    expect(deltaText(-12, 'ms')).toBe('-12 ms');
    expect(deltaText(0, 'ms')).toBe('0 ms');
    expect(deltaText(-1500, 'human')).toBe('-1.5 s');
    expect(deltaText(null, 'ms')).toBe('');
  });

  it('compares debug runs of one kind only', () => {
    expect(comparableRuns({ debug: 'ip' }, { debug: 'ip' })).toBe(true);
    expect(comparableRuns({ debug: 'dr' }, { debug: 'dr' })).toBe(true);
    expect(comparableRuns({ debug: 'ip' }, { debug: 'dr' })).toBe(false);
    expect(comparableRuns({ debug: 'ip' }, {})).toBe(false);
    expect(comparableRuns({}, {})).toBe(false);
    expect(comparableRuns(null, { debug: 'ip' })).toBe(false);
  });

  it('says nothing of a status when both runs ended the element with Succeeded', () => {
    expect(showCompareStatus('Succeeded', 'Succeeded')).toBe(false);
    expect(showCompareStatus('Success', 'succeeded')).toBe(false);
    expect(showCompareStatus('Succeeded', 'Failed')).toBe(true);
    expect(showCompareStatus('Failed', 'Failed')).toBe(true);
    expect(showCompareStatus('Succeeded', 'Skipped')).toBe(true);
    expect(showCompareStatus('Succeeded', '')).toBe(true);
  });
});
