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
      if (existing) {
        console.log('[Helper] interacting with selector:', selector, existing);
        return resolve(existing);
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          console.log('[Helper] interacting with selector:', selector, el);
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

  static waitForElementGone = (selector, timeout = 10000) => {
    console.log('[Helper] waiting for selector to disappear:', selector);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);
      if (!existing) return resolve();

      const observer = new MutationObserver(() => {
        if (!document.querySelector(selector)) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timed out waiting for element to disappear: ' + selector));
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
          console.log('[Helper] interacting with selector:', selector, el);
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
  static waitForElementByText = (selector, text, exact = true, timeout = 10000, caseInsensitive = false) => {
    console.log('[Helper] waiting for selector:', selector, 'with text:', text, 'exact:', exact);
    return new Promise((resolve, reject) => {
      let interval;
      let timer;
      const check = () => {
        const candidates = document.querySelectorAll(selector);
        for (const el of candidates) {
          console.log('[Helper] candidate innerHTML:', el.innerHTML);
          // Coerce to string defensively — el.innerHTML is always a string,
          // so a caller passing a raw number (e.g. a column count) would
          // otherwise never match under strict ===.
          const textStr = String(text);
          const html = exact ? el.innerHTML.trim() : el.innerHTML;
          // caseInsensitive defaults off so every existing caller keeps its
          // current (case-sensitive) behavior — only opt in where a
          // button's actual casing ("Edit" vs "EDIT") isn't known for sure.
          const a = caseInsensitive ? html.toLowerCase() : html;
          const b = caseInsensitive ? textStr.toLowerCase() : textStr;
          const matches = exact ? a === b : a.includes(b);
          if (matches) {
            console.log('[Helper] interacting with selector:', selector, el);
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

  // Per scratch.txt: never auto-click Save — hand off for review, and block
  // here until the user actually clicks Save or Discard Changes, so a
  // brief with more modules doesn't try to add the next one while this one
  // is still open. Discard sits right next to Save (same button shape,
  // distinguished only by its text) in every module — this is shared by
  // skinny-banner.js/hero-pov.js/hub-spoke.js/pov-card.js/item-carousel.js.
  // Returns true if Save was clicked, false if Discard Changes was clicked
  // — the caller uses this to decide whether to mark the module completed.
  // navigateBack defaults true (every Create-mode module's final save needs
  // to return to the module-zone list to find the next module) — Edit mode
  // passes false, since there's no next module to find and nothing to go
  // back to.
  static waitForSaveOrDiscard = async (saveButtonSel, discardButtonSel, navigateBack = true) => {
    const saveBtn = await Helper.waitForElementByText(saveButtonSel.selector, saveButtonSel.text, saveButtonSel.exact);
    const discardBtn = await Helper.waitForElementByText(
      discardButtonSel.selector,
      discardButtonSel.text,
      discardButtonSel.exact
    );
    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const saved = await new Promise((resolve) => {
      saveBtn.addEventListener('click', () => resolve(true), { once: true });
      discardBtn.addEventListener('click', () => resolve(false), { once: true });
    });

    if (!navigateBack) {
      Helper.log(saved ? 'Save clicked.' : 'Discard Changes clicked.');
      return saved;
    }

    Helper.log(
      saved
        ? 'Save clicked — going back to find the next module.'
        : 'Discard Changes clicked — going back without marking this module completed.'
    );
    window.history.back();
    await Helper.sleep(1000);
    return saved;
  };

  // App links can need a "gbo=1" param appended — as a new query param if
  // the URL has none yet, otherwise chained on with "&" — to force opening
  // externally instead of staying in-app. Off by default per module (see
  // popup's per-module checkbox); callers only invoke this when the user
  // opted in for that specific module's app links.
  static appendGboParam = (url) => {
    if (!url) return '';
    if (/[?&]gbo=1(&|$)/.test(url)) return url;
    return url.includes('?') ? `${url}&gbo=1` : `${url}?gbo=1`;
  };

  // Falls back to a generated alt copy (Brand + Device + Language + Module
  // Type) when a brief leaves an image's altCopy field blank. Shared by
  // skinny-banner.js and hero-pov.js.
  static generateAltCopy = ({ brandName, deviceType, language, moduleType }) => {
    const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const moduleLabel = moduleType.split('-').map(titleCase).join(' ');
    return `${brandName} ${titleCase(deviceType)} ${titleCase(language)} ${moduleLabel}`;
  };

  // Polls el.getBoundingClientRect() until two consecutive reads match
  // (handles an element still mid-animation/transition when clicked too
  // early — e.g. a popup sliding/fading into its final position), or gives
  // up after timeout and returns the last reading anyway.
  static waitForStableRect = async (el, { interval = 100, timeout = 2000 } = {}) => {
    const start = Date.now();
    let last = el.getBoundingClientRect();
    while (Date.now() - start < timeout) {
      await Helper.sleep(interval);
      const next = el.getBoundingClientRect();
      if (next.x === last.x && next.y === last.y && next.width === last.width && next.height === last.height) {
        return next;
      }
      last = next;
    }
    console.warn('[Helper] waitForStableRect timed out — using last reading:', last);
    return last;
  };

  // Scrolls the element into view, waits for its on-screen position to
  // stabilize, and asks background.js (the only context with
  // chrome.debugger access) to click there via CDP. Returns false (never
  // throws) on any failure so the caller can fall back cleanly.
  static clickViaCDP = async (el) => {
    try {
      el.scrollIntoView({ block: 'center' });
      await Helper.sleep(150);
      const rect = await Helper.waitForStableRect(el);
      if (rect.width === 0 && rect.height === 0) return false;

      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      console.log('[Helper] CDP click at', x, y, 'on element:', el);

      const resp = await chrome.runtime.sendMessage({ action: 'cdpClick', payload: { x, y } });
      if (resp?.status === 'ok') return true;
      console.warn('[Helper] CDP click responded with an error:', resp?.message);
      return false;
    } catch (err) {
      console.warn('[Helper] CDP click threw:', err);
      return false;
    }
  };

  // Real trusted click via CDP first, falling back to a plain el.click()
  // if CDP isn't available/fails. Confirmed necessary (not just
  // defensive): removing CDP reintroduced the failure, alongside the
  // two-stage save split in hub-spoke.js.
  static clickTrusted = async (el) => {
    const ok = await Helper.clickViaCDP(el);
    if (!ok) el.click();
  };

  // Deliberately no el.blur() here by default: this helper is also used for
  // the image-search inputs (type -> click search button -> click result),
  // and blurring right after typing risks closing that search popover
  // before the next click can happen — so blurAfter defaults false and is
  // only passed true at call sites where that risk doesn't apply (plain
  // text fields, not the image search input).
  //
  // Routes through chrome.debugger (CDP) first — element.dispatchEvent can
  // only ever produce isTrusted: false events. CDP's Input.dispatch*
  // commands are synthesized by Chrome itself (same mechanism Puppeteer/
  // WebdriverIO use), so they come through as isTrusted: true. Falls back
  // to the native-setter approach if the CDP round-trip fails for any
  // reason (e.g. real DevTools already attached to this tab, which blocks
  // chrome.debugger from attaching too).
  static setInputValue = async (el, value, blurAfter = false) => {
    console.log('[Helper] setting value:', value, 'on element:', el, 'tagName:', el.tagName);

    const cdpSucceeded = await Helper.setInputValueViaCDP(el, value);
    if (cdpSucceeded) {
      if (blurAfter) el.blur();
      return;
    }

    console.warn('[Helper] CDP setValue unavailable/failed — falling back to native-setter approach.');

    // Some inline-editable fields (seen in Edit mode, after the Edit-button
    // unlock) only swap into a real editable control on an actual click —
    // a programmatic .focus() alone doesn't trigger that. Dispatching a
    // realistic mousedown/mouseup/click sequence first mimics a genuine
    // user click.
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    el.focus();

    // The native-setter trick only applies to real <input>/<textarea>
    // elements. A field that's actually a contenteditable div (e.g. a
    // Quill rich-text editor — confirmed loaded on this page) isn't one,
    // and calling HTMLInputElement's native setter on it would throw
    // "Illegal invocation". Fall back to a plain assignment for anything
    // else rather than crash — it won't fix a contenteditable field, but
    // it surfaces as "value didn't take" instead of a hard error.
    const isTextarea = el instanceof HTMLTextAreaElement;
    const isInput = el instanceof HTMLInputElement;
    if (!isTextarea && !isInput) {
      console.warn('[Helper] setInputValue target is not an <input>/<textarea> — native setter skipped:', el);
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (blurAfter) el.blur();
      return;
    }

    const proto = isTextarea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (blurAfter) el.blur();
  };

  // Scrolls the element into view, waits for its on-screen position to
  // stabilize, and asks background.js to click there and type via CDP.
  // Returns false (never throws) on any failure so the caller can fall
  // back cleanly.
  static setInputValueViaCDP = async (el, value) => {
    try {
      el.scrollIntoView({ block: 'center' });
      await Helper.sleep(150);
      const rect = await Helper.waitForStableRect(el);
      if (rect.width === 0 && rect.height === 0) return false;

      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      console.log('[Helper] CDP setValue at', x, y, 'on element:', el);

      const resp = await chrome.runtime.sendMessage({
        action: 'cdpSetValue',
        payload: { x, y, value },
      });
      if (resp?.status === 'ok') return true;
      console.warn('[Helper] CDP setValue responded with an error:', resp?.message);
      return false;
    } catch (err) {
      console.warn('[Helper] CDP setValue threw:', err);
      return false;
    }
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
