import { attachPropPicker } from '../../src/ui/prop-picker.js';

function setup() {
  document.body.innerHTML = '<input id="p" value="jsonDef" />';
  const input = document.getElementById('p');
  attachPropPicker(input, (done) => done([
    { name: 'jsonDataStr', type: 'string' },
    { name: 'jsonDef', type: 'string' },
    { name: 'recordId', type: 'string' }
  ]));
  return input;
}

const menuNames = () => [...document.querySelectorAll('.prop-item > span:first-child')].map((el) => el.textContent);

describe('property picker', () => {
  it('lists every property on focus even when the input already has a value', () => {
    const input = setup();
    input.dispatchEvent(new Event('focus'));
    expect(menuNames()).toEqual(['jsonDataStr', 'jsonDef', 'recordId']);
  });

  it('fuzzy-filters while typing', () => {
    const input = setup();
    input.dispatchEvent(new Event('focus'));
    input.value = 'rid';
    input.dispatchEvent(new Event('input'));
    expect(menuNames()).toEqual(['recordId']);
  });

  it('picks with Enter and fires change', () => {
    const input = setup();
    let changes = 0;
    input.addEventListener('change', () => { changes++; });
    input.dispatchEvent(new Event('focus'));
    input.value = 'jds';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(input.value).toBe('jsonDataStr');
    expect(changes).toBe(1);
    expect(document.querySelector('.prop-menu').hidden).toBe(true);
  });
});
