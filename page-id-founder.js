// Content script for CX Tempo Page Filler.
// Runs the Page Selection sequence: tenant -> page type -> page ID -> submit.
// Shared helpers (sleep, waitForElement, notify, etc.) live in the Helper
// class in helper.js, loaded before this file — see manifest.json's
// content_scripts order.

class PageIdFounder {
  // All selectors used by the automation, grouped by the step that uses them.
  static SELECTORS = {
    pageSelectionLink: 'a[aria-current="page"]',
    tenantButton: 'button[placeholder="Please Select A Tenant"]',
    tenantOption: {
      desktop: 'div#dropdown-1>div>div#option-1',
      mobile: 'div#dropdown-1>div>div#option-0',
    },
    pageTypeButton: 'button[data-testid="Select-page-type"]',
    pageIdButton: 'button[data-e2eid="seconday-page-selector"]',
    pageIdInput: 'div#dropdown-4>div>input',
    submitButton: 'button[data-testid="submit-page-type"]',

    // Selectors below are specific to whichever "page type" is being filled.
    // This extension currently only automates the Brand Page flow
    // ("Content Page By Category" / "Mobile App Content Page"). A different
    // page type would need its own entries here rather than reusing these.
    brandPage: {
      pageTypeOption: {
        desktop: 'div#dropdown-3>div>div#option-67',
        mobile: 'div#dropdown-3>div>div#option-50',
      },
      pageSuggestionRow: 'div#dropdown-4>div:last-child>div:first-child',
    },
  };

  // If the page reloaded mid-automation (tenant selection destroys this
  // script's execution context), pick up at step 5 using the saved state.
  static resumeIfNeeded = async () => {
    const state = Helper.loadResumeState();
    if (state) {
      await new PageIdFounder(state).runFromPageType();
    }
  };

  constructor({ deviceType, pageId, autoSubmit }) {
    this.deviceType = deviceType;
    this.pageId = pageId;
    this.autoSubmit = autoSubmit;
  }

  run = async () => {
    try {
      Helper.log('Starting: navigating page selection...');

      // Step 2: click the current-page link to land on the page selection screen
      const pageLink = await Helper.waitForElement(PageIdFounder.SELECTORS.pageSelectionLink);
      pageLink.click();
      Helper.log('Clicked page selection link.');
      await Helper.sleep(800);

      // Step 3: open the tenant dropdown
      const tenantBtn = await Helper.waitForElement(PageIdFounder.SELECTORS.tenantButton);
      tenantBtn.click();
      Helper.log('Opened tenant dropdown.');
      await Helper.sleep(500);

      // Step 4: pick tenant option by device type
      const tenantOption = await Helper.waitForElement(
        PageIdFounder.SELECTORS.tenantOption[this.deviceType]
      );

      // Selecting the tenant triggers a full page reload, which destroys this
      // script's execution context. Persist state so the freshly-injected
      // content script can resume from step 5 once the new page loads.
      Helper.saveResumeState({ deviceType: this.deviceType, pageId: this.pageId, autoSubmit: this.autoSubmit });
      tenantOption.click();
      Helper.log('Selected tenant. Waiting for page reload...');
    } catch (err) {
      Helper.fail(err);
    }
  };

  runFromPageType = async () => {
    try {
      Helper.log('Resuming after tenant reload...');

      // Step 5: open page type selector
      const pageTypeBtn = await Helper.waitForElement(PageIdFounder.SELECTORS.pageTypeButton);
      pageTypeBtn.click();
      Helper.log('Opened page type dropdown.');
      await Helper.sleep(500);

      // Step 6: pick page type option by device type
      const pageTypeOption = await Helper.waitForElement(
        PageIdFounder.SELECTORS.brandPage.pageTypeOption[this.deviceType]
      );
      pageTypeOption.click();
      Helper.log('Selected page type.');
      await Helper.sleep(500);

      // Step 7: open the page-id dropdown/input control
      const dropdown4Btn = await Helper.waitForElement(PageIdFounder.SELECTORS.pageIdButton);
      dropdown4Btn.click();
      Helper.log('Opened page ID field.');
      await Helper.sleep(500);

      // Step 8: type the page ID
      const pageIdInput = await Helper.waitForElement(PageIdFounder.SELECTORS.pageIdInput);
      Helper.setInputValue(pageIdInput, this.pageId);
      await Helper.sleep(300);

      // Step 8b: wait for the suggestion row's text to match the typed page ID
      // (the search results are debounced, so an early match can be stale), then click it
      const discoveryPageOption = await Helper.waitForTextMatch(
        PageIdFounder.SELECTORS.brandPage.pageSuggestionRow,
        `(${this.pageId})`
      );
      console.log('Discovery page suggestion matched:', discoveryPageOption.textContent);
      discoveryPageOption.click();
      Helper.log('Selected Discovery Page.');
      await Helper.sleep(300);

      // Step 9: submit (or hand off for manual review)
      const submitBtn = await Helper.waitForElement(PageIdFounder.SELECTORS.submitButton);
      // Submitting is an in-place SPA transition, not a page reload, so the
      // module container can just be called directly in this same script
      // context once submission actually happens.
      if (this.autoSubmit) {
        submitBtn.click();
        Helper.log('Form filled and submitted automatically.');
        if (this.deviceType === 'desktop') {
          await DesktopModuleContainer.run();
        }
      } else {
        submitBtn.addEventListener(
          'click',
          async () => {
            if (this.deviceType === 'desktop') {
              await DesktopModuleContainer.run();
            }
          },
          { once: true }
        );
        submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        Helper.log('All fields filled — review and click Submit yourself.');
      }
    } catch (err) {
      Helper.fail(err);
    }
  };
}

PageIdFounder.resumeIfNeeded();
