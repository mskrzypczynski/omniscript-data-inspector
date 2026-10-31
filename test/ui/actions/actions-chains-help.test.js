'use strict';

/* The help of the Calls tab explains chained procedures and a
 * loaded session, in words that match what the tab does. */

import { stubChromeDevtools, mountPanelMarkup } from '../support/panel-fixture.js';
import { plainChips } from '../../../src/core/shared/chips.js';

describe('Calls help', () => {
  beforeAll(async () => {
    stubChromeDevtools();
    mountPanelMarkup();
    await import('../../../src/ui/app.js');
    document.getElementById('tab-actions').click();
    document.getElementById('help').click();
  });

  /* The panel draws the text and the short line; the details are on the website's reference page. */
  const whole = async (title) => {
    const { ACTIONS_HELP } = await import('../../../src/ui/help/actions.js');
    const [, text, extra] = ACTIONS_HELP.sections[0][1].find((item) => item[0] === title);
    return plainChips(`${extra.short} ${text} ${extra.more || ''}`);
  };

  it('has an entry for chained procedures that names the row, its calls and the 30 s rule', async () => {
    const text = await whole('Chained procedures');
    expect(text).toContain('chain · 3 calls');
    expect(text).toContain('Calls tab');
    expect(text).toContain('call 1 of 3');
    expect(text).not.toMatch(/\bhops?\b/i);
    expect(text).toContain('stopped early');
    expect(text).toContain('30 s');
    expect(text).toContain('chainId');
  });
});
