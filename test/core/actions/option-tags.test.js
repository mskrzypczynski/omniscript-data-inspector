'use strict';

import { fitTags, tagsTitle, tookTail, WIDE_TAG_CHARS } from '../../../src/core/actions/option-tags.js';

const tag = (label) => ({ label, title: `${label} means so` });

describe('fitTags', () => {
  it('shows every tag when they fit', () => {
    const result = fitTags([tag('chain'), tag('no cache')]);
    expect(result.shown.map((item) => item.label)).toEqual(['chain', 'no cache']);
    expect(result.more).toBe(0);
    expect(result.moreTitle).toBe('');
  });

  it('keeps the first tag whatever its length and counts the rest', () => {
    const result = fitTags([tag('a tag with a very long label of its own'), tag('continuation'), tag('future')]);
    expect(result.shown.map((item) => item.label)).toEqual(['a tag with a very long label of its own']);
    expect(result.more).toBe(2);
    expect(result.moreTitle).toBe('continuation means so\nfuture means so');
    expect(WIDE_TAG_CHARS).toBeGreaterThanOrEqual(28);
  });

  it('holds a chain row\'s two tags', () => {
    const result = fitTags([tag('chain · 3 calls'), tag('stopped early')]);
    expect(result.shown).toHaveLength(2);
    expect(result.more).toBe(0);
  });

  it('holds a long chain count and "stopped early" together, and the ×N of a shared request with them', () => {
    const result = fitTags([tag('chain · 10 calls'), tag('stopped early')]);
    expect(result.shown.map((item) => item.label)).toEqual(['stopped early', 'chain · 10 calls']);
    expect(result.more).toBe(0);
    expect(fitTags([tag('chain · 100 calls'), tag('stopped early')]).more).toBe(0);
  });

  it('puts the tags in the order of their importance: stopped early, chain, ×N, repeat, the rest', () => {
    const all = [tag('no cache'), tag('repeat ×2'), tag('×5'), tag('chain · 3 calls'), tag('chainable'), tag('stopped early')];
    expect(fitTags(all, { maxChars: 1000 }).shown.map((item) => item.label))
      .toEqual(['stopped early', 'chain · 3 calls', '×5', 'repeat ×2', 'no cache', 'chainable']);
  });

  it('loses the least important ones first when there is no room', () => {
    const tight = fitTags([tag('no cache'), tag('repeat ×2'), tag('×5'), tag('chain · 3 calls'), tag('stopped early')]);
    expect(tight.shown.map((item) => item.label)).toEqual(['stopped early', 'chain · 3 calls', '×5']);
    expect(tight.more).toBe(2);
    expect(tight.moreTitle).toBe('repeat ×2 means so\nno cache means so');
  });

  it('the one tag of a narrow list is the most important one, not the first drawn', () => {
    expect(fitTags([tag('chainable'), tag('×5')], { maxTags: 1 }).shown.map((item) => item.label)).toEqual(['×5']);
    expect(fitTags([tag('chain · 3 calls'), tag('stopped early')], { maxTags: 1 }).shown.map((item) => item.label)).toEqual(['stopped early']);
    expect(fitTags([tag('repeat ×2'), tag('chain · 2 calls')], { maxTags: 1 }).shown.map((item) => item.label)).toEqual(['chain · 2 calls']);
  });

  it('keeps the order of tags that matter equally', () => {
    expect(fitTags([tag('pre'), tag('post'), tag('future')], { maxChars: 1000 }).shown.map((item) => item.label)).toEqual(['pre', 'post', 'future']);
  });

  it('shows one tag and +N when only one is allowed', () => {
    const result = fitTags([tag('chain'), tag('future'), tag('pre')], { maxTags: 1 });
    expect(result.shown).toHaveLength(1);
    expect(result.more).toBe(2);
  });

  it('the narrow cell holds up to three short tags in 20 characters and counts the rest in +N', () => {
    const narrow = { maxTags: 3, maxChars: 20 };
    const labels = (result) => result.shown.map((item) => item.label);
    // A re-run's own tags and its option: 19 characters, all three shown.
    const rerun = fitTags([tag('chainable'), tag('test'), tag('re-run')], narrow);
    expect(labels(rerun)).toEqual(['test', 're-run', 'chainable']);
    expect(rerun.more).toBe(0);
    // Two options together fit (17 characters).
    expect(labels(fitTags([tag('chainable'), tag('no cache')], narrow))).toEqual(['chainable', 'no cache']);
    // A fourth tag is the +1.
    const four = fitTags([tag('chainable'), tag('test'), tag('re-run'), tag('no cache')], narrow);
    expect(labels(four)).toEqual(['test', 're-run', 'chainable']);
    expect(four.more).toBe(1);
    expect(four.moreTitle).toBe('no cache means so');
    // Two long ones do not fit side by side.
    expect(labels(fitTags([tag('queueable chain'), tag('continuation')], narrow))).toEqual(['queueable chain']);
  });

  it('ranks the plain re-run chip with a repeat, ahead of the options', () => {
    expect(fitTags([tag('chainable'), tag('re-run')], { maxTags: 1 }).shown.map((item) => item.label)).toEqual(['re-run']);
    expect(fitTags([tag('re-run'), tag('test')], { maxTags: 1 }).shown.map((item) => item.label)).toEqual(['test']);
  });

  it('copes with no tags', () => {
    expect(fitTags([])).toEqual({ shown: [], more: 0, moreTitle: '' });
    expect(fitTags(undefined).more).toBe(0);
  });
});

describe('tookTail', () => {
  it('is the ×N of a request several calls share, for a list with no tag column', () => {
    expect(tookTail([tag('chainable'), tag('×5')])).toBe('×5');
    expect(tookTail([tag('×12')])).toBe('×12');
  });

  it('is empty for everything else, a repeat included', () => {
    expect(tookTail([tag('chainable'), tag('repeat ×2'), tag('chain · 3 calls')])).toBe('');
    expect(tookTail([])).toBe('');
    expect(tookTail(undefined)).toBe('');
  });
});

describe('tagsTitle', () => {
  it('names every tag with its meaning', () => {
    expect(tagsTitle([tag('chain'), tag('pre')])).toBe('chain: chain means so\npre: pre means so');
    expect(tagsTitle([])).toBe('');
  });
});
