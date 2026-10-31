'use strict';

/* Chrome no longer draws a panel's icon in the DevTools tab strip, so the
 * title carries a small mark echoing the extension icon's braces. The icon
 * path is still given for any DevTools that does show one. */
chrome.devtools.panels.create(
  '{=} OmniScript',
  'icons/icon16.png',
  'panel.html',
  (panel) => {
    /* The panel page keeps running while the user is on another DevTools tab,
     * so tell it when it is actually on screen. Without this the Data tab polls
     * the page twice a second the whole time DevTools is open. */
    let panelWindow = null;

    panel.onShown.addListener((win) => {
      panelWindow = win;
      if (win && win.OmniPanel) win.OmniPanel.setVisible(true);
    });

    panel.onHidden.addListener(() => {
      if (panelWindow && panelWindow.OmniPanel) panelWindow.OmniPanel.setVisible(false);
    });
  }
);
