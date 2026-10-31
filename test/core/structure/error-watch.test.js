'use strict';

import { nextErrorWatch, NEW_WATCH, TOAST_EVERY_MS } from '../../../src/core/structure/error-watch.js';

const intro = { key: 'k1', name: 'Intro' };
const details = { key: 'k2', name: 'Details' };

/* Feeds reads [step, count, now] through the watch and returns the messages. */
function run(reads, memory = NEW_WATCH) {
  const messages = [];
  let current = memory;
  reads.forEach(([step, count, now]) => {
    const result = nextErrorWatch(current, step, count, now);
    current = result.memory;
    messages.push(result.message);
  });
  return { messages, memory: current };
}

describe('nextErrorWatch', () => {
  it('says nothing for the first read, whatever it holds', () => {
    expect(run([[intro, 0, 0]]).messages).toEqual([null]);
    expect(run([[intro, 2, 0]]).messages).toEqual([null]);
  });

  it('toasts when the count goes from none to some on the same step', () => {
    const { messages } = run([[intro, 0, 0], [intro, 0, 2000], [intro, 2, 4000]]);
    expect(messages).toEqual([null, null, 'Set Errors fire on Intro: 2']);
  });

  it('toasts once per transition: nothing while the errors keep firing, or change in number', () => {
    const { messages } = run([[intro, 0, 0], [intro, 1, 2000], [intro, 1, 4000], [intro, 3, 6000]]);
    expect(messages).toEqual([null, 'Set Errors fire on Intro: 1', null, null]);
  });

  it('toasts again after the errors cleared and came back, but not within 30 seconds', () => {
    const quick = run([[intro, 0, 0], [intro, 1, 2000], [intro, 0, 4000], [intro, 1, 6000]]);
    expect(quick.messages).toEqual([null, 'Set Errors fire on Intro: 1', null, null]);

    const later = run([[intro, 0, 0], [intro, 1, 2000], [intro, 0, 4000], [intro, 1, 2000 + TOAST_EVERY_MS]]);
    expect(later.messages[3]).toBe('Set Errors fire on Intro: 1');
    const justShort = run([[intro, 0, 0], [intro, 1, 2000], [intro, 0, 4000], [intro, 1, 1999 + TOAST_EVERY_MS]]);
    expect(justShort.messages[3]).toBeNull();
  });

  it('treats arriving on another step as a new baseline, not as news', () => {
    const { messages } = run([[intro, 0, 0], [details, 2, 2000], [details, 2, 4000]]);
    expect(messages).toEqual([null, null, null]);
  });

  it('then toasts for the new step when its errors start', () => {
    const { messages } = run([[intro, 0, 0], [details, 0, 2000], [details, 1, 4000]]);
    expect(messages[2]).toBe('Set Errors fire on Details: 1');
  });

  it('forgets the step when none is known, so coming back is a new baseline', () => {
    const { messages, memory } = run([[intro, 0, 0], [null, 0, 2000], [intro, 1, 4000]]);
    expect(messages).toEqual([null, null, null]);
    expect(memory.count).toBe(1);
  });

  it('does not change the memory it is given', () => {
    const memory = { stepKey: 'k1', count: 0, toastedAt: null };
    const frozen = Object.freeze({ ...memory });
    nextErrorWatch(frozen, intro, 2, 5);
    expect(frozen).toEqual(memory);
  });
});
