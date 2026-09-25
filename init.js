// Entry point for the CX Tempo Page Filler content script.
// Listens for the popup's "runAutomation" message and kicks off the fill
// sequence. Loaded after page-id-founder.js so PageIdFounder is defined
// (see manifest.json's content_scripts order).

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'runAutomation') {
    new PageIdFounder(msg.payload).run();
    sendResponse({ status: 'started' });
  }
});
