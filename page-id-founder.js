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
    heroPov: (deviceType, brandPage, d, addGbo) => HeroPov.run(deviceType, brandPage, addGbo),
    hubSpokesNM: (deviceType, brandPage, d, addGbo) => HubSpoke.run(deviceType, brandPage, addGbo),
    povCard: (deviceType, brandPage, d, addGbo) => PovCard.run(deviceType, brandPage, addGbo),
    itemCarousel: (deviceType, brandPage, d) => ItemCarousel.run(deviceType, brandPage, d.index),
    hubSpokeCard: (deviceType, brandPage, d, addGbo) => {
      if (deviceType !== 'app') {
        throw new Error('HubSpokeCard is app-only — cannot be edited on a web run.');
      }
      return HubSpokeCard.run(deviceType, brandPage, d.index, addGbo);
    },
    skinnyBanner: (deviceType, brandPage, d, addGbo) => SkinnyBanner.run(deviceType, d.bannerType, brandPage, addGbo),
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

  // Builds the ordered list of modules the brief actually contains, sorted
  // by each module's own "order" field so creation follows the brief's
  // intent rather than a hardcoded module-type sequence. A module with no
  // "order" field sorts after every module that has one (see the warning
  // logged below) rather than silently defaulting to some guessed position.
  static buildModuleDescriptors = (brandPage) => {
    const descriptors = [];

    SkinnyBanner.detectBannerTypes(brandPage).forEach((bannerType) => {
      const moduleKey = SkinnyBanner.moduleKeyForBannerType(bannerType);
      descriptors.push({ moduleKey, kind: 'skinnyBanner', bannerType, order: brandPage[moduleKey]?.order });
    });

    if (Array.isArray(brandPage.heroPov) && brandPage.heroPov.length > 0) {
      // heroPov has no separate module-level order field — the first
      // card's order (also used to sort cards within the module) doubles
      // as the module's position, per how briefs have used it so far.
      descriptors.push({ moduleKey: 'heroPov', kind: 'heroPov', order: brandPage.heroPov[0]?.order });
    }

    if (brandPage.hubSpokesNM) {
      descriptors.push({ moduleKey: 'hubSpokesNM', kind: 'hubSpokesNM', order: brandPage.hubSpokesNM.order });
    }

    if (brandPage.povCard) {
      descriptors.push({ moduleKey: 'povCard', kind: 'povCard', order: brandPage.povCard.order });
    }

    // itemCarousel is an array where each entry is a fully separate module
    // instance (its own add/fill/save cycle), not a repeating sub-element
    // within one module (unlike heroPov's cards) — so each entry gets its
    // own descriptor, keyed by index so completion tracking and the popup
    // checklist can address them independently.
    if (Array.isArray(brandPage.itemCarousel)) {
      brandPage.itemCarousel.forEach((entry, index) => {
        descriptors.push({ moduleKey: `itemCarousel-${index}`, kind: 'itemCarousel', index, order: entry?.order });
      });
    }

    // hubSpokeCard is app-only (see scratch.txt — no web variant is
    // documented) but shares itemCarousel's "array of independent module
    // instances" shape. The popup checklist doesn't know the run's
    // deviceType, so an app-only module can still be checked for a web
    // run — runModules() skips it in that case rather than erroring.
    if (Array.isArray(brandPage.hubSpokeCard)) {
      brandPage.hubSpokeCard.forEach((entry, index) => {
        descriptors.push({ moduleKey: `hubSpokeCard-${index}`, kind: 'hubSpokeCard', index, order: entry?.order });
      });
    }

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
  // behavior. Regardless of outcome, downloads output.json annotating every
  // module found in the brief with whether it actually got completed.
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

    const completion = {};
    allDescriptors.forEach((d) => {
      completion[d.moduleKey] = false;
    });

    try {
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
        } else {
          await ModuleFinder.run(this.deviceType, 'SkinnyBanner');
        }

        completion[d.moduleKey] = await PageIdFounder.FILL_BY_KIND[d.kind](this.deviceType, brandPage, d, addGbo);
      }
    } finally {
      this.downloadOutputJson(completion);
    }
  };

  // Writes isCompletedForWeb/isCompletedForApp onto each module the brief
  // contained (based on the completion map built in runModules) and
  // downloads the result as output.json, so a failed/partial run is
  // downloadable too. Only the field matching this run's device type is
  // updated — the other device's field (e.g. from a prior run whose
  // output.json was re-uploaded as this run's brief) is preserved as-is,
  // defaulting to false the first time a module is seen.
  downloadOutputJson = (completion) => {
    const output = JSON.parse(JSON.stringify(this.briefData));
    const completedKey = this.deviceType === 'web' ? 'isCompletedForWeb' : 'isCompletedForApp';
    const brandPage = output.brandPage;

    for (const [moduleKey, isCompleted] of Object.entries(completion)) {
      if (!brandPage) continue;

      if (moduleKey === 'heroPov') {
        // heroPov is an array, but each card in it is a plain object, so
        // (unlike setting a property on the array itself, which
        // JSON.stringify would silently drop) writing isCompletedForWeb/App
        // onto every card serializes fine. Save is one action for the whole
        // module, so every card gets the same outcome.
        if (Array.isArray(brandPage.heroPov)) {
          brandPage.heroPov.forEach((card) => {
            if (typeof card.isCompletedForWeb !== 'boolean') card.isCompletedForWeb = false;
            if (typeof card.isCompletedForApp !== 'boolean') card.isCompletedForApp = false;
            card[completedKey] = isCompleted;
          });
        }
        continue;
      }

      if (moduleKey.startsWith('itemCarousel-')) {
        // Unlike heroPov, each itemCarousel array entry is an independent
        // module instance — only the one this run actually processed
        // (identified by index) gets its completion flag updated.
        const index = Number(moduleKey.slice('itemCarousel-'.length));
        const entry = Array.isArray(brandPage.itemCarousel) ? brandPage.itemCarousel[index] : null;
        if (!entry) continue;
        if (typeof entry.isCompletedForWeb !== 'boolean') entry.isCompletedForWeb = false;
        if (typeof entry.isCompletedForApp !== 'boolean') entry.isCompletedForApp = false;
        entry[completedKey] = isCompleted;
        continue;
      }

      if (moduleKey.startsWith('hubSpokeCard-')) {
        // Same independent-instance handling as itemCarousel-. isCompleted
        // stays false here on a web run too, since runModules() skips
        // this app-only module entirely rather than attempting it.
        const index = Number(moduleKey.slice('hubSpokeCard-'.length));
        const entry = Array.isArray(brandPage.hubSpokeCard) ? brandPage.hubSpokeCard[index] : null;
        if (!entry) continue;
        if (typeof entry.isCompletedForWeb !== 'boolean') entry.isCompletedForWeb = false;
        if (typeof entry.isCompletedForApp !== 'boolean') entry.isCompletedForApp = false;
        entry[completedKey] = isCompleted;
        continue;
      }

      const module = brandPage[moduleKey];
      if (!module) continue;
      if (typeof module.isCompletedForWeb !== 'boolean') module.isCompletedForWeb = false;
      if (typeof module.isCompletedForApp !== 'boolean') module.isCompletedForApp = false;
      module[completedKey] = isCompleted;
    }

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    Helper.log('Downloaded output.json with module completion status.');
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
