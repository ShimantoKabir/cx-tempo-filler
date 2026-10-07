// Content script for the "Edit Module" flow — handles a brief that targets
// one already-existing module directly by URL, instead of creating a new
// one through Page Selection + ModuleFinder (see manifest.json's
// content_scripts order — must load after page-id-founder.js and
// module-finder.js, since it reuses their selectors/dispatch table, and
// before init.js, which wires it to the popup's message and to resume
// dispatch after each reload below).
//
// Three stages, each a same-origin navigation that destroys this script's
// execution context — so each one saves resume state right before
// navigating, same pattern PageIdFounder's tenant step already uses, and
// init.js reads it back on the next load to pick the right stage to resume:
//   1. run()            — background.js opened the same fixed landing
//                          module the create flow uses. Select the tenant
//                          here (tenant dropdown is part of the persistent
//                          top nav, present on every page) — this triggers
//                          a full reload.
//   2. runAfterTenant()  — resumed after that reload, tenant now active.
//                          Navigate to the actual module's edit URL next.
//   3. runOnModulePage() — resumed on the module's own edit page. Click the
//                          Content tab and fill exactly the one module the
//                          popup's single-select checklist specified.

class ModuleEditor {
  static SELECTORS = {
    // Opening an existing module by URL lands it in a locked/preview state
    // — this unlocks the Content tab's fields for editing. Scoped broadly
    // (button[type="button"] span, same genericity tradeoff as
    // ModuleFinder's selectModuleButton) since no more specific attribute
    // is documented for it yet.
    editButton: 'button[type="button"] span',
    // Per scratch.txt: these generic (module-name/heading) fields need to
    // be cleared before the module's own fill function sets its real
    // values — a non-empty-to-non-empty value jump doesn't always stick,
    // same class of issue as the setInputValue investigation earlier.
    // Not every module kind has heading/fr_heading (e.g. Hub Spoke Card
    // uses title/fr_title instead), so clearing these is best-effort.
    genericFields: {
      moduleName: 'input[id="../name"]',
      headingEn: 'input[data-e2eid="heading"]',
      headingFr: 'input[data-e2eid="fr_heading"]',
    },
  };

  static clickEditButton = async () => {
    const span = await Helper.waitForElementByText(ModuleEditor.SELECTORS.editButton, 'edit', false, 10000, true);
    const btn = span.closest('button') || span;
    btn.click();
    Helper.log('Clicked Edit.');
    await Helper.sleep(500);
  };

  // Best-effort variant for the two-stage (non-image fields -> save ->
  // image+alt fields) fill pattern every module now uses. Edit mode always
  // has this lock to re-open after an intermediate save; a freshly-added
  // Create-mode module was never locked in the first place, so this button
  // may simply not exist there — a short timeout here just means "nothing
  // to unlock," not a real failure, so the caller can keep going either way.
  static clickEditButtonIfPresent = async () => {
    try {
      const span = await Helper.waitForElementByText(ModuleEditor.SELECTORS.editButton, 'edit', false, 2000, true);
      const btn = span.closest('button') || span;
      btn.click();
      Helper.log('Clicked Edit.');
      await Helper.sleep(500);
    } catch {
      // No lock to re-open (e.g. Create mode) — nothing to do.
    }
  };

  static clearGenericFields = async () => {
    for (const selector of Object.values(ModuleEditor.SELECTORS.genericFields)) {
      try {
        const el = await Helper.waitForElement(selector, 2000);
        await Helper.setInputValue(el, '');
      } catch {
        // Field doesn't exist for this module kind — skip it.
      }
    }
    Helper.log('Cleared module name/heading fields.');
  };

  constructor({ deviceType, briefData, moduleKey, addGbo, editUrl }) {
    this.deviceType = deviceType;
    this.briefData = briefData;
    this.moduleKey = moduleKey;
    this.addGbo = addGbo;
    this.editUrl = editUrl;
  }

  run = async () => {
    try {
      Helper.log('Editing module — selecting tenant...');

      const tenantBtn = await Helper.waitForElement(PageIdFounder.SELECTORS.tenantButton);
      tenantBtn.click();
      Helper.log('Opened tenant dropdown.');
      await Helper.sleep(500);

      const tenantOption = await Helper.waitForElement(PageIdFounder.SELECTORS.tenantOption[this.deviceType]);

      Helper.saveResumeState({
        mode: 'edit',
        stage: 'afterTenant',
        deviceType: this.deviceType,
        briefData: this.briefData,
        moduleKey: this.moduleKey,
        addGbo: this.addGbo,
        editUrl: this.editUrl,
      });
      tenantOption.click();
      Helper.log('Selected tenant. Waiting for page reload...');
    } catch (err) {
      Helper.fail(err);
    }
  };

  runAfterTenant = async () => {
    try {
      Helper.log('Tenant selected — opening module URL...');

      // Another same-origin navigation, so save state again before it
      // destroys this script's context same as the tenant reload just did.
      Helper.saveResumeState({
        mode: 'edit',
        stage: 'onModulePage',
        deviceType: this.deviceType,
        briefData: this.briefData,
        moduleKey: this.moduleKey,
        addGbo: this.addGbo,
      });
      window.location.href = this.editUrl;
    } catch (err) {
      Helper.fail(err);
    }
  };

  runOnModulePage = async () => {
    try {
      Helper.log('Resuming on module page...');

      const contentTab = await Helper.waitForElement(ModuleFinder.SELECTORS.contentTab);
      contentTab.click();
      Helper.log('Opened Content tab.');
      await Helper.sleep(500);

      await ModuleEditor.clickEditButton();
      await ModuleEditor.clearGenericFields();

      const brandPage = this.briefData && this.briefData.brandPage;
      if (!brandPage) throw new Error('Edit mode requires a brief JSON with module data.');

      const descriptor = PageIdFounder.buildModuleDescriptors(brandPage).find(
        (d) => d.moduleKey === this.moduleKey
      );
      if (!descriptor) throw new Error(`Module "${this.moduleKey}" not found in brief.`);

      // Edit mode only supports Hub Spokes NxM, Hub Spoke Card, Hero POV,
      // YouTube, Recipe, Skinny Banner, POV Card, Item Carousel, Inspiration
      // Module, and Accordion so far — other kinds haven't had a "clear
      // existing content before refill" step built yet, and
      // without one their fill functions would leave stale rows/cards from
      // the module's current content mixed in with the brief's new one.
      // YouTube/Recipe don't need that step at all — they're a single
      // markup textarea that gets fully overwritten, not repeatable
      // rows/cards.
      // Hub Spokes NxM/Hub Spoke Card/Hero POV are called directly (not via
      // PageIdFounder.FILL_BY_KIND, which Create mode also uses and must
      // keep its rowsPreExist/cardsPreExist and navigateBackAfterSave
      // defaults) — deleting existing content wipes out the pre-existing
      // first row/card too, so run() needs to add every one itself instead
      // of assuming they exist, and there's no next module to go back and
      // find after saving. Skinny Banner's sections don't pre-exist at all
      // (run() always clicks "add"), so it only needs navigateBackAfterSave
      // overridden, not a rowsPreExist-style flag.
      if (descriptor.kind === 'hubSpokeNM') {
        await HubSpoke.deleteExistingRows();
        const completed = await HubSpoke.run(
          this.deviceType,
          brandPage,
          descriptor.index,
          this.addGbo,
          false,
          false
        );
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'hubSpokeCard') {
        if (this.deviceType !== 'app') {
          throw new Error('Hub Spoke Card is app-only — cannot be edited on a web run.');
        }
        await HubSpokeCard.deleteExistingCards();
        const completed = await HubSpokeCard.run(
          this.deviceType,
          brandPage,
          descriptor.index,
          this.addGbo,
          false,
          false
        );
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'heroPov') {
        // Works on both web and app — no device restriction, unlike
        // Hub Spoke Card/YouTube/Recipe.
        await HeroPov.deleteExistingCards();
        const completed = await HeroPov.run(
          this.deviceType,
          brandPage,
          descriptor.index,
          this.addGbo,
          false,
          false
        );
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'youtube') {
        if (this.deviceType !== 'web') {
          throw new Error('Youtube is web-only — cannot be edited on an app run.');
        }
        // No existing-content delete step needed — unlike rows/cards, this
        // is a single markup textarea that Youtube.run overwrites directly.
        const completed = await Youtube.run(this.deviceType, brandPage, descriptor.index, false);
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'recipe') {
        if (this.deviceType !== 'web') {
          throw new Error('Recipe is web-only — cannot be edited on an app run.');
        }
        const completed = await Recipe.run(this.deviceType, brandPage, descriptor.index, false);
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'skinnyBanner') {
        // Works on both web and app — no device restriction.
        await SkinnyBanner.prepareForEdit(this.deviceType);
        const completed = await SkinnyBanner.run(
          this.deviceType,
          descriptor.bannerType,
          brandPage,
          descriptor.index,
          this.addGbo,
          false
        );
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'povCard') {
        // Works on both web and app — no device restriction.
        await PovCard.prepareForEdit(this.deviceType);
        const completed = await PovCard.run(
          this.deviceType,
          brandPage,
          descriptor.index,
          this.addGbo,
          false,
          false
        );
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'itemCarousel') {
        // Works on both web and app — no device restriction.
        await ItemCarousel.prepareForEdit(this.deviceType);
        const completed = await ItemCarousel.run(this.deviceType, brandPage, descriptor.index, false);
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'inspirationModule') {
        if (this.deviceType !== 'web') {
          throw new Error('Inspiration Module is web-only — cannot be edited on an app run.');
        }
        await InspirationModule.prepareForEdit();
        const completed = await InspirationModule.run(this.deviceType, brandPage, descriptor.index, false, false);
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else if (descriptor.kind === 'accordion') {
        // Works on both web and app — no device restriction (two different
        // CMS modules under one brief key, see accordion.js's file header).
        await Accordion.prepareForEdit(this.deviceType);
        const completed = await Accordion.run(this.deviceType, brandPage, descriptor.index, false, false);
        Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
      } else {
        throw new Error(
          `Edit mode only supports Hub Spokes NxM, Hub Spoke Card, Hero POV, YouTube, Recipe, Skinny Banner, POV Card, Item Carousel, Inspiration Module, and Accordion for now (got "${descriptor.kind}").`
        );
      }
    } catch (err) {
      Helper.fail(err);
    }
  };
}
