'use strict';

import {
  VIEW_CHOICES, viewToKeep, viewToOpen, pickedTabToKeep, logTabToKeep
} from '../../../src/core/shared/remembered-views.js';
import { pickRemembered, REMEMBER_ALLOWED } from '../../../src/core/shared/remembered-settings.js';
import { detailTabs } from '../../../src/core/structure/detail-tabs.js';
import { VIEWS } from '../../../src/core/structure/form-rows.js';

describe('viewToKeep', () => {
  it('keeps the Data view only when it is Tree, Form or Raw, never Sizes or Changes', () => {
    expect(viewToKeep('dataView', 'tree')).toBe('tree');
    expect(viewToKeep('dataView', 'form')).toBe('form');
    expect(viewToKeep('dataView', 'raw')).toBe('raw');
    expect(viewToKeep('dataView', 'sizes')).toBeNull();
    expect(viewToKeep('dataView', 'changes')).toBeNull();
  });

  it('keeps the three Current value views, and nothing else', () => {
    ['form', 'tree', 'raw'].forEach((view) => expect(viewToKeep('structValueView', view)).toBe(view));
    expect(viewToKeep('structValueView', 'table')).toBeNull();
  });

  it('keeps a Calls tab only when it is Input, Output or Options', () => {
    ['input', 'output', 'options'].forEach((tab) => expect(viewToKeep('logDetailTab', tab)).toBe(tab));
    ['changes', 'hops', 'compare', 'nope'].forEach((tab) => expect(viewToKeep('logDetailTab', tab)).toBeNull());
  });

  it('knows nothing about a setting that is not a view', () => {
    expect(viewToKeep('textSize', 'M')).toBeNull();
    expect(viewToKeep('toString', 'x')).toBeNull();
  });
});

describe('viewToOpen', () => {
  it('opens on the stored view while it is still a choice, else on the fallback', () => {
    expect(viewToOpen('dataView', 'raw', 'tree')).toBe('raw');
    expect(viewToOpen('dataView', 'form', 'tree')).toBe('form');
    expect(viewToOpen('dataView', 'sizes', 'tree')).toBe('tree');
    expect(viewToOpen('structValueView', 'tree', 'form')).toBe('tree');
    expect(viewToOpen('structValueView', undefined, 'form')).toBe('form');
    expect(viewToOpen('logDetailTab', 'output', '')).toBe('output');
    expect(viewToOpen('logDetailTab', 'hops', '')).toBe('');
  });
});

describe('pickedTabToKeep', () => {
  it('keeps a tab picked by hand, and nothing for none or for Definition', () => {
    expect(pickedTabToKeep('props')).toBe('props');
    expect(pickedTabToKeep('validation')).toBe('validation');
    expect(pickedTabToKeep('definition')).toBe('');
    expect(pickedTabToKeep(null)).toBe('');
    expect(pickedTabToKeep(undefined)).toBe('');
  });

  it('names every tab the Structure detail pane can offer except Definition', () => {
    const element = {
      category: { key: 'step' }, conditional: true, isSetValues: false, remote: true,
      validation: { has: true }
    };
    const offered = detailTabs({
      element, value: 'x', callsCount: 1, stopCount: 1, usedByCount: 1, propsCount: 1, optionsCount: 1
    }).map((tab) => tab.id).filter((id) => id !== 'definition');
    offered.forEach((id) => expect(VIEW_CHOICES.structDetailTab).toContain(id));
  });
});

describe('logTabToKeep', () => {
  it('keeps the tab only when the user picked it and it is Input, Output or Options', () => {
    expect(logTabToKeep('output', true)).toBe('output');
    expect(logTabToKeep('output', false)).toBe('');
    expect(logTabToKeep('changes', true)).toBe('');
    expect(logTabToKeep('compare', true)).toBe('');
  });
});

describe('what Remember my settings accepts for the views', () => {
  const defaults = {
    rememberSettings: false, dataView: 'tree', structValueView: 'form', structDetailTab: '', structShowInternal: false,
    logDetailTab: '', refreshRate: 'normal'
  };

  it('puts the views back, empty meaning none picked', () => {
    const stored = {
      dataView: 'raw', structValueView: 'tree', structDetailTab: 'props', structShowInternal: true,
      logDetailTab: 'output', refreshRate: 'gentle'
    };
    expect(pickRemembered(stored, defaults, REMEMBER_ALLOWED)).toEqual(stored);
    expect(pickRemembered({ structDetailTab: '', logDetailTab: '' }, defaults, REMEMBER_ALLOWED))
      .toEqual({ structDetailTab: '', logDetailTab: '' });
  });

  it('drops a view or a rate that is not one of the choices', () => {
    expect(pickRemembered({
      dataView: 'sizes', structValueView: 'table', structDetailTab: 'definition', logDetailTab: 'hops', refreshRate: 'turbo'
    }, defaults, REMEMBER_ALLOWED)).toEqual({});
  });

  it('lists the same Current value views as the Structure tab draws', () => {
    expect([...VIEW_CHOICES.structValueView]).toEqual([...VIEWS]);
  });
});
