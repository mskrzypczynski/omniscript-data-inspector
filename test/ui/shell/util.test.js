/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { debounce, flashText, flashDone, downloadText, createPoller } from '../../../src/ui/util.js';
import { decorateButton, icon } from '../../../src/ui/icons.js';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('debounce', () => {
  test('runs once, after the last call, with its arguments', () => {
    const fn = jest.fn();
    const d = debounce(fn, 100);
    d('a'); jest.advanceTimersByTime(60);
    d('b'); jest.advanceTimersByTime(60);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(40);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });
});

describe('flashText', () => {
  test('shows the text then restores the label', () => {
    const b = document.createElement('button');
    b.textContent = 'Copy';
    flashText(b, 'Copied');
    expect(b.textContent).toBe('Copied');
    jest.advanceTimersByTime(1199);
    expect(b.textContent).toBe('Copied');
    jest.advanceTimersByTime(1);
    expect(b.textContent).toBe('Copy');
  });

  test('flashing twice still restores the original label', () => {
    const b = document.createElement('button');
    b.textContent = 'Copy';
    flashText(b, 'One');
    jest.advanceTimersByTime(500);
    flashText(b, 'Two', 300);
    jest.advanceTimersByTime(300);
    expect(b.textContent).toBe('Copy');
  });
});

describe('downloadText', () => {
  test('clicks a link to a blob and revokes it later', () => {
    URL.createObjectURL = jest.fn(() => 'blob:x');
    URL.revokeObjectURL = jest.fn();
    let clicked = null;
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked = this; });
    downloadText('a.json', '{}');
    expect(clicked.download).toBe('a.json');
    expect(clicked.href).toBe('blob:x');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    spy.mockRestore();
  });
});

describe('createPoller', () => {
  function make(extra = {}) {
    const calls = [];
    const state = { run: true, pending: null };
    const poller = createPoller({
      ms: 1000,
      canRun: () => state.run,
      task: (done) => { calls.push(1); state.pending = done; },
      ...extra
    });
    return { poller, calls, state };
  }

  test('start schedules a tick; the next waits for done', () => {
    const { poller, calls, state } = make();
    poller.start();
    jest.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1);
    jest.advanceTimersByTime(5000);
    expect(calls).toHaveLength(1);
    state.pending();
    jest.advanceTimersByTime(1000);
    expect(calls).toHaveLength(2);
  });

  test('does not schedule while canRun is false', () => {
    const { poller, calls, state } = make();
    state.run = false;
    poller.start();
    jest.advanceTimersByTime(3000);
    expect(calls).toHaveLength(0);
    state.run = true;
    poller.now();
    expect(calls).toHaveLength(1);
    state.run = false;
    state.pending();
    jest.advanceTimersByTime(3000);
    expect(calls).toHaveLength(1);
  });

  test('stop cancels the pending tick, now runs immediately', () => {
    const { poller, calls } = make();
    poller.start();
    poller.stop();
    jest.advanceTimersByTime(3000);
    expect(calls).toHaveLength(0);
    poller.now();
    expect(calls).toHaveLength(1);
  });
});

describe('createPoller with a changing period', () => {
  test('re-reads ms before every tick', () => {
    let period = 1000;
    const calls = [];
    const poller = createPoller({ ms: () => period, canRun: () => true, task: (done) => { calls.push(1); period = 4000; done(); } });
    poller.start();
    jest.advanceTimersByTime(1000);
    expect(calls).toHaveLength(1);
    jest.advanceTimersByTime(3999);
    expect(calls).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(calls).toHaveLength(2);
  });
});

describe('flashText on a button with an icon', () => {
  test('changes only the label span and keeps the icon', () => {
    const b = document.createElement('button');
    b.dataset.icon = 'copy';
    b.textContent = 'Copy JSON';
    decorateButton(b);
    const svg = b.querySelector('svg');
    flashText(b, 'Copied');
    expect(b.querySelector('.btn-label').textContent).toBe('Copied');
    expect(b.querySelector('svg')).toBe(svg);
    jest.advanceTimersByTime(1200);
    expect(b.querySelector('.btn-label').textContent).toBe('Copy JSON');
    expect(b.querySelector('svg')).toBe(svg);
  });
});

describe('flashDone', () => {
  test('swaps the icon for a check and back, without text', () => {
    const b = document.createElement('button');
    b.appendChild(icon('copy'));
    const original = b.firstChild;
    flashDone(b);
    expect(b.classList.contains('is-done')).toBe(true);
    expect(b.firstChild).not.toBe(original);
    expect(b.textContent).toBe('');
    jest.advanceTimersByTime(1200);
    expect(b.firstChild).toBe(original);
    expect(b.classList.contains('is-done')).toBe(false);
  });
});
