// Fills the Inspiration Module form after ModuleFinder has added and opened
// it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt: web-only module ("this module only available for web"),
// a module-level title, and up to 3 cards, each with an en/fr image, heading
// (max 23 chars), sub-heading (max 65 chars), a link text/value CTA pair,
// and a SKU list. The brief carries one linkValue per card, which is typed
// into BOTH of the CMS's two link fields (the image's own wrap-link, and
// the CTA's URL next to linkText) — confirmed intentional, not a brief gap.
// The CMS doesn't take a plain SKU array — it has three mutually-exclusive
// input variants (2 items, 3 items, "Upto 20" items), selected via a
// per-card dropdown, so the selector to type the comma-joined SKU string
// into depends on how many SKUs this card actually has.

class InspirationModule {
  static MAX_CARDS = 3;

  // $numberOfItem=twoItems|threeItems|oneItems — note: oneItems == "Upto 20"
  // option (anything other than exactly 2 or exactly 3 SKUs), twoItems ==
  // "2" option, threeItems == "3" option. Naming is the CMS's own, not a
  // typo — kept as documented in scratch.txt.
  static pickNumberOfItems = (count) => {
    if (count === 2) return { key: 'twoItems', optionText: '2' };
    if (count === 3) return { key: 'threeItems', optionText: '3' };
    return { key: 'oneItems', optionText: 'Upto 20' };
  };

  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    titleEn: 'input[data-e2eid="mainHeading"]',
    titleFr: 'input[data-e2eid="fr_mainHeading"]',
    addCardButton: 'div.add-group-button',
    card: (i) => ({
      image: {
        en: {
          open: `button[data-e2eid="inspirationModule-inspirationModule-${i}-cardImage-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="inspirationModule-inspirationModule-${i}-cardImage-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="inspirationModule-inspirationModule-${i}-cardImage-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="inspirationModule-inspirationModule-${i}-cardImage-alt-text"]`,
        },
        fr: {
          open: `button[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardImage-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardImage-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardImage-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardImage-alt-text"]`,
        },
      },
      headingEn: `input[data-e2eid="inspirationModule-inspirationModule-${i}-cardTitle"]`,
      headingFr: `input[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardTitle"]`,
      headingMaxLen: 23,
      subHeadingEn: `input[data-e2eid="inspirationModule-inspirationModule-${i}-cardSubTitle"]`,
      subHeadingFr: `input[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardSubTitle"]`,
      subHeadingMaxLen: 65,
      // Two separate link fields share the one brief "linkValue" per
      // explicit instruction: the image's own wrap-link (no text pair) and
      // the CTA's URL (paired with linkText) both get the same value.
      linkValueEn: `textarea[data-e2eid="inspirationModule-inspirationModule-${i}-cardImage-url-link"]`,
      linkValueFr: `textarea[data-e2eid="inspirationModule-inspirationModule-${i}-fr_cardImage-url-link"]`,
      ctaLinkValueEn: `textarea[data-e2eid="inspirationModule-inspirationModule-${i}-ctaInfo-url-link"]`,
      ctaLinkValueFr: `textarea[data-e2eid="inspirationModule-inspirationModule-${i}-fr_ctaInfo-url-link"]`,
      linkTextEn: `input[data-e2eid="inspirationModule-inspirationModule-${i}-ctaInfo-title-text-input"]`,
      linkTextFr: `input[data-e2eid="inspirationModule-inspirationModule-${i}-fr_ctaInfo-title-text-input"]`,
      itemNumberButton: `button[data-e2eid="inspirationModule-inspirationModule-${i}-itemNumber"]`,
      itemNumberOption: `button[data-e2eid="inspirationModule-inspirationModule-${i}-itemNumber"] + div div[id^="option-"]`,
      skusInput: (numberKey) =>
        `input[data-e2eid="inspirationModule-inspirationModule-${i}-${numberKey}-item-string-input"]`,
      addSkusButton: (numberKey) =>
        `button[data-e2eid="inspirationModule-inspirationModule-${i}-${numberKey}-add-button"]`,
    }),
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    await Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[InspirationModule] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await InspirationModule.setValue(selector, v);
  };

  // Edit mode only (see module-editor.js): same generic "delete repeatable
  // group" component every other module uses (dragElementWrapper +
  // deleteGroupButton + confirmDeleteGroupButton), filtered by label text
  // "Card" per scratch.txt.
  static CARD_DELETE_SELECTORS = {
    wrapper: 'div.dragElementWrapper',
    deleteIcon: 'svg.deleteGroupButton',
    confirmButton: 'button.confirmDeleteGroupButton',
    labelMatch: 'Card',
  };

  static findCardWrappers = () =>
    [...document.querySelectorAll(InspirationModule.CARD_DELETE_SELECTORS.wrapper)].filter((el) =>
      el.textContent.includes(InspirationModule.CARD_DELETE_SELECTORS.labelMatch)
    );

  static deleteExistingCards = async () => {
    const count = InspirationModule.findCardWrappers().length;
    Helper.log(`Found ${count} existing card(s) to delete.`);

    for (let i = 0; i < count; i++) {
      const cards = InspirationModule.findCardWrappers();
      if (cards.length === 0) break;

      const card = cards[0];
      ['mouseover', 'mouseenter', 'pointerover', 'pointerenter'].forEach((type) => {
        card.dispatchEvent(new MouseEvent(type, { bubbles: true }));
      });
      await Helper.sleep(200);

      const deleteBtn = card.querySelector(InspirationModule.CARD_DELETE_SELECTORS.deleteIcon);
      if (!deleteBtn) break;
      Helper.log(`Deleting existing card ${i + 1} of ${count}: ${card.textContent}`);
      deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const confirmBtn = await Helper.waitForElement(InspirationModule.CARD_DELETE_SELECTORS.confirmButton);
      confirmBtn.click();
      await Helper.sleep(500);
    }
  };

  // Module name/title aren't behind any "add section" group, so the
  // delete-group mechanism above doesn't touch them — clear them directly
  // instead.
  static clearModuleFields = async () => {
    const keys = ['moduleName', 'titleEn', 'titleFr'];
    for (const key of keys) {
      try {
        const el = await Helper.waitForElement(InspirationModule.SELECTORS[key], 2000);
        await Helper.setInputValue(el, '');
      } catch {
        // Field doesn't exist — skip it.
      }
    }
  };

  static prepareForEdit = async () => {
    await InspirationModule.deleteExistingCards();
    await InspirationModule.clearModuleFields();
  };

  // Split select-only / alt-text-only (same "images first" pattern as every
  // other module): alt text only saves once an image is actually selected,
  // so run() selects every card's image first, then fills alt text in a
  // later pass alongside the rest of each card's fields.
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

  static fillImageAltText = async (cfg, data, altCopyContext) => {
    if (!data || !data.searchText) return;
    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await InspirationModule.setValue(cfg.altText, altText);
  };

  static selectCardImages = async (cardSel, cardData) => {
    await InspirationModule.selectImage(cardSel.image.en, cardData.cardImage?.english);
    await InspirationModule.selectImage(cardSel.image.fr, cardData.cardImage?.french);
  };

  static fillCardImageAlts = async (cardSel, cardData, brandName) => {
    const altCopyContext = (language) => ({ brandName, deviceType: 'web', language, moduleType: 'inspiration-module' });
    await InspirationModule.fillImageAltText(cardSel.image.en, cardData.cardImage?.english, altCopyContext('english'));
    await InspirationModule.fillImageAltText(cardSel.image.fr, cardData.cardImage?.french, altCopyContext('french'));
  };

  // Selects the item-count dropdown option matching however many SKUs this
  // card actually has, then types them (comma-joined — the brief carries an
  // array, the CMS field takes one string) into whichever of the three SKU
  // inputs that option reveals, and clicks that variant's own add button.
  static fillSkus = async (cardSel, skus) => {
    if (!Array.isArray(skus) || skus.length === 0) return;

    const { key, optionText } = InspirationModule.pickNumberOfItems(skus.length);

    const dropdownBtn = await Helper.waitForElement(cardSel.itemNumberButton);
    dropdownBtn.click();
    await Helper.sleep(300);
    const option = await Helper.waitForElementByText(cardSel.itemNumberOption, optionText, false);
    option.click();
    Helper.log(`Selected item count option: ${optionText}`);
    await Helper.sleep(300);

    await InspirationModule.setValue(cardSel.skusInput(key), skus.join(', '));
    const addBtn = await Helper.waitForElement(cardSel.addSkusButton(key));
    addBtn.click();
    Helper.log(`Added ${skus.length} SKU(s).`);
    await Helper.sleep(300);
  };

  // Everything except image — deferred to run()'s later stage (see above).
  static fillCardNonImage = async (cardSel, cardData) => {
    await InspirationModule.setTruncated(cardSel.headingEn, cardData.heading?.english, cardSel.headingMaxLen);
    await InspirationModule.setTruncated(cardSel.headingFr, cardData.heading?.french, cardSel.headingMaxLen);

    await InspirationModule.setTruncated(cardSel.subHeadingEn, cardData.subHeading?.english, cardSel.subHeadingMaxLen);
    await InspirationModule.setTruncated(cardSel.subHeadingFr, cardData.subHeading?.french, cardSel.subHeadingMaxLen);

    // Same linkValue feeds both the image's own wrap-link and the CTA's URL
    // (paired with linkText below) — per explicit instruction, not a brief
    // field for each.
    await InspirationModule.setValue(cardSel.linkValueEn, cardData.linkValue?.english || '');
    await InspirationModule.setValue(cardSel.linkValueFr, cardData.linkValue?.french || '');
    await InspirationModule.setValue(cardSel.ctaLinkValueEn, cardData.linkValue?.english || '');
    await InspirationModule.setValue(cardSel.ctaLinkValueFr, cardData.linkValue?.french || '');

    await InspirationModule.setValue(cardSel.linkTextEn, cardData.linkText?.english || '');
    await InspirationModule.setValue(cardSel.linkTextFr, cardData.linkText?.french || '');

    await InspirationModule.fillSkus(cardSel, cardData.skus);
  };

  // Errors intentionally propagate to the caller — same convention as every
  // other module's run().
  // brandPage.inspirationModule is an array of independent module instances
  // (same "multi" pattern as itemCarousel/hubSpokeCard) — index picks which
  // one.
  // cardsPreExist defaults true (a freshly-created module already has card 0
  // sitting there empty). ModuleEditor passes false after deleteExistingCards()
  // wipes every card — so card 0 needs its own "add card" click too.
  // navigateBackAfterSave defaults true (Create mode needs to go back to
  // find the next module) — ModuleEditor passes false.
  static run = async (deviceType, brandPage, index, cardsPreExist = true, navigateBackAfterSave = true) => {
    if (deviceType !== 'web') {
      throw new Error('Inspiration Module is web-only — cannot be edited on an app run.');
    }

    const SEL = InspirationModule.SELECTORS;
    const entry = brandPage.inspirationModule?.[index];
    if (!entry) throw new Error(`Brief is missing inspirationModule[${index}] data`);

    const cards = Array.isArray(entry.cards) ? entry.cards.slice(0, InspirationModule.MAX_CARDS) : [];
    if (cards.length === 0) throw new Error('inspirationModule.cards is empty');

    Helper.log('Filling Inspiration Module...');

    // When the brief has more than one Inspiration Module, append a 1-based
    // sequence number so the generated names aren't all identical (same
    // convention as item-carousel.js/hub-spoke-card.js).
    const total = Array.isArray(brandPage.inspirationModule) ? brandPage.inspirationModule.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'inspiration-module', deviceType);
    if (total > 1) {
      moduleName += ` #${index + 1}`;
    }

    // No intermediate save — same flow as every other module: every card's
    // image selected first, then a second pass fills everything else, then
    // module name last of all.
    for (let i = 0; i < cards.length; i++) {
      if (i > 0 || !cardsPreExist) {
        const addBtn = await Helper.waitForElement(SEL.addCardButton);
        addBtn.click();
        await Helper.sleep(300);
      }
      await InspirationModule.selectCardImages(SEL.card(i), cards[i]);
      Helper.log(`Selected images for card ${i + 1} of ${cards.length} (rest deferred).`);
    }

    for (let i = 0; i < cards.length; i++) {
      await InspirationModule.fillCardNonImage(SEL.card(i), cards[i]);
      await InspirationModule.fillCardImageAlts(SEL.card(i), cards[i], brandPage.brandName);
      Helper.log(`Filled remaining fields for card ${i + 1} of ${cards.length}.`);
    }

    // Default to "Shop" / "Magasiner" when the brief omits a title (same
    // default as hub-spoke.js/hub-spoke-card.js).
    await InspirationModule.setValue(SEL.titleEn, entry.title?.english || 'Shop');
    await InspirationModule.setValue(SEL.titleFr, entry.title?.french || 'Magasiner');
    Helper.log('Filled title.');

    // Module name filled last of all — per explicit request — once every
    // card is done, rather than up front (see Helper.setModuleName's own
    // retry/verify logic for why this field needs special handling).
    await Helper.setModuleName(SEL.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    // Click a dummy field via CDP to force a real blur on whatever was last
    // focused, before handing off for review.
    await Helper.blurActiveFieldViaDummyInput();

    Helper.log('Inspiration Module filled — review and click Save (or Discard Changes) to continue.');
    const moduleRecord = navigateBackAfterSave
      ? { pageId: brandPage.pageId, deviceType, moduleKey: `inspirationModule-${index}`, moduleName }
      : null;
    return await Helper.waitForSaveOrDiscard(SEL.saveButton, SEL.discardButton, moduleRecord);
  };
}
