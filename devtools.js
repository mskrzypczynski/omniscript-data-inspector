chrome.devtools.panels.create(
  'OmniScript',
  '',
  'panel.html',
  function (panel) {
    /* The panel page keeps running while the user is on another DevTools tab,
     * so tell it when it is actually on screen. Without this the Data tab polls
     * the page twice a second the whole time DevTools is open. */
    var panelWindow = null;

    panel.onShown.addListener(function (win) {
      panelWindow = win;
      if (win && win.OmniPanel) win.OmniPanel.setVisible(true);
    });

    panel.onHidden.addListener(function () {
      if (panelWindow && panelWindow.OmniPanel) panelWindow.OmniPanel.setVisible(false);
    });
  }
);
