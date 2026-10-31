'use strict';

import { decorateButton } from '../../../src/ui/icons.js';
import { jest } from '@jest/globals';
import { writeClipboard, copyWithButton } from '../../../src/ui/clipboard.js';

afterEach(() => {
  delete document.execCommand;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  document.body.innerHTML = '';
});

describe('writeClipboard', () => {
  it('uses the async API when it works', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await writeClipboard('x');
    expect(writeText).toHaveBeenCalledWith('x');
  });

  it('falls back to execCommand when the API refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('no focus')) } });
    document.execCommand = jest.fn().mockReturnValue(true);
    await writeClipboard('x');
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('rejects when neither route works', async () => {
    document.execCommand = jest.fn().mockReturnValue(false);
    await expect(writeClipboard('x')).rejects.toThrow();
  });
});

describe('copyWithButton', () => {
  it('flashes the button label once copied, and does nothing for empty text', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    const button = { textContent: 'Copy' };
    copyWithButton('', button);
    expect(button.textContent).toBe('Copy');
    copyWithButton('x', button);
    await Promise.resolve(); await Promise.resolve();
    expect(button.textContent).toBe('Copied');
  });

  it('changes only the label of a button with an icon', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    const button = document.createElement('button');
    button.textContent = 'Copy';
    decorateButton(button, 'copy');
    const svg = button.querySelector('svg');
    copyWithButton('x', button);
    await Promise.resolve(); await Promise.resolve();
    expect(button.querySelector('.btn-label').textContent).toBe('Copied');
    expect(button.querySelector('svg')).toBe(svg);
  });
});
