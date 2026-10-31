'use strict';

import { jest } from '@jest/globals';
import { memoDraw } from '../../../src/ui/memo-draw.js';

describe('memoDraw', () => {
  it('draws the first time and again only when the signature changes', () => {
    const drawn = [];
    const paint = memoDraw((n) => `n=${n}`, (signature, n) => drawn.push([signature, n]));
    expect(paint.redraw(1)).toBe(true);
    expect(paint.redraw(1)).toBe(false);
    expect(paint.redraw(2)).toBe(true);
    expect(paint.redraw(2)).toBe(false);
    expect(drawn).toEqual([['n=1', 1], ['n=2', 2]]);
  });

  it('draws again after reset, even for the same signature', () => {
    const draw = jest.fn();
    const paint = memoDraw(() => 'same', draw);
    paint.redraw();
    paint.redraw();
    paint.reset();
    paint.redraw();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('counts the initial signature as already drawn', () => {
    const draw = jest.fn();
    const paint = memoDraw(() => '', draw, '');
    paint.redraw();
    expect(draw).not.toHaveBeenCalled();
    paint.reset();
    paint.redraw();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('keeps the signature of a draw that threw, so a broken view is not rebuilt on every poll', () => {
    const paint = memoDraw(() => 'x', () => { throw new Error('boom'); });
    expect(() => paint.redraw()).toThrow('boom');
    expect(paint.redraw()).toBe(false);
  });
});
