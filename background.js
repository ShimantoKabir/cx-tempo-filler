const TARGET_URL = 'https://v2.tempo.cxtools.walmart.com/module/aad6ee6a-eb1d-4759-ac71-bba810733ad2';

function runOnceLoaded(tabId, payload) {
  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId === tabId && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      // Give the single-page app a moment to render its own UI
      // after the browser reports the navigation as "complete".
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, { action: 'runAutomation', payload });
      }, 1500);
    }
  };
  chrome.tabs.onUpdated.addListener(listener);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startAutomation') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
      if (activeTab && activeTab.url && activeTab.url.startsWith(TARGET_URL)) {
        runOnceLoaded(activeTab.id, msg.payload);
        chrome.tabs.reload(activeTab.id);
      } else {
        chrome.tabs.create({ url: TARGET_URL }, (tab) => {
          runOnceLoaded(tab.id, msg.payload);
        });
      }
    });
    sendResponse({ status: 'ok' });
  }
});
