// Fills the Hub Spokes NxM module form after ModuleFinder has added and
// opened it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt: selectors are identical for web and app (unlike Skinny
// Banner / Hero POV), so this module doesn't branch on deviceType for DOM
// interaction — only for the generated alt-copy label.
//
// Structure: one heading + a chosen column count (4 or 6), then up to 5
// rows, each with up to `columns` "category" cells (name + image per
// language). The chosen column count is baked into every row/category
// selector (test-dataid="rows{colNumber}-...") — see COLNUMBER note below —
// so it must be selected before any row/category selector can resolve.
//
// Row 0 / category 0 are assumed to exist by default when the module opens
// (matching the same assumption already used for Hero POV's card 0) —
// scratch.txt doesn't explicitly confirm this, only that "add row"/"add
// column" controls exist for anything beyond that.

class HubSpoke {
  static MAX_ROWS = 5;
  static MAX_COLUMNS = 6;

  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    headingEn: 'input[data-e2eid="heading"]',
    headingFr: 'input[data-e2eid="fr_heading"]',
    colNumberButton: 'button[data-e2eid="colNumber"]',
    colNumberOption: 'button[data-e2eid="colNumber"] + div div[id^="option-"]',
    addRowButton: 'div.add-group-button',
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  // Edit mode only (see module-editor.js): an existing module may already
  // have rows/categories with real data, which run()'s "row/category 0
  // already exists, empty" assumption below doesn't account for. These
  // delete every existing row (and, with it, every category inside that
  // row — deleting a row removes its nested categories too) so run() starts
  // from the same clean slate a freshly-created module would have.
  static ROW_DELETE_SELECTORS = {
    wrapper: 'div.dragElementWrapper',
    deleteIcon: 'svg.deleteGroupButton',
    rowLabelMatch: 'Rows Of Categories',
    confirmButton: 'button.confirmDeleteGroupButton',
  };

  static deleteExistingRows = async () => {
    // Loop bound is a safety cap against an infinite loop (e.g. if a delete
    // click doesn't actually remove the row), not a real expected count.
    for (let i = 0; i < HubSpoke.MAX_ROWS + 1; i++) {
      const rows = [...document.querySelectorAll(HubSpoke.ROW_DELETE_SELECTORS.wrapper)].filter((el) =>
        el.textContent.includes(HubSpoke.ROW_DELETE_SELECTORS.rowLabelMatch)
      );
      if (rows.length === 0) break;

      const row = rows[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        row.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = row.querySelector(HubSpoke.ROW_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing row: ${row.textContent}`);
      // deleteBtn is an <svg> — unlike HTMLElement, SVGElement has no
      // .click() method, so a real click must be dispatched instead.
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const confirmBtn = await Helper.waitForElement(HubSpoke.ROW_DELETE_SELECTORS.confirmButton);
      confirmBtn.click();
      await Helper.sleep(500);
    }
  };

  static addColumnButton = (colNumber, row) => ({
    selector: `div[test-dataid="rows${colNumber}-${row},categories,0"] button.add-group-button-right`,
    text: 'ADD CATEGORIES',
    exact: false,
  });

  // The category-container-position ("ccp") wrapper scopes the
  // persistently-rendered fields (name, alt text, link value) that would
  // otherwise collide — every category in a row shares the same
  // data-e2eid, disambiguated only by this wrapper. The image search
  // popup (search input/button/result) renders outside this wrapper (same
  // portal behavior already found for Hero POV's fr images), so those stay
  // unscoped.
  static categorySelectors = (colNumber, row, col) => {
    const ccp = `div[test-dataid="rows${colNumber}-${row},categories,${col}"]`;
    const base = `rows${colNumber}-rows${colNumber}-${row}`;
    return {
      nameEn: `${ccp} input[data-e2eid="${base}-name"]`,
      nameFr: `${ccp} input[data-e2eid="${base}-fr_name"]`,
      image: {
        en: {
          open: `${ccp} button[data-e2eid="${base}-image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="${base}-image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="${base}-image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          linkValue: `${ccp} textarea[data-e2eid="${base}-image-url-link"]`,
          altText: `${ccp} input[data-e2eid="${base}-image-alt-text"]`,
        },
        fr: {
          open: `${ccp} button[data-e2eid="${base}-fr_image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="${base}-fr_image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="${base}-fr_image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          linkValue: `${ccp} textarea[data-e2eid="${base}-fr_image-url-link"]`,
          altText: `${ccp} input[data-e2eid="${base}-fr_image-alt-text"]`,
        },
      },
    };
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    Helper.setInputValue(el, value);
    return el;
  };

  static fillImage = async (cfg, data, altCopyContext, applyGbo) => {
    if (!data || !data.searchText) return;

    const openBtn = await Helper.waitForElement(cfg.open);
    openBtn.click();
    await Helper.sleep(300);

    const searchInput = await Helper.waitForElement(cfg.search);
    Helper.setInputValue(searchInput, data.searchText);

    const searchBtn = await Helper.waitForElement(cfg.searchBtn);
    searchBtn.click();

    const result = await Helper.waitForElement(cfg.result);
    result.click();
    Helper.log(`Selected image: ${data.searchText}`);

    if (data.linkValue) {
      const linkValue = applyGbo ? Helper.appendGboParam(data.linkValue) : data.linkValue;
      await HubSpoke.setValue(cfg.linkValue, linkValue);
    }

    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await HubSpoke.setValue(cfg.altText, altText);
  };

  static fillCategory = async (colNumber, row, col, categoryData, altCopyContextFor, applyGbo) => {
    if (!categoryData) return;
    const sel = HubSpoke.categorySelectors(colNumber, row, col);

    await HubSpoke.setValue(sel.nameEn, categoryData.name?.english || '');
    await HubSpoke.setValue(sel.nameFr, categoryData.name?.french || '');

    await HubSpoke.fillImage(sel.image.en, categoryData.image?.english, altCopyContextFor('english'), applyGbo);
    await HubSpoke.fillImage(sel.image.fr, categoryData.image?.french, altCopyContextFor('french'), applyGbo);
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run/HeroPov.run — so a failure stops the
  // loop instead of continuing on to a module that was never actually
  // added.
  // rowsPreExist defaults true (a freshly-created module already has row 0
  // sitting there empty, same assumption the rest of this function makes).
  // ModuleEditor passes false after deleteExistingRows() wipes every row
  // including row 0 — so row 0 needs its own "add row" click too, not just
  // rows beyond the first.
  // navigateBackAfterSave defaults true (Create mode needs to go back to
  // find the next module) — ModuleEditor passes false, since Edit mode is
  // done with exactly one module and there's nothing to go back to find.
  static run = async (deviceType, brandPage, addGbo, rowsPreExist = true, navigateBackAfterSave = true) => {
    // Category image linkValue isn't device-split in the brief (same value
    // used for web and app runs), so gbo=1 only applies on an app run.
    const applyGbo = deviceType === 'app' && Boolean(addGbo);
    const hub = brandPage.hubSpokesNM;
    if (!hub) throw new Error('Brief is missing hubSpokesNM data');

    const rows = Array.isArray(hub.rows) ? hub.rows.slice(0, HubSpoke.MAX_ROWS) : [];
    if (rows.length === 0) throw new Error('hubSpokesNM.rows is empty');

    Helper.log('Filling Hub Spokes NxM module...');

    const gridLayout = `${rows.length}x${hub.columns}`;
    const moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'hub-spokes-nxm', deviceType, {
      gridLayout,
    });
    await HubSpoke.setValue(HubSpoke.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    await HubSpoke.setValue(HubSpoke.SELECTORS.headingEn, hub.heading?.english || '');
    await HubSpoke.setValue(HubSpoke.SELECTORS.headingFr, hub.heading?.french || '');

    // Column count must be selected before any row/category selector can
    // resolve, since the chosen number is baked into their test-dataid.
    const colBtn = await Helper.waitForElement(HubSpoke.SELECTORS.colNumberButton);
    colBtn.click();
    await Helper.sleep(300);
    const colOption = await Helper.waitForElementByText(HubSpoke.SELECTORS.colNumberOption, String(hub.columns), false);
    colOption.click();
    Helper.log(`Selected column count: ${hub.columns}`);
    await Helper.sleep(300);

    const colNumber = hub.columns;
    const maxColumnsForRow = Math.min(colNumber, HubSpoke.MAX_COLUMNS);

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      if (rowIndex > 0 || !rowsPreExist) {
        const addRowBtn = await Helper.waitForElement(HubSpoke.SELECTORS.addRowButton);
        addRowBtn.click();
        await Helper.sleep(300);
      }

      const categories = Array.isArray(rows[rowIndex].categories)
        ? rows[rowIndex].categories.slice(0, maxColumnsForRow)
        : [];

      for (let colIndex = 0; colIndex < categories.length; colIndex++) {
        if (colIndex > 0) {
          const addColBtn = HubSpoke.addColumnButton(colNumber, rowIndex);
          const btn = await Helper.waitForElementByText(addColBtn.selector, addColBtn.text, addColBtn.exact);
          btn.click();
          await Helper.sleep(300);
        }

        const altCopyContextFor = (language) => ({
          brandName: brandPage.brandName,
          deviceType,
          language,
          moduleType: 'hub-spokes-nxm',
        });
        await HubSpoke.fillCategory(colNumber, rowIndex, colIndex, categories[colIndex], altCopyContextFor, applyGbo);
        Helper.log(`Filled row ${rowIndex + 1}, column ${colIndex + 1}.`);
      }
    }

    Helper.log('Hub Spokes NxM filled — review and click Save (or Discard Changes) to continue.');
    return await Helper.waitForSaveOrDiscard(
      HubSpoke.SELECTORS.saveButton,
      HubSpoke.SELECTORS.discardButton,
      navigateBackAfterSave
    );
  };
}
