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

  static findRowWrappers = () =>
    [...document.querySelectorAll(HubSpoke.ROW_DELETE_SELECTORS.wrapper)].filter((el) =>
      el.textContent.includes(HubSpoke.ROW_DELETE_SELECTORS.rowLabelMatch)
    );

  static deleteExistingRows = async () => {
    // Count up front (same pattern as HubSpokeCard.deleteExistingCards) and
    // loop exactly that many times, rather than an arbitrary MAX_ROWS + 1
    // safety cap — gives a real expected count to log progress against and
    // to break early on if fewer rows delete successfully than were
    // actually found. The label filter stays — unlike Hub Spoke Card, this
    // module's dragElementWrappers are nested (rows AND the categories
    // inside them both use it), so rowLabelMatch is still needed to scope
    // to rows only.
    const count = HubSpoke.findRowWrappers().length;
    Helper.log(`Found ${count} existing row(s) to delete.`);

    for (let i = 0; i < count; i++) {
      const rows = HubSpoke.findRowWrappers();
      if (rows.length === 0) break;

      const row = rows[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        row.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = row.querySelector(HubSpoke.ROW_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing row ${i + 1} of ${count}: ${row.textContent}`);
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
    await Helper.setInputValue(el, value, true);
    return el;
  };

  static fillLinkValue = async (cfg, data, applyGbo) => {
    if (!data || !data.linkValue) return;
    const linkValue = applyGbo ? Helper.appendGboParam(data.linkValue) : data.linkValue;
    await HubSpoke.setValue(cfg.linkValue, linkValue);
  };

  static fillAltText = async (cfg, data, altCopyContext) => {
    if (!data || !data.searchText) return;
    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await HubSpoke.setValue(cfg.altText, altText);
  };

  // Image selection only — name/link/alt text are all deferred to
  // fillCategoryRest, same "images first" flow as hero-pov.js (confirmed
  // working there): filling text fields after an image is selected doesn't
  // wipe the image, but selecting an image after text fields were already
  // filled was found to wipe them — so every category's image gets
  // selected first, with nothing else on the page yet to wipe.
  static selectImage = async (cfg, data) => {
    if (!data || !data.searchText) return;

    const openBtn = await Helper.waitForElement(cfg.open);
    await Helper.clickTrusted(openBtn);
    await Helper.sleep(300);

    const searchInput = await Helper.waitForElement(cfg.search);
    await Helper.setInputValue(searchInput, data.searchText);

    const searchBtn = await Helper.waitForElement(cfg.searchBtn);
    await Helper.clickTrusted(searchBtn);

    const result = await Helper.waitForElement(cfg.result);
    await Helper.clickTrusted(result);
    Helper.log(`Selected image: ${data.searchText}`);
  };

  static selectCategoryImages = async (colNumber, row, col, categoryData) => {
    if (!categoryData) return;
    const sel = HubSpoke.categorySelectors(colNumber, row, col);

    await HubSpoke.selectImage(sel.image.en, categoryData.image?.english);
    await HubSpoke.selectImage(sel.image.fr, categoryData.image?.french);
  };

  // Everything except the image itself — name, link value, and alt text
  // (alt text only saves once a real image is already selected, which by
  // this point every category's is).
  static fillCategoryRest = async (colNumber, row, col, categoryData, altCopyContextFor, applyGbo) => {
    if (!categoryData) return;
    const sel = HubSpoke.categorySelectors(colNumber, row, col);

    await HubSpoke.setValue(sel.nameEn, categoryData.name?.english || '');
    await HubSpoke.setValue(sel.nameFr, categoryData.name?.french || '');

    await HubSpoke.fillLinkValue(sel.image.en, categoryData.image?.english, applyGbo);
    await HubSpoke.fillLinkValue(sel.image.fr, categoryData.image?.french, applyGbo);

    await HubSpoke.fillAltText(sel.image.en, categoryData.image?.english, altCopyContextFor('english'));
    await HubSpoke.fillAltText(sel.image.fr, categoryData.image?.french, altCopyContextFor('french'));
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
  // brandPage.hubSpokeNM is an array of independent module instances (same
  // "multi" pattern as itemCarousel/hubSpokeCard) — index picks which one.
  static run = async (deviceType, brandPage, index, addGbo, rowsPreExist = true, navigateBackAfterSave = true) => {
    // Category image linkValue isn't device-split in the brief (same value
    // used for web and app runs), so gbo=1 only applies on an app run.
    const applyGbo = deviceType === 'app' && Boolean(addGbo);
    const hub = brandPage.hubSpokeNM?.[index];
    if (!hub) throw new Error(`Brief is missing hubSpokeNM[${index}] data`);

    const rows = Array.isArray(hub.rows) ? hub.rows.slice(0, HubSpoke.MAX_ROWS) : [];
    if (rows.length === 0) throw new Error('hubSpokeNM.rows is empty');

    Helper.log('Filling Hub Spokes NxM module...');

    // When the brief has more than one Hub Spokes NxM, append a 1-based
    // sequence number so the generated names aren't all identical (same
    // convention as item-carousel.js/hub-spoke-card.js).
    const total = Array.isArray(brandPage.hubSpokeNM) ? brandPage.hubSpokeNM.length : 1;
    const gridLayout = `${rows.length}x${hub.columns}`;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'hub-spokes-nxm', deviceType, {
      gridLayout,
    });
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }

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

    // Clean phases, not interleaved: (1) click every "add row"/"ADD
    // CATEGORIES" button for the WHOLE module first — no field writes at
    // all yet. Reasoning: card 0 (pre-existing, never touched by an "add"
    // click) keeps its data reliably; every dynamically-added card's TEXT
    // fields (name/alt/link) were observed getting wiped while its already-
    // selected IMAGE survived — consistent with a later "add" click
    // triggering a re-render that remounts earlier cards' DOM (resetting
    // whatever only the DOM, not the app's own state, ever captured) while
    // image-selection state is tracked properly and survives. Making sure
    // no "add" click EVER happens after a field is filled should prevent
    // that remount from catching anything.
    const rowCategoryCounts = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      if (rowIndex > 0 || !rowsPreExist) {
        const addRowBtn = await Helper.waitForElement(HubSpoke.SELECTORS.addRowButton);
        addRowBtn.click();
        await Helper.sleep(300);
      }

      const categories = Array.isArray(rows[rowIndex].categories)
        ? rows[rowIndex].categories.slice(0, maxColumnsForRow)
        : [];
      rowCategoryCounts.push(categories.length);

      for (let colIndex = 1; colIndex < categories.length; colIndex++) {
        const addColBtn = HubSpoke.addColumnButton(colNumber, rowIndex);
        const btn = await Helper.waitForElementByText(addColBtn.selector, addColBtn.text, addColBtn.exact);
        btn.click();
        await Helper.sleep(300);
      }
    }

    // No intermediate save — per explicit request, same flow as
    // hero-pov.js: (2) every category's image selected first (nothing
    // else on the page yet to wipe), then (3) a second pass fills
    // everything else — name, link value, alt text — then heading and
    // module name last of all.
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const categories = Array.isArray(rows[rowIndex].categories)
        ? rows[rowIndex].categories.slice(0, rowCategoryCounts[rowIndex])
        : [];

      for (let colIndex = 0; colIndex < categories.length; colIndex++) {
        await HubSpoke.selectCategoryImages(colNumber, rowIndex, colIndex, categories[colIndex]);
        Helper.log(`Selected images for row ${rowIndex + 1}, column ${colIndex + 1} (name/link/alt deferred).`);
      }
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const categories = Array.isArray(rows[rowIndex].categories)
        ? rows[rowIndex].categories.slice(0, rowCategoryCounts[rowIndex])
        : [];

      for (let colIndex = 0; colIndex < categories.length; colIndex++) {
        const altCopyContextFor = (language) => ({
          brandName: brandPage.brandName,
          deviceType,
          language,
          moduleType: 'hub-spokes-nxm',
        });
        await HubSpoke.fillCategoryRest(colNumber, rowIndex, colIndex, categories[colIndex], altCopyContextFor, applyGbo);
        Helper.log(`Filled remaining fields for row ${rowIndex + 1}, column ${colIndex + 1}.`);
      }
    }

    // Default to "Shop" / "Magasiner" when the brief omits a heading.
    await HubSpoke.setValue(HubSpoke.SELECTORS.headingEn, hub.heading?.english || 'Shop');
    await HubSpoke.setValue(HubSpoke.SELECTORS.headingFr, hub.heading?.french || 'Magasiner');
    Helper.log('Filled heading.');

    // Row 0 / category 0's text fields specifically don't sync otherwise
    // (confirmed live): for each one, first CDP-focus+click the real field
    // itself, then CDP-click a dummy input appended INSIDE that category's
    // own test-dataid-scoped wrapper (rather than at the body root, like
    // the generic blur below) to force a real blur on it. Must happen
    // before module name is set, per explicit request.
    const firstCategoryContainer = document.querySelector(`div[test-dataid="rows${colNumber}-0,categories,0"]`);
    if (firstCategoryContainer) {
      const firstCatSel = HubSpoke.categorySelectors(colNumber, 0, 0);
      const fieldsToSync = [
        firstCatSel.nameEn,
        firstCatSel.nameFr,
        firstCatSel.image.en.altText,
        firstCatSel.image.fr.altText,
        firstCatSel.image.en.linkValue,
        firstCatSel.image.fr.linkValue,
      ];
      for (const fieldSelector of fieldsToSync) {
        const fieldEl = document.querySelector(fieldSelector);
        if (fieldEl) {
          await Helper.clickTrusted(fieldEl);
          await Helper.sleep(200);
        } else {
          console.warn(`[HubSpoke] Row 1 / category 1 field not found: ${fieldSelector}`);
        }
        await Helper.blurActiveFieldViaDummyInput(firstCategoryContainer);
      }
      Helper.log('Forced focus+blur on row 1 / category 1 fields to sync them.');
    } else {
      console.warn('[HubSpoke] Row 1 / category 1 container not found — skipping its extra blur.');
    }

    // Module name filled last of all — per explicit request — once every
    // row/category is done, rather than up front (see Helper.setModuleName's
    // own retry/verify logic for why this field needs special handling).
    await Helper.setModuleName(HubSpoke.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    // Click a dummy field via CDP to force a real blur on whatever was
    // last focused, before handing off for review — catches any field
    // that only commits its value on blur rather than on input/change.
    await Helper.blurActiveFieldViaDummyInput();

    Helper.log('Hub Spokes NxM filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `hubSpokeNM-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(
      HubSpoke.SELECTORS.saveButton,
      HubSpoke.SELECTORS.discardButton,
      moduleRecord
    );
  };
}
