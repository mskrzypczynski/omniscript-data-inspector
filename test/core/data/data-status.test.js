import { statusText } from '../../../src/core/data/data-status.js';

const base = {
  host: { label: 'Frame A' }, shown: 1, nested: 0, truncated: false, rawLength: 0,
  scanError: null, visible: true, stale: false, live: true, lastUpdateText: '',
  changedCount: 0, view: 'tree', hasData: true, rawLines: 0, rawMatches: 0, filter: ''
};
const plain = (s) => s.left.map((p) => p.text).join('');

describe('statusText', () => {
  test('host summary: the script in bold, its size, then the embedded scripts that are hidden', () => {
    const s = statusText({ ...base, shown: 2, rawLength: 2048, nested: 3, truncated: true });
    expect(plain(s)).toBe('Frame A · 2.0 KB · 3 embedded scripts hidden · list truncated');
    expect(s.left.filter((p) => p.bold).map((p) => p.text)).toEqual(['Frame A']);
    expect(plain(statusText({ ...base, nested: 1 }))).toBe('Frame A · 0 B · 1 embedded script hidden');
  });

  test('names the script by Type/SubType/Language in bold, and by the tag without one', () => {
    const keyed = statusText({ ...base, rawLength: 7372, host: { label: 'c-quote#main', key: 'Sales/Quote/English' } });
    expect(plain(keyed)).toBe('Sales/Quote/English · 7.2 KB');
    expect(keyed.left.filter((p) => p.bold).map((p) => p.text)).toEqual(['Sales/Quote/English']);
    expect(plain(statusText({ ...base, host: { label: 'c-quote#main', key: '' } }))).toBe('c-quote#main · 0 B');
  });

  test('reads like "<script> · 7.2 KB · Live · changed 10:43"', () => {
    const s = statusText({ ...base, rawLength: 7372, host: { label: 'c-q', key: 'A/b/C' }, lastUpdateText: '10:43', prop: 'jsonDataStr', shown: 3 });
    expect(`${plain(s)} · ${s.right}`).toBe('A/b/C · 7.2 KB · Live · changed 10:43');
  });

  test('keeps the host count, the tag and the property for the tooltip', () => {
    const s = statusText({ ...base, host: { label: 'c-q#main', key: 'A/b/C' }, prop: 'jsonDataStr', shown: 2 });
    expect(s.title).toBe('Element c-q#main, property jsonDataStr.\n2 OmniScripts listed.');
    expect(statusText({ ...base, shown: 1 }).title).toBe('Element Frame A.\n1 OmniScript listed.');
  });

  test('puts hidden element hosts in the tooltip, and embedded scripts in the line only when they are real', () => {
    const elements = statusText({ ...base, nested: 0, elementHosts: 196 });
    expect(plain(elements)).toBe('Frame A · 0 B');
    expect(elements.right).not.toMatch(/hidden/);
    expect(elements.title).toContain('196 other components of a listed script hidden');
    expect(elements.title).not.toContain('embedded script');
    const real = statusText({ ...base, nested: 2, elementHosts: 5 });
    expect(plain(real)).toContain('2 embedded scripts hidden');
    expect(real.title).toContain('5 other components of a listed script hidden');
    expect(real.title).toContain('2 embedded scripts hidden');
  });

  test('says one other component in the singular, and where Embedded scripts is', () => {
    const one = statusText({ ...base, nested: 1, elementHosts: 1 });
    expect(one.title).toContain('1 other component of a listed script hidden');
    expect(one.title).not.toContain('1 other components');
    expect(one.title).toContain('1 embedded script hidden (to list them, show the Frame row in Settings, Data, Reading another page, and tick Embedded scripts)');
  });

  test('adds the note a tab asked for to the tooltip', () => {
    expect(statusText({ ...base, note: '1,800 rows, drawn a window at a time' }).title).toMatch(/\n1,800 rows, drawn a window at a time$/);
    expect(statusText({ ...base, host: null, note: 'x' }).title).toBe('x');
  });

  test('singular and no-host wording', () => {
    expect(plain(statusText(base))).toMatch(/^Frame A · /);
    expect(plain(statusText({ ...base, host: null }))).toBe('Nothing found on this page');
    expect(plain(statusText({ ...base, host: null, scanError: 'x' }))).toBe('Read failed');
  });

  test('right side priority: hidden, stale, manual, live', () => {
    expect(statusText({ ...base, visible: false, stale: true }).right).toBe('Idle (panel hidden)');
    expect(statusText({ ...base, stale: true }).right).toBe('Stale (OmniScript gone)');
    expect(statusText({ ...base, live: false }).right).toBe('Manual mode · press Refresh to update');
    expect(statusText(base).right).toBe('Live');
  });

  test('adds change info and raw counts', () => {
    const s = statusText({
      ...base, lastUpdateText: '10:00:00', changedCount: 2, view: 'raw', rawLines: 40, rawMatches: 1, filter: 'a'
    });
    expect(s.right).toBe('Live · changed 10:00:00 · 2 values updated · 40 lines · 1 match');
    expect(s.rightParts.filter((p) => p.quiet).map((p) => p.text)).toEqual([' · changed 10:00:00']);
    expect(statusText({ ...base, view: 'raw', rawLines: 5, rawMatches: 2, filter: ' ' }).right).toBe('Live · 5 lines');
    expect(statusText({ ...base, view: 'raw', rawMatches: 2, filter: 'a', hasData: false }).right).toBe('Live');
  });
});

describe('statusText when the script is gone but its payload is kept', () => {
  it('says the last data read is shown, with its size', () => {
    const { left } = statusText({ host: null, stale: true, rawLength: 2048, visible: true });
    expect(left).toEqual([{ text: 'Nothing found on this page · showing the last data read (2.0 KB)' }]);
  });

  it('says only that nothing was found when there is nothing kept', () => {
    expect(statusText({ host: null, stale: false, rawLength: 0, visible: true }).left).toEqual([{ text: 'Nothing found on this page' }]);
  });
});

describe('statusText while nothing is found', () => {
  const none = { ...base, host: null, shown: 0, stale: false, rawLength: 0 };

  it('does not say Live: there is nothing being read', () => {
    expect(statusText(none).right).toBe('Waiting for an OmniScript');
    expect(statusText(none).right).not.toMatch(/Live/);
  });

  it('says so in manual mode too, without asking for a Refresh that has nothing to read', () => {
    expect(statusText({ ...none, live: false }).right).toBe('Manual mode · nothing to read yet');
  });

  it('keeps Idle and Stale ahead of it', () => {
    expect(statusText({ ...none, visible: false }).right).toBe('Idle (panel hidden)');
    expect(statusText({ ...none, stale: true, rawLength: 10 }).right).toBe('Stale (OmniScript gone)');
  });
});

describe('an open bundle', () => {
  const loaded = { ...base, session: 'bug.json', rawLength: 2048, lastUpdateText: '10:00:00' };

  it('names the file instead of counting scripts on the page', () => {
    const s = statusText(loaded);
    expect(plain(s)).toBe('Bundle: bug.json · Frame A · 2.0 KB');
    expect(s.left[0]).toEqual({ text: 'Bundle', bold: true });
  });

  it('says read-only, with no clock time', () => {
    expect(statusText(loaded).right).toBe('Read-only');
    expect(statusText({ ...loaded, live: false }).right).toBe('Read-only');
  });

  it('is ignored when no file is loaded', () => {
    expect(plain(statusText({ ...base, session: null }))).toMatch(/^Frame A/);
  });

  test('says what a $ query in the filter found, in the tree view only', () => {
    const query = (extra) => ({ text: '$.Rows[*].Code', matches: 3, capped: false, ...extra });
    expect(statusText({ ...base, query: query() }).right).toBe('Live · 3 matches');
    expect(statusText({ ...base, query: query({ matches: 1 }) }).right).toBe('Live · 1 match');
    expect(statusText({ ...base, query: query({ matches: 0 }) }).right).toBe('Live · 0 matches');
    expect(statusText({ ...base, query: query({ matches: 5000, capped: true }) }).right).toBe('Live · 5,000+ matches');
    expect(statusText({ ...base, view: 'raw', query: query() }).right).toBe('Live · 0 lines');
    expect(statusText({ ...base, query: null }).right).toBe('Live');
  });

  test('does not repeat the query: it is in the filter box', () => {
    const text = '$.' + 'a'.repeat(60);
    expect(statusText({ ...base, query: { text, matches: 2, capped: false } }).right).toBe('Live · 2 matches');
  });
});

describe('status wording', () => {
  const host = { label: 'c-a' };
  const base = { host, shown: 1, nested: 0, rawLength: 5, visible: true, live: true, view: 'tree', hasData: true };

  it('says 1 value updated, not 1 value(s)', () => {
    expect(statusText({ ...base, changedCount: 1 }).right).toBe('Live · 1 value updated');
    expect(statusText({ ...base, changedCount: 4 }).right).toBe('Live · 4 values updated');
    const one = { updated: 1, rowsAdded: 1, rowsRemoved: 1, truncated: false };
    expect(statusText({ ...base, changeInfo: one }).right).toBe('Live · 1 value updated · 1 row added · 1 row removed');
  });

  it('keeps the property the data was read from out of the line, in the tooltip', () => {
    const s = statusText({ ...base, prop: 'jsonDataStr' });
    expect(s.left.map((part) => part.text).join('')).toBe('c-a · 5 B');
    expect(s.title).toContain('property jsonDataStr');
  });
});
