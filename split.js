'use strict';

/* Draggable divider for a two-pane .split (list + detail), shared by the
 * Structure and Remote actions tabs. Works in both orientations: side by side
 * on a wide panel (drag left/right, sets --list-w) and stacked on a narrow one
 * (drag up/down, sets --list-h). panel.css maps each variable to the list
 * pane's flex-basis for the matching layout.
 *
 *   Split.init(splitEl)
 *
 * Width/height is held in memory only — no storage, no permissions — so it
 * lasts as long as DevTools stays open and resets when it is closed. */
(function (global) {

  var MIN_LEAD = 140;   // px the list pane may never go below
  var MIN_TAIL = 200;   // px the detail pane may never go below

  function init(split) {
    if (!split || split.dataset.split === 'on') return;
    split.dataset.split = 'on';

    var list = split.firstElementChild;
    if (!list) return;

    var divider = document.createElement('div');
    divider.className = 'split-divider';
    divider.setAttribute('role', 'separator');
    divider.title = 'Drag to resize · double-click to reset';
    list.after(divider);

    var dragging = false;
    var vertical = false;

    function clamp(px, extent) {
      return Math.max(MIN_LEAD, Math.min(px, extent - MIN_TAIL - 6));
    }

    function onMove(ev) {
      if (!dragging) return;
      var r = split.getBoundingClientRect();
      if (vertical) {
        split.style.setProperty('--list-h',
          clamp(ev.clientY - r.top, split.clientHeight) + 'px');
      } else {
        split.style.setProperty('--list-w',
          clamp(ev.clientX - r.left, split.clientWidth) + 'px');
      }
      ev.preventDefault();
    }

    function stop() {
      if (!dragging) return;
      dragging = false;
      divider.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', stop);
    }

    divider.addEventListener('mousedown', function (ev) {
      vertical = getComputedStyle(split).flexDirection === 'column';
      dragging = true;
      divider.classList.add('is-dragging');
      document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', stop);
      ev.preventDefault();
    });

    /* Double-click restores the default balance for both axes. */
    divider.addEventListener('dblclick', function () {
      split.style.removeProperty('--list-w');
      split.style.removeProperty('--list-h');
    });
  }

  global.Split = { init: init };

})(window);
