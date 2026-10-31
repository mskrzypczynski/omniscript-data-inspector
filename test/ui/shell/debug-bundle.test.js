'use strict';

/* "Save a debug bundle", in the help overlay next to Restore default settings,
 * through the real panel markup. */

import { jest } from '@jest/globals';
import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';

describe('Debug bundle button', () => {
  let blobs;
  let downloads;

  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
  });

  beforeEach(() => {
    blobs = [];
    downloads = [];
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:test'; };
    URL.revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloads.push(this.download);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.querySelectorAll('.toast').forEach((node) => node.remove());
  });

  it('is gone from the top bar', () => {
    expect(document.getElementById('debug-bundle')).toBeNull();
  });
});
