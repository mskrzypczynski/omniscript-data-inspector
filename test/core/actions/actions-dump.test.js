'use strict';

import { actionsDump, filterTextForDump } from '../../../src/core/actions/actions-dump.js';
import { buildActionRecord } from '../../../src/core/shared/actions-model.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const action = (input, options = {}) => ({
  remoteClass: 'omnistudiocore.IPService', remoteMethod: 'Order_Place', apexClass: '', apexMethod: '', descriptor: '', input, options
});

function record(id, { input = { Name: 'Ada' }, options = {}, body, problem, responseText } = {}) {
  return buildActionRecord(id, 'aura', action(input, options), 0, body === undefined ? { returnValue: { ok: true } } : body, {
    url: 'https://x.example/aura', startedAt: new Date(Date.UTC(2024, 0, 1, 0, 0, id)), durationMs: 30, httpStatus: problem ? 200 : 200,
    bodySize: 10, requestId: id, batchSize: 1, responseText
  });
}

const base = { recording: true, clearOnReload: false, onlyOmni: true, errorsOnly: false, slowMs: 0, filter: '', selectedId: null, compareId: null };

describe('actionsDump', () => {
  it('dumps the same calls as the bundle: the OmniStudio calls only when asked, the newest 50', () => {
    const entries = [];
    for (let id = 1; id <= 60; id++) entries.push(record(id));
    const other = { ...record(61), omni: false };
    const all = [...entries, other];
    const dump = actionsDump({ ...base, onlyOmni: true, entries: all });
    expect(dump.entries).toHaveLength(50);
    expect(dump.entries[0].id).toBe(11);
    expect(dump.entries.some((row) => row.id === 61)).toBe(false);
    expect(dump.problems).toHaveLength(50);
    expect(actionsDump({ ...base, onlyOmni: false, entries: all }).entries.some((row) => row.id === 61)).toBe(true);
  });

  it('carries the settings, the selection and the calls with their ids', () => {
    const entries = [record(1), record(2, { options: { chainable: true } })];
    const dump = actionsDump({ ...base, selectedId: 2, compareId: 1, marked: new Set([1, 2]), slowMs: 500, errorsOnly: true, entries });
    expect(dump).toMatchObject({
      recording: true,
      clearOnReload: false,
      filters: { onlyOmni: true, errorsOnly: true, slowMs: 500, text: '' },
      selectedId: 2,
      compareId: 1,
      marked: [1, 2]
    });
    expect(dump.entries.map((row) => row.id)).toEqual([1, 2]);
    expect(dump.entries[0]).toMatchObject({ action: expect.any(String), input: { Name: 'Ada' }, httpStatus: 200 });
    expect(dump.entries[1].options).toEqual({ chainable: true });
  });

  it('masks input, options, output and failure text, and keeps names, ids and statuses', () => {
    const entries = [record(1, { input: { Name: 'Ada', Age: 36 }, options: { token: 'abc' }, body: { error: [{ message: 'Ada is not allowed' }] } })];
    const dump = actionsDump({ ...base, entries }, maskValues, true);
    const text = JSON.stringify(dump);
    expect(text).not.toContain('Ada');
    expect(text).not.toContain('abc');
    expect(dump.entries[0].input).toEqual({ Name: '<string>', Age: '<number>' });
    expect(dump.entries[0].action).toBe('Order_Place');
    expect(dump.entries[0].httpStatus).toBe(200);
  });

  it('leaves the raw text of an undecodable answer out while masked, and keeps it otherwise', () => {
    const html = '<html>Down for Ada</html>';
    const entries = [record(1, { body: undefined, responseText: html, problem: true })];
    // A body that is not JSON: the record notes the problem.
    entries[0].responseProblem = 'not-json';
    entries[0].rawResponse = html;
    expect(actionsDump({ ...base, entries }, (v) => v, false).entries[0].rawResponse).toBe(html);
    const masked = actionsDump({ ...base, entries }, maskValues, true);
    expect(masked.entries[0]).not.toHaveProperty('rawResponse');
    expect(JSON.stringify(masked)).not.toContain('Down for Ada');
  });

  it('does not attach the raw text of a call that was understood', () => {
    const entries = [record(1, { responseText: 'while(1);{"actions":[]}' })];
    expect(actionsDump({ ...base, entries }).entries[0]).not.toHaveProperty('rawResponse');
  });

  it('lists why each call has a problem', () => {
    const ok = record(1);
    const bad = record(2);
    bad.responseProblem = 'no-response';
    const dump = actionsDump({ ...base, entries: [ok, bad] });
    expect(dump.problems).toEqual([
      { id: 1, responseProblem: null, failure: null },
      { id: 2, responseProblem: 'no-response', failure: expect.any(String) }
    ]);
  });

  it('copes with nothing captured', () => {
    expect(actionsDump({ ...base })).toMatchObject({ entries: [], problems: [], marked: [], selectedId: null, compareId: null });
  });
});

describe('filterTextForDump', () => {
  it('masks the value of in: and keeps the other terms', () => {
    expect(filterTextForDump('fetch in:Ada url:aura step:"Order Review"', maskValues)).toBe('fetch in:<string> url:aura step:"Order Review"');
    expect(filterTextForDump('in:"Ada Lovelace"', maskValues)).toBe('in:<string>');
  });

  it('is the text as typed without a mask, and with nothing after in:', () => {
    expect(filterTextForDump('in:"Ada Lovelace" x', (v) => v)).toBe('in:"Ada Lovelace" x');
    expect(filterTextForDump('in:', maskValues)).toBe('in:');
    expect(filterTextForDump(undefined, maskValues)).toBe('');
  });
});

describe('actionsDump: test calls', () => {
  it('carries the test tag of a call the panel sent', () => {
    const entry = {
      id: 1, kind: 'aura', url: 'https://x/aura', time: new Date('2024-01-01T10:00:00Z'), duration: 5, requestId: 1, batchSize: 1,
      httpStatus: 200, omni: true, type: 'IP', flags: [], name: 'A_B', nameFrom: 'method', signature: 'a.B.A_B',
      action: { input: {}, options: {} }, state: 'SUCCESS', output: {}, error: null,
      test: { token: 't', rerunOf: 3, rerunTime: Date.parse('2024-01-01T09:00:00Z') }
    };
    const dump = actionsDump({ entries: [entry], onlyOmni: true });
    expect(dump.entries[0].test).toEqual({ rerunOf: '2024-01-01T09:00:00.000Z' });
  });
});
