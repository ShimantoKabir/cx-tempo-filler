// Shared helpers for the CX Tempo Page Filler content script.
// Loaded before page-id-founder.js (see manifest.json) so the Helper class below is
// available as a plain global in the same content script scope.

class Helper {
  static RESUME_KEY = 'cxtfResume';

  static sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  static waitForElement = (selector, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      console.log("elemnt exxist: ", existing, existing && existing.textContent)
      if (existing) return resolve(existing);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          console.log("elemnt found: ", el, el.textContent)
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timed out waiting for: ' + selector));
      }, timeout);
    });
  };

  static waitForTextMatch = (selector, text, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      let interval;
      let timer;
      const check = () => {
        const el = document.querySelector(selector);
        if (el && el.textContent.includes(text)) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve(el);
        }
      };
      interval = setInterval(check, 200);
      check();
      timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Timed out waiting for text "' + text + '" in: ' + selector));
      }, timeout);
    });
  };

  // Unlike waitForTextMatch (single element, substring match), this scans
  // every element matching the selector and returns the one whose trimmed
  // text content exactly equals `text` — needed when a selector matches
  // many elements (e.g. a list of search results) and only one is wanted.
  static waitForElementByText = (selector, text, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      let interval;
      let timer;
      const check = () => {
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
          if (el.textContent.trim() === text) {
            clearInterval(interval);
            clearTimeout(timer);
            resolve(el);
            return;
          }
        }
      };
      interval = setInterval(check, 200);
      check();
      timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for "${selector}" with text "${text}"`));
      }, timeout);
    });
  };

  static setInputValue = (el, value) => {
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  static notify = (message, isError = false) => {
    let el = document.getElementById('cxtf-notify');
    let textEl;
    if (!el) {
      el = document.createElement('div');
      el.id = 'cxtf-notify';
      el.style.position = 'fixed';
      el.style.top = '12px';
      el.style.left = '12px';
      el.style.zIndex = '999999';
      el.style.padding = '10px 16px';
      el.style.borderRadius = '6px';
      el.style.fontFamily = 'sans-serif';
      el.style.fontSize = '13px';
      el.style.color = '#fff';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.gap = '10px';

      textEl = document.createElement('span');
      el.appendChild(textEl);

      const closeBtn = document.createElement('span');
      closeBtn.textContent = '✕';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.style.lineHeight = '1';
      closeBtn.onclick = () => {
        clearTimeout(el._cxtfTimer);
        el.remove();
      };
      el.appendChild(closeBtn);

      document.body.appendChild(el);
    } else {
      textEl = el.firstChild;
    }
    el.style.background = isError ? '#d32f2f' : '#2e7d32';
    textEl.textContent = message;
    clearTimeout(el._cxtfTimer);
    el._cxtfTimer = setTimeout(() => el.remove(), 7000);
  };

  static saveResumeState = (state) => {
    sessionStorage.setItem(Helper.RESUME_KEY, JSON.stringify(state));
  };

  static loadResumeState = () => {
    const raw = sessionStorage.getItem(Helper.RESUME_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(Helper.RESUME_KEY);
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  static log = (message) => {
    Helper.notify(message);
    console.log(message);
  };

  static fail = (err) => {
    Helper.notify('Automation stopped: ' + err.message, true);
    console.log('Automation stopped: ' + err.message);
    console.error('[CX Tempo Filler]', err);
  };
}
