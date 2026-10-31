'use strict';

/* The shell of a full-panel dialog (the help and the settings): open and
 * close with focus handled, Esc, a click on the backdrop and Tab kept inside
 * the card. What the dialog holds is the caller's: `onOpen` draws it just
 * before it is shown and `initialFocus` says where the keyboard starts. */

const FOCUSABLE = 'button, input, a[href], summary, [tabindex]:not([tabindex="-1"])';

/* A control the keyboard can reach: not inside something hidden, not
 * disabled, and not inside a folded <details> (its summary still is). */
const reachable = (node) => !node.closest('[hidden]') && !node.disabled
  && !(node.tagName !== 'SUMMARY' && node.closest('details:not([open])'));

export function createOverlay({ overlay, card, button, closeButton, onOpen = () => {}, initialFocus = () => card }) {
  let opener = null; // what had the focus when it opened, so Esc gives it back

  const isOpen = () => !overlay.hidden;

  /* restoreFocus is false when another dialog takes over, so the focus does
   * not flash through the control that opened this one. */
  function toggle(show, { restoreFocus = true } = {}) {
    const open = show === undefined ? overlay.hidden : show;
    const wasOpen = isOpen();
    if (open) onOpen(wasOpen);
    if (open && !wasOpen) opener = document.activeElement;
    overlay.hidden = !open;
    if (button) button.setAttribute('aria-expanded', String(open));

    if (open && !wasOpen) {
      initialFocus().focus();
    } else if (!open && wasOpen) {
      const back = opener && opener.isConnected && opener !== document.body ? opener : button;
      opener = null;
      if (restoreFocus && back) back.focus();
    }
  }

  /* Tab stays inside the dialog: from the last control it wraps to the first. */
  function trapFocus(ev) {
    if (ev.key !== 'Tab' || !isOpen()) return;
    const items = Array.from(card.querySelectorAll(FOCUSABLE)).filter(reachable);
    if (!items.length) { ev.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || active === card || !card.contains(active))) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && (active === last || !card.contains(active))) {
      ev.preventDefault();
      first.focus();
    }
  }

  if (button) button.addEventListener('click', () => toggle());
  if (closeButton) closeButton.addEventListener('click', () => toggle(false));
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) toggle(false); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && isOpen()) toggle(false); });
  document.addEventListener('keydown', trapFocus);

  return { isOpen, toggle, open: () => toggle(true), close: (options) => toggle(false, options) };
}
