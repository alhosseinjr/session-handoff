// background/service-worker.js
//
// Minimal background worker. Its only job right now is to register a
// right-click "send selection to Session Handoff" context menu item, which
// acts as a resilience path: if a site's DOM changes and the content-script
// adapter breaks, the user can still select text manually and send it in.
// No network calls happen here. No data is sent anywhere.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'handoff-capture-selection',
    title: 'Send selection to Session Handoff',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'handoff-capture-selection' && info.selectionText) {
    // Stash it; the popup checks for this on open and offers to use it.
    chrome.storage.local.set({ pendingSelection: info.selectionText });
  }
});
