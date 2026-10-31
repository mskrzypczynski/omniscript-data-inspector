'use strict';

/* The views of the Debug tab, the decisions: which options the picker offers,
 * what each view shows and copies, the log chips, the steps as a table.
 * Names, Ids and values are invented (test/fixtures/debug-runs.js). */

import {
  ipDebugModel, drDebugModel, debugModelOf, blankOpen, parseDebugLog, debugHeadParts, logStats, knownWordOrMasked, debugCopy, statusTone, shareLabel
} from '../../../src/core/actions/debug-run.js';
import {
  debugViews, resolveView, viewValue, elementValue, debugFullData, logChips, logLineShown, visibleLog, slowestStep, stepsMarkdown,
  stepMatches, viewCopyText, viewCopyTitle, stepIndexOfView, stepViewId, visibleSteps, maskElement, nothingToCopy, leftNothing, OVERVIEW
} from '../../../src/core/actions/debug-views.js';
import { maskValues, MASK_STRING } from '../../../src/core/shared/mask.js';
import { ipFullData, drResult, ACCOUNT_ID, IP_LOG } from '../../fixtures/debug-runs.js';

const ipEntry = (data = ipFullData()) => ({ debug: 'ip', output: { fullDataJson: data }, action: {} });
const drEntry = (result = drResult()) => ({ debug: 'dr', output: result, action: { options: { interfaceType: 'Extract' } } });
const modelOf = (entry) => (entry.debug === 'dr' ? drDebugModel(entry.output) : ipDebugModel(entry.output));
const ids = (views) => views.map((view) => view.id);

describe('the options of the picker', () => {
  it('offers the Overview, the whole data, Response, Original input, the log, then each element in run order', () => {
    const entry = ipEntry();
    const views = debugViews(modelOf(entry), entry);
    expect(views.map((view) => view.label)).toEqual([
      'Overview', 'Full data JSON', 'Response', 'Original input', 'Debug log', 'GetAccount', 'SetTotals', 'CallRating'
    ]);
    expect(ids(views)).toEqual(['overview', 'full', 'response', 'original', 'log', 'step:0', 'step:1', 'step:2']);
    expect(views.filter((view) => view.kind === 'element')).toHaveLength(3);
  });

  it('leaves out an option whose data is not there', () => {
    const data = ipFullData();
    delete data.originalInput;
    delete data.debugLog;
    delete data.response;
    const entry = ipEntry(data);
    expect(ids(debugViews(modelOf(entry), entry))).toEqual(['overview', 'full', 'step:0', 'step:1', 'step:2']);
  });

  it('offers only the Overview for an answer with nothing in it', () => {
    const entry = ipEntry({});
    expect(ids(debugViews(modelOf(entry), entry))).toEqual(['overview']);
  });

  it('names an element that ran twice by its place', () => {
    const data = { ...ipFullData(), executionSequence: ['GetAccount', 'SetTotals', 'GetAccount'] };
    const entry = ipEntry(data);
    expect(debugViews(modelOf(entry), entry).filter((view) => view.kind === 'element').map((view) => view.label))
      .toEqual(['GetAccount (1)', 'SetTotals', 'GetAccount (3)', 'CallRating']); // CallRating has a block and no place in the sequence
  });

  it('offers a DataRaptor its Output, the log and the Full response, and Errors and Created objects only when there are any', () => {
    const plain = drEntry();
    expect(debugViews(modelOf(plain), plain).map((view) => view.label)).toEqual(['Overview', 'Output', 'Debug log', 'Full response']);
    const busy = drEntry({
      ...drResult({ error: 'Required field missing' }),
      createdObjectsByType: { Account: ['001000000000001AAA'] }
    });
    expect(debugViews(modelOf(busy), busy).map((view) => view.label))
      .toEqual(['Overview', 'Output', 'Errors', 'Created objects', 'Debug log', 'Full response']);
  });

  it('gives nothing without a model', () => {
    expect(debugViews(null, ipEntry())).toEqual([]);
    expect(debugViews(modelOf(ipEntry()), null)).toEqual([]);
  });

  it('keeps the chosen view while the run offers it and falls back to the Overview otherwise', () => {
    const entry = ipEntry();
    const views = debugViews(modelOf(entry), entry);
    expect(resolveView(views, 'step:1')).toBe('step:1');
    expect(resolveView(views, 'step:9')).toBe(OVERVIEW);
    expect(resolveView(views, undefined)).toBe(OVERVIEW);
    expect(blankOpen().view).toBe(OVERVIEW);
  });

  it('reads and writes the id of an element view', () => {
    expect(stepViewId(2)).toBe('step:2');
    expect(stepIndexOfView('step:2')).toBe(2);
    expect(stepIndexOfView('log')).toBe(-1);
  });
});

describe('what a view shows', () => {
  it('shows the whole data of an Integration Procedure and the whole result of a DataRaptor', () => {
    const entry = ipEntry();
    expect(viewValue(entry, modelOf(entry), 'full')).toEqual(ipFullData());
    expect(debugFullData(entry).executionSequence).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    const dr = drEntry();
    expect(viewValue(dr, modelOf(dr), 'full')).toEqual(drResult());
    expect(debugFullData(null)).toEqual({});
  });

  it('shows the response and the original input as they are', () => {
    const entry = ipEntry();
    const model = modelOf(entry);
    expect(viewValue(entry, model, 'response')).toEqual({ total: 120, currency: 'EUR' });
    expect(viewValue(entry, model, 'original')).toEqual({ ContextId: ACCOUNT_ID });
  });

  it('shows an element as input, options, output and the rest of its Debug block', () => {
    const entry = ipEntry();
    const value = viewValue(entry, modelOf(entry), 'step:0');
    expect(Object.keys(value)).toEqual(['input', 'options', 'output', 'debug']);
    expect(value.input).toEqual({ accountId: ACCOUNT_ID });
    expect(value.options).toEqual({ bundle: 'DRDemoGetAccount' });
    expect(value.output).toEqual({ Name: 'Demo Corp', Address: { City: 'Demo City', Lines: ['1 Demo Street'] } });
    expect(value.debug).toEqual({ Status: 'Success', Type: 'DataRaptor Extract Action', ElapsedTime: 120, ElapsedTimeCPU: 30 });
    expect(elementValue(entry, modelOf(entry), 9)).toBeUndefined();
  });

  it('shows only the roots an element has: no input, options or debug line for what it did not leave', () => {
    const entry = ipEntry({ executionSequence: ['Lonely'], Lonely: { a: 1 } });
    const value = viewValue(entry, modelOf(entry), 'step:0');
    expect(value).toEqual({ output: { a: 1 } });
    expect(Object.keys(value)).toEqual(['output']);
  });

  it('shows an element with no block and no output as nothing', () => {
    const entry = ipEntry({ executionSequence: ['Ghost'] });
    const value = viewValue(entry, modelOf(entry), 'step:0');
    expect(value).toEqual({});
    expect(leftNothing(value)).toBe(true);
    expect(leftNothing({ output: 1 })).toBe(false);
    expect(viewCopyText(entry, modelOf(entry), 'step:0')).toBe('{}');
    expect(nothingToCopy(entry, modelOf(entry), 'step:0')).toBe(true);
    expect(nothingToCopy(entry, modelOf(entry), OVERVIEW)).toBe(false);
  });

  it('offers no Response for an empty one, and no Original input for a null one', () => {
    const empty = (tweak) => { const data = ipFullData(); tweak(data); const entry = ipEntry(data); return ids(debugViews(modelOf(entry), entry)); };
    expect(empty((data) => { data.response = {}; })).not.toContain('response');
    expect(empty((data) => { data.response = null; })).not.toContain('response');
    expect(empty((data) => { data.response = []; })).not.toContain('response');
    expect(empty((data) => { data.response = { total: 0 }; })).toContain('response');
    expect(empty((data) => { data.originalInput = null; })).not.toContain('original');
    expect(empty((data) => { data.originalInput = {}; })).toContain('original');
  });

  it('shows a DataRaptor part and nothing for a view that is not a tree', () => {
    const dr = drEntry();
    const model = modelOf(dr);
    expect(viewValue(dr, model, 'output')).toEqual({ Account: [{ Name: 'Demo Corp', Id: ACCOUNT_ID }] });
    expect(viewValue(dr, model, 'log')).toBeUndefined();
    expect(viewValue(dr, null, 'output')).toBeUndefined();
  });
});

describe('the log chips', () => {
  const log = parseDebugLog(IP_LOG);

  it('has a chip for each kind of line the log holds, with its count', () => {
    expect(logChips(log).map((chip) => [chip.id, chip.count])).toEqual([['queries', 1], ['timing', 2], ['info', 1]]);
  });

  it('counts the Queries chip in queries, as the totals line and the head line do, while it still shows the count lines', () => {
    const chip = logChips(log).find((one) => one.id === 'queries');
    expect(chip.count).toBe(logStats(log).queries);
    expect(chip.count).toBe(1);
    expect(visibleLog(log, new Set(['queries']), '', false)).toHaveLength(2);
    const model = modelOf(ipEntry());
    const head = debugHeadParts({ debug: 'ip', action: {} }, model, 'ms').find((part) => /quer/.test(part) && !/in queries/.test(part));
    expect(head).toBe(`${chip.count} query`);
  });

  it('agrees on two queries with their two count lines', () => {
    const two = parseDebugLog([
      '2026-03-02T09:15:00.000Z: Query: SELECT Id FROM Account',
      '2026-03-02T09:15:00.010Z: Query results found: 2',
      '2026-03-02T09:15:00.020Z: Query: SELECT Id FROM Contact',
      '2026-03-02T09:15:00.030Z: Query results found: 5'
    ]);
    expect(logChips(two).find((chip) => chip.id === 'queries').count).toBe(2);
    expect(logStats(two).queries).toBe(2);
    expect(debugHeadParts({ debug: 'ip', action: {} }, { ...modelOf(ipEntry()), log: two }, 'ms')).toContain('2 queries');
  });

  it('leaves out a chip with nothing behind it', () => {
    expect(logChips(parseDebugLog(['2026-03-02T09:15:00.000Z: Run started'])).map((chip) => chip.id)).toEqual(['info']);
    expect(logChips([])).toEqual([]);
  });

  it('shows every line with no chip pressed, and the lines of the pressed chips otherwise', () => {
    expect(visibleLog(log, new Set(), '', false)).toHaveLength(5);
    expect(visibleLog(log, new Set(['queries']), '', false).map((line) => line.kind)).toEqual(['query', 'count']);
    expect(visibleLog(log, new Set(['timing']), '', false).map((line) => line.kind)).toEqual(['time', 'time']);
    expect(visibleLog(log, new Set(['queries', 'info']), '', false).map((line) => line.kind)).toEqual(['info', 'query', 'count']);
  });

  it('narrows by the filter text, on the line as shown, so a masked value cannot be searched for', () => {
    expect(visibleLog(log, new Set(), 'demo corp', false)).toHaveLength(1);
    expect(visibleLog(log, new Set(), 'demo corp', true)).toHaveLength(0);
    expect(visibleLog(log, new Set(['timing']), 'query', false)).toHaveLength(1);
    expect(logLineShown(log[0], undefined, '  ', false)).toBe(true);
  });
});

describe('the steps', () => {
  it('singles out the slowest step, and none when there is nothing to tell apart', () => {
    const steps = ipEntry() && modelOf(ipEntry()).steps;
    expect(slowestStep(steps)).toBe(2);
    expect(slowestStep([{ elapsedMs: 5 }])).toBe(-1);
    expect(slowestStep([{ elapsedMs: 5 }, { elapsedMs: 5 }])).toBe(-1);
    expect(slowestStep([{ elapsedMs: null }, { elapsedMs: 7 }])).toBe(-1);
    expect(slowestStep([{ elapsedMs: 0 }, { elapsedMs: 7 }, { elapsedMs: 3 }])).toBe(1);
    expect(slowestStep([])).toBe(-1);
  });

  it('counts a step that took 0 ms as timed, keeping the no-tie rule', () => {
    expect(slowestStep([{ elapsedMs: 0 }, { elapsedMs: 240 }])).toBe(1);
    expect(slowestStep([{ elapsedMs: 0 }, { elapsedMs: 0 }, { elapsedMs: 240 }])).toBe(2);
    expect(slowestStep([{ elapsedMs: 0 }, { elapsedMs: 0 }])).toBe(-1);
    expect(slowestStep([{ elapsedMs: 0 }])).toBe(-1);
    expect(slowestStep([{ elapsedMs: 240 }, { elapsedMs: 0 }, { elapsedMs: 240 }])).toBe(-1);
  });

  it('never singles out a step that did not run', () => {
    const steps = [{ elapsedMs: 5, status: 'Succeeded' }, { elapsedMs: 9, status: 'Skipped' }, { elapsedMs: 7, status: 'Succeeded' }];
    expect(slowestStep(steps)).toBe(2);
    expect(slowestStep([{ elapsedMs: 5, status: 'Succeeded' }, { elapsedMs: null, status: 'Skipped' }])).toBe(-1);
  });

  it('writes the steps as a Markdown table', () => {
    expect(stepsMarkdown(modelOf(ipEntry()), 'ms')).toBe([
      '| # | Element | Type | Status | Elapsed | CPU |',
      '|---|---|---|---|---|---|',
      '| 1 | GetAccount | DataRaptor Extract Action | Succeeded | 120 ms | 30 ms |',
      '| 2 | SetTotals | Set Values | Succeeded | 10 ms | 2 ms |',
      '| 3 | CallRating | HTTP Action | Succeeded | 240 ms | 60 ms |'
    ].join('\n'));
  });

  it('keeps a cell with a bar or a line break in one cell, and leaves a missing time empty', () => {
    const model = { steps: [{ name: 'A|B', type: 'x\ny', status: '', elapsedMs: null, cpuMs: 1500 }] };
    expect(stepsMarkdown(model, 'human').split('\n')[2]).toBe('| 1 | A\\|B | x y |  |  | 1.5 s |');
    expect(stepsMarkdown({ steps: [] }, 'ms')).toBe('');
    expect(stepsMarkdown(null, 'ms')).toBe('');
  });

  it('carries no value of the run: the same table with Mask values on', () => {
    const entry = ipEntry();
    const masked = ipDebugModel(maskValues({ fullDataJson: ipFullData() }));
    expect(stepsMarkdown(masked, 'ms')).not.toContain('Demo');
    expect(stepsMarkdown(modelOf(entry), 'ms')).not.toContain(ACCOUNT_ID);
  });

  describe('a step that did not run', () => {
    const skipRun = () => {
      const data = ipFullData();
      data.CB_Other = null;
      data.CB_OtherStatus = false; // outside the sequence, no block: it did not run
      return ipDebugModel({ fullDataJson: data });
    };

    it('reads as skipped, with no times, in the table', () => {
      const model = skipRun();
      expect(model.steps[3]).toMatchObject({ name: 'CB_Other', status: 'Skipped', elapsedMs: null, cpuMs: null });
      expect(stepsMarkdown(model, 'ms').split('\n').pop()).toBe('| 4 | CB_Other |  | Skipped |  |  |');
      expect(stepsMarkdown(model, 'ms', { masked: true }).split('\n').pop()).toBe('| 4 | CB_Other |  | Skipped |  |  |');
    });

    it('is grey, says it did not run, and is never the slowest', () => {
      const model = skipRun();
      expect(statusTone('Skipped')).toBe('neutral');
      expect(statusTone('skipped')).toBe('neutral');
      expect(statusTone('Success')).toBe('good');
      expect(shareLabel(model.steps[3])).toBe('Skipped');
      expect(model.steps[3].share).toBe(0);
      expect(slowestStep(model.steps)).toBe(2);
    });
  });

  it('copies the rows the filter shows, numbered as in the run', () => {
    const model = modelOf(ipEntry());
    expect(visibleSteps(model, '').map((one) => one.index)).toEqual([0, 1, 2]);
    expect(visibleSteps(model, 'http').map((one) => one.index)).toEqual([2]);
    expect(visibleSteps(null, '')).toEqual([]);
    expect(stepsMarkdown(model, 'ms', { filter: 'http' })).toBe([
      '| # | Element | Type | Status | Elapsed | CPU |',
      '|---|---|---|---|---|---|',
      '| 3 | CallRating | HTTP Action | Succeeded | 240 ms | 60 ms |'
    ].join('\n'));
    expect(stepsMarkdown(model, 'ms', { filter: 'zzz' })).toBe('');
  });

  describe('under Mask values', () => {
    const secretRun = () => {
      const data = ipFullData();
      data.GetAccountDebug.Status = 'Error: record 001000000000001AAA for Zed Example not found';
      data.SetTotalsDebug.Type = 'Custom Action for Zed Example';
      return ipDebugModel({ fullDataJson: data });
    };

    it('keeps a status or type only when it is a short known word', () => {
      ['Success', 'succeeded', 'ERROR', 'Failed', 'failure', 'Skipped', 'Warning', 'Not run', 'not   executed',
        'DataRaptor Extract Action', 'Integration Procedure Action', 'Remote Action', 'HTTP Action', 'Set Values', 'Conditional Block',
        'Response Action', 'Loop Block', 'Cache Block', 'Try Catch Block', 'Matrix Action', 'Calculation Action', 'Email Action',
        'DataRaptor Transform Action', 'DataRaptor Post Action', 'DataRaptor Turbo Action', 'List Action', 'Dynamic Action'].forEach((word) => {
        expect(knownWordOrMasked(word)).toBe(word);
      });
      expect(knownWordOrMasked('Error: record 001000000000001AAA not found')).toBe(MASK_STRING);
      expect(knownWordOrMasked('Success for Zed Example')).toBe(MASK_STRING);
      expect(knownWordOrMasked('Zed')).toBe(MASK_STRING);
      expect(knownWordOrMasked('')).toBe('');
      expect(knownWordOrMasked(undefined)).toBe('');
      expect(knownWordOrMasked(null)).toBe('');
      expect(knownWordOrMasked(42)).toBe(MASK_STRING);
    });

    it('copies the table without the free text of a status or type', () => {
      const text = stepsMarkdown(secretRun(), 'ms', { masked: true });
      expect(text).not.toContain('Zed');
      expect(text).not.toContain('001000000000001AAA');
      expect(text).toContain('| 1 | GetAccount | DataRaptor Extract Action | <string> |');
      expect(text).toContain('| 2 | SetTotals | <string> | Succeeded |');
      expect(stepsMarkdown(secretRun(), 'ms')).toContain('Zed Example');
    });

    it('copies the Overview without them either', () => {
      const model = secretRun();
      const text = JSON.stringify(debugCopy({ debug: 'ip' }, model, maskValues));
      expect(text).not.toContain('Zed');
      expect(text).not.toContain('001000000000001AAA');
      const copied = debugCopy({ debug: 'ip' }, model, maskValues);
      expect(copied.steps[2]).toMatchObject({ type: 'HTTP Action', status: 'Succeeded' });
      expect(JSON.stringify(debugCopy({ debug: 'ip' }, model))).toContain('Zed Example');
    });

    it('copies an element view with the known words of its debug root and nothing else', () => {
      const data = ipFullData();
      data.GetAccountDebug.Status = 'Error: Zed Example not found';
      const entry = ipEntry(data);
      const model = modelOf(entry);
      const text = viewCopyText(entry, model, 'step:0', maskValues);
      expect(text).not.toContain('Zed');
      const debug = JSON.parse(text).debug;
      expect(debug).toEqual({ Status: MASK_STRING, Type: 'DataRaptor Extract Action', ElapsedTime: '<number>', ElapsedTimeCPU: '<number>' });
      const fine = JSON.parse(viewCopyText(ipEntry(), modelOf(ipEntry()), 'step:0', maskValues)).debug;
      expect(fine.Status).toBe('Success');
      expect(maskElement({ output: { a: 'x' } }, maskValues)).toEqual({ output: { a: MASK_STRING } });
    });
  });

  describe('nothing to copy', () => {
    it('is said for a log with no line in view, not for one with lines', () => {
      const entry = ipEntry();
      const model = modelOf(entry);
      expect(nothingToCopy(entry, model, 'log', { chips: new Set(), filter: 'zzz' })).toBe(true);
      expect(nothingToCopy(entry, model, 'log', { chips: new Set(), filter: '' })).toBe(false);
      expect(nothingToCopy(entry, model, 'full')).toBe(false);
      expect(nothingToCopy(entry, null, 'full')).toBe(true);
    });
  });

  it('matches a step by name, type or status', () => {
    const step = { name: 'GetAccount', type: 'DataRaptor Extract Action', status: 'Succeeded' };
    expect(stepMatches(step, '')).toBe(true);
    expect(stepMatches(step, 'getacc')).toBe(true);
    expect(stepMatches(step, 'extract')).toBe(true);
    expect(stepMatches(step, 'succeeded')).toBe(true);
    expect(stepMatches(step, 'nope')).toBe(false);
  });
});

describe('what Copy puts on the clipboard', () => {
  const entry = ipEntry();
  const model = modelOf(entry);

  it('copies the whole run from the Overview', () => {
    const plain = JSON.parse(viewCopyText(entry, model, 'overview', undefined));
    expect(plain.steps).toHaveLength(3);
    expect(plain.response).toEqual({ total: 120, currency: 'EUR' });
  });

  it('copies the tree of a view, masked while Mask values is on', () => {
    expect(JSON.parse(viewCopyText(entry, model, 'response', undefined))).toEqual({ total: 120, currency: 'EUR' });
    expect(JSON.parse(viewCopyText(entry, model, 'response', maskValues))).toEqual({ total: '<number>', currency: '<string>' });
    const element = viewCopyText(entry, model, 'step:0', maskValues);
    expect(element).not.toContain('Demo Corp');
    expect(element).not.toContain(ACCOUNT_ID);
    expect(Object.keys(JSON.parse(element))).toEqual(['input', 'options', 'output', 'debug']);
    const full = viewCopyText(entry, model, 'full', maskValues);
    expect(full).not.toContain('Demo Corp');
    expect(full).not.toContain(ACCOUNT_ID);
    expect(full).toContain('GetAccountDebug');
  });

  it('copies the log lines in view, one per line, with the literals hidden under Mask values', () => {
    const all = viewCopyText(entry, model, 'log', undefined, { format: 'ms' }).split('\n');
    expect(all).toHaveLength(5);
    expect(all[1]).toBe(`+37 ms\tQuery: SELECT Id, Name FROM Account WHERE Id = '${ACCOUNT_ID}' AND Name = 'Demo Corp'`);
    const masked = viewCopyText(entry, model, 'log', maskValues, { format: 'ms', chips: new Set(['queries']) });
    expect(masked.split('\n')).toEqual([
      "+37 ms\tQuery: SELECT Id, Name FROM Account WHERE Id = '•••' AND Name = '•••'",
      '+52 ms\tQuery results found: 1'
    ]);
  });

  it('copies nothing for a view the run does not have, and says what it copies', () => {
    expect(viewCopyText(entry, model, 'step:9', undefined)).toBe('');
    expect(viewCopyText(entry, null, 'overview', undefined)).toBe('');
    expect(viewCopyTitle('overview')).toMatch(/Copy this run/);
    expect(viewCopyTitle('log')).toMatch(/lines of the log/);
    expect(viewCopyTitle('full')).toMatch(/Honours Mask values/);
  });

  it('copies a loaded, masked run the same way', () => {
    const loaded = debugModelOf(entry);
    expect(JSON.parse(viewCopyText(entry, loaded, 'step:2', maskValues)).output).toEqual({ rating: '<string>' });
  });
});
