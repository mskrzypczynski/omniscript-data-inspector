'use strict';

import { buildReport, REPORT_FAILED_CALLS } from '../../../src/core/shared/report.js';
import { buildActionRecord } from '../../../src/core/shared/actions-model.js';
import { maskValues } from '../../../src/core/shared/mask.js';

const at = (h, m, s) => new Date(2024, 0, 1, h, m, s);

function call(id, name, { body, status = 200, time = at(10, 0, id) } = {}) {
  const action = { remoteClass: 'omnistudiocore.IPService', remoteMethod: name, apexClass: '', apexMethod: '', descriptor: '', input: { Name: 'Ada' }, options: {} };
  return buildActionRecord(id, 'aura', action, 0, body === undefined ? { returnValue: { ok: true } } : body, {
    url: 'https://x.example/aura', startedAt: time, durationMs: 30, httpStatus: status, bodySize: 10, requestId: id, batchSize: 1
  });
}
const bad = (id, name, message = 'Plan not found') => call(id, name, { body: { returnValue: { returnValue: { error: message } } } });

const base = {
  script: 'Onboarding/Start/English',
  step: { name: 'PlanSelection' },
  stoppers: [{ name: 'PlanType', reason: 'Required and empty' }],
  failedCalls: [call(1, 'GetPlans'), bad(2, 'Order_Place')],
  payloadBytes: 2048,
  problems: 2,
  version: '2.0.0'
};

describe('buildReport', () => {
  it('writes the script, step, payload size, problems and version', () => {
    const text = buildReport(base);
    expect(text).toContain('# OmniScript report');
    expect(text).toContain('- Script: `Onboarding/Start/English`');
    expect(text).toContain('- Current step: `PlanSelection`');
    expect(text).toContain('- Data JSON: 2.0 KB');
    expect(text).toContain('- Problems: 2');
    expect(text).toContain('- OmniScript Data Inspector 2.0.0');
  });

  it('lists what may stop Next', () => {
    expect(buildReport(base)).toContain('## May stop Next\n- `PlanType`: Required and empty');
  });

  it('says so when nothing was found, and leaves the section out when it is not known', () => {
    expect(buildReport({ ...base, stoppers: [] })).toContain('Nothing found that may stop Next');
    expect(buildReport({ ...base, stoppers: null })).not.toContain('May stop Next');
  });

  it('lists the failed calls with their reasons, newest first, and not the good ones', () => {
    const text = buildReport({ ...base, failedCalls: [bad(1, 'First', 'one'), call(2, 'Good'), bad(3, 'Third', 'three')] });
    expect(text).toContain('## Failed calls (last 2)');
    expect(text.indexOf('Third')).toBeLessThan(text.indexOf('First'));
    expect(text).toContain('- 10:00:03 `Third` — Response error — three');
    expect(text).not.toContain('Good');
  });

  it('keeps the last five failed calls', () => {
    expect(REPORT_FAILED_CALLS).toBe(5);
    const many = Array.from({ length: 8 }, (_, i) => bad(i + 1, `Call${i + 1}`));
    const text = buildReport({ ...base, failedCalls: many });
    expect(text).toContain('(last 5)');
    expect(text).toContain('Call8');
    expect(text).toContain('Call4');
    expect(text).not.toContain('Call3');
  });

  it('says so when no call failed', () => {
    expect(buildReport({ ...base, failedCalls: [call(1, 'Fine')] })).toContain('No failed calls captured.');
    expect(buildReport({ ...base, failedCalls: [] })).toContain('No failed calls captured.');
  });

  it('masks the values a reason quotes, and nothing else it knows', () => {
    const text = buildReport({ ...base, failedCalls: [bad(1, 'Order_Place', 'No plan for Ada Lovelace')] }, maskValues);
    expect(text).toContain('Response error — <string>');
    expect(text).not.toContain('Ada Lovelace');
    expect(text).toContain('`Order_Place`');
    expect(text).toContain('`PlanSelection`');
  });

  it('shows the values without a mask', () => {
    expect(buildReport({ ...base, failedCalls: [bad(1, 'Order_Place', 'No plan for Ada Lovelace')] })).toContain('No plan for Ada Lovelace');
  });

  it('says no problems as none, and leaves out what is not known', () => {
    expect(buildReport({ ...base, problems: 0 })).toContain('- Problems: none');
    const text = buildReport({ script: '', failedCalls: [] });
    expect(text).toContain('- Script: not found');
    expect(text).not.toContain('Current step');
    expect(text).not.toContain('Payload');
    expect(text).not.toContain('Problems');
  });

  it('keeps each fact on one line and a name literal', () => {
    const text = buildReport({ ...base, step: { name: 'Plan\nSelection `x`' }, stoppers: [{ name: 'A|B', reason: 'line one\nline two' }] });
    expect(text).toContain("- Current step: `Plan Selection 'x'`");
    expect(text).toContain('- `A|B`: line one line two');
  });

  it('copes with nothing at all', () => {
    expect(buildReport()).toContain('# OmniScript report');
    expect(buildReport({})).not.toContain('Failed calls');
  });

  it('takes the script as an object', () => {
    expect(buildReport({ script: { key: 'A/B/English', label: 'c-os' } })).toContain('`A/B/English`');
  });
});

describe('buildReport names from the input', () => {
  it('masks a Data Mapper name that was read from the input', () => {
    const action = { remoteClass: 'vlocity_ins.DefaultDROmniScriptIntegration', remoteMethod: 'invokeInboundDR', apexClass: '', apexMethod: '', descriptor: '', input: { bundle: 'Jane Doe Notes' }, options: {} };
    const entry = buildActionRecord(1, 'aura', action, 0, { actions: [{ state: 'ERROR', error: [{ message: 'boom' }] }] }, {
      url: 'https://x.example/aura', startedAt: at(10, 0, 1), durationMs: 30, httpStatus: 200, requestId: 1, batchSize: 1
    });
    expect(buildReport({ failedCalls: [entry] })).toContain('Jane Doe Notes');
    expect(buildReport({ failedCalls: [entry] }, maskValues)).not.toContain('Jane Doe Notes');
  });
});

describe('buildReport and OmniStudio only', () => {
  const other = (id) => ({ ...bad(id, 'Whatever'), omni: false, name: `LayoutController.get${id}` });

  it('lists the failed OmniStudio calls, not a busy page\'s other Apex errors', () => {
    const calls = [bad(1, 'Order_Place'), other(2), other(3), other(4), other(5), other(6), other(7)];
    const text = buildReport({ failedCalls: calls });
    expect(text).toContain('`Order_Place`');
    expect(text).not.toContain('LayoutController');
    expect(text).toContain('Failed calls (last 1)');
  });

  it('lists every failed call when the filter is off', () => {
    const text = buildReport({ failedCalls: [bad(1, 'Order_Place'), other(2)], onlyOmni: false });
    expect(text).toContain('LayoutController.get2');
    expect(text).toContain('`Order_Place`');
  });
});

describe('copy report: test calls', () => {
  it('tags a failed call that the panel sent', () => {
    const call = (extra) => ({
      name: 'Order_Place', signature: 'a.B.Order_Place', nameFrom: 'method', omni: true, time: new Date('2024-01-01T10:00:00Z'),
      httpStatus: 500, failure: 'HTTP 500', ...extra
    });
    const text = buildReport({ script: 'A/B', failedCalls: [call({}), call({ test: { token: 't', rerunOf: null, rerunTime: null } })], version: '2.0.0' });
    const lines = text.split('\n').filter((line) => line.includes('Order_Place'));
    expect(lines).toHaveLength(2);
    expect(lines.filter((line) => line.includes('(test call)'))).toHaveLength(1);
  });
});
