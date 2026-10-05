'use strict';

/* A small right-click menu. One at a time; it closes on any click elsewhere,
 * on Escape, on scroll and when the panel loses focus.
 *
 *   openContextMenu(ev, [{ label, action, disabled }, '-', ...])
 */

let current = null;

export function closeContextMenu() {
  if (!current) return;
  current.cleanup();
  current.node.remove();
  current = null;
}

export function openContextMenu(ev, items) {
  closeContextMenu();

  const node = document.createElement('div');
  node.className = 'ctx-menu';
  node.setAttribute('role', 'menu');

  items.forEach((item) => {
    if (item === '-') {
      const rule = document.createElement('div');
      rule.className = 'ctx-sep';
      node.appendChild(rule);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ctx-item';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.disabled = !!item.disabled;
    button.addEventListener('click', () => { closeContextMenu(); item.action(); });
    node.appendChild(button);
  });

  document.body.appendChild(node);

  /* Keep it inside the panel: flip to the left / upwards near the edges. */
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  node.style.left = `${Math.max(0, Math.min(ev.clientX, window.innerWidth - width - 2))}px`;
  node.style.top = `${Math.max(0, Math.min(ev.clientY, window.innerHeight - height - 2))}px`;

  const onDown = (down) => { if (!node.contains(down.target)) closeContextMenu(); };
  const onKey = (key) => { if (key.key === 'Escape') { key.stopPropagation(); closeContextMenu(); } };
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', closeContextMenu);
  document.addEventListener('scroll', closeContextMenu, true);

  current = {
    node,
    cleanup: () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', closeContextMenu);
      document.removeEventListener('scroll', closeContextMenu, true);
    }
  };

  const first = node.querySelector('.ctx-item:not(:disabled)');
  if (first) first.focus();
}
