'use strict';

/* No OmniScript on the page: the Structure tab says so in one line, switches
 * the controls that need a script off and folds the detail pane away. */

import { bootStructure } from '../support/structure-page.js';

describe('with no script found', () => {
  it('shows one line with a Rescan button and a More help link', async () => {
    await bootStructure({ scripts: [] });
    const card = document.querySelector('#struct-list .struct-empty');
    expect(card.textContent).toBe('No OmniScript found on this page. Open a page that runs one and let it load, then Rescan.RescanMore help');
    expect(card.querySelectorAll('button')).toHaveLength(2);
    expect(document.querySelector('#struct-list ol, #struct-list ul')).toBeNull();
  });

  it('presses the top bar\'s Rescan and opens the help from its two controls', async () => {
    await bootStructure({ scripts: [] });
    let rescans = 0;
    const asked = [];
    document.getElementById('rescan').addEventListener('click', () => { rescans += 1; });
    document.addEventListener('keydown', (ev) => asked.push([ev.key, ev.target.getAttribute('data-help')]));
    document.getElementById('struct-empty-rescan').click();
    document.getElementById('struct-empty-help').click();
    expect(rescans).toBe(1);
    expect(asked).toEqual([['h', 'No OmniScript found']]);
  });
});
