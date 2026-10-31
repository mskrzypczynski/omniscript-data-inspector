import { actionsStatus } from '../../../src/core/actions/actions-status.js';

const base = {
  shown: 5, total: 5, chains: 0, failed: 0, session: false, recording: true, dropped: false, droppedOmni: false, maxEntries: 500,
  filters: { onlyOmni: true, errorsOnly: false, query: '', slowMs: 0, clearOnReload: false }
};
const filters = (extra) => ({ ...base.filters, ...extra });

describe('actionsStatus', () => {
  it('reads "5 calls" and "Recording" when everything is at its defaults', () => {
    expect(actionsStatus(base)).toEqual({ left: '5 calls', right: 'Recording' });
    expect(actionsStatus({ ...base, shown: 1, total: 1 }).left).toBe('1 call');
  });

  it('says Paused while the panel does not capture', () => {
    expect(actionsStatus({ ...base, recording: false }).right).toBe('Paused');
  });

  it('adds failed only when there is one, then the chains', () => {
    expect(actionsStatus({ ...base, failed: 1 }).left).toBe('5 calls · 1 failed');
    expect(actionsStatus({ ...base, failed: 0, chains: 1 }).left).toBe('5 calls · 1 chain');
    expect(actionsStatus({ ...base, failed: 2, chains: 3 }).left).toBe('5 calls · 2 failed · 3 chains');
  });

  it('says how many were captured when the filters keep some off the list', () => {
    expect(actionsStatus({ ...base, shown: 3, total: 40 }).left).toBe('3 calls of 40 captured');
  });

  it('names no filter that is at its default: All Apex calls off is not said', () => {
    expect(actionsStatus({ ...base, filters: filters({ onlyOmni: true }) }).right).toBe('Recording');
  });

  it('names a choice only when it differs from the default', () => {
    expect(actionsStatus({ ...base, filters: filters({ onlyOmni: false }) }).right).toBe('Recording · all Apex calls');
    expect(actionsStatus({ ...base, filters: filters({ clearOnReload: true }) }).right).toBe('Recording · clears on reload');
    expect(actionsStatus({ ...base, filters: filters({ errorsOnly: true }) }).right).toBe('Recording · failed only');
    expect(actionsStatus({ ...base, filters: filters({ query: 'slow:800' }) }).right).toBe('Recording · slow: 800 ms');
    expect(actionsStatus({ ...base, filters: filters({ query: 'slow:', slowMs: 500 }) }).right).toBe('Recording · slow: 500 ms');
    expect(actionsStatus({ ...base, filters: filters({ query: 'step:Intro' }) }).right).toBe('Recording · text: step:Intro');
  });

  it('lists several in a fixed order', () => {
    const all = filters({ onlyOmni: false, clearOnReload: true, errorsOnly: true, query: 'slow:800 foo' });
    expect(actionsStatus({ ...base, recording: false, filters: all }).right)
      .toBe('Paused · all Apex calls · clears on reload · failed only · slow: 800 ms · text: foo');
  });

  it('says the oldest calls were dropped only when it matters for what is listed', () => {
    const dropped = { ...base, dropped: true, droppedOmni: false };
    expect(actionsStatus(dropped).right).toBe('Recording');
    expect(actionsStatus({ ...dropped, droppedOmni: true }).right).toBe('Recording · oldest calls dropped (the last 500 are kept)');
    expect(actionsStatus({ ...dropped, filters: filters({ onlyOmni: false }) }).right)
      .toBe('Recording · all Apex calls · oldest calls dropped (the last 500 are kept)');
  });

  it('says Not capturing for a loaded file, counts against the file, and leaves out reload and drops', () => {
    const file = { ...base, session: true, shown: 2, total: 9, recording: false, dropped: true, droppedOmni: true, filters: filters({ clearOnReload: true }) };
    expect(actionsStatus(file)).toEqual({ left: '2 calls of 9 in the file', right: 'Not capturing' });
    expect(actionsStatus({ ...file, filters: filters({ onlyOmni: false }) }).right).toBe('Not capturing · all Apex calls');
  });
});
