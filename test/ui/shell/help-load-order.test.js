'use strict';

/* The help is filtered by the gates that are open when it is read, not when
 * its modules are imported: a build with gates registers them after some of
 * them were already loaded (a module that imports another registers nothing,
 * a test or a script may import the help first). Names are invented. */

import { jest } from '@jest/globals';

const HELP = '../../../src/ui/help';

/* One after another: Jest's module linker can fail ("module not been linked")
 * when several dynamic imports that share a dependency run at once. */
async function importHelp() {
  const modules = [];
  for (const file of ['data', 'structure', 'actions', 'common', 'start', 'shortcuts']) {
    modules.push(await import(`${HELP}/${file}.js`));
  }
  const [data, structure, actions, common, start, shortcuts] = modules;
  const entries = (tab) => tab.sections.flatMap(([, list]) => list);
  return {
    data: entries(data.DATA_HELP),
    structure: entries(structure.STRUCTURE_HELP),
    actions: entries(actions.ACTIONS_HELP),
    common: common.COMMON_HELP[1],
    start: { data: start.START.data, structure: start.START.structure, actions: start.START.actions },
    keys: shortcuts.shortcuts(),
    read: () => ({
      data: entries(data.DATA_HELP), actions: entries(actions.ACTIONS_HELP), common: common.COMMON_HELP[1],
      start: start.START, keys: shortcuts.shortcuts()
    })
  };
}

const textOf = (list, title) => list.find(([name]) => name === title)[1];
const shortOf = (list, title) => list.find(([name]) => name === title)[2].short;

beforeEach(() => jest.resetModules());

describe('help imported before a build registers its gates', () => {
  it('keeps the Free wording when nothing is registered, whichever module loaded first', async () => {
    const loaded = await importHelp();
    expect(textOf(loaded.data, 'Filter')).not.toContain('$ query');
    expect(textOf(loaded.common, 'Status bar')).toContain('Buy me a coffee');
    expect(shortOf(loaded.data, 'Views')).toContain('Tree, Form or Raw');
    expect(shortOf(loaded.data, 'Views')).not.toContain('Sizes');
    expect(textOf(loaded.data, 'Views')).not.toContain('Sizes');
  });
});

describe('the Free help', () => {
  it('names no control that only a build with gates has', async () => {
    const loaded = await importHelp();
    const tasks = await import(`${HELP}/tasks.js`);
    const text = JSON.stringify([loaded.data, loaded.structure, loaded.actions, loaded.common, loaded.start, tasks]);
    ['Actions only', 'What may stop Next is', 'Written by'].forEach((words) => expect(text).not.toContain(words));
  });
});
