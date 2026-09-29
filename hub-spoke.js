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

  static fillImage = async (cfg, data, altCopyContext) => {
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
      await HubSpoke.setValue(cfg.linkValue, data.linkValue);
    }

    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await HubSpoke.setValue(cfg.altText, altText);
  };

  static fillCategory = async (colNumber, row, col, categoryData, altCopyContextFor) => {
    if (!categoryData) return;
    const sel = HubSpoke.categorySelectors(colNumber, row, col);

    await HubSpoke.setValue(sel.nameEn, categoryData.name?.english || '');
    await HubSpoke.setValue(sel.nameFr, categoryData.name?.french || '');

    await HubSpoke.fillImage(sel.image.en, categoryData.image?.english, altCopyContextFor('english'));
    await HubSpoke.fillImage(sel.image.fr, categoryData.image?.french, altCopyContextFor('french'));
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run/HeroPov.run — so a failure stops the
  // loop instead of continuing on to a module that was never actually
  // added.
  static run = async (deviceType, brandPage) => {
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
      if (rowIndex > 0) {
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
        await HubSpoke.fillCategory(colNumber, rowIndex, colIndex, categories[colIndex], altCopyContextFor);
        Helper.log(`Filled row ${rowIndex + 1}, column ${colIndex + 1}.`);
      }
    }

    // Per scratch.txt convention (see skinny-banner.js/hero-pov.js): never
    // auto-click Save — hand off for review, and block here until the user
    // actually clicks it, so a brief with more modules doesn't try to add
    // the next one while this one is still open and unsaved.
    const saveBtn = await Helper.waitForElementByText(
      HubSpoke.SELECTORS.saveButton.selector,
      HubSpoke.SELECTORS.saveButton.text,
      HubSpoke.SELECTORS.saveButton.exact
    );
    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    Helper.log('Hub Spokes NxM filled — review and click Save to continue.');

    await new Promise((resolve) => {
      saveBtn.addEventListener('click', () => resolve(), { once: true });
    });
    Helper.log('Save clicked — going back to find the next module.');
    window.history.back();
    await Helper.sleep(1000);
  };
}
