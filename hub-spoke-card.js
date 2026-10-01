// Fills the Hub Spoke Card module form after ModuleFinder has added and
// opened it (see manifest.json's content_scripts order — must load before
// page-id-founder.js).
//
// Per scratch.txt: this module is APP-ONLY — there is no web variant
// documented. page-id-founder.js is responsible for skipping this module
// entirely on a web run; run() below just guards against being called with
// the wrong deviceType.
//
// brandPage.hubSpokeCard is an array where each entry is a fully separate
// module instance (own add/fill/save cycle) — same "multi" pattern as
// itemCarousel — and each instance holds its own "cards" array (up to 6,
// per scratch.txt's "max 6 card can be added: [0-5]"). Card index is baked
// directly into every field's data-e2eid (categoryCards-categoryCards-{i}),
// so no test-dataid scoping wrapper is needed (same as pov-card.js's app
// cards, unlike hub-spoke.js's categories which share one e2eid per row).
//
// Unlike Hero POV / Hub Spokes / POV Card (where only card 0 pre-exists),
// this module's UI already renders 4 empty cards (indices 0-3) on load —
// confirmed by testing, not scratch.txt. Only cards beyond that (4 and 5)
// need the "add" button clicked.

class HubSpokeCard {
  static MAX_CARDS = 6;
  static PRE_EXISTING_CARDS = 4;

  static SELECTORS = {
    moduleName: 'input[id="../name"]',
    titleEn: 'input[data-e2eid="title"]',
    titleFr: 'input[data-e2eid="fr_title"]',
    addCardButton: 'div.add-group-button',
    card: (i) => ({
      image: {
        en: {
          open: `button[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="categoryCards-categoryCards-${i}-image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="categoryCards-categoryCards-${i}-image-alt-text"]`,
        },
        fr: {
          open: `button[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-dropdown-button"]`,
          search: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-dropdown-input"]`,
          searchBtn: `button[data-e2eid="categoryCards-categoryCards-${i}-fr_image-clickable-image-search-asset-button"]`,
          result: 'div#searched-image',
          altText: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_image-alt-text"]`,
        },
      },
      headingEn: `input[data-e2eid="categoryCards-categoryCards-${i}-title"]`,
      headingFr: `input[data-e2eid="categoryCards-categoryCards-${i}-fr_title"]`,
      headingMaxLen: 41,
      linkValueEn: `textarea[data-e2eid="categoryCards-categoryCards-${i}-image-url-link"]`,
      linkValueFr: `textarea[data-e2eid="categoryCards-categoryCards-${i}-fr_image-url-link"]`,
    }),
    saveButton: { selector: 'button[type="button"]', text: 'SAVE', exact: false },
    discardButton: { selector: 'button[type="button"]', text: 'DISCARD CHANGES', exact: false },
  };

  static setValue = async (selector, value) => {
    const el = await Helper.waitForElement(selector);
    Helper.setInputValue(el, value);
    return el;
  };

  static setTruncated = async (selector, value, maxLen) => {
    let v = value || '';
    if (maxLen && v.length > maxLen) {
      console.warn(`[HubSpokeCard] "${v}" exceeds ${maxLen} chars, truncating.`);
      v = v.slice(0, maxLen);
    }
    await HubSpokeCard.setValue(selector, v);
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

    const altText = data.altCopy || Helper.generateAltCopy(altCopyContext);
    await HubSpokeCard.setValue(cfg.altText, altText);
  };

  static fillCard = async (cardSel, cardData, brandName, addGbo) => {
    const altCopyContext = (language) => ({ brandName, deviceType: 'app', language, moduleType: 'hub-spoke-card' });

    await HubSpokeCard.fillImage(cardSel.image.en, cardData.image?.english, altCopyContext('english'));
    await HubSpokeCard.fillImage(cardSel.image.fr, cardData.image?.french, altCopyContext('french'));

    await HubSpokeCard.setTruncated(cardSel.headingEn, cardData.heading?.english, cardSel.headingMaxLen);
    await HubSpokeCard.setTruncated(cardSel.headingFr, cardData.heading?.french, cardSel.headingMaxLen);

    // Always app (this module is app-only), so addGbo alone decides.
    const linkValue = (url) => (addGbo ? Helper.appendGboParam(url) : url || '');
    await HubSpokeCard.setValue(cardSel.linkValueEn, linkValue(cardData.linkValue?.english));
    await HubSpokeCard.setValue(cardSel.linkValueFr, linkValue(cardData.linkValue?.french));
  };

  // Errors intentionally propagate to the caller — same convention as every
  // other module — so a failure stops the loop instead of continuing on to
  // fill a module that was never actually added.
  static run = async (deviceType, brandPage, index, addGbo) => {
    if (deviceType !== 'app') {
      throw new Error('HubSpokeCard is app-only — page-id-founder.js should never call this for web.');
    }

    const entry = brandPage.hubSpokeCard?.[index];
    if (!entry) throw new Error(`Brief is missing hubSpokeCard[${index}] data`);

    const cards = Array.isArray(entry.cards) ? entry.cards.slice(0, HubSpokeCard.MAX_CARDS) : [];
    if (cards.length === 0) throw new Error(`hubSpokeCard[${index}].cards is empty`);

    Helper.log('Filling Hub Spoke Card module...');

    // When the brief has more than one Hub Spoke Card, append a 1-based
    // sequence number so the generated names aren't all identical (same
    // convention as item-carousel.js).
    const total = Array.isArray(brandPage.hubSpokeCard) ? brandPage.hubSpokeCard.length : 1;
    let moduleName = ModuleNameBuilder.generateTempoModuleName(brandPage.brandName, 'hub-spoke-card', deviceType);
    if (total > 1) {
      moduleName += ` ${index + 1}`;
    }
    await HubSpokeCard.setValue(HubSpokeCard.SELECTORS.moduleName, moduleName);
    Helper.log(`Set module name: ${moduleName}`);

    await HubSpokeCard.setValue(HubSpokeCard.SELECTORS.titleEn, entry.title?.english || '');
    await HubSpokeCard.setValue(HubSpokeCard.SELECTORS.titleFr, entry.title?.french || '');

    for (let i = 0; i < cards.length; i++) {
      if (i >= HubSpokeCard.PRE_EXISTING_CARDS) {
        const addBtn = await Helper.waitForElement(HubSpokeCard.SELECTORS.addCardButton);
        addBtn.click();
        await Helper.sleep(300);
      }
      await HubSpokeCard.fillCard(HubSpokeCard.SELECTORS.card(i), cards[i], brandPage.brandName, addGbo);
      Helper.log(`Filled card ${i + 1} of ${cards.length}.`);
    }

    Helper.log('Hub Spoke Card filled — review and click Save (or Discard Changes) to continue.');
    return await Helper.waitForSaveOrDiscard(HubSpokeCard.SELECTORS.saveButton, HubSpokeCard.SELECTORS.discardButton);
  };
}
