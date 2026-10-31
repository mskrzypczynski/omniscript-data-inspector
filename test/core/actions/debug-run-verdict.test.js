'use strict';

/* Debug runs: the Debug tab's outcome is the verdict of the call's row, in
 * both directions, and the model and the row read the same flags. Names, Ids
 * and hosts are invented (test/fixtures/debug-runs.js). */

import { parseRequest, decodeResponse, buildActionRecord, failed, failureReason, flagFailure, isStepFailure, exportEntries } from '../../../src/core/shared/actions-model.js';
import {
  debugModelOf, debugHeadParts, debugOutcome, ipDebugModel, drDebugModel, NO_DEBUG_INFO
} from '../../../src/core/actions/debug-run.js';
import { maskValues } from '../../../src/core/shared/mask.js';
import { recordsFromExport } from '../../../src/core/actions/actions-import.js';
import { ipPreviewCall, drPreviewCall, ipFullData, drResult, remotingAnswer, VF_URL, ACCOUNT_ID } from '../../fixtures/debug-runs.js';

function recordOfText(call, text, httpStatus = 200) {
  const action = parseRequest('vfremote', JSON.stringify(call), VF_URL)[0];
  return buildActionRecord(1, 'vfremote', action, 0, decodeResponse(text).body, {
    url: VF_URL, startedAt: new Date('2026-03-02T09:15:00Z'), durationMs: 410, httpStatus, bodySize: text.length, responseText: text
  });
}

const ipRecord = (result, status, extra) => recordOfText(ipPreviewCall(), remotingAnswer(12, result, extra), status);
const drRecord = (result, status, extra) => recordOfText(drPreviewCall(), remotingAnswer(24, result, extra), status);
const exception = (tid) => JSON.stringify([{ type: 'exception', tid, statusCode: 500, message: 'Script-thrown exception' }]);

/* The head and the row must say the same. */
function expectAgreement(entry) {
  const model = debugModelOf(entry);
  expect(model.ok).toBe(!failed(entry));
  if (failed(entry)) expect(debugHeadParts(entry, model)[0]).toBe('Failed');
  else expect(debugHeadParts(entry, model)[0]).not.toBe('Failed');
  return model;
}

describe('the Debug head takes the outcome from the row', () => {
  it('a remoting exception is Failed, with a note that the answer holds no debug information', () => {
    const entry = recordOfText(ipPreviewCall(), exception(12));
    expect(failed(entry)).toBe(true);
    expectAgreement(entry);
    expect(debugHeadParts(entry, debugModelOf(entry))).toEqual(['Failed', NO_DEBUG_INFO]);
  });

  it('a DataRaptor exception is Failed as well', () => {
    const entry = recordOfText(drPreviewCall(), exception(24));
    expect(failed(entry)).toBe(true);
    expect(debugHeadParts(entry, debugModelOf(entry))).toEqual(['Failed', NO_DEBUG_INFO]);
  });

  it('an HTTP 500 with a readable body is Failed, and keeps the times and steps it has', () => {
    const entry = ipRecord({ fullDataJson: ipFullData() }, 500);
    expect(failed(entry)).toBe(true);
    expect(debugHeadParts(entry, debugModelOf(entry))).toEqual(['Failed', '410 ms', 'CPU 95 ms', '3 steps', '1 query', '14 ms in queries']);
  });

  it('an empty body is no success: the head does not claim one', () => {
    const entry = recordOfText(ipPreviewCall(), '');
    expect(debugHeadParts(entry, debugModelOf(entry))).toEqual([NO_DEBUG_INFO]);
    expect(debugOutcome(entry, debugModelOf(entry))).toBeNull();
    const failedEmpty = recordOfText(ipPreviewCall(), '', 500);
    expect(debugHeadParts(failedEmpty, debugModelOf(failedEmpty))).toEqual(['Failed', NO_DEBUG_INFO]);
  });

  it('a result that is plain text agrees with the row', () => {
    const entry = ipRecord('Something went wrong', 200);
    const model = expectAgreement(entry);
    expect(debugHeadParts(entry, model)).toContain(NO_DEBUG_INFO);
    expect(debugHeadParts(entry, model)[0]).not.toBe('Succeeded');
  });

  it('a clean run is Succeeded, and so is its row', () => {
    const ip = ipRecord({ fullDataJson: ipFullData() });
    expect(failed(ip)).toBe(false);
    expect(debugHeadParts(ip, debugModelOf(ip))[0]).toBe('Succeeded');
    const dr = drRecord(drResult());
    expect(failed(dr)).toBe(false);
    expect(debugHeadParts(dr, debugModelOf(dr))[0]).toBe('Succeeded');
  });

  it('a failed step is Failed in the head and the row', () => {
    const entry = ipRecord({ fullDataJson: ipFullData({ failSecondStep: true }) });
    expect(failureReason(entry)).toBe('Step SetTotals Failed');
    expect(debugHeadParts(entry, debugModelOf(entry))[0]).toBe('Failed');
  });
});

describe('the row and the model read the same flags of the run', () => {
  it('success: false at the root of the run fails the row as well as the head', () => {
    const entry = ipRecord({ fullDataJson: { ...ipFullData(), success: false } });
    expect(failed(entry)).toBe(true);
    expect(failureReason(entry)).toBe('Response sets success: false');
    expect(ipDebugModel({ fullDataJson: { ...ipFullData(), success: false } }).ok).toBe(false);
    expect(debugHeadParts(entry, debugModelOf(entry))[0]).toBe('Failed');
  });

  it('an error in the run\'s response fails both', () => {
    const entry = ipRecord({ fullDataJson: { ...ipFullData(), response: { error: 'Something broke' } } });
    expect(failureReason(entry)).toBe('Response error — Something broke');
    expect(ipDebugModel(entry.output).ok).toBe(false);
  });

  it('a benign error value fails neither', () => {
    const entry = ipRecord({ fullDataJson: { ...ipFullData(), response: { error: 'OK' }, success: true } });
    expect(failed(entry)).toBe(false);
    expect(ipDebugModel(entry.output).ok).toBe(true);
  });

  it('a DataRaptor with errors fails both, whichever part holds them', () => {
    [{ errors: ['x'] }, { errorsByField: { Name: ['is required'] } }, { errorsAsJson: { Other: 'bad' } }, { hasErrors: true }].forEach((extra) => {
      const entry = drRecord({ ...drResult(), ...extra });
      expect(failed(entry)).toBe(true);
      expect(drDebugModel(entry.output).ok).toBe(false);
      expect(debugHeadParts(entry, debugModelOf(entry))[0]).toBe('Failed');
    });
    const clean = drRecord({ ...drResult(), errors: [], errorsByField: { Name: [] } });
    expect(failed(clean)).toBe(false);
    expect(drDebugModel(clean.output).ok).toBe(true);
  });

  it('flagFailure reads one object\'s flags and nothing else', () => {
    expect(flagFailure({ hasErrors: true })).toBe('Response sets hasErrors: true');
    expect(flagFailure({ success: false, error: 'boom' })).toBe('Response sets success: false — boom');
    expect(flagFailure({ errorCode: 'E1' })).toBe('Response errorCode — E1');
    expect(flagFailure({ IPResult: { success: false } })).toMatch(/^IPResult indicates failure/);
    expect(flagFailure({ errors: ['a'] })).toBe('Response errors — ["a"]');
    expect(flagFailure({ success: true, error: null, errors: [] })).toBeNull();
    expect(flagFailure(null)).toBeNull();
    expect(flagFailure('text')).toBeNull();
  });
});

describe('a model with no steps and no times', () => {
  it('says there is no debug information, whatever the verdict', () => {
    const entry = { debug: 'ip', action: {}, output: {}, failure: null };
    const model = debugModelOf(entry);
    expect(debugHeadParts(entry, model)).toEqual([NO_DEBUG_INFO]);
    expect(debugHeadParts({ ...entry, failure: 'HTTP 500' }, debugModelOf({ ...entry, failure: 'HTTP 500' }))).toEqual(['Failed', NO_DEBUG_INFO]);
    const dr = { debug: 'dr', action: { options: { interfaceType: 'Extract' } }, output: {}, failure: null };
    expect(debugHeadParts(dr, debugModelOf(dr))).toEqual([NO_DEBUG_INFO]);
  });
});

describe('step statuses', () => {
  it('count a warning as a success with a note, and a placeholder as unknown', () => {
    expect(isStepFailure('Warning')).toBe(false);
    expect(isStepFailure('Success with warnings')).toBe(false);
    expect(isStepFailure('<string>')).toBe(false);
    expect(isStepFailure('Error')).toBe(true);
    expect(isStepFailure('Aborted')).toBe(true);
  });
});

describe('a masked export loaded back', () => {
  const secret = 'Zed Example';
  const entry = ipRecord({ fullDataJson: { ...ipFullData(), response: { total: 120, owner: secret } } });
  const [row] = exportEntries([entry], maskValues);
  const [back] = recordsFromExport([JSON.parse(JSON.stringify(row))]);

  it('carries a skeleton with no value in it', () => {
    expect(row.debugRun).toMatchObject({ flavour: 'ip', outcome: 'succeeded', elapsedMs: 410, cpuMs: 95 });
    expect(row.debugRun.steps).toEqual([
      { name: 'GetAccount', type: 'DataRaptor Extract Action', status: 'Succeeded', elapsedMs: 120, cpuMs: 30 },
      { name: 'SetTotals', type: 'Set Values', status: 'Succeeded', elapsedMs: 10, cpuMs: 2 },
      { name: 'CallRating', type: 'HTTP Action', status: 'Succeeded', elapsedMs: 240, cpuMs: 60 }
    ]);
    expect(row.debugRun.log.map((line) => line.kind)).toEqual(['info', 'query', 'count', 'time', 'time']);
    expect(row.debugRun.log[1].offsetMs).toBe(37);
    expect(JSON.stringify(row.debugRun)).not.toContain('Demo Corp');
    expect(JSON.stringify(row.debugRun)).not.toContain(ACCOUNT_ID);
    expect(JSON.stringify(row)).not.toContain(secret);
  });

  it('builds the Debug tab from the skeleton: steps, times, outcome, bars', () => {
    const model = debugModelOf(back);
    expect(model.steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(model.steps.map((step) => step.status)).toEqual(['Succeeded', 'Succeeded', 'Succeeded']);
    expect(model.steps.map((step) => step.share)).toEqual([0.5, 10 / 240, 1]);
    expect(model.ok).toBe(true);
    expect(debugHeadParts(back, model)).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps', '1 query']);
  });

  it('shows the values as placeholders and the log lines by kind and offset', () => {
    const model = debugModelOf(back);
    expect(model.response).toEqual({ total: '<number>', owner: '<string>' });
    expect(model.steps[0].input).toEqual({ accountId: '<string>' });
    expect(model.log.map((line) => line.kind)).toEqual(['info', 'query', 'count', 'time', 'time']);
    expect(model.log.map((line) => line.offsetMs)).toEqual([0, 37, 52, 60, 410]);
    expect(model.log[1].text).toBe('Query: •••');
    expect(JSON.stringify(model)).not.toContain('Demo Corp');
  });

  it('keeps a failed step failed, from the skeleton and the file\'s verdict', () => {
    const bad = ipRecord({ fullDataJson: ipFullData({ failSecondStep: true }) });
    const [loaded] = recordsFromExport([exportEntries([bad], maskValues)[0]]);
    const model = debugModelOf(loaded);
    expect(model.ok).toBe(false);
    expect(model.steps.map((step) => isStepFailure(step.status))).toEqual([false, true, false]);
    expect(debugHeadParts(loaded, model)[0]).toBe('Failed');
  });

  it('reads a DataRaptor the same way', () => {
    const dr = drRecord(drResult());
    const [loaded] = recordsFromExport([exportEntries([dr], maskValues)[0]]);
    const model = debugModelOf(loaded);
    expect(debugHeadParts(loaded, model)).toEqual(['Succeeded', '48 ms', 'CPU 20 ms', 'Extract', 'response JSON']);
    expect(model.log.map((line) => line.kind)).toEqual(['info', 'query', 'count']);
    expect(model.output).toEqual({ Account: [{ Name: '<string>', Id: '<string>' }] });
  });

  it('without a skeleton (an older file) ignores placeholder names and takes a placeholder status as unknown', () => {
    const { debugRun, ...older } = row;
    expect(debugRun).toBeDefined();
    const [loaded] = recordsFromExport([older]);
    const model = debugModelOf(loaded);
    expect(model.steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(model.steps.every((step) => step.status === '<string>')).toBe(true);
    expect(model.ok).toBe(true);
    expect(model.elapsedMs).toBeNull();
    expect(debugHeadParts(loaded, model)).toEqual(['Succeeded', '3 steps']);
  });

  it('survives a skeleton that is not one', () => {
    [null, 5, 'x', [], { flavour: 'ip', steps: 'x', log: 3 }, { flavour: 'dr' }].forEach((junk) => {
      const [loaded] = recordsFromExport([{ ...row, debugRun: junk }]);
      expect(() => debugModelOf(loaded)).not.toThrow();
    });
  });
});
