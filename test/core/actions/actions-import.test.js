'use strict';

import { bundleCallRows, recordsFromExport, sessionText } from '../../../src/core/actions/actions-import.js';
import { buildActionRecord, exportEntries, failed, failureReason, verdictOf, KIND_LABEL } from '../../../src/core/shared/actions-model.js';
import { actionsDump } from '../../../src/core/actions/actions-dump.js';
import { buildDebugBundle } from '../../../src/core/shared/debug-bundle.js';
import { groupChains } from '../../../src/core/actions/actions-chains.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const T0 = Date.UTC(2024, 0, 1, 10, 0, 0);

/* A live record, built the way the tab builds them. */
function live(id, {
  remoteClass = 'omnistudiocore.IPService', remoteMethod = 'Order_Place', apexClass = '', apexMethod = '',
  input = { Name: 'Ada' }, options = { chainable: true }, body = { returnValue: { returnValue: { ok: true } } },
  at = id * 1000, ms = 250, httpStatus = 200, requestId = id, batchSize = 1, responseText
} = {}) {
  const action = { remoteClass, remoteMethod, apexClass, apexMethod, descriptor: '', input, options };
  return buildActionRecord(id, 'aura', action, 0, body, {
    url: 'https://x.example/aura', startedAt: new Date(T0 + at), durationMs: ms, httpStatus,
    bodySize: 99, requestId, batchSize, responseText
  });
}

/* What a debug bundle carries for these calls: the tab's dump, rows with ids. */
function bundleOf(entries, mask) {
  const dump = actionsDump({ entries, marked: [], recording: true, preserve: true }, mask, !!mask);
  return buildDebugBundle({ now: new Date(T0), calls: entries, tabs: { actions: dump } }, mask);
}

describe('names read from the input', () => {
  const dataMapper = (input) => live(1, { remoteClass: 'omnistudiocore.DRService', remoteMethod: 'invokeInboundDR', input, options: {} });

  it('stay marked as input after a round trip, so Mask values applies to them again', () => {
    const entry = dataMapper({ bundleName: 'Secret_Bundle' });
    expect(entry.nameFrom).toBe('input');
    const [loaded] = recordsFromExport(exportEntries([entry]));
    expect(loaded.name).toBe('Secret_Bundle');
    expect(loaded.nameFrom).toBe('input');
    const [masked] = recordsFromExport(bundleCallRows(bundleOf([entry], maskValues)));
    expect(masked.nameFrom).toBe('input');
  });

  it('are not claimed for a name that only looks similar, or for a code name', () => {
    const ip = live(2);
    expect(recordsFromExport(exportEntries([ip]))[0].nameFrom).toBe('');
    const renamed = { ...exportEntries([dataMapper({ bundleName: 'Secret_Bundle' })])[0], action: 'Something_Else' };
    expect(recordsFromExport([renamed])[0].nameFrom).toBe('');
  });
});

describe('bundleCallRows', () => {
  it('takes the Calls dump, else the older calls', () => {
    const entries = [live(1)];
    expect(bundleCallRows(bundleOf(entries))).toHaveLength(1);
    expect(bundleCallRows(bundleOf(entries))[0]).toHaveProperty('id', 1);
    const old = { calls: exportEntries(entries) };
    expect(bundleCallRows(old)).toHaveLength(1);
    expect(bundleCallRows({ tabs: { actions: { entries: [] } }, calls: exportEntries(entries) })).toHaveLength(1);
  });

  it('gives nothing for anything else', () => {
    expect(bundleCallRows(null)).toEqual([]);
    expect(bundleCallRows({})).toEqual([]);
    expect(bundleCallRows({ tabs: { actions: {} }, calls: 'x' })).toEqual([]);
  });
});

describe('sessionText', () => {
  it('names the file', () => {
    expect(sessionText('bug.json')).toBe('Bundle: bug.json');
    expect(sessionText('')).toBe('Bundle');
  });
});

describe('recordsFromExport', () => {
  it('turns a bundle\'s calls back into records the list accepts', () => {
    const original = live(7, { requestId: 3, batchSize: 2, input: { Id: '001' }, options: { chainable: true, note: 'x' } });
    const [record] = recordsFromExport(bundleCallRows(bundleOf([original])));
    expect(record).toMatchObject({
      id: 7,
      name: 'Order_Place',
      signature: 'omnistudiocore.IPService.Order_Place',
      type: 'IP',
      url: 'https://x.example/aura',
      duration: 250,
      httpStatus: 200,
      state: 'SUCCESS',
      requestId: 3,
      batchSize: 2,
      output: { ok: true },
      error: null,
      omni: true
    });
    expect(record.time).toEqual(original.time);
    expect(record.action.input).toEqual({ Id: '001' });
    expect(record.action.options).toEqual({ chainable: true, note: 'x' });
    expect(record.action).toMatchObject({ remoteClass: 'omnistudiocore.IPService', remoteMethod: 'Order_Place' });
    expect(record.flags.map((flag) => flag.label)).toEqual(['chainable']);
    expect(record.failure).toBeNull();
    expect(failed(record)).toBe(false);
  });

  it('reads the older calls rows, which have no ids', () => {
    const rows = exportEntries([live(1), live(2)]);
    expect(recordsFromExport(rows).map((record) => record.id)).toEqual([1, 2]);
    const partial = [{ ...rows[0], id: 2 }, rows[1]];
    expect(recordsFromExport(partial).map((record) => record.id).sort()).toEqual([1, 2]);
  });

  it('keeps a failure as the file saw it, with the same wording', () => {
    const bad = live(1, { body: { returnValue: { returnValue: { success: false, error: 'Stock is short' } } } });
    const [record] = recordsFromExport(bundleCallRows(bundleOf([bad])));
    expect(failed(record)).toBe(true);
    expect(record.failure).toBe(bad.failure);
    expect(failureReason(record, true)).toBe(failureReason(bad, true));
    expect(verdictOf(record)).toEqual({ text: 'Failed', tone: 'bad' });
  });

  it('keeps answer-wide problems: no response, an empty or unreadable body', () => {
    const none = live(1, { httpStatus: 0, ms: 0, body: null });
    const unreadable = live(2, { httpStatus: 200, body: null, responseText: 'not json' });
    const [a, b] = recordsFromExport(bundleCallRows(bundleOf([none, unreadable])));
    expect(a.responseProblem).toBe('no-response');
    expect(failureReason(a, true)).toBe('No response');
    expect(verdictOf(a).text).toBe('No response');
    expect(b.responseProblem).toBe('not-json');
    expect(failureReason(b, true)).toBe('Response is not JSON');
  });

  it('reads the kind labels an earlier version wrote into a bundle', () => {
    const rows = [
      { id: 1, time: new Date(T0).toISOString(), action: 'Order_Place', signature: 'ns.Service.odd', type: 'Remote action', output: {} },
      { id: 2, time: new Date(T0).toISOString(), action: 'Load_Account', signature: 'ns.Service.load', type: 'Data mapper / DataRaptor', output: {} }
    ];
    expect(recordsFromExport(rows).map((record) => record.type)).toEqual(['RA', 'DR']);
  });

  it('keeps the file\'s verdict where the rules cannot find it again', () => {
    const [record] = recordsFromExport([{
      id: 1, time: new Date(T0).toISOString(), action: 'Odd_Call', signature: 'ns.Service.odd', type: KIND_LABEL.RA,
      failed: true, failure: 'Something the rules do not know', output: { fine: true }
    }]);
    expect(failed(record)).toBe(true);
    expect(failureReason(record, true)).toBe('Something the rules do not know');
    expect(failureReason(record, false)).toBe('Something the rules do not know');
    // With masking on, a text the rules did not build cannot be taken apart, so it is masked whole.
    expect(failureReason(record, true, maskValues)).toBe('<string>');
  });

  it('does not turn a clean call red because masking changed its data', () => {
    const clean = live(1, { body: { returnValue: { returnValue: { error: 'OK', total: 3 } } } });
    expect(failed(clean)).toBe(false);
    const masked = bundleOf([clean], maskValues);
    const [record] = recordsFromExport(bundleCallRows(masked));
    // "OK" is "<string>" in the file, which the rules would call an error.
    expect(record.output.error).toBe('<string>');
    expect(failed(record)).toBe(false);
    expect(failureReason(record, true, maskValues)).toBeNull();
  });

  it('judges a row with no verdict by the rules', () => {
    const rows = exportEntries([live(1, { body: { returnValue: { returnValue: { hasErrors: true } } } })]);
    delete rows[0].failed;
    delete rows[0].failure;
    const [record] = recordsFromExport(rows);
    expect(record.loaded).toBeUndefined();
    expect(record.failure).toBe('Response sets hasErrors: true');
  });

  it('reads the kind from its label, and tells a bare Apex call apart', () => {
    const ra = live(1, { remoteClass: 'MyCo.Service', remoteMethod: 'save' });
    const apex = live(2, { remoteClass: '', remoteMethod: '', apexClass: 'AccountCtl', apexMethod: 'load' });
    const [a, b] = recordsFromExport(exportEntries([ra, apex]));
    expect(a.type).toBe('RA');
    expect(a.action).toMatchObject({ remoteClass: 'MyCo.Service', remoteMethod: 'save' });
    expect(b.type).toBe('APEX');
    expect(b.action).toMatchObject({ apexClass: 'AccountCtl', apexMethod: 'load', remoteClass: '' });
    expect(b.omni).toBe(false);
    expect(a.omni).toBe(true);
  });

  it('carries the chain a call was exported with, so the chain is found again whatever the answers say', () => {
    const hops = [live(1, { at: 0, options: {} }), live(2, { at: 120000, options: {} })];
    const rows = exportEntries(hops).map((row) => ({ ...row, chainId: 'chain-1' }));
    const records = recordsFromExport(rows);
    expect(records.map((record) => record.chainId)).toEqual(['chain-1', 'chain-1']);
    expect(groupChains(records).map((group) => group.hops)).toEqual([[1, 2]]);
    expect(groupChains(recordsFromExport(exportEntries(hops)))).toEqual([]);
  });

  it('keeps the calls in the order they started', () => {
    const rows = exportEntries([live(1, { at: 5000 }), live(2, { at: 1000 }), live(3, { at: 1000 })]);
    expect(recordsFromExport(rows).map((record) => record.id)).toEqual([2, 3, 1]);
  });

  it('skips what is not a row and survives missing fields and a bad time', () => {
    const records = recordsFromExport([null, 'text', 5, {}, { time: 'not a date', action: 'X' }]);
    expect(records).toHaveLength(2);
    records.forEach((record) => {
      expect(Number.isNaN(record.time.getTime())).toBe(false);
      expect(() => record.time.toISOString()).not.toThrow();
      expect(record.duration).toBeNull();
      expect(record.batchSize).toBe(1);
    });
    expect(records[0].name).toBe('unknown action');
    expect(recordsFromExport(undefined)).toEqual([]);
  });

  it('gives a call with no http status the no-response problem, as a live one gets', () => {
    const [record] = recordsFromExport([{ time: new Date(T0).toISOString(), action: 'X', signature: 'a.B.c', httpStatus: 0 }]);
    expect(record.responseProblem).toBe('no-response');
    expect(record.httpStatus).toBe(0);
  });
});
