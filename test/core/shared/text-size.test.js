'use strict';

import {
  TEXT_SIZES, DEFAULT_TEXT_SIZE, normalizeTextSize, zoomOf, textSizeName, sizeAfterKey, fixedPosition
} from '../../../src/core/shared/text-size.js';

describe('text size', () => {
  it('has four sizes with Medium as the default and no zoom', () => {
    expect(TEXT_SIZES).toEqual(['S', 'M', 'L', 'XL']);
    expect(DEFAULT_TEXT_SIZE).toBe('M');
    expect(zoomOf('M')).toBe(1);
  });

  it('zooms each size by its documented factor', () => {
    expect(TEXT_SIZES.map(zoomOf)).toEqual([0.9, 1, 1.12, 1.25]);
  });

  it('reads anything unknown as the default', () => {
    ['', 'xl', 'huge', 3, null, undefined].forEach((value) => {
      expect(normalizeTextSize(value)).toBe('M');
      expect(zoomOf(value)).toBe(1);
    });
    expect(normalizeTextSize('XL')).toBe('XL');
  });

  it('names the sizes for tooltips', () => {
    expect(TEXT_SIZES.map(textSizeName)).toEqual(['Small', 'Medium', 'Large', 'Extra large']);
  });

  it('moves one step per key and stops at the ends', () => {
    expect(sizeAfterKey('M', 'larger')).toBe('L');
    expect(sizeAfterKey('L', 'larger')).toBe('XL');
    expect(sizeAfterKey('XL', 'larger')).toBe('XL');
    expect(sizeAfterKey('M', 'smaller')).toBe('S');
    expect(sizeAfterKey('S', 'smaller')).toBe('S');
  });

  it('goes back to the default with reset, and keeps the size for another key', () => {
    expect(sizeAfterKey('XL', 'reset')).toBe('M');
    expect(sizeAfterKey('L', 'sideways')).toBe('L');
    expect(sizeAfterKey('bogus', 'larger')).toBe('L');
  });
});

describe('fixedPosition', () => {
  const view = { viewWidth: 1000, viewHeight: 600 };

  it('puts the box at the point when the page is not zoomed', () => {
    expect(fixedPosition({ x: 100, y: 50, width: 80, height: 40, ...view })).toEqual({ left: 100, top: 50 });
  });

  it('divides the point by the zoom, since left and top are in the zoomed page\'s pixels', () => {
    expect(fixedPosition({ x: 150, y: 100, width: 80, height: 40, zoom: 1.25, ...view })).toEqual({ left: 120, top: 80 });
  });

  it('keeps the box inside the view, counting its size at the zoom', () => {
    // 200 wide at 1.25 is 250 on screen: the left edge stops at 1000 - 250 - 2
    const at = fixedPosition({ x: 990, y: 590, width: 200, height: 100, zoom: 1.25, ...view });
    expect(at.left * 1.25).toBeCloseTo(748);
    expect(at.top * 1.25).toBeCloseTo(473);
  });

  it('never goes negative, and reads a bad zoom as none', () => {
    expect(fixedPosition({ x: -5, y: -5, width: 10, height: 10, ...view })).toEqual({ left: 0, top: 0 });
    expect(fixedPosition({ x: 10, y: 20, width: 1, height: 1, zoom: 0, ...view })).toEqual({ left: 10, top: 20 });
  });
});
