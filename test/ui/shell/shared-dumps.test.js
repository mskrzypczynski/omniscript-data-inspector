'use strict';

import { Shared } from '../../../src/ui/shared.js';

describe('Shared.dumps', () => {
  it('collects every tab through the mask and keeps one failing getter from hiding the rest', () => {
    Shared.setDump('one', (mask) => ({ value: mask('secret') }));
    Shared.setDump('two', () => { throw new Error('boom'); });
    const out = Shared.dumps(() => '<masked>');
    expect(out.one).toEqual({ value: '<masked>' });
    expect(out.two).toEqual({ error: 'boom' });
  });
});
