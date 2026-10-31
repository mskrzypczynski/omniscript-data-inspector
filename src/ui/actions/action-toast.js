'use strict';

/* A toast with one button: a question that expires ("Send X again as it
 * was?" with Send) or a way out of a message ("Listed, hidden by Failed only"
 * with Show all). One at a time; it goes when the button is pressed, after
 * `ms`, or when another one replaces it. The plain toast (src/ui/toast.js)
 * cannot be clicked, so this one is the Calls tab's own. */

let node = null;
let timer = null;

export function closeActionToast() {
  clearTimeout(timer);
  timer = null;
  if (node) node.remove();
  node = null;
}

/* text: the sentence. label, title: the button. onPress runs once. */
export function actionToast(text, label, title, onPress, { ms = 8000 } = {}) {
  closeActionToast();
  // A plain toast shares the corner; the question must not hide behind it.
  document.querySelectorAll('.toast:not(.toast-action)').forEach((other) => other.remove());
  node = document.createElement('div');
  node.className = 'toast toast-action';
  node.setAttribute('role', 'status');
  const words = document.createElement('span');
  words.textContent = text;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-btn tiny toast-button';
  button.textContent = label;
  button.title = title;
  button.addEventListener('click', () => {
    closeActionToast();
    onPress();
  });
  node.append(words, button);
  document.body.appendChild(node);
  timer = setTimeout(closeActionToast, ms);
}
