'use strict';

import { foldHelp, wordCount, COLLAPSE_WORDS } from '../../../src/core/shared/help-text.js';
import { helpMatches } from '../../../src/core/shared/help-filter.js';

/* n words, the first capitalised so a sentence can start on it. */
const words = (n) => Array.from({ length: n }, (_, at) => (at ? `word${at}` : 'Word0')).join(' ');

describe('foldHelp', () => {
  it('shows an entry of up to 40 words whole', () => {
    const text = `${words(COLLAPSE_WORDS - 1)}. Next.`;
    expect(wordCount(text)).toBe(COLLAPSE_WORDS);
    expect(foldHelp(text)).toEqual({ head: text, rest: '' });
  });

  it('folds a longer entry after its first sentence', () => {
    const text = `Reads the data of the script now. ${words(60)}.`;
    const { head, rest } = foldHelp(text);
    expect(head).toBe('Reads the data of the script now.');
    expect(rest).toBe(`${words(60)}.`);
    expect(`${head} ${rest}`).toBe(text);
  });

  it('does not end a sentence after e.g. or i.e.', () => {
    const text = `Joined with its label, e.g. US (United States) or i.e. the stored value. ${words(50)}.`;
    expect(foldHelp(text).head).toBe('Joined with its label, e.g. US (United States) or i.e. the stored value.');
  });

  it('does not end a sentence in the middle of a name such as jsonDataStr. any', () => {
    const text = `Any property name, not just jsonDataStr. ${words(50)}.`;
    expect(foldHelp(text).head).toBe('Any property name, not just jsonDataStr.');
  });

  it('takes the next sentence along when the first is only a few words', () => {
    const text = `Under Advanced. Nested scripts inherit the properties of their parent. ${words(50)}.`;
    expect(foldHelp(text).head).toBe('Under Advanced. Nested scripts inherit the properties of their parent.');
  });

  it('cuts a long single sentence at the limit and keeps the rest', () => {
    const text = `${words(70)}.`;
    const { head, rest } = foldHelp(text);
    expect(head.endsWith('…')).toBe(true);
    expect(wordCount(head)).toBe(COLLAPSE_WORDS);
    expect(wordCount(rest)).toBe(30);
  });

  it('cuts at the limit when the first sentence is itself longer than it', () => {
    const text = `${words(45)}. Short.`;
    const { head } = foldHelp(text);
    expect(wordCount(head)).toBe(COLLAPSE_WORDS);
  });

  it('loses no word: head and rest together hold the whole text', () => {
    const text = `First sentence here. ${words(80)}. Last one!`;
    const { head, rest } = foldHelp(text);
    expect(`${head} ${rest}`.replace('…', '')).toContain('Last one!');
    expect(wordCount(`${head} ${rest}`)).toBeGreaterThanOrEqual(wordCount(text));
  });
});

describe('searching folded help', () => {
  it('still finds a word that sits in the folded part', () => {
    const text = `Reads the data of the script now. ${words(60)} needle ${words(5)}.`;
    expect(foldHelp(text).head).not.toContain('needle');
    expect(helpMatches('needle', 'Refresh', text)).toBe(true);
  });
});

describe('control names in folded help', () => {
  it('never cuts a [[control name]] in two when the limit falls inside it', () => {
    const text = `${words(COLLAPSE_WORDS - 2)} [[Track changes on this tab]] and then some more words with no stop`;
    const { head, rest } = foldHelp(text);
    expect(head).toContain('[[Track changes on this tab]]');
    expect(head.split('[[').length).toBe(head.split(']]').length);
    expect(`${head} ${rest}`).not.toBe('');
  });

  it('is found by the name inside the mark, not by the brackets', () => {
    expect(helpMatches('rescan if', 'Top bar', 'Press [[Rescan]] if the list is empty.')).toBe(true);
    expect(helpMatches('[[rescan', 'Top bar', 'Press [[Rescan]] if the list is empty.')).toBe(false);
  });
});
