'use strict';

/* Debug runs, the decisions: recognising a designer preview, reading its
 * answer into the models the Debug tab draws, the debug log, masking. Names,
 * Ids and hosts are invented (test/fixtures/debug-runs.js). */

import {
  parseRequest, decodeResponse, buildActionRecord, resultFor, failed, failureReason, kindOf, isOmni, label, exportEntries, maskedName, matchesFilter, debugRunFailure,
  ipRoot, ipRootOf, debugFlavourOf, previewOfSignature
} from '../../../src/core/shared/actions-model.js';
import {
  debugRunOf, parseDebugLog, maskLogLine, queryOf, offsetText, ipDebugModel, drDebugModel, debugModelOf, debugHeadParts, debugCopy,
  logSummary, logStats, logStatsText, LOG_FOLD_AT, blankOpen, sectionOpen, stepKey, stepTone, statusTone, shareLabel, barPercent, isPlainSuccess
} from '../../../src/core/actions/debug-run.js';
import { maskValues } from '../../../src/core/shared/mask.js';
import { defaultDetailTab, tabBody, metaParts } from '../../../src/core/actions/actions-detail.js';
import { recordsFromExport } from '../../../src/core/actions/actions-import.js';
import { canRerun, draftFromEntry, isDebugDraft, formTitle } from '../../../src/core/actions/test-calls.js';
import { debugViews, viewValue, fullDataLabel } from '../../../src/core/actions/debug-views.js';
import { compareDebugRuns, comparableRuns } from '../../../src/core/actions/debug-compare.js';
import {
  ipPreviewCall, drPreviewCall, ipFullData, drResult, remotingAnswer, VF_URL, IP_ID, ACCOUNT_ID, IP_LOG, ipDebugAnswer, ipPlainAnswer
} from '../../fixtures/debug-runs.js';

const parse = (call) => parseRequest('vfremote', JSON.stringify(call), VF_URL)[0];

function recordFor(call, result, extra = {}) {
  const text = remotingAnswer(call.tid, result, extra);
  const action = parse(call);
  return buildActionRecord(1, 'vfremote', action, 0, decodeResponse(text).body, {
    url: VF_URL, startedAt: new Date('2026-03-02T09:15:00Z'), durationMs: 410, httpStatus: 200, bodySize: text.length, responseText: text
  });
}

describe('recognising a designer preview', () => {
  it('reads an Integration Procedure preview: Id, input text and options', () => {
    const action = parse(ipPreviewCall());
    expect(action.debug).toBe('ip');
    expect(action.recordId).toBe(IP_ID);
    expect(action.input).toEqual({ ContextId: ACCOUNT_ID });
    expect(action.options).toMatchObject({ isDebug: true, ignoreCache: true });
    expect(action.wireId).toBe('12');
    expect(debugRunOf(action)).toEqual({ flavour: 'ip', recordId: IP_ID, name: '', input: { ContextId: ACCOUNT_ID }, options: action.options });
  });

  it('reads a DataRaptor preview: bundle name, input text, the rest as options', () => {
    const action = parse(drPreviewCall());
    expect(action.debug).toBe('dr');
    expect(action.input).toEqual({ accountId: ACCOUNT_ID });
    expect(action.options).toEqual({
      bundleName: 'DRDemoGetAccount', inputType: 'JSON', interfaceType: 'Extract', ignoreCache: true, bulkUpload: false, debug: true
    });
    expect(debugRunOf(action)).toMatchObject({ flavour: 'dr', name: 'DRDemoGetAccount', recordId: '' });
  });

  it('ignores the namespace of the class, and works without one', () => {
    ['vlocity_ins.OmniScriptDesignerController', 'omnistudio.OmniScriptDesignerController', 'OmniScriptDesignerController'].forEach((klass) => {
      expect(debugRunOf(parse(ipPreviewCall({ klass })))).toMatchObject({ flavour: 'ip' });
    });
    expect(debugRunOf(parse(drPreviewCall({ klass: 'DRMapperControllerFoundation' })))).toMatchObject({ flavour: 'dr' });
    expect(parse(ipPreviewCall({ klass: 'vlocity_ins.OmniScriptDesignerController' })).namespace).toBe('vlocity_ins');
  });

  it('does not take other remoting calls for a preview', () => {
    expect(debugRunOf(null)).toBeNull();
    expect(debugRunOf({})).toBeNull();
    const other = parse({ action: 'ns.OmniScriptDesignerController', method: 'somethingElse', data: ['a', 'b'], tid: 3 });
    expect(other.debug).toBeUndefined();
    expect(debugRunOf(other)).toBeNull();
    const wrongClass = parse({ action: 'ns.OtherController', method: 'testIntegrationProcedure', data: [IP_ID, '{}', {}], tid: 4 });
    expect(wrongClass.debug).toBeUndefined();
  });

  it('keeps the positional decode for every other call', () => {
    const [action] = parseRequest('vfremote', JSON.stringify([{ tid: 7, action: 'MyController', method: 'invokeMethod', data: ['vlocity_ins.DRService', 'invokeInboundDR', { A: 1 }, { bundle: 'X' }] }]));
    expect(action.remoteClass).toBe('vlocity_ins.DRService');
    expect(action.input).toEqual({ A: 1 });
    expect(action.debug).toBeUndefined();
  });

  it('is lenient about a short or odd request', () => {
    expect(parse({ action: 'ns.OmniScriptDesignerController', method: 'testIntegrationProcedure', tid: 1 })).toMatchObject({ debug: 'ip', recordId: '' });
    expect(parse({ action: 'ns.DRMapperControllerFoundation', method: 'drPreviewExecute', data: [], tid: 1 })).toMatchObject({ debug: 'dr', options: {} });
  });
});

describe('the record of a preview', () => {
  it('is an OmniStudio call of the right type, named after the bundle, with a signature of the Apex class and method', () => {
    const dr = recordFor(drPreviewCall(), drResult());
    expect(dr).toMatchObject({ debug: 'dr', type: 'DR', omni: true, name: 'DRDemoGetAccount', kind: 'vfremote' });
    expect(dr.signature).toBe('ns.DRMapperControllerFoundation.drPreviewExecute');
    const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
    expect(ip).toMatchObject({ debug: 'ip', type: 'IP', omni: true, name: `IP preview · ${IP_ID}` });
    expect(kindOf(ip.action)).toBe('IP');
    expect(isOmni(ip.action)).toBe(true);
    expect(label(ip.action)).toBe('ns.OmniScriptDesignerController.testIntegrationProcedure');
  });

  it('names an Integration Procedure preview by its Id, so previews can be told apart and found', () => {
    const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
    expect(ip.name).toBe(`IP preview · ${IP_ID}`);
    expect(metaParts(ip, { clock: () => '09:15:00', step: null }).join(' ')).not.toContain(IP_ID);
    const other = parse({ ...ipPreviewCall(), data: ['a0A000000000002AAA', '{}', {}] });
    expect(buildActionRecord(2, 'vfremote', other, 0, null, { url: VF_URL, startedAt: new Date(0) }).name).toBe('IP preview · a0A000000000002AAA');
    expect(matchesFilter(ip, { onlyOmni: true, query: IP_ID })).toBe(true);
    expect(matchesFilter(ip, { onlyOmni: true, query: 'a0A000000000002AAA' })).toBe(false);
    const bare = buildActionRecord(3, 'vfremote', parse({ ...ipPreviewCall(), data: [] }), 0, null, { url: VF_URL, startedAt: new Date(0) });
    expect(bare.name).toBe('IP preview');
  });

  it('masks the Id in the name, not the words, and keeps it through an export', () => {
    const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
    expect(maskedName(ip, maskValues)).toBe('IP preview · <string>');
    expect(maskedName(ip)).toBe(`IP preview · ${IP_ID}`);
    const [row] = exportEntries([ip], maskValues);
    expect(row.action).toBe('IP preview · <string>');
    const [back] = recordsFromExport([row]);
    expect(maskedName(back, maskValues)).toBe('IP preview · <string>');
    const [plain] = recordsFromExport([exportEntries([ip])[0]]);
    expect(maskedName(plain, () => 'X')).toBe('IP preview · X');
  });

  it('holds the answer as the output', () => {
    const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
    expect(ip.output.fullDataJson.executionSequence).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(resultFor('vfremote', decodeResponse(remotingAnswer(12, { fullDataJson: ipFullData() })).body, ip.action, 0).state).toBe('SUCCESS');
  });

  it('is marked failed when a step failed or the DataRaptor reports an error, and not otherwise', () => {
    expect(failed(recordFor(ipPreviewCall(), { fullDataJson: ipFullData() }))).toBe(false);
    const bad = recordFor(ipPreviewCall(), { fullDataJson: ipFullData({ failSecondStep: true }) });
    expect(failed(bad)).toBe(true);
    expect(failureReason(bad)).toBe('Step SetTotals Failed');
    expect(failed(recordFor(drPreviewCall(), drResult()))).toBe(false);
    const drBad = recordFor(drPreviewCall(), drResult({ error: 'Required field missing' }));
    expect(failureReason(drBad)).toBe('Data Mapper error — Required field missing');
  });

  it('is not marked failed for a step that was skipped or has no status', () => {
    const data = ipFullData();
    data.SetTotalsDebug.Status = 'Skipped';
    delete data.CallRatingDebug.Status;
    expect(failed(recordFor(ipPreviewCall(), { fullDataJson: data }))).toBe(false);
  });

  it('survives Export and loading it back, with its Debug tab', () => {
    const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
    const [row] = exportEntries([ip]);
    expect(row.debug).toBe('ip');
    const [back] = recordsFromExport([row]);
    expect(back.debug).toBe('ip');
    expect(back.type).toBe('IP');
    expect(ipDebugModel(back.output).steps).toHaveLength(3);
    expect(exportEntries([recordFor(drPreviewCall(), drResult())])[0].debug).toBe('dr');
  });

  it('adds no debug key to an ordinary call', () => {
    const [action] = parseRequest('vfremote', JSON.stringify([{ tid: 1, action: 'C', method: 'm', data: ['a', 'b', {}, {}] }]));
    const record = buildActionRecord(1, 'vfremote', action, 0, null, { url: VF_URL, startedAt: new Date(0) });
    expect('debug' in record).toBe(false);
    expect('debug' in exportEntries([record])[0]).toBe(false);
  });
});

describe('the default tab', () => {
  const ip = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
  const plain = { debug: undefined, failure: null, action: {} };

  it('is Debug for a debug run, whatever tab was picked on other calls', () => {
    expect(defaultDetailTab(ip, 'input', false)).toBe('debug');
    expect(defaultDetailTab(ip, 'output', false)).toBe('debug');
    expect(defaultDetailTab(ip, 'debug', true)).toBe('debug');
    ['input', 'output', 'options'].forEach((tab) => expect(defaultDetailTab(ip, tab, true)).toBe('debug'));
    expect(defaultDetailTab(ip, 'compare', false)).toBe('compare');
    expect(defaultDetailTab(ip, 'compare', true)).toBe('compare');
  });

  it('still keeps a picked tab on a call that is no debug run', () => {
    const plain = { debug: undefined, failure: 'x', action: {} };
    expect(defaultDetailTab(plain, 'input', true)).toBe('input');
    expect(defaultDetailTab(plain, 'options', true)).toBe('options');
  });

  it('falls back to Input or Output on a call that has no Debug tab', () => {
    expect(defaultDetailTab(plain, 'debug', true)).toBe('input');
    expect(defaultDetailTab({ ...plain, failure: 'x' }, 'debug', false)).toBe('output');
  });

  it('hands the model to the tab body', () => {
    const model = ipDebugModel(ip.output);
    expect(tabBody(ip, 'debug', { debug: model })).toBe(model);
    expect(tabBody(ip, 'debug', {})).toBeUndefined();
  });
});

describe('parseDebugLog', () => {
  it('gives the stamp, the offset from the first stamped line, the text and the kind', () => {
    const log = parseDebugLog(IP_LOG);
    expect(log.map((line) => line.offsetMs)).toEqual([0, 37, 52, 60, 410]);
    expect(log[1].at).toBe('2026-03-02T09:15:00.037Z');
    expect(log.map((line) => line.kind)).toEqual(['info', 'query', 'count', 'time', 'time']);
    expect(log[2].text).toBe('Query results found: 1');
  });

  it('keeps a line that does not fit as info with no stamp', () => {
    const log = parseDebugLog(['2026-03-02T09:15:00.000Z: first', 'free text', 'Query: SELECT Id FROM Account', 12, null]);
    expect(log[1]).toEqual({ at: null, offsetMs: null, text: 'free text', kind: 'info' });
    expect(log[2].kind).toBe('query'); // a bare query line is still a query
    expect(log[3].text).toBe('12');
    expect(log).toHaveLength(4);
  });

  it('counts the offset from the first stamped line, not the first line', () => {
    const log = parseDebugLog(['intro', '2026-03-02T09:15:01.000Z: a', '2026-03-02T09:15:01.250Z: b']);
    expect(log.map((line) => line.offsetMs)).toEqual([null, 0, 250]);
  });

  it('never throws', () => {
    expect(parseDebugLog(undefined)).toEqual([]);
    expect(parseDebugLog('text')).toEqual([{ at: null, offsetMs: null, text: 'text', kind: 'info' }]);
    expect(parseDebugLog(42)).toEqual([]);
    expect(parseDebugLog(['9999-99-99T99:99:99: nope'])[0].at).toBeNull();
  });

  it('writes an offset and finds the SOQL', () => {
    const log = parseDebugLog(IP_LOG);
    expect(offsetText(log[1])).toBe('+37 ms');
    expect(offsetText(log[0])).toBe('+0 ms');
    expect(offsetText({ offsetMs: null })).toBe('');
    expect(queryOf(log[1])).toMatch(/^SELECT Id, Name FROM Account WHERE Id = /);
  });
});

describe('maskLogLine', () => {
  it('hides SOQL string literals and Salesforce Ids in a query, not counts or times', () => {
    const line = `Query: SELECT Id FROM Account WHERE Id = '${ACCOUNT_ID}' AND Name = 'O\\'Demo' AND Owner = ${IP_ID}`;
    expect(maskLogLine(line)).toBe("Query: SELECT Id FROM Account WHERE Id = '•••' AND Name = '•••' AND Owner = •••");
    expect(maskLogLine('Query results found: 12')).toBe('Query results found: 12');
    expect(maskLogLine('Query time: 14')).toBe('Query time: 14');
  });

  it('replaces any line of another kind by its kind word and a placeholder', () => {
    expect(maskLogLine('001000000000001')).toBe('Info: •••');
    expect(maskLogLine('Representatives and GetAccountDebug_Step')).toBe('Info: •••');
  });
});

describe('ipDebugModel', () => {
  const model = ipDebugModel({ fullDataJson: ipFullData() });

  it('follows the execution sequence and reads each step', () => {
    expect(model.steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(model.steps[0]).toMatchObject({
      type: 'DataRaptor Extract Action', status: 'Succeeded', elapsedMs: 120, cpuMs: 30, input: { accountId: ACCOUNT_ID }, options: { bundle: 'DRDemoGetAccount' }, output: { Name: 'Demo Corp' }
    });
    expect(model).toMatchObject({ ok: true, elapsedMs: 410, cpuMs: 95, response: { total: 120, currency: 'EUR' }, originalInput: { ContextId: ACCOUNT_ID } });
    expect(model.log).toHaveLength(5);
  });

  it('sets the share against the slowest step', () => {
    expect(model.steps.map((step) => step.share)).toEqual([0.5, 10 / 240, 1]);
  });

  it('keeps the noise keys out of the steps', () => {
    expect(model.steps.map((step) => step.name)).not.toContain('is');
    expect(JSON.stringify(model)).not.toContain('vlcPersistentComponent');
  });

  it('appends an element that has a block and no place in the sequence', () => {
    const data = ipFullData();
    data.executionSequence = ['GetAccount'];
    expect(ipDebugModel({ fullDataJson: data }).steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
  });

  it('accepts the fullDataJson object itself, and as text', () => {
    expect(ipDebugModel(ipFullData()).steps).toHaveLength(3);
    expect(ipDebugModel({ fullDataJson: JSON.stringify(ipFullData()) }).steps).toHaveLength(3);
  });

  it('is not ok when a step failed or the answer carries an error', () => {
    expect(ipDebugModel({ fullDataJson: ipFullData({ failSecondStep: true }) }).ok).toBe(false);
    expect(ipDebugModel({ fullDataJson: ipFullData(), hasErrors: true }).ok).toBe(false);
    const withError = { ...ipFullData(), response: { error: 'Something broke' } };
    expect(ipDebugModel({ fullDataJson: withError }).ok).toBe(false);
    expect(ipDebugModel({ fullDataJson: { ...ipFullData(), response: { error: 'OK' } } }).ok).toBe(true);
  });

  it('gives empty sections, never a throw, for odd answers', () => {
    [undefined, null, 'text', 5, [], {}, { fullDataJson: null }, { fullDataJson: { executionSequence: 'x', debugLog: 3, GetAccountDebug: 4 } }].forEach((output) => {
      const empty = ipDebugModel(output);
      expect(empty.steps).toEqual([]);
      expect(empty.log).toEqual([]);
      expect(empty.ok).toBe(true);
      expect(empty.elapsedMs).toBeNull();
    });
    const lone = ipDebugModel({ fullDataJson: { executionSequence: ['Solo'] } });
    expect(lone.steps).toEqual([{ name: 'Solo', type: '', status: '', elapsedMs: null, cpuMs: null, share: 0, input: undefined, options: undefined, output: undefined }]);
  });

  it('has a share of 0 for every step when no time is known', () => {
    const data = ipFullData();
    ['GetAccountDebug', 'SetTotalsDebug', 'CallRatingDebug'].forEach((key) => { delete data[key].ElapsedTime; });
    expect(ipDebugModel(data).steps.map((step) => step.share)).toEqual([0, 0, 0]);
  });
});

describe('a run whose parts come as JSON text and Status flags', () => {
  /* Some orgs hand the debug blocks, the sequence and the log over as JSON
   * text, and set a <Name>Status flag beside each element's output instead
   * of a Status word in its block. */
  const textRun = () => ({
    response: JSON.stringify({ total: 120 }),
    originalInput: JSON.stringify({ ContextId: ACCOUNT_ID }),
    executionSequence: JSON.stringify(['GetAccount', 'SetTotals', 'CallRating']),
    elapsedTimeActual: '410',
    elapsedTimeCPU: '95',
    GetAccount: JSON.stringify({ Name: 'Example Ltd' }),
    GetAccountStatus: true,
    GetAccountDebug: JSON.stringify({ Type: 'DataRaptor Extract Action', ElapsedTime: 120, ElapsedTimeCPU: 30, Input: JSON.stringify({ accountId: ACCOUNT_ID }), Options: { bundle: 'DRDemoGetAccount' } }),
    SetTotals: { total: 120 },
    SetTotalsStatus: true,
    CallRating: JSON.stringify({ rating: 'A' }),
    CallRatingStatus: false,
    CallRatingDebug: JSON.stringify({ Type: 'HTTP Action', ElapsedTime: 240, ElapsedTimeCPU: 60 }),
    debugLog: JSON.stringify([
      '2026-03-02T09:15:00.100Z: Query: SELECT Id FROM Account WHERE Id = \'' + ACCOUNT_ID + '\'',
      '2026-03-02T09:15:00.137Z: Query results found: 1'
    ])
  });

  test('the steps, their values and the log are read through the text', () => {
    const model = ipDebugModel({ fullDataJson: JSON.stringify(textRun()) });
    expect(model.steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    expect(model.steps[0]).toMatchObject({ type: 'DataRaptor Extract Action', status: 'Succeeded', elapsedMs: 120, cpuMs: 30 });
    expect(model.steps[0].input).toEqual({ accountId: ACCOUNT_ID });
    expect(model.steps[0].output).toEqual({ Name: 'Example Ltd' });
    expect(model.steps[1]).toMatchObject({ status: 'Succeeded', elapsedMs: null });
    expect(model.steps[2]).toMatchObject({ type: 'HTTP Action', status: 'Failed', elapsedMs: 240 });
    expect(model.response).toEqual({ total: 120 });
    expect(model.originalInput).toEqual({ ContextId: ACCOUNT_ID });
    expect(model.elapsedMs).toBe(410);
    expect(model.log.map((line) => line.kind)).toEqual(['query', 'count']);
    expect(model.ok).toBe(false);
  });

  test('a false Status flag fails the run like a failed block', () => {
    expect(debugRunFailure('ip', { fullDataJson: textRun() })).toBe('Step CallRating Failed');
    const fine = textRun();
    fine.CallRatingStatus = true;
    expect(debugRunFailure('ip', { fullDataJson: fine })).toBeNull();
  });

  test('a false flag on an element that did not run is Skipped, not a failure', () => {
    const run = textRun();
    run.CallRatingStatus = true;
    run.CB_OtherPath = null;
    run.CB_OtherPathStatus = false; // a conditional block whose condition was false: no block, not in the sequence
    const model = ipDebugModel({ fullDataJson: run });
    const other = model.steps.find((step) => step.name === 'CB_OtherPath');
    expect(other).toMatchObject({ status: 'Skipped', elapsedMs: null, share: 0 });
    expect(model.ok).toBe(true);
    expect(debugRunFailure('ip', { fullDataJson: run })).toBeNull();
    const head = debugHeadParts({ debug: 'ip', action: {} }, model, (n) => `${n} ms`);
    expect(head).toContain('3 steps');
    expect(head).toContain('1 skipped');
  });

  test('elements with only a Status flag are listed after the sequence', () => {
    const run = textRun();
    delete run.executionSequence;
    const model = ipDebugModel({ fullDataJson: run });
    expect(model.steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
  });

  test('a log handed over as plain text is split at line ends', () => {
    const lines = parseDebugLog('2026-03-02T09:15:00.100Z: Query: SELECT Id FROM Account\n2026-03-02T09:15:00.137Z: Query results found: 1\n');
    expect(lines.map((line) => line.kind)).toEqual(['query', 'count']);
    expect(lines[1].offsetMs).toBe(37);
  });
});

describe('drDebugModel', () => {
  it('reads times, response type, interface info, output and log', () => {
    const model = drDebugModel(drResult());
    expect(model).toMatchObject({
      ok: true, elapsedMs: 48, cpuMs: 20, responseType: 'JSON', interfaceInfo: { DRDemoGetAccount: 'JSON' },
      output: { Account: [{ Name: 'Demo Corp', Id: ACCOUNT_ID }] }, errors: {}, created: {}
    });
    expect(model.log).toHaveLength(3);
  });

  it('does not take a null DRError for an error', () => {
    expect(drDebugModel(drResult()).errors).toEqual({});
  });

  it('merges the parts of the errors that say something', () => {
    const model = drDebugModel({
      ...drResult({ error: 'Required field missing' }),
      errorsByField: { Name: ['is required'], Phone: [] },
      errors: ['first']
    });
    expect(model.ok).toBe(false);
    expect(model.errors).toEqual({
      errorsAsJson: { DRError: 'Required field missing' }, errors: ['first'], errorsByField: { Name: ['is required'] }
    });
  });

  it('keeps the created-object maps that hold something', () => {
    const model = drDebugModel({ ...drResult(), createdObjectsByType: { Account: ['001000000000002AAA'] } });
    expect(model.created).toEqual({ createdObjectsByType: { Account: ['001000000000002AAA'] } });
  });

  it('is not ok when hasErrors is set', () => {
    expect(drDebugModel({ ...drResult(), hasErrors: true }).ok).toBe(false);
  });

  it('gives empty sections for odd answers', () => {
    [undefined, null, 'text', [], {}].forEach((output) => {
      expect(drDebugModel(output)).toMatchObject({ ok: true, elapsedMs: null, errors: {}, created: {}, log: [], interfaceInfo: {}, responseType: '' });
    });
  });

  it('is chosen by the flavour of the call', () => {
    expect(debugModelOf({ debug: 'dr', output: drResult() }).responseType).toBe('JSON');
    expect(debugModelOf({ debug: 'ip', output: { fullDataJson: ipFullData() } }).steps).toHaveLength(3);
    expect(debugModelOf({ output: {} })).toBeNull();
    expect(debugModelOf(null)).toBeNull();
  });
});

describe('the head line', () => {
  it('says the outcome, the times and the steps of an Integration Procedure', () => {
    const entry = { debug: 'ip', action: {} };
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: ipFullData() }))).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps', '1 query', '14 ms in queries']);
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: ipFullData({ failSecondStep: true }) }), 'human')[0]).toBe('Failed');
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: { executionSequence: ['A'] } }))).toEqual(['Succeeded', '1 step']);
  });

  it('says the interface type and the response type of a DataRaptor', () => {
    const entry = { debug: 'dr', action: { options: { interfaceType: 'Extract' } } };
    expect(debugHeadParts(entry, drDebugModel(drResult()))).toEqual(['Succeeded', '48 ms', 'CPU 20 ms', 'Extract', 'response JSON']);
  });

  it('is empty without a model', () => {
    expect(debugHeadParts({}, null)).toEqual([]);
  });
});

describe('Copy and the log summary', () => {
  const ip = { debug: 'ip' };
  const model = ipDebugModel({ fullDataJson: ipFullData() });

  it('copies the model as it is while Mask values is off', () => {
    const copy = debugCopy(ip, model, undefined);
    expect(copy.flavour).toBe('ip');
    expect(copy.steps[0].input).toEqual({ accountId: ACCOUNT_ID });
    expect(copy.log[1].text).toContain("'Demo Corp'");
  });

  it('masks the values and the log lines when it is on, and keeps names, types, statuses and times', () => {
    const copy = debugCopy(ip, model, maskValues);
    expect(JSON.stringify(copy)).not.toContain(ACCOUNT_ID);
    expect(JSON.stringify(copy)).not.toContain('Demo Corp');
    expect(copy.steps[0]).toMatchObject({ name: 'GetAccount', type: 'DataRaptor Extract Action', status: 'Succeeded', elapsedMs: 120, input: { accountId: '<string>' } });
    expect(copy.response).toEqual({ total: '<number>', currency: '<string>' });
    expect(copy.log[1].text).toBe("Query: SELECT Id, Name FROM Account WHERE Id = '•••' AND Name = '•••'");
    expect(copy.log[2].text).toBe('Query results found: 1');
    expect(copy.log[1].offsetMs).toBe(37);
  });

  it('masks a DataRaptor the same way', () => {
    const copy = debugCopy({ debug: 'dr' }, drDebugModel(drResult({ error: 'Failed for Demo Corp' })), maskValues);
    expect(JSON.stringify(copy)).not.toContain('Demo Corp');
    expect(JSON.stringify(copy)).not.toContain(ACCOUNT_ID);
    expect(copy.responseType).toBe('JSON');
  });

  it('has nothing to copy without a model', () => {
    expect(debugCopy(ip, null, maskValues)).toBeUndefined();
  });

  it('summarises the log and folds a long one', () => {
    expect(logSummary(1)).toBe('Debug log (1 line)');
    expect(logSummary(31)).toBe('Debug log (31 lines)');
    expect(LOG_FOLD_AT).toBe(30);
  });

  it('keeps what the user opened: their choice, else the default', () => {
    const open = blankOpen();
    expect(sectionOpen(open, 'response', true)).toBe(true);
    expect(sectionOpen(open, 'input', false)).toBe(false);
    open.sections.response = false;
    expect(sectionOpen(open, 'response', true)).toBe(false);
    expect(stepKey(0, 'input')).toBe('step:0:input');
    expect(stepKey(2, 'input')).not.toBe(stepKey(0, 'input'));
  });

  it('tones a step by its type, like the list', () => {
    expect(stepTone('DataRaptor Extract Action')).toBe('dr');
    expect(stepTone('Data Mapper Transform Action')).toBe('dr');
    expect(stepTone('Integration Procedure Action')).toBe('ip');
    expect(stepTone('Remote Action')).toBe('ra');
    expect(stepTone('Set Values')).toBe('neutral');
    expect(stepTone(undefined)).toBe('neutral');
  });

  it('tones a status: failure bad, warning warn, the rest good', () => {
    expect(statusTone('Error')).toBe('bad');
    expect(statusTone('Success with warnings')).toBe('warn');
    expect(statusTone('Warning')).toBe('warn');
    expect(statusTone('Success')).toBe('good');
    expect(statusTone('<string>')).toBe('good');
  });

  it('words a bar for a screen reader', () => {
    expect(shareLabel({ elapsedMs: 120, share: 0.5 })).toBe('50% of the slowest step');
    expect(shareLabel({ elapsedMs: 0, share: 0 })).toBe('0% of the slowest step');
    expect(shareLabel({ elapsedMs: null, share: 0 })).toBe('Time not reported');
    expect(shareLabel(undefined)).toBe('Time not reported');
  });

  it('writes a bar width from the share', () => {
    expect(barPercent(1)).toBe(100);
    expect(barPercent(10 / 240)).toBe(4.2);
    expect(barPercent(-1)).toBe(0);
    expect(barPercent(undefined)).toBe(0);
  });
});

describe('what the log adds up to', () => {
  it('counts the lines and the queries and adds up the query times, with the time in the server', () => {
    expect(logStats(parseDebugLog(IP_LOG))).toEqual({ lines: 5, queries: 1, queryMs: 14, serverMs: 410 });
    const two = parseDebugLog([
      '2026-03-02T09:15:00.000Z: Query: SELECT Id FROM Account',
      '2026-03-02T09:15:00.010Z: Query time: 14',
      '2026-03-02T09:15:00.020Z: Query: SELECT Id FROM Contact',
      '2026-03-02T09:15:00.030Z: Query time: 8.5 ms',
      '2026-03-02T09:15:00.040Z: Time in Server: 120'
    ]);
    expect(logStats(two)).toEqual({ lines: 5, queries: 2, queryMs: 22.5, serverMs: 120 });
  });

  it('knows no time from a log without one, or from a masked one', () => {
    expect(logStats(parseDebugLog(['2026-03-02T09:15:00.000Z: Run started']))).toEqual({ lines: 1, queries: 0, queryMs: null, serverMs: null });
    expect(logStats([])).toEqual({ lines: 0, queries: 0, queryMs: null, serverMs: null });
    expect(logStats(undefined).lines).toBe(0);
    const masked = parseDebugLog(IP_LOG).map((line) => ({ ...line, text: maskLogLine(line.text) }));
    expect(logStats(masked)).toEqual({ lines: 5, queries: 1, queryMs: 14, serverMs: 410 }); // numbers only: they stay
    const placeholders = parseDebugLog(IP_LOG).map((line) => ({ ...line, text: `Query time: •••` }));
    expect(logStats(placeholders).queryMs).toBeNull();
  });

  it('writes the parts that are known', () => {
    expect(logStatsText(logStats(parseDebugLog(IP_LOG)), 'ms')).toBe('5 lines · 1 query · 14 ms in queries · 410 ms in the server');
    expect(logStatsText({ lines: 1, queries: 0, queryMs: null, serverMs: null }, 'ms')).toBe('1 line');
    expect(logStatsText({ lines: 9, queries: 3, queryMs: null, serverMs: null }, 'ms')).toBe('9 lines · 3 queries');
    expect(logStatsText({ lines: 9, queries: 3, queryMs: 1500, serverMs: null }, 'human')).toBe('9 lines · 3 queries · 1.5 s in queries');
  });

  it('adds the queries to the head line of an Integration Procedure, and only when the log has any', () => {
    const entry = { debug: 'ip', action: {} };
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: ipFullData() }))).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps', '1 query', '14 ms in queries']);
    const two = { ...ipFullData(), debugLog: [...IP_LOG, '2026-03-02T09:15:00.100Z: Query: SELECT Id FROM Contact', '2026-03-02T09:15:00.110Z: Query time: 6'] };
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: two }), 'human').slice(4)).toEqual(['2 queries', '20 ms in queries']);
    const none = { ...ipFullData(), debugLog: ['2026-03-02T09:15:00.000Z: Run started'] };
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: none }))).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps']);
    const untimed = { ...ipFullData(), debugLog: ['2026-03-02T09:15:00.000Z: Query: SELECT Id FROM Account'] };
    expect(debugHeadParts(entry, ipDebugModel({ fullDataJson: untimed }))).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps', '1 query']);
  });

  it('starts a call on the Overview with no chip pressed', () => {
    const open = blankOpen();
    expect(open.view).toBe('overview');
    expect(open.chips.size).toBe(0);
  });
});

/* An Integration Procedure a page called with isDebug: true in its options
 * answers with the whole debug run, under IPResult beside fullDataJson. */
describe('an answer that carries a debug run', () => {
  const AURA_URL = 'https://demo.example.invalid/aura?r=1';
  const IP_CLASS = 'omnistudiocore.IPService';

  function auraAction({ method = 'Account_Fetch', cls = IP_CLASS, options = { isDebug: true } } = {}) {
    const message = JSON.stringify({ actions: [{ id: '1;a', descriptor: 'd', params: { namespace: '', classname: cls, method: 'invokeMethod', params: { sClassName: cls, sMethodName: method, input: '{"ContextId":"001"}', options } } }] });
    return parseRequest('aura', new URLSearchParams({ message, 'aura.token': 't' }).toString(), AURA_URL)[0];
  }

  function auraRecord(output, call = {}) {
    const body = { actions: [{ id: '1;a', state: 'SUCCESS', returnValue: { returnValue: output } }] };
    return buildActionRecord(1, 'aura', auraAction(call), 0, body, { url: AURA_URL, startedAt: new Date('2026-03-02T09:15:00Z'), durationMs: 410, httpStatus: 200, bodySize: 1 });
  }

  describe('ipRoot', () => {
    it('picks IPResult for a run that sits beside fullDataJson', () => {
      expect(ipRootOf(ipDebugAnswer()).key).toBe('IPResult');
      expect(ipRoot(ipDebugAnswer()).executionSequence).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
      expect(ipRootOf(JSON.stringify(ipDebugAnswer())).key).toBe('IPResult');
      expect(ipRootOf({ IPResult: JSON.stringify(ipDebugAnswer().IPResult) }).key).toBe('IPResult');
      expect(ipRootOf({ ipresult: ipDebugAnswer().IPResult }).key).toBe('ipresult');
    });

    it('picks fullDataJson for a designer preview, and the answer itself for a top-level run', () => {
      expect(ipRootOf({ fullDataJson: ipFullData() })).toEqual({ root: ipFullData(), key: 'fullDataJson' });
      expect(ipRootOf({ fullDataJson: JSON.stringify(ipFullData()) }).key).toBe('fullDataJson');
      expect(ipRootOf(ipFullData())).toEqual({ root: ipFullData(), key: '' });
      expect(ipRootOf({ IPResult: { fullDataJson: ipFullData() } })).toEqual({ root: ipFullData(), key: 'fullDataJson' });
    });

    it('keeps the old choice for an answer with no run: fullDataJson when it is an object, else the answer', () => {
      expect(ipRootOf(ipPlainAnswer())).toEqual({ root: ipPlainAnswer(), key: '' });
      expect(ipRootOf({ fullDataJson: { total: 1 }, IPResult: { total: 1 } })).toEqual({ root: { total: 1 }, key: 'fullDataJson' });
      expect(ipRootOf({ fullDataJson: null, a: 1 })).toEqual({ root: { fullDataJson: null, a: 1 }, key: '' });
      [undefined, null, 'text', 5, []].forEach((output) => expect(ipRootOf(output)).toEqual({ root: {}, key: '' }));
    });
  });

  describe('debugFlavourOf', () => {
    it('is ip for an Integration Procedure called with that answer, and for a designer preview as before', () => {
      expect(debugFlavourOf(auraAction(), ipDebugAnswer())).toBe('ip');
      expect(debugFlavourOf(auraAction(), JSON.stringify(ipDebugAnswer()))).toBe('ip');
      expect(debugFlavourOf(parse(ipPreviewCall()), {})).toBe('ip');
      expect(debugFlavourOf(parse(drPreviewCall()), {})).toBe('dr');
    });

    it('is undefined for a plain answer, a Data Mapper, an Apex call, text that is not JSON, and odd values', () => {
      expect(debugFlavourOf(auraAction(), ipPlainAnswer())).toBeUndefined();
      expect(debugFlavourOf(auraAction(), { IPResult: { GetAccountDebug: { Status: true } } })).toBeUndefined(); // a block, but no log
      expect(debugFlavourOf(auraAction(), { IPResult: { executionSequence: [] } })).toBeUndefined();
      expect(debugFlavourOf(auraAction({ method: 'invokeInboundDR', cls: 'omnistudiocore.DRService' }), ipDebugAnswer())).toBeUndefined();
      expect(debugFlavourOf({ apexClass: 'AccountController', apexMethod: 'getAccount', descriptor: 'apex' }, ipDebugAnswer())).toBeUndefined();
      expect(debugFlavourOf(auraAction(), 'GetAccountDebug executionSequence')).toBeUndefined();
      [undefined, null, 5, [], {}].forEach((output) => expect(debugFlavourOf(auraAction(), output)).toBeUndefined());
      [undefined, null, 'x', 5, []].forEach((action) => expect(() => debugFlavourOf(action, ipDebugAnswer())).not.toThrow());
      expect(debugFlavourOf(null, ipDebugAnswer())).toBeUndefined();
    });
  });

  describe('the record', () => {
    it('is a debug run named after the procedure, and stays an ordinary call otherwise', () => {
      const run = auraRecord(ipDebugAnswer());
      expect(run).toMatchObject({ debug: 'ip', type: 'IP', omni: true, name: 'Account_Fetch', kind: 'aura' });
      expect(run.action.debug).toBeUndefined();
      expect(run.signature).toBe(`${IP_CLASS}.Account_Fetch`);
      expect(failed(run)).toBe(false);
      expect('debug' in auraRecord(ipPlainAnswer())).toBe(false);
    });

    it('opens on the Debug tab', () => {
      const run = auraRecord(ipDebugAnswer());
      expect(defaultDetailTab(run, 'input', false)).toBe('debug');
      expect(defaultDetailTab(run, 'output', true)).toBe('debug');
      expect(defaultDetailTab(auraRecord(ipPlainAnswer()), 'debug', false)).toBe('input');
    });

    it('reads the steps in run order, a flag and a JSON-text input included', () => {
      const model = debugModelOf(auraRecord(ipDebugAnswer()));
      expect(model.steps.map((step) => [step.name, step.type, step.status, step.elapsedMs])).toEqual([
        ['GetAccount', 'DataRaptor Extract Action', 'Succeeded', 120],
        ['SetTotals', 'Set Values', 'Succeeded', 10],
        ['CallRating', 'HTTP Action', 'Succeeded', 240]
      ]);
      expect(model.steps[1].input).toEqual({ total: 120 });
      expect(model.response).toEqual({ total: 120, currency: 'EUR' });
      expect(model.originalInput).toEqual({ ContextId: ACCOUNT_ID });
      expect(model.log).toHaveLength(IP_LOG.length);
      expect(debugHeadParts(auraRecord(ipDebugAnswer()), model)).toEqual(['Succeeded', '410 ms', 'CPU 95 ms', '3 steps', '1 query', '14 ms in queries']);
    });

    it('offers the same views as a preview, the Full data JSON rooted at IPResult', () => {
      const run = auraRecord(ipDebugAnswer());
      const model = debugModelOf(run);
      expect(debugViews(model, run).map((view) => view.id)).toEqual(['overview', 'full', 'response', 'original', 'log', 'step:0', 'step:1', 'step:2']);
      expect(fullDataLabel(run)).toBe('IPResult');
      expect(viewValue(run, model, 'full').executionSequence).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
      expect(viewValue(run, model, 'step:1')).toMatchObject({ input: { total: 120 }, output: { total: 120 }, debug: { Status: 'Success', Type: 'Set Values' } });
      expect(fullDataLabel(recordFor(ipPreviewCall(), { fullDataJson: ipFullData() }))).toBe('fullDataJson');
      expect(fullDataLabel({ debug: 'ip', output: ipFullData() })).toBe('output');
      expect(fullDataLabel(recordFor(drPreviewCall(), drResult()))).toBe('result');
    });

    it('is marked failed when a step failed, and a plain answer\'s verdict does not change', () => {
      const bad = auraRecord(ipDebugAnswer({ failSecondStep: true }));
      expect(failed(bad)).toBe(true);
      expect(failureReason(bad)).toBe('Step SetTotals Failed');
      expect(debugModelOf(bad).ok).toBe(false);
      const flagged = ipDebugAnswer();
      flagged.IPResult.SetTotalsDebug.Status = false;
      expect(failureReason(auraRecord(flagged))).toBe('Step SetTotals Failed');
      expect(failureReason(auraRecord(ipPlainAnswer()))).toBeNull();
      expect(failureReason(auraRecord({ IPResult: { total: 1 }, error: 'Required field missing' }))).toBe('Response error — Required field missing');
    });

    it('compares with another run of either kind', () => {
      const run = auraRecord(ipDebugAnswer());
      const preview = recordFor(ipPreviewCall(), { fullDataJson: ipFullData() });
      expect(comparableRuns(run, preview)).toBe(true);
      expect(comparableRuns(run, auraRecord(ipPlainAnswer()))).toBe(false);
      const result = compareDebugRuns(debugModelOf(preview), debugModelOf(run));
      expect(result.rows.map((row) => row.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
    });
  });

  describe('export and loading back', () => {
    it('exports debug and debugRun, and a bundle reads it back as a debug run under its own name', () => {
      const run = auraRecord(ipDebugAnswer());
      const [row] = exportEntries([run]);
      expect(row.debug).toBe('ip');
      expect(row.debugRun).toMatchObject({ flavour: 'ip', outcome: 'succeeded', elapsedMs: 410, cpuMs: 95 });
      expect(row.debugRun.steps.map((step) => step.status)).toEqual(['Succeeded', 'Succeeded', 'Succeeded']);
      const [back] = recordsFromExport([JSON.parse(JSON.stringify(row))]);
      expect(back).toMatchObject({ debug: 'ip', type: 'IP', name: 'Account_Fetch' });
      expect(back.action.debug).toBeUndefined();
      expect(back.action).toMatchObject({ remoteClass: IP_CLASS, remoteMethod: 'Account_Fetch' });
      expect(debugModelOf(back).steps).toHaveLength(3);
    });

    it('keeps the run of a masked file, and finds one in a row that does not say so', () => {
      const [masked] = exportEntries([auraRecord(ipDebugAnswer())], maskValues);
      const [back] = recordsFromExport([JSON.parse(JSON.stringify(masked))]);
      expect(back.debug).toBe('ip');
      expect(debugModelOf(back).steps.map((step) => step.name)).toEqual(['GetAccount', 'SetTotals', 'CallRating']);
      const { debug, debugRun, ...older } = exportEntries([auraRecord(ipDebugAnswer())])[0];
      expect([debug, debugRun.flavour]).toEqual(['ip', 'ip']);
      expect(recordsFromExport([older])[0].debug).toBe('ip');
      const plainRow = exportEntries([auraRecord(ipPlainAnswer())])[0];
      expect('debug' in recordsFromExport([plainRow])[0]).toBe(false);
    });

    it('still reads a designer preview back as a preview', () => {
      const [row] = exportEntries([recordFor(ipPreviewCall(), { fullDataJson: ipFullData() })]);
      const [back] = recordsFromExport([row]);
      expect(back.action.debug).toBe('ip');
      expect(previewOfSignature(row.signature)).toBe('ip');
      expect(previewOfSignature('ns.DRMapperControllerFoundation.drPreviewExecute')).toBe('dr');
      expect(previewOfSignature(`${IP_CLASS}.Account_Fetch`)).toBeNull();
      expect(previewOfSignature(undefined)).toBeNull();
    });
  });

  describe('a re-run', () => {
    it('is the ordinary form, with the name and the options as they were, isDebug included', () => {
      const run = auraRecord(ipDebugAnswer(), { options: { isDebug: true, chainable: false } });
      expect(canRerun(run)).toBe(true);
      const draft = draftFromEntry(run);
      expect(isDebugDraft(draft)).toBe(false);
      expect(formTitle(draft)).toBe('Test call');
      expect(draft).toMatchObject({ kind: 'IP', name: 'Account_Fetch', wireKind: 'aura' });
      expect(JSON.parse(draft.options)).toEqual({ isDebug: true, chainable: false });
    });

    it('is not offered for a remoting call that is no designer preview, whatever it answered', () => {
      const [action] = parseRequest('vfremote', JSON.stringify([{ tid: 7, action: 'MyController', method: 'invokeMethod', data: ['omnistudiocore.IPService', 'Account_Fetch', {}, { isDebug: true }] }]), VF_URL);
      const record = buildActionRecord(1, 'vfremote', action, 0, [{ tid: 7, statusCode: 200, result: JSON.stringify(ipDebugAnswer()) }], { url: VF_URL, startedAt: new Date(0), httpStatus: 200 });
      expect(record.debug).toBe('ip');
      expect(canRerun(record)).toBe(false);
      expect(canRerun(recordFor(ipPreviewCall(), { fullDataJson: ipFullData() }))).toBe(true);
    });
  });
});

describe('isPlainSuccess', () => {
  it('is true for the ordinary good outcome only, whatever its case', () => {
    expect(['Succeeded', 'Success', ' success '].map(isPlainSuccess)).toEqual([true, true, true]);
    expect(['Failed', 'Skipped', 'Success with warnings', '', undefined, null].map(isPlainSuccess)).toEqual([false, false, false, false, false, false]);
  });
});
