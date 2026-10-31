'use strict';

import {
  groupChains, chainRows, chainIndex, chainView, chainMetaParts, chainSummary, chainVerdict, withChainIds,
  answerMarker, mayContinue, chainSentence, chainPlaceText, CHAIN_GAP_MS, SILENT_GAP_MS, OVERLAP_MS, nextStopCheck
} from '../../../src/core/actions/actions-chains.js';
import { buildActionRecord, exportEntries } from '../../../src/core/shared/actions-model.js';
import { actionsDump } from '../../../src/core/actions/actions-dump.js';

const T0 = Date.UTC(2024, 0, 1, 0, 0, 0);

/* One call of an Integration Procedure (or any other call, with `key`). */
function call(id, { key = 'Order_Place', at = 0, ms = 400, options = { chainable: true }, output = { ok: true }, requestId = id, remoteClass = 'omnistudiocore.IPService', input = { Order: 'one' } } = {}) {
  const action = { remoteClass, remoteMethod: key, apexClass: '', apexMethod: '', descriptor: '', input, options };
  return buildActionRecord(id, 'aura', action, 0, { returnValue: { returnValue: output } }, {
    url: 'https://x.example/aura', startedAt: new Date(T0 + at), durationMs: ms, httpStatus: 200,
    bodySize: 10, requestId, batchSize: 1, responseText: undefined
  });
}

describe('answerMarker and mayContinue', () => {
  it('reads a status that says the chain goes on, or is done', () => {
    expect(answerMarker({ vlcStatus: 'InProgress' })).toBe('continues');
    expect(answerMarker({ VlcStatus: 'Queued' })).toBe('continues');
    expect(answerMarker({ vlcStatus: 'Complete' })).toBe('done');
    expect(answerMarker({ IPResult: { vlcStatus: 'queued' } })).toBe('continues');
    expect(answerMarker({ continuationId: 'abc' })).toBe('continues');
    expect(answerMarker({ other: 1 })).toBeNull();
    expect(answerMarker('text')).toBeNull();
    expect(answerMarker(undefined)).toBeNull();
  });

  it('lets an answer that is done win over the option flag, and the flag decide when the answer is silent', () => {
    expect(mayContinue(call(1, { options: { chainable: true }, output: { vlcStatus: 'Complete' } }))).toBe(false);
    expect(mayContinue(call(1, { options: {}, output: { vlcStatus: 'InProgress' } }))).toBe(true);
    expect(mayContinue(call(1, { options: { queueableChainable: true } }))).toBe(true);
    expect(mayContinue(call(1, { options: {} }))).toBe(false);
  });
});

describe('groupChains', () => {
  it('groups consecutive calls to one procedure when the earlier one was chainable', () => {
    const entries = [call(1, { at: 0, ms: 700 }), call(2, { at: 1000, ms: 600 }), call(3, { at: 2000, ms: 800, options: {} })];
    const [group, ...rest] = groupChains(entries);
    expect(rest).toEqual([]);
    expect(group).toEqual({
      id: 'chain-1', name: 'Order_Place', key: 'omnistudiocore.IPService.Order_Place', hops: [1, 2, 3],
      durationMs: 2100, spanMs: 2800, failed: false, stoppedEarly: false
    });
  });

  it('follows the answer when it says the chain goes on, flag or not', () => {
    const entries = [call(1, { options: {}, output: { vlcStatus: 'InProgress' } }), call(2, { at: 500, options: {} })];
    expect(groupChains(entries).map((group) => group.hops)).toEqual([[1, 2]]);
  });

  it('does not make a chain of one call, chainable or not', () => {
    expect(groupChains([call(1)])).toEqual([]);
    expect(groupChains([call(1, { options: {} }), call(2, { at: 500, options: {} })])).toEqual([]);
    expect(groupChains([])).toEqual([]);
  });

  it('does not chain a call to a different procedure, or one whose answer says it is done', () => {
    expect(groupChains([call(1), call(2, { at: 500, key: 'Other_Thing' })])).toEqual([]);
    expect(groupChains([call(1, { output: { vlcStatus: 'Complete' } }), call(2, { at: 500 })])).toEqual([]);
  });

  it('keeps a chain together across other calls made in between', () => {
    const entries = [
      call(1, { at: 0 }),
      call(2, { at: 300, key: 'Fetch_Account', options: {} }),
      call(3, { at: 600, remoteClass: 'ns.Controller', key: 'save' }),
      call(4, { at: 900, options: {} })
    ];
    const groups = groupChains(entries);
    expect(groups.map((group) => group.hops)).toEqual([[1, 4]]);
    const rows = chainRows(entries, groups, new Set());
    expect(rows.map((row) => `${row.kind}${row.entry ? row.entry.id : ''}`)).toEqual(['chain', 'call2', 'call3']);
  });

  it('starts a new chain when the next call comes too long after the last hop', () => {
    const goesOn = { vlcStatus: 'InProgress' };
    const entries = [call(1, { at: 0, ms: 500, output: goesOn }), call(2, { at: 500 + CHAIN_GAP_MS + 1, options: {} })];
    expect(groupChains(entries)).toEqual([]);
    const near = [call(1, { at: 0, ms: 500, output: goesOn }), call(2, { at: 500 + CHAIN_GAP_MS, options: {} })];
    expect(groupChains(near)).toHaveLength(1);
  });

  it('does not join independent calls on the strength of the flag alone when they are far apart', () => {
    // Chainable and silent: nothing says a second call is a continuation.
    const apart = [call(1, { at: 0, ms: 500 }), call(2, { at: 500 + 20000, options: {} })];
    expect(groupChains(apart)).toEqual([]);
    const soon = [call(1, { at: 0, ms: 500 }), call(2, { at: 500 + SILENT_GAP_MS, options: {} })];
    expect(groupChains(soon)).toHaveLength(1);
    const late = [call(1, { at: 0, ms: 500 }), call(2, { at: 500 + SILENT_GAP_MS + 1, options: {} })];
    expect(groupChains(late)).toEqual([]);
  });

  it('does not join independent chainable calls with silent answers and unrelated inputs', () => {
    const entries = [
      call(1, { at: 0, ms: 300, input: { Name: 'first' }, output: { result: 1 } }),
      call(2, { at: 1300, ms: 300, input: { Name: 'second' }, output: { result: 2 } })
    ];
    expect(groupChains(entries)).toEqual([]);
  });

  it('joins a silent hop that repeats the input, or carries a token from the answer before', () => {
    const same = [call(1, { at: 0 }), call(2, { at: 800 })];
    expect(groupChains(same)).toHaveLength(1);
    const token = [
      call(1, { at: 0, input: { Name: 'x' }, output: { handle: 'tok-4711-abc' } }),
      call(2, { at: 800, input: { Name: 'y', resume: 'tok-4711-abc' } })
    ];
    expect(groupChains(token)).toHaveLength(1);
    const short = [
      call(1, { at: 0, input: { Name: 'x' }, output: { ok: 'yes' } }),
      call(2, { at: 800, input: { Name: 'y', note: 'yes' } })
    ];
    expect(groupChains(short)).toEqual([]);
  });

  it('sees a marker under result, and one behind error OK and an INVOKE-200 code', () => {
    const wrapped = { result: { vlcStatus: 'queued' }, error: 'OK', errorCode: 'INVOKE-200' };
    const entries = [
      call(1, { at: 0, ms: 300, options: {}, input: { A: 'one' }, output: wrapped }),
      call(2, { at: 10300, options: {}, input: { A: 'two' } })
    ];
    expect(entries[0].output).toEqual({ vlcStatus: 'queued' });
    expect(answerMarker(entries[0].output)).toBe('continues');
    expect(groupChains(entries).map((group) => group.hops)).toEqual([[1, 2]]);
  });

  it('does not join a call that started while the earlier one was still running', () => {
    const goesOn = { vlcStatus: 'InProgress' };
    // Starts 2 s before the first ended: two independent requests, not hops.
    const overlapping = [call(1, { at: 0, ms: 3000, output: goesOn }), call(2, { at: 1000, options: {} })];
    expect(groupChains(overlapping)).toEqual([]);
    // A little clock noise is not an overlap.
    const noise = [call(1, { at: 0, ms: 1000, output: goesOn }), call(2, { at: 1000 - OVERLAP_MS, options: {} })];
    expect(groupChains(noise)).toHaveLength(1);
    const over = [call(1, { at: 0, ms: 1000, output: goesOn }), call(2, { at: 1000 - OVERLAP_MS - 1, options: {} })];
    expect(groupChains(over)).toEqual([]);
  });

  it('keeps two chains of one procedure apart when the first ended', () => {
    const entries = [
      call(1, { at: 0 }), call(2, { at: 600, options: {}, output: { vlcStatus: 'Complete' } }),
      call(3, { at: 5000 }), call(4, { at: 5600, options: {} })
    ];
    expect(groupChains(entries).map((group) => group.hops)).toEqual([[1, 2], [3, 4]]);
  });

  it('does not chain two calls that travelled in one request', () => {
    expect(groupChains([call(1, { requestId: 7 }), call(2, { at: 100, requestId: 7, options: {} })])).toEqual([]);
  });

  it('marks a chain failed when any hop failed, and sums only known durations', () => {
    const entries = [call(1, { ms: 0 }), call(2, { at: 300, output: { success: false }, options: {} })];
    const [group] = groupChains(entries);
    expect(group.failed).toBe(true);
    expect(group.durationMs).toBe(400);
  });

  it('says stoppedEarly when the last hop still goes on and nothing came within 30 s', () => {
    const entries = [call(1, { at: 0, ms: 500 }), call(2, { at: 1000, ms: 500, output: { vlcStatus: 'InProgress' } })];
    expect(groupChains(entries)[0].stoppedEarly).toBe(false); // nothing later to show 30 s passed
    expect(groupChains(entries, { now: T0 + 1500 + CHAIN_GAP_MS })[0].stoppedEarly).toBe(false);
    expect(groupChains(entries, { now: T0 + 1500 + CHAIN_GAP_MS + 1 })[0].stoppedEarly).toBe(true);
    const later = [...entries, call(3, { at: 40000, key: 'Unrelated_Call', options: {} })];
    expect(groupChains(later)[0].stoppedEarly).toBe(true);
  });

  it('is not stopped early when the last hop only carries the flag, or says it is done', () => {
    const flagged = [call(1, { at: 0 }), call(2, { at: 500 })];
    expect(groupChains(flagged, { now: T0 + 999999 })[0].stoppedEarly).toBe(false);
    const done = [call(1, { at: 0 }), call(2, { at: 500, output: { vlcStatus: 'Complete' } })];
    expect(groupChains(done, { now: T0 + 999999 })[0].stoppedEarly).toBe(false);
  });

  it('uses the chains a file names, whatever the answers say', () => {
    const entries = [call(1, { options: {} }), call(2, { at: 100_000, options: {} }), call(3, { at: 200_000, options: {} })];
    entries[0].chainId = 'chain-9';
    entries[2].chainId = 'chain-9';
    const groups = groupChains(entries);
    expect(groups.map((group) => ({ id: group.id, hops: group.hops }))).toEqual([{ id: 'chain-1', hops: [1, 3] }]);
  });
});

describe('nextStopCheck', () => {
  const going = { vlcStatus: 'InProgress' };

  it('says when a chain that goes on will count as stopped, and never for one that is done', () => {
    const entries = [call(1, { at: 0, ms: 500, output: going }), call(2, { at: 1000, ms: 500, output: going })];
    const groups = groupChains(entries, { now: T0 + 2000 });
    expect(nextStopCheck(groups, entries, T0 + 2000)).toBe(1500 + CHAIN_GAP_MS - 2000 + 1);
    expect(nextStopCheck(groups, entries, T0 + 1500 + CHAIN_GAP_MS)).toBe(1);

    const done = [call(1, { at: 0 }), call(2, { at: 600, options: {}, output: { vlcStatus: 'Complete' } })];
    expect(nextStopCheck(groupChains(done, { now: T0 }), done, T0)).toBeNull();
    expect(nextStopCheck([], [], T0)).toBeNull();
  });

  it('has nothing to wait for once the chain is marked stopped', () => {
    const entries = [call(1, { at: 0, ms: 500, output: going }), call(2, { at: 1000, ms: 500, output: going })];
    const late = T0 + 1500 + CHAIN_GAP_MS + 5;
    expect(nextStopCheck(groupChains(entries, { now: late }), entries, late)).toBeNull();
  });

  it('waits for the soonest of several chains', () => {
    const entries = [
      call(1, { at: 0, ms: 100, output: going }), call(2, { at: 200, ms: 100, output: going }),
      call(3, { at: 5000, ms: 100, key: 'Other_Key', output: going }), call(4, { at: 5200, ms: 100, key: 'Other_Key', output: going })
    ];
    const groups = groupChains(entries, { now: T0 + 6000 });
    expect(nextStopCheck(groups, entries, T0 + 6000)).toBe(300 + CHAIN_GAP_MS - 6000 + 1);
  });
});

describe('chainRows', () => {
  const entries = [call(1, { at: 0 }), call(2, { at: 500, options: {} }), call(3, { at: 900, key: 'Solo_Call', options: {} })];
  const groups = groupChains(entries);

  it('puts a chain where its first hop stood, with its hops after it only while it is open', () => {
    expect(chainRows(entries, groups, new Set()).map((row) => row.kind)).toEqual(['chain', 'call']);
    const open = chainRows(entries, groups, new Set(['chain-1']));
    expect(open.map((row) => row.kind)).toEqual(['chain', 'hop', 'hop', 'call']);
    expect(open.filter((row) => row.kind === 'hop').map((row) => row.number)).toEqual([1, 2]);
  });

  it('shows a chain while any hop passes the filters, with the hops that pass', () => {
    const rows = chainRows([entries[1], entries[2]], groups, new Set(['chain-1']));
    expect(rows.map((row) => row.kind)).toEqual(['chain', 'hop', 'call']);
    expect(rows[0].hops.map((hop) => hop.id)).toEqual([2]);
    expect(rows[0].total).toBe(2);
    expect(chainRows([entries[2]], groups, new Set()).map((row) => row.kind)).toEqual(['call']);
  });
});

describe('chain texts and view', () => {
  const entries = [call(1, { at: 0, ms: 1200 }), call(2, { at: 1300, ms: 900, options: {}, output: { done: 1 } })];
  const [group] = groupChains(entries);
  const clock = () => '10:00:00';

  it('summarises a chain', () => {
    expect(chainSummary(group, 'ms')).toBe('2 calls · 2,100 ms');
    expect(chainSummary(group, 'human')).toBe('2 calls · 2.1 s');
  });

  it('writes the meta line, naming failed hops and a stop', () => {
    expect(chainMetaParts(group, entries, { clock, format: 'ms' })).toEqual([
      'Integration Procedure', '2 calls', 'total 2,100 ms', 'span 2,200 ms', '10:00:00'
    ]);
    const failing = [entries[0], call(2, { at: 1300, options: {}, output: { success: false } })];
    const bad = { ...group, failed: true, stoppedEarly: true };
    expect(chainMetaParts(bad, failing, { clock, format: 'ms' }).slice(-2)).toEqual(['1 call failed', 'stopped early']);
  });

  it('shows the first hop\'s input and the last hop\'s output', () => {
    const view = chainView(group, entries);
    expect(view.action.input).toEqual({ Order: 'one' });
    expect(view.output).toEqual({ done: 1 });
    expect(view.chain).toBe(group);
    expect(view.hopEntries).toEqual(entries);
    expect(view.duration).toBe(2100);
    expect(view.failure).toBeNull();
    expect(chainView(group, [])).toBeNull();
  });

  it('is red when any hop failed and carries the hop\'s reason', () => {
    const failing = [call(1, { at: 0, output: { success: false } }), call(2, { at: 300, options: {} })];
    const [bad] = groupChains(failing);
    expect(chainVerdict(bad, failing)).toEqual({ text: 'Failed', tone: 'bad' });
    expect(chainView(bad, failing).failure).toMatch(/^Call 1 of 2: /);
    expect(chainVerdict(group, entries)).toEqual({ text: 'Succeeded', tone: 'good' });
  });

  it('names the chain of each exported row', () => {
    const rows = withChainIds(exportEntries(entries), entries, [group]);
    expect(rows.map((row) => row.chainId)).toEqual(['chain-1', 'chain-1']);
    const outside = withChainIds(exportEntries([call(5, { options: {} })]), [call(5)], [group]);
    expect(outside[0]).not.toHaveProperty('chainId');
    expect(chainIndex([group]).get(2)).toBe(group);
  });

  it('names the chain of each call in the debug bundle\'s dump', () => {
    const dump = actionsDump({ entries, chains: [group], marked: [] });
    expect(dump.entries.map((row) => row.chainId)).toEqual(['chain-1', 'chain-1']);
    expect(actionsDump({ entries, marked: [] }).entries[0]).not.toHaveProperty('chainId');
  });
});

describe('chainSentence', () => {
  const going = { vlcStatus: 'InProgress' };

  it('says the server answered continue when every call but the last did', () => {
    const calls = [call(1, { output: going }), call(2, { at: 500, output: going }), call(3, { at: 1000, output: { vlcStatus: 'Complete' } })];
    expect(chainSentence(calls, false)).toBe('This procedure ran as 3 calls in a chain; the server answered \'continue\' after each but the last.');
  });

  it('adds the 30 seconds when the last answer said continue too and nothing followed', () => {
    const calls = [call(1, { output: going }), call(2, { at: 500, output: going })];
    expect(chainSentence(calls, true)).toBe('This procedure ran as 2 calls in a chain; the server answered \'continue\' after each, including the last, but no further call followed within 30 seconds.');
  });

  it('does not claim an answer for a chain found by the chainable option and a shared input', () => {
    const calls = [call(1), call(2, { at: 500 })];
    const text = chainSentence(calls, false);
    expect(text).toBe('This procedure ran as 2 calls in a chain; they were joined by the chainable option and a shared input or token, not by an answer saying \'continue\'.');
    expect(text).not.toContain('answered');
  });

  it('keeps to the count when nothing in the calls says why they are one chain', () => {
    const calls = [call(1, { options: {} }), call(2, { at: 500, options: {} })];
    expect(chainSentence(calls, false)).toBe('This procedure ran as 2 calls in a chain.');
    expect(chainSentence([], false)).toBe('This procedure ran as 0 calls in a chain.');
  });

  it('does not say every answer continued when only some did', () => {
    const calls = [call(1, { output: going }), call(2, { at: 500 }), call(3, { at: 800, output: { vlcStatus: 'Complete' } })];
    expect(chainSentence(calls, false)).not.toContain('answered');
  });
});

describe('chainPlaceText', () => {
  const group = { hops: [4, 7, 9] };

  it('says which call of the chain a call is', () => {
    expect(chainPlaceText(group, 4)).toBe('call 1 of 3 in a chain');
    expect(chainPlaceText(group, 7)).toBe('call 2 of 3 in a chain');
    expect(chainPlaceText(group, 9)).toBe('call 3 of 3 in a chain');
  });

  it('is empty for a call that is not in the group, or no group', () => {
    expect(chainPlaceText(group, 5)).toBe('');
    expect(chainPlaceText(undefined, 4)).toBe('');
    expect(chainPlaceText({}, 4)).toBe('');
  });
});
