const TARGET_URL = 'https://v2.tempo.cxtools.walmart.com/module/aad6ee6a-eb1d-4759-ac71-bba810733ad2';

function runOnceLoaded(tabId, messageAction, payload) {
  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId === tabId && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      // Give the single-page app a moment to render its own UI
      // after the browser reports the navigation as "complete".
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: messageAction, payload });
      }, 1500);
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

// Reuses the active tab (reloading it) if it's already on the target URL,
// otherwise opens a new tab there — shared by both the create flow
// (TARGET_URL is a fixed scratch module, just a landing page to reach Page
// Selection from) and the edit flow (url is whatever module the user wants
// to edit).
function openAndRun(url, messageAction, payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    if (activeTab && activeTab.url && activeTab.url.startsWith(url)) {
      runOnceLoaded(activeTab.id, messageAction, payload);
      chrome.tabs.reload(activeTab.id);
    } else {
      chrome.tabs.create({ url }, (tab) => {
        runOnceLoaded(tab.id, messageAction, payload);
      });
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startAutomation') {
    openAndRun(TARGET_URL, 'runAutomation', msg.payload);
    sendResponse({ status: 'ok' });
  } else if (msg.action === 'startEditAutomation') {
    // Tenant selection happens on this same fixed landing page first (see
    // module-editor.js) — the module's own edit URL (msg.payload.editUrl)
    // is only navigated to afterwards, by the content script itself.
    openAndRun(TARGET_URL, 'runEditAutomation', msg.payload);
    sendResponse({ status: 'ok' });
  }
});
