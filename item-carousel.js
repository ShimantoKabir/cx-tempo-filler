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
    },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    Helper.setInputValue(el, value);
    return el;
  };

  // Errors intentionally propagate to the caller — same convention as
  // ModuleFinder.run/SkinnyBanner.run/HeroPov.run/HubSpoke.run/PovCard.run —
  // so a failure stops the loop instead of continuing on to a module that
  // was never actually added.
  // brandPage.itemCarousel is an array — each entry is a fully separate
  // module instance (its own module-add, fill, and save cycle), not a
  // repeating sub-element within one module — so `index` selects which
  // entry this call fills.
  static run = async (deviceType, brandPage, index) => {
    const SEL = ItemCarousel.SELECTORS[deviceType];
    if (!SEL) throw new Error(`No Item Carousel selectors for device type: ${deviceType}`);

    const item = brandPage.itemCarousel?.[index];
    if (!item) throw new Error(`Brief is missing itemCarousel[${index}] data`);

    Helper.log('Filling Item Carousel module...');

    const moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'item-carousel', deviceType);
    await ItemCarousel.setValue(SEL.moduleName, moduleName);
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

    // Per scratch.txt convention (see skinny-banner.js/hero-pov.js/
    // hub-spoke.js/pov-card.js): never auto-click Save — hand off for
    // review, and block here until the user actually clicks it, so a brief
    // with more modules doesn't try to add the next one while this one is
    // still open and unsaved.
    const saveBtn = await Helper.waitForElementByText(
      SEL.saveButton.selector,
      SEL.saveButton.text,
      SEL.saveButton.exact
    );
    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    Helper.log('Item Carousel filled — review and click Save to continue.');

    await new Promise((resolve) => {
      saveBtn.addEventListener('click', () => resolve(), { once: true });
    });
    Helper.log('Save clicked — going back to find the next module.');
    window.history.back();
    await Helper.sleep(1000);
  };
}
