// Fills the Item Carousel module form after ModuleFinder has added and
// opened it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt, web and app are identical except the item-selection
// dropdown's data-e2eid ("itemsSelection" on web, "itemSelection" on app —
// not a typo, both are explicitly documented that way). No cards/rows —
// just a title, sub-title, a fixed "Items List" selection mode, and a
// comma-joined SKU string.

class ItemCarousel {
  static SELECTORS = {
    web: {
      moduleName: 'input[id="../name"]',
      titleEn: 'input[data-e2eid="title"]',
      titleFr: 'input[data-e2eid="fr_title"]',
      subTitleEn: 'input[data-e2eid="subTitle"]',
      subTitleFr: 'input[data-e2eid="fr_subTitle"]',
      itemSelectionButton: 'button[data-e2eid="itemsSelection"]',
      itemSelectionOption: 'button[data-e2eid="itemsSelection"] + div div[id^="option-"]',
      skusInput: 'input[data-testid="item-string-input"]',
      addSkusButton: 'button[data-testid="add-tags"]',
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
    app: {
      moduleName: 'input[id="../name"]',
      titleEn: 'input[data-e2eid="title"]',
      titleFr: 'input[data-e2eid="fr_title"]',
      subTitleEn: 'input[data-e2eid="subTitle"]',
      subTitleFr: 'input[data-e2eid="fr_subTitle"]',
      itemSelectionButton: 'button[data-e2eid="itemSelection"]',
      itemSelectionOption: 'button[data-e2eid="itemSelection"] + div div[id^="option-"]',
      skusInput: 'input[data-testid="item-string-input"]',
      addSkusButton: 'button[data-testid="add-tags"]',
      saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
      discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
    },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  // Edit mode only (see module-editor.js): an existing module may already
  // have a title/sub-title, an item-selection mode, and a SKU tag list —
  // none of which run() accounts for (it always sets fresh values, but
  // never resets the selection mode or clears old tags first). Per
  // scratch.txt: clear the SKU tags while still in "Items List" mode (the
  // clear-tags button only exists in that mode), then reset selection to
  // "None" for a clean slate — run() switches it back to "Items List"
  // itself right after — then clear the plain text fields directly.
  static clearSkus = async () => {
    const clearBtn = await Helper.waitForElement('button[data-testid="clear-tags"]');
    clearBtn.click();
    Helper.log('Cleared existing SKU tags.');
    await Helper.sleep(300);
  };

  static resetItemSelection = async (deviceType) => {
    const SEL = ItemCarousel.SELECTORS[deviceType];
    const selectionBtn = await Helper.waitForElement(SEL.itemSelectionButton);
    selectionBtn.click();
    await Helper.sleep(300);
    const noneOption = await Helper.waitForElementByText(SEL.itemSelectionOption, 'None', false);
    noneOption.click();
    Helper.log('Reset item selection to "None".');
    await Helper.sleep(300);
  };

  static clearModuleFields = async (deviceType) => {
    const SEL = ItemCarousel.SELECTORS[deviceType];
    const keys = ['moduleName', 'titleEn', 'titleFr', 'subTitleEn', 'subTitleFr'];
    for (const key of keys) {
      try {
        const el = await Helper.waitForElement(SEL[key], 2000);
        await Helper.setInputValue(el, '');
      } catch {
        // Field doesn't exist on this page — skip it.
      }
    }
  };

  static prepareForEdit = async (deviceType) => {
    await ItemCarousel.clearSkus();
    await ItemCarousel.resetItemSelection(deviceType);
    await ItemCarousel.clearModuleFields(deviceType);
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run/HeroPov.run/HubSpoke.run/PovCard.run —
  // so a failure stops the loop instead of continuing on to a module that
  // was never actually added.
  // brandPage.itemCarousel is an array — each entry is a fully separate
  // module instance (its own module-add, fill, and save cycle), not a
  // repeating sub-element within one module — so `index` selects which
  // entry this call fills.
  // navigateBackAfterSave defaults true (Create mode needs to go back to
  // find the next module) — ModuleEditor passes false, since Edit mode is
  // done with exactly one module and there's nothing to go back to find.
  static run = async (deviceType, brandPage, index, navigateBackAfterSave = true) => {
    const SEL = ItemCarousel.SELECTORS[deviceType];
    if (!SEL) throw new Error(`No Item Carousel selectors for device type: ${deviceType}`);

    const item = brandPage.itemCarousel?.[index];
    if (!item) throw new Error(`Brief is missing itemCarousel[${index}] data`);

    Helper.log('Filling Item Carousel module...');

    // When the brief has more than one Item Carousel, append a 1-based
    // sequence number so the generated names aren't all identical — a
    // single instance keeps the plain name with no trailing number.
    const total = Array.isArray(brandPage.itemCarousel) ? brandPage.itemCarousel.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'item-carousel', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }
    // Verified + retried against div.css-1t27te5 (see Helper.setModuleName)
    // rather than a plain setValue — this field was found not to always
    // sync on the first write.
    await Helper.setModuleName(SEL.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    await ItemCarousel.setValue(SEL.titleEn, item.title?.english || '');
    await ItemCarousel.setValue(SEL.titleFr, item.title?.french || '');

    await ItemCarousel.setValue(SEL.subTitleEn, item.subTitle?.english || '');
    await ItemCarousel.setValue(SEL.subTitleFr, item.subTitle?.french || '');

    const selectionBtn = await Helper.waitForElement(SEL.itemSelectionButton);
    selectionBtn.click();
    await Helper.sleep(300);
    const itemsListOption = await Helper.waitForElementByText(SEL.itemSelectionOption, 'Items List', false);
    itemsListOption.click();
    Helper.log('Selected "Items List" mode.');
    await Helper.sleep(300);

    // Brief carries skus as an array; the CMS field takes one comma-
    // separated string.
    const skus = Array.isArray(item.skus) ? item.skus : [];
    if (skus.length > 0) {
      await ItemCarousel.setValue(SEL.skusInput, skus.join(', '));
      const addBtn = await Helper.waitForElement(SEL.addSkusButton);
      addBtn.click();
      Helper.log(`Added ${skus.length} SKU(s).`);
      await Helper.sleep(300);
    }

    Helper.log('Item Carousel filled — review and click Save (or Discard Changes) to continue.');
    // Only Create mode (navigateBackAfterSave=true) tracks a module record
    // — Edit mode doesn't track/limit edits, so it never passes one.
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `itemCarousel-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(SEL.saveButton, SEL.discardButton, moduleRecord);
  };
}
