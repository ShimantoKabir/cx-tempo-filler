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
      web: 'div#dropdown-1>div>div#option-1',
      app: 'div#dropdown-1>div>div#option-0',
    },
    pageTypeButton: 'button[data-testid="Select-page-type"]',
    pageIdButton: 'button[data-e2eid="seconday-page-selector"]',
    pageIdInput: 'div#dropdown-4>div>input',
    go: 'button[data-testid="submit-page-type"]',

    // Selectors below are specific to whichever "page type" is being filled.
    // This extension currently only automates the Brand Page flow
    // ("Content Page By Category" / "Mobile App Content Page"). A different
    // page type would need its own entries here rather than reusing these.
    brandPage: {
      pageTypeOption: {
        web: 'div#dropdown-3>div>div#option-68',
        app: 'div#dropdown-3>div>div#option-52',
      },
      pageSuggestionRow: 'div#dropdown-4>div:last-child>div:first-child',
    },
  };

  // Maps a descriptor's "kind" to the function that fills that module's
  // content (ModuleFinder is deliberately not called here — this is only the
  // "fill" half). Shared by runModules (which calls ModuleFinder.run first,
  // to search/add a brand-new module) and ModuleEditor (which skips
  // ModuleFinder entirely since it's editing a module that already exists
  // at a known URL).
  static FILL_BY_KIND = {
    heroPov: (deviceType, brandPage, d, addGbo) => HeroPov.run(deviceType, brandPage, d.index, addGbo),
    hubSpokesNM: (deviceType, brandPage, d, addGbo) => HubSpoke.run(deviceType, brandPage, d.index, addGbo),
    povCard: (deviceType, brandPage, d, addGbo) => PovCard.run(deviceType, brandPage, d.index, addGbo),
    itemCarousel: (deviceType, brandPage, d) => ItemCarousel.run(deviceType, brandPage, d.index),
    hubSpokeCard: (deviceType, brandPage, d, addGbo) => {
      if (deviceType !== 'app') {
        throw new Error('HubSpokeCard is app-only — cannot be edited on a web run.');
      }
      return HubSpokeCard.run(deviceType, brandPage, d.index, addGbo);
    },
    skinnyBanner: (deviceType, brandPage, d, addGbo) =>
      SkinnyBanner.run(deviceType, d.bannerType, brandPage, d.index, addGbo),
    youtube: (deviceType, brandPage, d) => {
      if (deviceType !== 'web') {
        throw new Error('Youtube is web-only — cannot be edited on an app run.');
      }
      return Youtube.run(deviceType, brandPage, d.index);
    },
    recipe: (deviceType, brandPage, d) => {
      if (deviceType !== 'web') {
        throw new Error('Recipe is web-only — cannot be edited on an app run.');
      }
      return Recipe.run(deviceType, brandPage, d.index);
    },
  };

  constructor({ deviceType, pageId, autoSubmit, gboModules, briefData, selectedModules }) {
    this.deviceType = deviceType;
    this.pageId = pageId;
    this.autoSubmit = autoSubmit;
    // Array of moduleKeys the user opted to add gbo=1 to — a per-module
    // decision, since different modules' app links may need different
    // in-app-vs-external behavior.
    this.gboModules = gboModules;
    this.briefData = briefData;
    this.selectedModules = selectedModules;
  }

  // Every module key in the brief is an array of independent module
  // instances (its own add/fill/save cycle) — even one that's conceptually
  // "just one module" is a single-entry array, same shape as
  // itemCarousel/hubSpokeCard already used. Each entry gets its own
  // descriptor, keyed by index so completion tracking and the popup
  // checklist can address instances independently.
  static pushArrayDescriptors = (descriptors, brandPage, key, kind, extraFor = () => ({})) => {
    const list = brandPage[key];
    if (!Array.isArray(list)) return;
    list.forEach((entry, index) => {
      descriptors.push({ moduleKey: `${key}-${index}`, kind, index, order: entry?.order, ...extraFor(entry, index) });
    });
  };

  // Builds the ordered list of modules the brief actually contains, sorted
  // by each module's own "order" field so creation follows the brief's
  // intent rather than a hardcoded module-type sequence. A module with no
  // "order" field sorts after every module that has one (see the warning
  // logged below) rather than silently defaulting to some guessed position.
  static buildModuleDescriptors = (brandPage) => {
    const descriptors = [];
    const push = (key, kind, extraFor) => PageIdFounder.pushArrayDescriptors(descriptors, brandPage, key, kind, extraFor);

    push('imageAndTextSkinnyBanner', 'skinnyBanner', () => ({ bannerType: 'image-and-text' }));
    push('textOnlySkinnyBanner', 'skinnyBanner', () => ({ bannerType: 'text-only' }));
    push('heroPov', 'heroPov');
    push('hubSpokesNM', 'hubSpokesNM');
    push('povCard', 'povCard');
    push('itemCarousel', 'itemCarousel');
    // hubSpokeCard/youtube/recipe are device-restricted (app-only /
    // web-only per scratch.txt) — the popup checklist doesn't know the
    // run's deviceType, so a restricted module can still be checked for
    // the wrong device; runModules() skips it in that case rather than
    // erroring.
    push('hubSpokeCard', 'hubSpokeCard');
    push('youtube', 'youtube');
    push('recipe', 'recipe');

    descriptors.forEach((d) => {
      if (typeof d.order !== 'number') {
        console.warn(`[PageIdFounder] Module "${d.moduleKey}" has no "order" field — it will run last.`);
      }
    });

    // Modules with no order (undefined) sort after every ordered module,
    // rather than being treated as 0 and jumping to the front.
    descriptors.sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Infinity;
      const orderB = typeof b.order === 'number' ? b.order : Infinity;
      return orderA - orderB;
    });

    return descriptors;
  };

  // Adds and fills one module per entry found in the brief AND checked by
  // the user in the popup. With no brief uploaded — or nothing selected —
  // falls back to adding a single blank module, matching the pre-brief
  // behavior. Completion is tracked in chrome.storage now (see
  // Helper.saveModuleRecord, called from inside each module's own run()
  // right after a successful save) rather than by downloading an
  // output.json to re-upload as the next run's brief.
  runModules = async () => {
    const brandPage = this.briefData && this.briefData.brandPage;
    if (!brandPage) {
      Helper.log('No brief JSON supplied — adding a blank module.');
      await ModuleFinder.run(this.deviceType, 'SkinnyBanner');
      return;
    }

    const allDescriptors = PageIdFounder.buildModuleDescriptors(brandPage);
    const descriptors = this.selectedModules
      ? allDescriptors.filter((d) => this.selectedModules.includes(d.moduleKey))
      : allDescriptors;

    if (descriptors.length === 0) {
      Helper.log('No modules selected — adding a blank module.');
      await ModuleFinder.run(this.deviceType, 'SkinnyBanner');
      return;
    }

    for (const d of descriptors) {
      // Each module's run() blocks until the user clicks either Save or
      // Discard Changes, and returns true only for Save — Discard still
      // navigates back to continue the loop, but must NOT mark the
      // module as completed.
      const addGbo = this.gboModules?.includes(d.moduleKey) ?? false;

      // App-only — skip rather than error if somehow selected on a web
      // run (the popup checklist doesn't filter by deviceType).
      if (d.kind === 'hubSpokeCard' && this.deviceType !== 'app') {
        Helper.log(`Hub Spoke Card is app-only — skipping "${d.moduleKey}" on web.`);
        continue;
      }

      // Web-only — skip rather than error if somehow selected on an app
      // run, same handling as hubSpokeCard's app-only skip above.
      if ((d.kind === 'youtube' || d.kind === 'recipe') && this.deviceType !== 'web') {
        Helper.log(`"${d.moduleKey}" is web-only — skipping on app.`);
        continue;
      }

      if (d.kind === 'heroPov') {
        await ModuleFinder.run(this.deviceType, 'HeroPov');
      } else if (d.kind === 'hubSpokesNM') {
        await ModuleFinder.run(this.deviceType, 'HubSpokesNxM', 'hubSpokes');
      } else if (d.kind === 'povCard') {
        const moduleKey = this.deviceType === 'web' ? 'POVCards' : 'POVCarousel';
        await ModuleFinder.run(this.deviceType, moduleKey, 'POVCar');
      } else if (d.kind === 'itemCarousel') {
        // "ItemCarousel" auto-derives to "item carousel", already
        // matching scratch.txt's given search text — no override needed.
        await ModuleFinder.run(this.deviceType, 'ItemCarousel');
      } else if (d.kind === 'hubSpokeCard') {
        // Module find key is "Hubspoke" (exact case per scratch.txt);
        // the auto-derived search query would be close enough, but the
        // given search text "HubSpoke" is passed explicitly to be safe.
        await ModuleFinder.run(this.deviceType, 'Hubspoke', 'HubSpoke');
      } else if (d.kind === 'youtube' || d.kind === 'recipe') {
        // Both are a generic "Custom HTML" module, not their own CMS
        // module kind — Youtube.run/Recipe.run build the whole markup
        // themselves (see scratch.txt).
        await ModuleFinder.run(this.deviceType, 'CustomHtml', 'Custom HTML');
      } else {
        await ModuleFinder.run(this.deviceType, 'SkinnyBanner');
      }

      await PageIdFounder.FILL_BY_KIND[d.kind](this.deviceType, brandPage, d, addGbo);
    }
  };

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
      Helper.saveResumeState({
        deviceType: this.deviceType,
        pageId: this.pageId,
        autoSubmit: this.autoSubmit,
        gboModules: this.gboModules,
        briefData: this.briefData,
        selectedModules: this.selectedModules,
      });
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
      await Helper.setInputValue(pageIdInput, this.pageId);
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
      const goBtn = await Helper.waitForElement(PageIdFounder.SELECTORS.go);
      // Submitting is an in-place SPA transition, not a page reload, so the
      // module container can just be called directly in this same script
      // context once submission actually happens.
      if (this.autoSubmit) {
        goBtn.click();
        Helper.log('Form filled and submitted automatically.');
        await this.runModules();
      } else {
        goBtn.addEventListener(
          'click',
          async () => {
            await this.runModules();
          },
          { once: true }
        );
        goBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        Helper.log('All fields filled — review and click Submit yourself.');
      }
    } catch (err) {
      Helper.fail(err);
    }
  };
}
