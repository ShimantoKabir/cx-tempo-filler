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

// CDP-based input dispatch — a content script can only dispatch synthetic
// DOM events (element.dispatchEvent / el.click()), which always have
// isTrusted: false. chrome.debugger gives this extension access to the
// same Input.dispatch* commands real automation tools (Puppeteer,
// WebdriverIO's Chrome driver) use under the hood, which Chrome
// synthesizes at the browser-process level — those come through as
// isTrusted: true. Only callable from here (background), not from a
// content script — chrome.debugger isn't exposed there. Confirmed via
// testing: removing this reintroduces the failure, so it's needed
// alongside the two-stage save split in hub-spoke.js, not instead of it.
const attachedTabs = new Set();

function ensureDebuggerAttached(tabId) {
  if (attachedTabs.has(tabId)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        attachedTabs.add(tabId);
        resolve();
      }
    });
  });
}

function sendDebuggerCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

// Attachment is per-tab and survives same-tab reloads/navigations on its
// own (this flow reloads several times — tenant select, module URL nav) —
// only cleared here if something else detaches it (e.g. the user manually
// closes the "is debugging this browser" banner).
chrome.debugger.onDetach.addListener(({ tabId }) => {
  attachedTabs.delete(tabId);
});

async function cdpClick(tabId, x, y) {
  await ensureDebuggerAttached(tabId);
  await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sendDebuggerCommand(tabId, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

async function cdpSetValue(tabId, x, y, value) {
  await cdpClick(tabId, x, y);

  // Select any existing value (Ctrl+A) so the inserted text replaces it
  // instead of inserting at whatever cursor position the click landed on.
  await sendDebuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  });
  await sendDebuggerCommand(tabId, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    modifiers: 2,
    windowsVirtualKeyCode: 65,
  });

  await sendDebuggerCommand(tabId, 'Input.insertText', { text: String(value) });
}

// Fetches a Google Sheet's export-as-xlsx URL — needs to run here rather
// than in popup.js, since popup.js only lives as long as the popup window
// stays open, and a network request risks being aborted if the user clicks
// away mid-fetch. Relies on the browser's existing Google session cookies
// (no separate OAuth flow) — only works if the signed-in Google account
// this browser profile is using actually has access to the sheet. Returns
// the xlsx bytes as base64 (chrome.runtime messaging round-trips plain
// JSON-safe values most reliably) for popup.js to decode and hand to
// XLSX.read.
function fetchGoogleSheetAsBase64(url) {
  return fetch(url).then((res) => {
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} — the sheet may not be shared with your Google account, or you're not signed into Google in this browser.`
      );
    }
    return res.arrayBuffer();
  }).then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
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
  } else if (msg.action === 'cdpClick') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ status: 'error', message: 'No tab id on sender.' });
      return;
    }
    const { x, y } = msg.payload;
    cdpClick(tabId, x, y)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true; // keep the message channel open for the async response
  } else if (msg.action === 'cdpSetValue') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ status: 'error', message: 'No tab id on sender.' });
      return;
    }
    const { x, y, value } = msg.payload;
    cdpSetValue(tabId, x, y, value)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true; // keep the message channel open for the async response
  } else if (msg.action === 'fetchGoogleSheet') {
    fetchGoogleSheetAsBase64(msg.payload.url)
      .then((base64) => sendResponse({ status: 'ok', base64 }))
      .catch((err) => sendResponse({ status: 'error', message: err.message }));
    return true; // keep the message channel open for the async response
  }
});
