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

  static clearGenericFields = async () => {
    for (const selector of Object.values(ModuleEditor.SELECTORS.genericFields)) {
      try {
        const el = await Helper.waitForElement(selector, 2000);
        Helper.setInputValue(el, '');
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

      // Edit mode only supports Hub Spokes NxM so far — other kinds haven't
      // had a "clear existing content before refill" step built yet, and
      // without one their fill functions would leave stale rows/cards from
      // the module's current content mixed in with the brief's new one.
      if (descriptor.kind !== 'hubSpokesNM') {
        throw new Error(`Edit mode only supports Hub Spokes NxM for now (got "${descriptor.kind}").`);
      }

      await HubSpoke.deleteExistingRows();

      // Called directly (not via PageIdFounder.FILL_BY_KIND, which Create
      // mode also uses and must keep its rowsPreExist/navigateBackAfterSave
      // defaults) — deleteExistingRows() just wiped out row 0 too, so
      // run() needs to add every row itself instead of assuming the first
      // one exists, and there's no next module to go back and find after
      // saving.
      const completed = await HubSpoke.run(this.deviceType, brandPage, this.addGbo, false, false);
      Helper.log(completed ? 'Module saved.' : 'Changes discarded.');
    } catch (err) {
      Helper.fail(err);
    }
  };
}
